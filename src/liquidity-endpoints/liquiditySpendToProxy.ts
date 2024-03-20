import {
    Lucid,
    SpendingValidator,
    MintingPolicy,
    Data,
    toUnit,
    TxComplete,
    fromText,
    Constr,
    Assets,
    OutRef,
  } from "lucid-fork";
  import { cFold, PTHOLDER, SETNODE_PREFIX, TIME_TOLERANCE_MS } from "../core/constants.js";
  import { FoldAct, FoldDatum, FoldMintAct, LiquidityFoldDatum, LiquidityHolderDatum, LiquidityProxyDatum, LiquiditySetNode, SetNode } from "../core/contract.types.js";
  import { SpendToProxyConfig, InitFoldConfig, Result } from "../core/types.js";
  import { fromAddress } from "../index.js";
  
  export const spendToProxy = async (
    lucid: Lucid,
    config: SpendToProxyConfig
  ): Promise<Result<{ txComplete: TxComplete, datum: string }>> => {
    config.currenTime ??= Date.now();
  
    const proxyTokenHolderV1Validator: SpendingValidator = {
      type: "PlutusV2",
      script: config.scripts.proxyTokenHolderV1Validator,
    };

    const proxyTokenHolderV1ValidatorAddr = lucid.utils.validatorToAddress(proxyTokenHolderV1Validator);
    
    const liquidityTokenRedeemer = Data.to(new Constr(1, []));
    
    const upperBound = config.currenTime + TIME_TOLERANCE_MS;
    const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

    const [tokenUtxo] = config.liquidityTokenHolderInputs;
    const tokenHolderDatum = Data.from(tokenUtxo.datum as string, LiquidityHolderDatum)
    
    const proxyDatum = Data.to({
        totalCommitted: tokenHolderDatum.totalCommitted,
        returnAddress: fromAddress(tokenUtxo.address)
    }, LiquidityProxyDatum);

    const tokenHolderPolicy = await lucid.provider.getUtxosByOutRef([config.refScripts.liquidityTokenHolderPolicy])
    const tokenHolderValidator = await lucid.provider.getUtxosByOutRef([config.refScripts.liquidityTokenHolderValidator])

    try {
      const tx = await lucid
        .newTx()
        .collectFrom([tokenUtxo], liquidityTokenRedeemer)
        .readFrom(tokenHolderPolicy)
        .readFrom(tokenHolderValidator)
        .payToContract(proxyTokenHolderV1ValidatorAddr, proxyDatum, tokenUtxo.assets)
        .validFrom(lowerBound)
        .validTo(upperBound)
        .complete({
          nativeUplc: true
        });
  
      return { type: "ok", data: { txComplete: tx, datum: proxyDatum } };
    } catch (error) {
      if (error instanceof Error) return { type: "error", error: error };
  
      return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
  };
  