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
import { FoldNodesConfig, Result } from "../core/types.js";
import { mkNodeKeyTN, utxosAtScript } from "../index.js";

export const foldNodes = async (
  lucid: Lucid,
  config: FoldNodesConfig
): Promise<Result<TxComplete>> => {
  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const foldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.foldValidator,
  };

  const foldValidatorAddr = lucid.utils.validatorToAddress(foldValidator);

  const foldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.foldPolicy,
  };

  const foldPolicyId = lucid.utils.mintingPolicyToId(foldPolicy);

  const foldUTxO = (
    await lucid.utxosByOutRef([config.foldOutRef])
  )[0];

  if (!foldUTxO || !foldUTxO.datum)
    return { type: "error", error: new Error("missing foldUTxO") };

  // const nodeUTXOs = await utxosAtScript(lucid, config.scripts.)

  try {
    const tx = await lucid
      .newTx()
      // .collectFrom([foldUTxO], redeemerNodeValidator)
      // .attachSpendingValidator(nodeValidator)
      // .payToContract(
      //   nodeValidatorAddr,
      //   { inline: prevNodeDatum },
      //   coveringNode.assets
      // )
      // .payToContract(
      //   nodeValidatorAddr,
      //   { inline: nodeDatum },
      //   { ...assets, lovelace: 2_000_000n }
      // )
      // .mintAssets(assets, redeemerNodePolicy)
      // .attachMintingPolicy(nodePolicy)
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
