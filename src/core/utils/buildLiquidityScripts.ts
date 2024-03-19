import {
    applyParamsToScript,
    Constr,
    fromText,
    Lucid,
    MintingPolicy,
    SpendingValidator,
    WithdrawalValidator,
  } from "lucid-fork";
  import { BuildLiquidityScriptsConfig, CborHex, Result } from "../types.js";
  import { fromAddressToData } from "./utils.js";
  
  type LiquidityScripts = {
    liquidityPolicy: CborHex;
    liquidityValidator: CborHex;
    collectStake: CborHex;
    rewardStake: CborHex;
    collectFoldPolicy: CborHex;
    collectFoldValidator: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
    tokenHolderPolicy: CborHex;
    tokenHolderValidator: CborHex;
  };
  
  export const buildLiquidityScripts = (
    lucid: Lucid,
    config: BuildLiquidityScriptsConfig
  ): Result<LiquidityScripts> => {
    const initUTXOprojectTokenHolder = new Constr(0, [
      new Constr(0, [config.projectTokenHolder.initUTXO.txHash]),
      BigInt(config.projectTokenHolder.initUTXO.outputIndex),
    ]);
  
    const liquidityTokenHolderPolicy = applyParamsToScript(
      config.unapplied.tokenHolderPolicy,
      [initUTXOprojectTokenHolder]
    );
  
    const liquidityTokenHolderMintingPolicy: MintingPolicy = {
      type: "PlutusV2",
      script: liquidityTokenHolderPolicy,
    };
  
    const initUTxO = new Constr(0, [
      new Constr(0, [config.liquidityPolicy.initUTXO.txHash]),
      BigInt(config.liquidityPolicy.initUTXO.outputIndex),
    ]);
  
    const penaltyAddress = fromAddressToData(
      config.liquidityPolicy.penaltyAddress
    );
  
    if (penaltyAddress.type == "error")
      return { type: "error", error: penaltyAddress.error };
  
    const liquidityPolicy = applyParamsToScript(
      config.unapplied.liquidityPolicy,
      [
        new Constr(0, [
          initUTxO,
          BigInt(config.liquidityPolicy.deadline), // discoveryDeadline PInteger
          penaltyAddress.data, // penaltyAddress PAddress
        ]),
      ]
    );
  
    const liquidityMintingPolicy: MintingPolicy = {
      type: "PlutusV2",
      script: liquidityPolicy,
    };
  
    const collectFoldValidator = applyParamsToScript(config.unapplied.collectFoldValidator, [
      lucid.utils.mintingPolicyToId(liquidityMintingPolicy),
      lucid.utils.mintingPolicyToId(liquidityTokenHolderMintingPolicy)
    ]);
    const collectFoldSpendingValidator: SpendingValidator = {
      type: "PlutusV2",
      script: collectFoldValidator,
    };
  
    const foldValidatorAddress = fromAddressToData(
      lucid.utils.validatorToAddress(collectFoldSpendingValidator)
    );
  
    if (foldValidatorAddress.type == "error")
      return { type: "error", error: foldValidatorAddress.error };
  
    const collectFoldPolicy = applyParamsToScript(config.unapplied.collectFoldPolicy, [
      new Constr(0, [
        lucid.utils.mintingPolicyToId(liquidityMintingPolicy),
        foldValidatorAddress.data,
        BigInt(config.liquidityPolicy.deadline), // discoveryDeadline PInteger
      ]),
    ]);
  
    const collectFoldMintingPolicy: MintingPolicy = {
      type: "PlutusV2",
      script: collectFoldPolicy,
    };
  
    const projectAddress = fromAddressToData(config.rewardFoldValidator.projectAddr);
    if (projectAddress.type == "error")
      return { type: "error", error: projectAddress.error };
  
    const rewardFoldValidator = applyParamsToScript(
      config.unapplied.distributionFoldValidator,
      [
        new Constr(0, [
          lucid.utils.mintingPolicyToId(liquidityMintingPolicy), //nodeCS
          fromText(config.rewardFoldValidator.projectLpPolicyId), // pool LP cs
          projectAddress.data, // projectAddr
        ]),
      ]
    );
  
    const rewardSpendingValidator: SpendingValidator = {
      type: "PlutusV2",
      script: rewardFoldValidator,
    };
  
    const rewardValidatorAddress = fromAddressToData(
      lucid.utils.validatorToAddress(rewardSpendingValidator)
    );
  
    if (rewardValidatorAddress.type == "error")
      return { type: "error", error: rewardValidatorAddress.error };

    const rewardFoldPolicy = applyParamsToScript(config.unapplied.distributionFoldPolicy, [
      new Constr(0, [
        lucid.utils.mintingPolicyToId(liquidityMintingPolicy), // nodeCS
        lucid.utils.mintingPolicyToId(liquidityTokenHolderMintingPolicy), //tokenHolderCS
        rewardValidatorAddress.data, // rewardScriptAddr
        config.rewardFoldValidator.projectLpPolicyId, // pool lp cs
        lucid.utils.mintingPolicyToId(collectFoldMintingPolicy), // commitFoldCS
      ]),
    ]);
    const rewardFoldMintingPolicy: MintingPolicy = {
      type: "PlutusV2",
      script: rewardFoldPolicy,
    };
  
    const collectStake = applyParamsToScript(config.unapplied.liquidityStake, [
      lucid.utils.mintingPolicyToId(collectFoldMintingPolicy),
    ]);
  
    const collectStakeValidator: WithdrawalValidator = {
      type: "PlutusV2",
      script: collectStake,
    };
    
    const rewardStake = applyParamsToScript(config.unapplied.liquidityStake, [
        lucid.utils.mintingPolicyToId(rewardFoldMintingPolicy),
    ]);
    
    const rewardStakeValidator: WithdrawalValidator = {
        type: "PlutusV2",
        script: rewardStake,
    };

    const liquidityValidator = applyParamsToScript(
      config.unapplied.liquidityValidator,
      [
        new Constr(0, [
          BigInt(config.liquidityPolicy.deadline), // liquidityDeadline PInteger
          penaltyAddress.data, // penaltyAddress PAddress
          new Constr(0, [new Constr(1, [lucid.utils.validatorToScriptHash(collectStakeValidator)])]), // PStakingCredential
          new Constr(0, [new Constr(1, [lucid.utils.validatorToScriptHash(rewardStakeValidator)])])
        ]),
      ]
    );
  
    //NOTE: PROJECT TOKEN HOLDER VALIDATOR
    // pprojectTokenHolder :: Term s (PAsData PCurrencySymbol :--> PValidator)
    // pprojectTokenHolder = phoistAcyclic $ plam $ \rewardsCS _dat _redeemer ctx -> unTermCont $ do
    const liquidityTokenHolderValidator = applyParamsToScript(
      config.unapplied.tokenHolderValidator,
      [
        lucid.utils.mintingPolicyToId(rewardFoldMintingPolicy),
        lucid.utils.mintingPolicyToId(collectFoldMintingPolicy)
      ]
    );
  
    return {
      type: "ok",
      data: {
        liquidityPolicy: liquidityPolicy,
        liquidityValidator: liquidityValidator,
        collectStake: collectStake,
        rewardStake: rewardStake,
        collectFoldPolicy: collectFoldPolicy,
        collectFoldValidator: collectFoldValidator,
        rewardFoldPolicy: rewardFoldPolicy,
        rewardFoldValidator: rewardFoldValidator,
        tokenHolderPolicy: liquidityTokenHolderPolicy,
        tokenHolderValidator: liquidityTokenHolderValidator,
      },
    };
  };
  