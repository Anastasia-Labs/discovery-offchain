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
  PTHOLDER,
  SETNODE_PREFIX,
  TIME_TOLERANCE_MS,
  rFold,
} from "../core/constants.js";
import {
  FoldMintAct,
  LiquidityHolderDatum,
  LiquidityRewardFoldDatum,
  LiquiditySetNode,
} from "../core/contract.types.js";
import { InitLiquidityRewardFoldConfig, Result } from "../core/types.js";
import { fromAddress } from "../index.js";

export const initLqRewardFold = async (
  lucid: Lucid,
  config: InitLiquidityRewardFoldConfig,
): Promise<Result<TxComplete>> => {
  config.currenTime ??= Date.now();

  const rewardFoldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldValidator,
  };

  const rewardFoldValidatorAddr =
    lucid.utils.validatorToAddress(rewardFoldValidator);

  const rewardFoldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldPolicy,
  };

  const rewardFoldPolicyId = lucid.utils.mintingPolicyToId(rewardFoldPolicy);

  const liquidityPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.liquidityPolicy,
  };

  const liquidityValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.liquidityValidator,
  };

  const liquidityTokenHolderPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderPolicy,
  };

  const liquidityTokenHolderPolicyId = lucid.utils.mintingPolicyToId(
    liquidityTokenHolderPolicy,
  );

  const liquidityTokenHolderValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderValidator,
  };

  const liquidityTokenHolderValidatorAddr = lucid.utils.validatorToAddress(
    liquidityTokenHolderValidator,
  );

  const [headNodeUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(liquidityValidator),
    toUnit(
      lucid.utils.mintingPolicyToId(liquidityPolicy),
      fromText(SETNODE_PREFIX),
    ),
  );

  if (!headNodeUTxO || !headNodeUTxO.datum)
    return { type: "error", error: new Error("missing nodeRefInputUTxO") };

  const currentNode = Data.from(headNodeUTxO.datum, LiquiditySetNode);

  const tokenHolderAsset = toUnit(
    liquidityTokenHolderPolicyId,
    fromText(PTHOLDER),
  );

  const rewardFoldAsset = toUnit(rewardFoldPolicyId, rFold);

  const [tokenUtxo] = await lucid.provider.getUtxosWithUnit(
    liquidityTokenHolderValidatorAddr,
    tokenHolderAsset,
  );

  const tokenUtxoDatumHex =
    config?.datums?.[tokenUtxo.datumHash as string] ??
    (await lucid.provider.getDatum(tokenUtxo.datumHash as string));

  const tokenUtxoDatum = Data.from(tokenUtxoDatumHex, LiquidityHolderDatum);

  const datum = Data.to(
    {
      currNode: currentNode,
      owner: fromAddress(await lucid.wallet.address()), //NOTE: owner is not being used in fold minting or validator
      totalCommitted: tokenUtxoDatum.totalCommitted,
      totalLPTokens: tokenUtxoDatum.totalLpTokens,
    },
    LiquidityRewardFoldDatum,
  );

  const outputAssets: Assets = {
    ...tokenUtxo.assets,
    [rewardFoldAsset]: 1n,
  };

  delete outputAssets[tokenHolderAsset];

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const tx = lucid
      .newTx()
      .collectFrom([tokenUtxo], Data.to(new Constr(2, [])))
      .readFrom([headNodeUTxO])
      .payToContract(rewardFoldValidatorAddr, { inline: datum }, outputAssets)
      .mintAssets(
        {
          [rewardFoldAsset]: 1n,
        },
        Data.to("MintFold", FoldMintAct),
      )
      .mintAssets(
        {
          [tokenHolderAsset]: -1n,
        },
        Data.to("BurnFold", FoldMintAct),
      )
      .validFrom(lowerBound)
      .validTo(upperBound);

    if (config.refScripts) {
      tx.readFrom([config.refScripts.tokenHolderPolicy as UTxO])
        .readFrom([config.refScripts.rewardFoldPolicy as UTxO])
        .readFrom([config.refScripts.tokenHolderValidator as UTxO]);
    } else {
      tx.attachMintingPolicy(rewardFoldPolicy)
        .attachMintingPolicy(liquidityTokenHolderPolicy)
        .attachSpendingValidator(liquidityValidator);
    }

    const txComplete = await tx.complete();

    return { type: "ok", data: txComplete };
  } catch (error) {
    if (error instanceof Error)
      return {
        type: "error",
        error: new Error(error.message.replace("\\n", "\n")),
      };

    return {
      type: "error",
      error: new Error(
        `${JSON.stringify(error, null, 5).replace("\\n", "\n")}`,
      ),
    };
  }
};
