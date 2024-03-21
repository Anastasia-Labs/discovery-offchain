import {
  Assets,
  Constr,
  Data,
  Lucid,
  MintingPolicy,
  SpendingValidator,
  TxComplete,
  UTxO,
  fromText,
  toUnit,
} from "lucid-fork";
import {
  CreatePoolRedeemer,
  LiquidityFactoryDatum,
  LiquidityHolderDatum,
  LiquidityPoolDatum,
  LiquidityProxyDatum,
  PTHOLDER,
  TIME_TOLERANCE_MS,
  sqrt,
  toAddress,
} from "../core/index.js";
import { CreateV1PoolConfig, Result } from "../core/types.js";

export const createLiquidityV1Pool = async (
  lucid: Lucid,
  config: CreateV1PoolConfig,
): Promise<
  Result<{ tx: TxComplete; lpTokenAsset: string; newProxyDatum: string }>
> => {
  try {
    const v1FactoryValidatorScript: SpendingValidator = {
      type: "PlutusV1",
      script: config.scripts.v1FactoryValidatorScript,
    };

    const v1FactoryValidatorScriptAddr = lucid.utils.validatorToAddress(
      v1FactoryValidatorScript,
    );

    const proxyValidatorScript: SpendingValidator = {
      type: "PlutusV1",
      script: config.scripts.proxyTokenHolderScript,
    };

    const tokenHolderMintingPolicy: MintingPolicy = {
      type: "PlutusV2",
      script: config.scripts.tokenHolderPolicy,
    };

    const tokenHolderPolicyId = lucid.utils.mintingPolicyToId(
      tokenHolderMintingPolicy,
    );
    const projectTokenUnit = toUnit(
      config.projectToken.policyId,
      config.projectToken.assetName,
    );

    const proxyValidatorScriptAddr =
      lucid.utils.validatorToAddress(proxyValidatorScript);
    const [proxyUtxo] = await lucid.provider.getUtxosWithUnit(
      proxyValidatorScriptAddr,
      projectTokenUnit,
    );

    const projectTokenAmount = proxyUtxo.assets[projectTokenUnit];
    const proxyDatumHex =
      (await lucid.provider.getDatum(proxyUtxo.datumHash as string)) ??
      config.datums[proxyUtxo.datumHash as string];
    const proxyDatum = Data.from(
      proxyDatumHex ?? (proxyUtxo.datum as string),
      LiquidityProxyDatum,
    );

    const [factoryUtxo] = await lucid.provider.getUtxosWithUnit(
      v1FactoryValidatorScriptAddr,
      toUnit(config.v1FactoryToken.policyId, config.v1FactoryToken.assetName),
    );

    if (!factoryUtxo?.datumHash) {
      throw new Error("Could not find the datum hash of the factory UTXO.");
    }

    const oldFactoryDatum =
      (await lucid.provider.getDatum(factoryUtxo.datumHash as string)) ??
      config.datums[factoryUtxo?.datumHash as string];
    const { nextPoolIdent, ...rest } = Data.from(
      oldFactoryDatum as string,
      LiquidityFactoryDatum,
    );

    const newNextPoolIdent = genNextPoolIdent(nextPoolIdent);
    const newFactoryDatum = Data.to(
      {
        ...rest,
        nextPoolIdent: newNextPoolIdent,
      },
      LiquidityFactoryDatum,
    );

    const poolMintingPolicy: MintingPolicy = {
      type: "PlutusV1",
      script: config.scripts.v1PoolPolicyScript,
    };
    const poolPolicyId = lucid.utils.mintingPolicyToId(poolMintingPolicy);
    const poolLpTokenName = "6c7020" + nextPoolIdent;

    const circulatingLP = sqrt(
      proxyUtxo.assets.lovelace - 2_000_000n,
      projectTokenAmount,
    );
    const lpTokenAsset = toUnit(poolPolicyId, poolLpTokenName);
    console.log(`
          Depositing: ${proxyDatum.totalCommitted} Lovelace,
          Depositing: ${projectTokenAmount} ${Buffer.from(config.projectToken.assetName, "hex").toString("utf-8")},
          Generating: ${circulatingLP} LP Tokens
          LP Asset Name: ${lpTokenAsset}
      `);

    const poolDatum = Data.to(
      {
        coins: {
          coinA: {
            policyId: "",
            tokenName: "",
          },
          coinB: {
            policyId: config.projectToken.policyId,
            tokenName: config.projectToken.assetName,
          },
        },
        poolIdent: nextPoolIdent,
        circulatingLP,
        swapFees: {
          denominator: 1000n,
          numerator: 3n,
        },
      },
      LiquidityPoolDatum,
    );

    config.currenTime ??= Date.now();
    const upperBound = config.currenTime + TIME_TOLERANCE_MS;
    const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

    const proxyRedeemer = Data.to(new Constr(0, []));

    const createPoolRedeemer = Data.to(
      {
        coinA: {
          policyId: "",
          tokenName: "",
        },
        coinB: {
          policyId: config.projectToken.policyId,
          tokenName: config.projectToken.assetName,
        },
      },
      CreatePoolRedeemer,
    );

    const newProxyDatum = Data.to(
      {
        lpAssetName: poolLpTokenName,
        totalCommitted: proxyDatum.totalCommitted,
        totalLpTokens: circulatingLP,
      },
      LiquidityHolderDatum,
    );

    const collectFromProxy: UTxO = {
      ...proxyUtxo,
      datum: proxyDatumHex,
    };

    const collectFromFactory: UTxO = {
      ...factoryUtxo,
      datum: oldFactoryDatum,
    };

    const tokenHolderAsset = toUnit(tokenHolderPolicyId, fromText(PTHOLDER));
    const poolAssets: Assets = {
      ...proxyUtxo.assets,
      [toUnit(poolPolicyId, "7020" + nextPoolIdent)]: 1n,
    };

    // Remove the token holder asset from the pool.
    delete poolAssets[tokenHolderAsset];

    const tx = await lucid
      .newTx()
      .collectFrom([collectFromProxy], proxyRedeemer)
      .collectFrom([collectFromFactory], createPoolRedeemer)
      .payToContract(factoryUtxo.address, newFactoryDatum, factoryUtxo.assets)
      .payToContract(config.v1PoolAddress, poolDatum, poolAssets)
      .payToContract(
        toAddress(proxyDatum.returnAddress, lucid),
        newProxyDatum,
        {
          lovelace: proxyUtxo.assets.lovelace - proxyDatum.totalCommitted,
          [lpTokenAsset]: circulatingLP,
          [tokenHolderAsset]: 1n,
        },
      )
      .mintAssets(
        {
          [toUnit(poolPolicyId, "7020" + nextPoolIdent)]: 1n,
          [lpTokenAsset]: circulatingLP,
        },
        `41${nextPoolIdent}`,
      )
      .attachSpendingValidator(v1FactoryValidatorScript)
      .attachMintingPolicy(poolMintingPolicy)
      .attachSpendingValidator(proxyValidatorScript)
      .validFrom(lowerBound)
      .validTo(upperBound)
      .complete({
        nativeUplc: config.emulator ?? false,
      });

    return {
      type: "ok",
      data: {
        tx,
        lpTokenAsset,
        newProxyDatum,
      },
    };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};

function genNextPoolIdent(current: string) {
  const byteArray = Buffer.from(current, "hex");
  const result: number[] = [];

  let carry = 1;
  for (const byte of byteArray) {
    if (byte === 255 && carry === 1) {
      result.push(0);
      carry = 1;
    } else {
      result.push(byte + carry);
      carry = 0;
    }
  }

  if (carry === 1) {
    result.push(1);
  }

  return Buffer.from(result).toString("hex");
}
