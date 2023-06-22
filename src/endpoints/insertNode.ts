import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
} from "lucid-cardano";
import { DiscoveryNodeAction, SetNode } from "../core/contract.types.js";
import { InsertNodeConfig, Result } from "../core/types.js";
import { mkNodeKeyTN } from "../index.js";

export const insertNode = async (
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

  //TODO: move this to utils
  const coveringNode = nodeUTXOs.find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, SetNode);
      (datum.key == null || datum.key.Key < userKey) &&
        (datum.next == null || userKey < datum.next.Key);
    }
  });

  if (!coveringNode || !coveringNode.datum)
    return { type: "error", error: new Error("missing coveringNode") };

  const coveringNodeDatum = Data.from(coveringNode.datum, SetNode);

  const assets = {
    [toUnit(nodePolicyId, mkNodeKeyTN(userKey))]: 1n,
  };

  const prevNodeDatum = Data.to(
    {
      key: coveringNodeDatum.key,
      next: { Key: userKey },
    },
    SetNode
  );

  const nodeDatum = Data.to(
    {
      key: { Key: userKey },
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

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([coveringNode])
      .payToContract(
        nodeValidatorAddr,
        { inline: prevNodeDatum },
        coveringNode.assets
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
