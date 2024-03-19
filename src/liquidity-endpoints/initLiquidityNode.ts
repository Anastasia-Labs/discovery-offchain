import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
} from "lucid-fork";
import { MIN_COMMITMENT_ADA, TT_UTXO_ADDITIONAL_ADA, originNodeTokenName } from "../core/constants.js";
import { DiscoveryNodeAction, LiquidityNodeAction, LiquiditySetNode } from "../core/contract.types.js";
import { InitNodeConfig, Result } from "../core/types.js";
import { NODE_ADA } from "../core/constants.js";

export const initLqNode = async (
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

  const datum = Data.to(
    {
      key: null,
      next: null,
      commitment: BigInt(0),
    },
    LiquiditySetNode
  );

  const liquidityNodePolicyRedeemer = Data.to("PLInit", LiquidityNodeAction);

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([config.initUTXO])
      .payToContract(
        nodeValidatorAddr,
        { inline: datum },
        { ...assets, lovelace: TT_UTXO_ADDITIONAL_ADA + MIN_COMMITMENT_ADA }
      )
      .mintAssets(assets, liquidityNodePolicyRedeemer)
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
