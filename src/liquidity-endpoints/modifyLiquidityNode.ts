import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  Assets,
} from "lucid-fork";
import {
  DiscoveryNodeAction,
  LiquidityNodeValidatorAction,
  LiquiditySetNode,
  NodeValidatorAction,
  SetNode,
} from "../core/contract.types.js";
import { InsertNodeConfig, Result } from "../core/types.js";
import { TIME_TOLERANCE_MS, mkNodeKeyTN } from "../index.js";

export const modifyLqNode = async (
  lucid: Lucid,
  config: InsertNodeConfig,
): Promise<Result<TxComplete>> => {
  const nodeValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.nodeValidator,
  };

  const nodeValidatorAddr = lucid.utils.validatorToAddress(nodeValidator);

  const userKey = lucid.utils.getAddressDetails(await lucid.wallet.address())
    .paymentCredential?.hash;

  if (!userKey)
    return { type: "error", error: new Error("missing PubKeyHash") };

  const nodeUTXOs = config.nodeUTxOs
    ? config.nodeUTxOs
    : await lucid.utxosAt(nodeValidatorAddr);
  // console.log(nodeUTXOs)

  //TODO: move this to utils
  const ownNode = nodeUTXOs.find((utxo) => {
    if (utxo.datum) {
      const nodeDat = Data.from(utxo.datum, LiquiditySetNode);
      return nodeDat.key == userKey;
    }
  });
  // console.log("found covering node ", coveringNode)

  if (!ownNode || !ownNode.datum)
    return { type: "error", error: new Error("missing ownNode") };

  const redeemerNodeValidator = Data.to(
    "ModifyCommitment",
    LiquidityNodeValidatorAction,
  );

  const newNodeAssets: Assets = {};
  Object.keys(ownNode.assets).forEach(
    (unit) => (newNodeAssets[unit] = ownNode.assets[unit]),
  );
  newNodeAssets["lovelace"] =
    newNodeAssets["lovelace"] + BigInt(config.amountLovelace);

  config.currenTime ??= Date.now();
  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([ownNode], redeemerNodeValidator)
      .compose(
        config.refScripts?.nodeValidator
          ? lucid.newTx().readFrom([config.refScripts.nodeValidator])
          : lucid.newTx().attachSpendingValidator(nodeValidator),
      )
      .payToContract(
        nodeValidatorAddr,
        { inline: ownNode.datum },
        newNodeAssets,
      )
      .validFrom(lowerBound)
      .validTo(upperBound)
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
