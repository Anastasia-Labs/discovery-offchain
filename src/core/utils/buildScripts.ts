import {
  applyParamsToScript,
  fromText,
  Lucid,
  MintingPolicy,
  SpendingValidator,
} from "lucid-cardano";
import {BuildScriptsConfig, CborHex} from "../types.js";

type Result = {
  nodePolicy: CborHex;
  nodeValidator: CborHex;
  foldPolicy: CborHex;
  foldValidator: CborHex
};

export const buildScripts = (
  lucid: Lucid,
  config: BuildScriptsConfig
): Result => {
  //TODO: policy takes the following params
  // CurrencySymbol -> ValidatorHash -> ClosedTerm ( PDiscoveryConfig ...)
  // data PDiscoveryConfig (s :: S)
  //   = PDiscoveryConfig
  //       ( Term
  //           s
  //           ( PDataRecord
  //               '[ "initUTxO" ':= PTxOutRef
  //                , "maxRaise" ':= PInteger
  //                , "discoveryDeadline" ':= PPOSIXTime
  //                , "penaltyAddress" ':= PAddress
  //                ]
  //           )
  //       )
  const nodePolicy = applyParamsToScript(config.unapplied.nodePolicy, []);

  const nodeMintingPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: nodePolicy,
  };

  //TODO: node validator takes a prefix
  const nodeValidator = applyParamsToScript(config.unapplied.nodeValidator, [
    fromText(config.params.nodeValidator.prefix),
  ]);

  const nodeSpendingValidator: SpendingValidator = {
    type: "PlutusV2",
    script: nodeValidator,
  };

  //TODO: add params
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
  const foldPolicy = applyParamsToScript(config.unapplied.foldPolicy, []);

  //TODO: add params
  const foldValidator = applyParamsToScript(config.unapplied.foldValidator,[])

  return {
    nodePolicy: nodePolicy,
    nodeValidator: nodeValidator,
    foldPolicy: foldPolicy,
    foldValidator: foldValidator
  };
};
