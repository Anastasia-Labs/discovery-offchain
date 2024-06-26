import {
  applyParamsToScript,
  Constr,
  fromText,
  Lucid,
  MintingPolicy,
  SpendingValidator,
  WithdrawalValidator,
} from "lucid-fork";
import { BuildScriptsConfig, CborHex, Result } from "../types.js";
import { fromAddressToData } from "./utils.js";

export type Scripts = {
  discoveryPolicy: CborHex;
  discoveryValidator: CborHex;
  discoveryStake: CborHex;
  foldPolicy: CborHex;
  foldValidator: CborHex;
  rewardPolicy: CborHex;
  rewardValidator: CborHex;
  tokenHolderPolicy: CborHex;
  tokenHolderValidator: CborHex;
};

export const buildScripts = (
  lucid: Lucid,
  config: BuildScriptsConfig,
): Result<Scripts> => {
  const initUTXOprojectTokenHolder = new Constr(0, [
    new Constr(0, [config.projectTokenHolder.initUTXO.txHash]),
    BigInt(config.projectTokenHolder.initUTXO.outputIndex),
  ]);

  const tokenHolderPolicy = applyParamsToScript(
    config.unapplied.tokenHolderPolicy,
    [initUTXOprojectTokenHolder],
  );

  const tokenHolderMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: tokenHolderPolicy,
  };

  const initUTxO = new Constr(0, [
    new Constr(0, [config.discoveryPolicy.initUTXO.txHash]),
    BigInt(config.discoveryPolicy.initUTXO.outputIndex),
  ]);

  const penaltyAddress = fromAddressToData(
    config.discoveryPolicy.penaltyAddress,
  );

  if (penaltyAddress.type == "error")
    return { type: "error", error: penaltyAddress.error };

  //NOTE: DISCOVERY POLICY
  //
  // data PDiscoveryConfig (s :: S)
  // = PDiscoveryConfig
  //     ( Term
  //         s
  //         ( PDataRecord
  //             '[ "initUTxO" ':= PTxOutRef
  //              , "discoveryDeadline" ':= PPOSIXTime
  //              , "penaltyAddress" ':= PAddress
  //              ]
  //         )
  //     )
  const discoveryPolicy = applyParamsToScript(
    config.unapplied.discoveryPolicy,
    [
      new Constr(0, [
        initUTxO,
        BigInt(config.discoveryPolicy.deadline), // discoveryDeadline PInteger
        penaltyAddress.data, // penaltyAddress PAddress
      ]),
    ],
  );

  const discoveryMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: discoveryPolicy,
  };

  //NOTE: FOLD VALIDATOR
  //
  // pfoldValidatorW :: Term s (PAsData PCurrencySymbol :--> PAsData PPOSIXTime :--> PValidator)
  // pfoldValidatorW = phoistAcyclic $
  //   plam $ \nodeCS discoveryDeadline datum redeemer ctx ->
  const foldValidator = applyParamsToScript(config.unapplied.foldValidator, [
    lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
    BigInt(config.discoveryPolicy.deadline),
  ]);
  const foldSpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: foldValidator,
  };

  const foldValidatorAddress = fromAddressToData(
    lucid.utils.validatorToAddress(foldSpendingValidator),
  );

  if (foldValidatorAddress.type == "error")
    return { type: "error", error: foldValidatorAddress.error };

  //NOTE: FOLD POLICY
  //
  // data PFoldMintConfig (s :: S)
  //   = PFoldMintConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "nodeCS" ':= PCurrencySymbol
  //                , "foldAddr" ':= PAddress
  //                , "discoveryDeadline" ':= PPOSIXTime
  //                ]
  //           )
  //       )
  //   deriving stock (Generic)
  //   deriving anyclass (PlutusType, PIsData, PDataFields)
  const foldPolicy = applyParamsToScript(config.unapplied.foldPolicy, [
    new Constr(0, [
      lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
      foldValidatorAddress.data,
      BigInt(config.discoveryPolicy.deadline), // discoveryDeadline PInteger
    ]),
  ]);

  const foldMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: foldPolicy,
  };

  const projectAddress = fromAddressToData(config.rewardValidator.projectAddr);
  if (projectAddress.type == "error")
    return { type: "error", error: projectAddress.error };

  //NOTE: REWARD VALIDATOR
  //
  // data PRewardFoldConfig (s :: S)
  //   = PRewardFoldConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "nodeCS" ':= PCurrencySymbol
  //                , "projectCS" ':= PCurrencySymbol
  //                , "projectTN" ':= PTokenName
  //                , "projectAddr" ':= PAddress
  //                ]
  //           )
  //       )
  //   deriving stock (Generic)
  //   deriving anyclass (PlutusType, PIsData, PDataFields)
  const rewardValidator = applyParamsToScript(
    config.unapplied.rewardValidator,
    [
      new Constr(0, [
        lucid.utils.mintingPolicyToId(discoveryMintingPolicy), //nodeCS
        config.rewardValidator.projectCS, // projectCS
        fromText(config.rewardValidator.projectTN), // projectTN
        projectAddress.data, // projectAddr
      ]),
    ],
  );

  const rewardSpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: rewardValidator,
  };

  const rewardValidatorAddress = fromAddressToData(
    lucid.utils.validatorToAddress(rewardSpendingValidator),
  );

  if (rewardValidatorAddress.type == "error")
    return { type: "error", error: rewardValidatorAddress.error };

  //NOTE: REWARD POLICY
  //
  // data PRewardMintFoldConfig (s :: S)
  //   = PRewardMintFoldConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "nodeCS" ':= PCurrencySymbol,
  //                  "tokenHolderCS" ':= PCurrencySymbol,
  //                  "rewardScriptAddr" ':= PAddress,
  //                  "projectTN" ':= PTokenName,
  //                  "projectCS" ':= PCurrencySymbol,
  //                  "commitFoldCS" ':= PCurrencySymbol
  //                ]
  //           )
  //       )
  const rewardPolicy = applyParamsToScript(config.unapplied.rewardPolicy, [
    new Constr(0, [
      lucid.utils.mintingPolicyToId(discoveryMintingPolicy), // nodeCS
      lucid.utils.mintingPolicyToId(tokenHolderMintingPolicy), //tokenHolderCS
      rewardValidatorAddress.data, // rewardScriptAddr
      fromText(config.rewardValidator.projectTN), // projectTN
      config.rewardValidator.projectCS, // projectCS
      lucid.utils.mintingPolicyToId(foldMintingPolicy), // commitFoldCS
    ]),
  ]);
  const rewardMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: rewardPolicy,
  };

  //NOTE: DISCOVERY STAKE VALIDATOR
  // pDiscoverGlobalLogicW :: Term s (PAsData PCurrencySymbol :--> PStakeValidator)
  // pDiscoverGlobalLogicW = phoistAcyclic $ plam $ \rewardCS' _redeemer ctx -> P.do
  const discoveryStake = applyParamsToScript(config.unapplied.discoveryStake, [
    lucid.utils.mintingPolicyToId(rewardMintingPolicy),
  ]);

  const discoveryStakeValidator: WithdrawalValidator = {
    type: "PlutusV2",
    script: discoveryStake,
  };

  // NOTE: DISCOVERY VALIDATOR
  //
  // data PDiscoveryLaunchConfig (s :: S)
  // = PDiscoveryLaunchConfig
  //     ( Term
  //         s
  //         ( PDataRecord
  //             '[ "discoveryDeadline" ':= PPOSIXTime
  //              , "penaltyAddress" ':= PAddress
  //              , "globalCred" ':= PStakingCredential
  //              ]
  //         )
  //     )
  const discoveryValidator = applyParamsToScript(
    config.unapplied.discoveryValidator,
    [
      new Constr(0, [
        BigInt(config.discoveryPolicy.deadline), // discoveryDeadline PInteger
        penaltyAddress.data, // penaltyAddress PAddress
        new Constr(0, [
          new Constr(1, [
            lucid.utils.validatorToScriptHash(discoveryStakeValidator),
          ]),
        ]), // PStakingCredential
      ]),
    ],
  );

  const discoverySpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: discoveryValidator,
  };

  //NOTE: PROJECT TOKEN HOLDER VALIDATOR
  // pprojectTokenHolder :: Term s (PAsData PCurrencySymbol :--> PValidator)
  // pprojectTokenHolder = phoistAcyclic $ plam $ \rewardsCS _dat _redeemer ctx -> unTermCont $ do
  const tokenHolderValidator = applyParamsToScript(
    config.unapplied.tokenHolderValidator,
    [lucid.utils.mintingPolicyToId(rewardMintingPolicy)],
  );

  return {
    type: "ok",
    data: {
      discoveryPolicy: discoveryPolicy,
      discoveryValidator: discoveryValidator,
      discoveryStake: discoveryStake,
      foldPolicy: foldPolicy,
      foldValidator: foldValidator,
      rewardPolicy: rewardPolicy,
      rewardValidator: rewardValidator,
      tokenHolderPolicy: tokenHolderPolicy,
      tokenHolderValidator: tokenHolderValidator,
    },
  };
};
