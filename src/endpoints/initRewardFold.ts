import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  Constr,
  fromText,
  OutRef,
} from "lucid-cardano";
import { cFold, SETNODE_PREFIX } from "../core/constants.js";
import {
  SetNode,
  FoldDatum,
  AddressSchema,
  SetNodeSchema,
} from "../core/contract.types.js";
import { CborHex, Result } from "../core/types.js";
import { fromAddress, toAddress } from "../index.js";

export type InitRewardFoldConfig = {
  nodeRefInput: OutRef;
  scripts: {
    nodeValidator: CborHex;
    nodePolicy: CborHex;
    foldPolicy: CborHex;
    foldValidator: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
    tokenHolderPolicy: CborHex;
  };
};

export const RewardFoldDatumSchema = Data.Object({
  currNode: SetNodeSchema,
  totalProjectTokens: Data.Integer(),
  totalCommitted: Data.Integer(),
  owner: AddressSchema,
});
export type RewardFoldDatum = Data.Static<typeof RewardFoldDatumSchema>;
export const RewardFoldDatum =
  RewardFoldDatumSchema as unknown as RewardFoldDatum;

export const initRewardFold = async (
  lucid: Lucid,
  config: InitRewardFoldConfig
): Promise<Result<TxComplete>> => {
  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const rewardFoldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldValidator,
  };
  const rewardFoldValidatorAddr =
    lucid.utils.validatorToAddress(rewardFoldValidator);

  const rewardFoldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldPolicy,
  };
  const rewardFoldPolicyId = lucid.utils.mintingPolicyToId(rewardFoldPolicy);

  const commitFoldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.foldValidator,
  };
  const commitFoldValidatorAddr =
    lucid.utils.validatorToAddress(commitFoldValidator);

  const commitFoldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.foldPolicy,
  };
  const commitFoldPolicyId = lucid.utils.mintingPolicyToId(commitFoldPolicy);

  const tokenHolderPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderPolicy,
  };
  const tokenHolderPolicyId = lucid.utils.mintingPolicyToId(tokenHolderPolicy);

  const discoveryPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.nodePolicy,
  };

  const discoveryValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.nodeValidator,
  };

  const [headNodeUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(discoveryValidator),
    toUnit(
      lucid.utils.mintingPolicyToId(discoveryPolicy),
      fromText(SETNODE_PREFIX)
    )
  );

  if (!headNodeUTxO || !headNodeUTxO.datum)
    return { type: "error", error: new Error("missing nodeRefInputUTxO") };

  const currentNode = Data.from(headNodeUTxO.datum, SetNode);

  const ptHolderAsset = toUnit(tokenHolderPolicyId, fromText("PTHolder"));

  const tokenHolderUTxO = await lucid.utxoByUnit(ptHolderAsset);

  const [projectToken] = Object.keys(tokenHolderUTxO.assets).filter(
    (unit) => unit !== "lovelace" && unit !== ptHolderAsset
  );

  const commitFoldAsset = toUnit(commitFoldPolicyId, cFold);
  const commitFoldUTxO = (
    await lucid.utxosAtWithUnit(commitFoldValidatorAddr, commitFoldAsset)
  ).find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, FoldDatum);
      return datum.currNode.next == null;
    }
  });
  const commitFoldDatum = Data.from(commitFoldUTxO!.datum!, FoldDatum);

  const datum = Data.to(
    {
      currNode: currentNode,
      totalProjectTokens: tokenHolderUTxO.assets[projectToken],
      totalCommitted: commitFoldDatum.committed,
      owner: fromAddress(await lucid.wallet.address()), //NOTE: owner is not being used in fold minting or validator
    },
    RewardFoldDatum
  );

  const burnPTHolderAct = Data.to(new Constr(1, []));
  const burnCommitFoldAct = Data.to(new Constr(1, []));
  const mintRewardAct = Data.void();

  const reclaimCommitFoldAct = Data.to(new Constr(1, []));

  const rewardFoldAssets = {
    [toUnit(rewardFoldPolicyId, fromText("RFold"))]: 1n,
    [projectToken]: tokenHolderUTxO.assets[projectToken],
  };

  try {
    const tx = await lucid
      .newTx()
      .readFrom([headNodeUTxO])
      .collectFrom([commitFoldUTxO!], reclaimCommitFoldAct)
      .payToContract(
        rewardFoldValidatorAddr,
        { inline: datum },
        rewardFoldAssets
      )
      .mintAssets(
        { [toUnit(rewardFoldPolicyId, fromText("RFold"))]: 1n },
        mintRewardAct
      )
      .mintAssets({ [commitFoldAsset]: -1n }, burnCommitFoldAct)
      .mintAssets({ [ptHolderAsset]: -1n }, burnPTHolderAct)
      .attachMintingPolicy(rewardFoldPolicy)
      .attachMintingPolicy(commitFoldPolicy)
      .attachMintingPolicy(tokenHolderPolicy)
      .addSigner(toAddress(commitFoldDatum.owner, lucid))
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
