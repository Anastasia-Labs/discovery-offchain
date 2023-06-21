import {
  applyParamsToScript,
  Constr,
  fromText,
  Lucid,
  MintingPolicy,
  SpendingValidator,
} from "lucid-cardano";
import { DiscoveryConfig } from "../contract.types.js";
import { BuildScriptsConfig, CborHex, Result } from "../types.js";
import { fromAddress, fromAddressToData, toAddress } from "./utils.js";

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
  // pDiscoverySetValidator ::
  //   Config ->
  //   ByteString ->
  //   ClosedTerm (PAsData PCurrencySymbol :--> PValidator)
  // pDiscoverySetValidator cfg prefix = plam $ \rewardFoldCS dat redmn ctx' -> popaque $ P.do
  const discoveryValidator = applyParamsToScript(
    config.unapplied.discoveryValidator,
    []
  );

  const discoverySpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: discoveryValidator,
  };

  const addressData = fromAddressToData(config.discoveryPolicy.penaltyAddress);

  if (addressData.type == "error")
    return { type: "error", error: addressData.error };

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
        addressData.data, // penaltyAddress PAddress
        lucid.utils.validatorToScriptHash(discoverySpendingValidator), // nodeVal PSriptHash
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

  const foldAddrData = fromAddressToData(
    lucid.utils.validatorToAddress(foldSpendingValidator)
  );

  if (foldAddrData.type == "error")
    return { type: "error", error: foldAddrData.error };

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
      foldAddrData.data,
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
      foldAddrData.data,
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
