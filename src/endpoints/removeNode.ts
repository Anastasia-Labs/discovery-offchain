import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
} from "lucid-cardano";
import {
  DiscoveryNodeAction,
  NodeValidatorAction,
  SetNode,
} from "../core/contract.types.js";
import { RemoveNodeConfig, Result } from "../core/types.js";
import { mkNodeKeyTN } from "../index.js";

export const removeNode = async (
  lucid: Lucid,
  config: RemoveNodeConfig
): Promise<Result<TxComplete>> => {
  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

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

  const userPubKeyHash = lucid.utils.getAddressDetails(await lucid.wallet.address())
    .paymentCredential?.hash;

  if (!userPubKeyHash)
    return { type: "error", error: new Error("missing PubKeyHash") };

  const nodeUTXOs = await lucid.utxosAt(nodeValidatorAddr);

  const node = nodeUTXOs.find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, SetNode);
      return datum.key !== null && datum.key.key == userPubKeyHash;
    }
  });

  if (!node || !node.datum)
    return { type: "error", error: new Error("missing node") };

  const nodeDatum = Data.from(node.datum, SetNode);

  const prevNode = nodeUTXOs.find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, SetNode);
      return datum.next !== null && datum.next.key == userPubKeyHash;
    }
  });

  if (!prevNode || !prevNode.datum)
    return { type: "error", error: new Error("missing prevNode") };

  const prevNodeDatum = Data.from(prevNode.datum, SetNode);

  const assets = {
    [toUnit(nodePolicyId, mkNodeKeyTN(userPubKeyHash))]: -1n,
  };

  const newPrevNode: SetNode = {
    key: prevNodeDatum.key,
    next: nodeDatum.next,
  };

  const newPrevNodeDatum = Data.to(newPrevNode,SetNode)

  //TODO: Add Node Action
  const redeemerNodePolicy = Data.to(
    {
      PRemove: {
        keyToRemove: userPubKeyHash,
        coveringNode: newPrevNode,
      },
    },
    DiscoveryNodeAction
  );
  const redeemerNodeValidator = Data.to("LinkedListAct",NodeValidatorAction)

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([node,prevNode], redeemerNodeValidator)
      .attachSpendingValidator(nodeValidator)
      .payToContract(
        nodeValidatorAddr,
        { inline: newPrevNodeDatum },
        prevNode.assets
      )
      .mintAssets(assets, redeemerNodePolicy)
      .attachMintingPolicy(nodePolicy)
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
