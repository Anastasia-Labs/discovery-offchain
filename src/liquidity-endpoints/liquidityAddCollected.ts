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
  } from "@anastasia-labs/lucid-cardano-fork";
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

    const collectFoldPolicyId = lucid.utils.mintingPolicyToId(collectFoldPolicy);
  
    const liquidityTokenHolderValidator: SpendingValidator = {
        type: "PlutusV2",
        script: config.scripts.tokenHolderValidator
    }

    const liquidityTokenHolderValidatorAddr = lucid.utils.validatorToAddress(liquidityTokenHolderValidator)

    const liquidityTokenHolderPolicy: MintingPolicy = {
        type: "PlutusV2",
        script: config.scripts.tokenHolderPolicy
    }

    const liquidityTokenHolderPolicyId = lucid.utils.mintingPolicyToId(liquidityTokenHolderPolicy);
  
    
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

    // Make this match
    // const datum = Data.to(
    //     [],
    //     LiquidityHolderDatum
    // )
    // const datum = Data.to(new Constr(0, [
    //     "",
    //     foldDatum.committed,
    //     0n
    // ]))
    const datum = Data.to({
      lpAssetName: "",
      totalCommitted: foldDatum.committed,
      totalLpTokens: 0n
    }, LiquidityHolderDatum)

    const tempTokenHolderPolicy = await lucid.provider.getUtxosByOutRef([{
      outputIndex: 0,
      txHash: "47ba149ba4298eb20f9142af5b09f4159a0e817ae69a1e7dd2619506d9a28dd9"
    }])
    const tempTokenHolderValidator = await lucid.provider.getUtxosByOutRef([{
      outputIndex: 0,
      txHash: "c38fcc0f01e663aab149cc8f108668528179b5af432c6ccd20f483003935b2a8"
    }])

    try {
      const tx = await lucid
        .newTx()
        .collectFrom([tokenUtxo], tokenRedeemer)
        .collectFrom([foldUtxo], foldRedeemer)
        .attachMintingPolicy(collectFoldPolicy)
        .attachSpendingValidator(collectFoldValidator)
        .readFrom(tempTokenHolderPolicy)
        .readFrom(tempTokenHolderValidator)
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
  