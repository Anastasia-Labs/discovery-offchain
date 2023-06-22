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

  const penaltyAddress = fromAddressToData(config.discoveryPolicy.penaltyAddress);

  if (penaltyAddress.type == "error")
    return { type: "error", error: penaltyAddress.error };

  //WARNING: DiscoveryConfig does not work it returns this... missing the following properties from type 'unknown[]': length, pop, push, concat, and 31 more.
  const discoveryPolicy = applyParamsToScript(
    config.unapplied.discoveryPolicy,
    [
      new Constr(0, [
        new Constr(0, [
          new Constr(0, [config.discoveryPolicy.initUTXO.txHash]),
          BigInt(config.discoveryPolicy.initUTXO.outputIndex),
        ]), // initUTxO PTxOutRef
        BigInt(config.discoveryPolicy.maxRaise), // maxRaise PInteger
        BigInt(config.discoveryPolicy.deadline), // goalRaise PInteger
        penaltyAddress.data, // penaltyAddress PAddress
      ]),
    ]
  );

  const discoveryMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: discoveryPolicy,
  };

  // pfoldValidatorW :: Term s (PAsData PCurrencySymbol :--> PAsData PPOSIXTime :--> PValidator)
  // pfoldValidatorW = phoistAcyclic $
  //   plam $ \nodeCS discoveryDeadline datum _redeemer ctx -> unTermCont $ do
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

  // data PFoldConfig (s :: S)
  //   = PFoldConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "nodeCS" ':= PCurrencySymbol
  //                  "foldAddr" ':= PAddress
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
  const rewardPolicy = applyParamsToScript(config.unapplied.rewardPolicy, [
    new Constr(0, [
      lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
      foldValidatorAddress.data,
    ]),
  ]);
  const rewardMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: rewardPolicy,
  };

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
  const projectAddrData = fromAddressToData(config.rewardValidator.projectAddr);
  if (projectAddrData.type == "error")
    return { type: "error", error: projectAddrData.error };
  const rewardValidator = applyParamsToScript(
    config.unapplied.rewardValidator,
    [
      new Constr(0, [
        lucid.utils.mintingPolicyToId(discoveryMintingPolicy),
        lucid.utils.mintingPolicyToId(foldMintingPolicy),
        config.rewardValidator.projectCS,
        fromText(config.rewardValidator.projectTN),
        projectAddrData.data,
        BigInt(config.discoveryPolicy.deadline),
      ]),
    ]
  );

  const rewardSpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: rewardValidator,
  };

  // pDiscoverySetValidator ::
  //   Config ->
  //   ByteString ->
  //   ClosedTerm (PAsData PCurrencySymbol :--> PValidator)
  // pDiscoverySetValidator cfg prefix = plam $ \rewardFoldCS dat redmn ctx' -> popaque $ P.do
  const discoveryValidator = applyParamsToScript(
    config.unapplied.discoveryValidator,
    [lucid.utils.mintingPolicyToId(rewardMintingPolicy)]
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
