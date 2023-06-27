import {
  applyParamsToScript,
  Constr,
  fromText,
  Lucid,
  MintingPolicy,
  SpendingValidator,
} from "lucid-cardano";
import { BuildScriptsConfig, CborHex, Result } from "../types.js";
import { fromAddressToData } from "./utils.js";

type Scripts = {
  discoveryPolicy: CborHex;
  discoveryValidator: CborHex;
  foldPolicy: CborHex;
  foldValidator: CborHex;
  rewardPolicy: CborHex;
  rewardValidator: CborHex;
};

export const buildScripts = (
  lucid: Lucid,
  config: BuildScriptsConfig
): Result<Scripts> => {
  const initUTxO = new Constr(0, [
    new Constr(0, [config.discoveryPolicy.initUTXO.txHash]),
    BigInt(config.discoveryPolicy.initUTXO.outputIndex),
  ]);

  const penaltyAddress = fromAddressToData(
    config.discoveryPolicy.penaltyAddress
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
    ]
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
    lucid.utils.validatorToAddress(foldSpendingValidator)
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
  //                ]
  //           )
  //       )
  const foldPolicy = applyParamsToScript(config.unapplied.foldPolicy, [
    new Constr(0, [
      lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
      foldValidatorAddress.data,
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
  //                , "commitFoldCS" ':= PCurrencySymbol
  //                , "projectCS" ':= PCurrencySymbol
  //                , "projectTN" ':= PTokenName
  //                , "projectAddr" ':= PAddress
  //                , "discoveryDeadline" ':= PPOSIXTime
  //                ]
  //           )
  //       )
  const rewardValidator = applyParamsToScript(
    config.unapplied.rewardValidator,
    [
      new Constr(0, [
        lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
        lucid.utils.mintingPolicyToId(foldMintingPolicy),
        config.rewardValidator.projectCS,
        fromText(config.rewardValidator.projectTN),
        projectAddress.data,
        BigInt(config.discoveryPolicy.deadline),
      ]),
    ]
  );

  const rewardSpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: rewardValidator,
  };

  //NOTE: REWARD POLICY
  //
  // data PRewardMintFoldConfig (s :: S)
  //   = PRewardMintFoldConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "initUTxO" ':= PTxOutRef
  //                , "nodeCS" ':= PCurrencySymbol
  //                , "rewardScriptAddr" ':= PAddress
  //                , "projectTN" ':= PTokenName
  //                , "projectCS" ':= PCurrencySymbol
  //                ]
  //           )
  //       )
  const rewardPolicy = applyParamsToScript(config.unapplied.rewardPolicy, [
    new Constr(0, [
      initUTxO,
      lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
      lucid.utils.validatorToScriptHash(rewardSpendingValidator),
      fromText(config.rewardValidator.projectTN),
      config.rewardValidator.projectCS,
    ]),
  ]);
  const rewardMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: rewardPolicy,
  };

  // NOTE: DISCOVERY VALIDATOR
  //
  // data PDiscoveryLaunchConfig (s :: S)
  //   = PDiscoveryLaunchConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "discoveryDeadline" ':= PPOSIXTime
  //                , "penaltyAddress" ':= PAddress
  //                , "rewardsCS" ':= PCurrencySymbol
  //                ]
  //           )
  //       )
  const discoveryValidator = applyParamsToScript(
    config.unapplied.discoveryValidator,
    [
      new Constr(0, [
        BigInt(config.discoveryPolicy.deadline), // discoveryDeadline PInteger
        penaltyAddress.data, // penaltyAddress PAddress
        lucid.utils.mintingPolicyToId(rewardMintingPolicy), // rewardsCS PCurrencySymbol
      ]),
    ]
  );

  const discoverySpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: discoveryValidator,
  };

  return {
    type: "ok",
    data: {
      discoveryPolicy: discoveryPolicy,
      discoveryValidator: discoveryValidator,
      foldPolicy: foldPolicy,
      foldValidator: foldValidator,
      rewardPolicy: rewardPolicy,
      rewardValidator: rewardValidator,
    },
  };
};
