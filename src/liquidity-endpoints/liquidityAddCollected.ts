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
    Script,
  } from "lucid-fork";
  import { cFold, PTHOLDER, SETNODE_PREFIX, TIME_TOLERANCE_MS } from "../core/constants.js";
  import { FoldAct, FoldDatum, FoldMintAct, LiquidityFoldDatum, LiquidityHolderDatum, LiquiditySetNode, SetNode } from "../core/contract.types.js";
  import { AddCollectedConfig, InitFoldConfig, Result } from "../core/types.js";
  import { fromAddress } from "../index.js";
  
  export const addCollected = async (
    lucid: Lucid,
    config: AddCollectedConfig
  ): Promise<Result<TxComplete>> => {
    config.currenTime ??= Date.now();
  
    const collectFoldValidator: SpendingValidator = {
      type: "PlutusV2",
      script: config.scripts.collectFoldValidator,
    };
    
    const collectFoldPolicy: MintingPolicy = {
        type: "PlutusV2",
        script: config.scripts.collectFoldPolicy
    }

    console.log(config.refScripts)
    const [tokenHolderPolicy] = await lucid.provider.getUtxosByOutRef([config.refScripts.tokenHolderPolicy])
    const [tokenHolderValidator] = await lucid.provider.getUtxosByOutRef([config.refScripts.tokenHolderValidator])

    if (!tokenHolderPolicy?.scriptRef || !tokenHolderValidator?.scriptRef) {
      throw new Error("Could not find the required reference scripts for TokenHolderPolicy and/or TokenHolderValidator.")
    }

    const collectFoldPolicyId = lucid.utils.mintingPolicyToId(collectFoldPolicy);
    const liquidityTokenHolderPolicyId = lucid.utils.mintingPolicyToId(tokenHolderPolicy.scriptRef);
    const liquidityTokenHolderValidatorAddr = lucid.utils.validatorToAddress(tokenHolderValidator.scriptRef)
    
    const foldNFT = toUnit(collectFoldPolicyId, cFold);
    const foldUtxo = await lucid.provider.getUtxoByUnit(foldNFT)

    const tokenNFT = toUnit(liquidityTokenHolderPolicyId, fromText(PTHOLDER));
    const tokenUtxo = await lucid.provider.getUtxoByUnit(tokenNFT)
    
    const tokenRedeemer = Data.to(new Constr(0, []));
    const foldRedeemer = Data.to("Reclaim", FoldAct)
    
    const upperBound = config.currenTime + TIME_TOLERANCE_MS;
    const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

    const foldDatum = Data.from(foldUtxo.datum as string, LiquidityFoldDatum);

    const assets: Assets = {
        ...tokenUtxo.assets,
        lovelace: tokenUtxo.assets.lovelace + foldDatum.committed,
    }

    const datum = Data.to({
      lpAssetName: "",
      totalCommitted: foldDatum.committed,
      totalLpTokens: 0n
    }, LiquidityHolderDatum)

    try {
      const tx = await lucid
        .newTx()
        .collectFrom([tokenUtxo], tokenRedeemer)
        .collectFrom([foldUtxo], foldRedeemer)
        .attachMintingPolicy(collectFoldPolicy)
        .attachSpendingValidator(collectFoldValidator)
        .readFrom([tokenHolderPolicy])
        .readFrom([tokenHolderValidator])
        .payToContract(liquidityTokenHolderValidatorAddr, { inline: datum }, assets)
        .mintAssets({
            [foldNFT]: -1n
        }, Data.to(new Constr(1, [])))
        .validFrom(lowerBound)
        .validTo(upperBound)
        .complete({
          nativeUplc: true
        });
  
      return { type: "ok", data: tx };
    } catch (error) {
      if (error instanceof Error) return { type: "error", error: error };
  
      return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
  };
  