import { Constr, Data, Lucid, SpendingValidator, TxComplete } from "lucid-fork";
import { TIME_TOLERANCE_MS } from "../core/constants.js";
import {
  LiquidityHolderDatum,
  LiquidityProxyDatum,
} from "../core/contract.types.js";
import { Result, SpendToProxyConfig } from "../core/types.js";
import { fromAddress, utxosAtScript } from "../index.js";

export const spendToProxy = async (
  lucid: Lucid,
  config: SpendToProxyConfig,
): Promise<Result<{ txComplete: TxComplete; datum: string }>> => {
  config.currenTime ??= Date.now();

  const [tokenUtxo] = await utxosAtScript(
    lucid,
    config.scripts.tokenHolderValidator,
  );

  const tokenHolderDatum = Data.from(
    tokenUtxo.datum as string,
    LiquidityHolderDatum,
  );

  const proxyTokenHolderValidator: SpendingValidator = {
    type: "PlutusV1",
    script: config.scripts.proxyTokenHolderValidator,
  };

  const proxyTokenHolderValidatorAddr = lucid.utils.validatorToAddress(
    proxyTokenHolderValidator,
  );

  const liquidityTokenRedeemer = Data.to(new Constr(1, []));

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  const proxyDatum = Data.to(
    {
      totalCommitted: tokenHolderDatum.totalCommitted,
      returnAddress: fromAddress(tokenUtxo.address),
    },
    LiquidityProxyDatum,
  );

  const tokenHolderPolicy = await lucid.provider.getUtxosByOutRef([
    config.refScripts.liquidityTokenHolderPolicy,
  ]);
  const tokenHolderValidator = await lucid.provider.getUtxosByOutRef([
    config.refScripts.liquidityTokenHolderValidator,
  ]);

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([tokenUtxo], liquidityTokenRedeemer)
      .readFrom(tokenHolderPolicy)
      .readFrom(tokenHolderValidator)
      .payToContract(
        proxyTokenHolderValidatorAddr,
        proxyDatum,
        tokenUtxo.assets,
      )
      .validFrom(lowerBound)
      .validTo(upperBound)
      .complete({
        nativeUplc: true,
      });

    return { type: "ok", data: { txComplete: tx, datum: proxyDatum } };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
