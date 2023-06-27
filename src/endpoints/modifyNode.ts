
import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
} from "lucid-cardano";
import { DiscoveryNodeAction, NodeValidatorAction, SetNode } from "../core/contract.types.js";
import { InsertNodeConfig, Result } from "../core/types.js";
import { mkNodeKeyTN } from "../index.js";

export const modifyNode = async (
  lucid: Lucid,
  config: InsertNodeConfig
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

  const userKey = lucid.utils.getAddressDetails(await lucid.wallet.address())
    .paymentCredential?.hash;

  if (!userKey)
    return { type: "error", error: new Error("missing PubKeyHash") };

  const nodeUTXOs = await lucid.utxosAt(nodeValidatorAddr);
  // console.log(nodeUTXOs)

  //TODO: move this to utils
  const ownNode = nodeUTXOs.find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, SetNode);
      return (datum.key == null || datum.key < userKey) &&
        (datum.next == null || userKey < datum.next);
    }
  });
  // console.log("found covering node ", coveringNode)

  if (!ownNode || !ownNode.datum)
    return { type: "error", error: new Error("missing coveringNode") };

  const coveringNodeDatum = Data.from(ownNode.datum, SetNode);

  const assets = {
    [toUnit(nodePolicyId, mkNodeKeyTN(userKey))]: 1n,
  };

  const prevNodeDatum = Data.to(
    {
      key: coveringNodeDatum.key,
      next: userKey,
    },
    SetNode
  );

  const nodeDatum = Data.to(
    {
      key:  userKey,
      next: coveringNodeDatum.next,
    },
    SetNode
  );

  //TODO: Add Node Action
  const redeemerNodePolicy = Data.to(
    {
      PInsert: {
        keyToInsert: userKey,
        coveringNode: coveringNodeDatum,
      },
    },
    DiscoveryNodeAction
  );
  console.log(JSON.stringify(Data.from(redeemerNodePolicy),undefined,2))

  const redeemerNodeValidator = Data.to("LinkedListAct",NodeValidatorAction)

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([ownNode], redeemerNodeValidator)
      .attachSpendingValidator(nodeValidator)
      .payToContract(
        nodeValidatorAddr,
        { inline: prevNodeDatum },
        ownNode.assets
      )
      .payToContract(
        nodeValidatorAddr,
        { inline: nodeDatum },
        { ...assets, lovelace: 2_000_000n }
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
