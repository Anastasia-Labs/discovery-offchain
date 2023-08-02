import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
} from "lucid-cardano";
import { originNodeTokenName } from "../core/constants.js";
import { DiscoveryNodeAction, SetNode } from "../core/contract.types.js";
import { InitNodeConfig, Result } from "../core/types.js";
import { NODE_ADA } from "../core/constants.js";

export const initNode = async (
  lucid: Lucid,
  config: InitNodeConfig
): Promise<Result<TxComplete>> => {
  const nodeValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.nodeValidator,
  };

  const nodeValidatorAddr = lucid.utils.validatorToAddress(nodeValidator);

  const nodePolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.nodePolicy,
  };

  const nodePolicyId = lucid.utils.mintingPolicyToId(nodePolicy);

  const assets = {
    [toUnit(nodePolicyId, originNodeTokenName)]: 1n,
    // [toUnit(nodePolicyId, corrNodeTokenName)]: 1n,
  };

  //TODO: Add PDiscoveryNode struct
  const datum = Data.to(
    {
      key: null,
      next: null,
    },
    SetNode
  );

  const redeemerNodePolicy = Data.to("PInit", DiscoveryNodeAction);

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([config.initUTXO])
      .payToAddressWithData(
        nodeValidatorAddr,
        { inline: datum, scriptRef: nodeValidator },
        { ...assets, lovelace: NODE_ADA }
      )
      .mintAssets(assets, redeemerNodePolicy)
      // .attachMintingPolicy(nodePolicy)
      .compose(
        config.refScripts?.nodePolicy
          ? lucid.newTx().readFrom([config.refScripts.nodePolicy])
          : lucid.newTx().attachMintingPolicy(nodePolicy)
      )
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
