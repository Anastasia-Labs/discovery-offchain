import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  TxComplete,
} from "lucid-cardano";
import { FoldAct, FoldDatum, SetNode } from "../core/contract.types.js";
import { FoldNodeConfig, Result } from "../core/types.js";

export const foldNode = async (
  lucid: Lucid,
  config: FoldNodeConfig
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

  const foldUTxO = (await lucid.utxosByOutRef([config.foldOutRef]))[0];

  if (!foldUTxO || !foldUTxO.datum)
    return { type: "error", error: new Error("missing foldUTxO") };

  const oldFoldDatum = Data.from(foldUTxO.datum, FoldDatum);

  const [nodeRefUTxO] = await lucid.utxosByOutRef([config.nodeRefInput]);
  const nodeDatum = Data.from(nodeRefUTxO.datum!, SetNode);

  const newFoldDatum = Data.to(
    {
      currNode: nodeDatum,
      committed: oldFoldDatum.committed + nodeRefUTxO.assets.lovelace,
      owner: oldFoldDatum.owner,
    },
    FoldDatum
  );

  const foldAct = Data.to("FoldNode", FoldAct);

  try {
    const tx = await lucid
      .newTx()
      .readFrom([nodeRefUTxO])
      .collectFrom([foldUTxO], foldAct)
      .attachSpendingValidator(foldValidator)
      .payToContract(
        foldValidatorAddr,
        { inline: newFoldDatum },
        foldUTxO.assets
      )
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
