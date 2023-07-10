import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  Constr,
  fromText,
} from "lucid-cardano";
import { cFold, SETNODE_PREFIX } from "../core/constants.js";
import { SetNode, FoldDatum, RewardFoldDatum } from "../core/contract.types.js";
import { InitRewardFoldConfig, Result } from "../core/types.js";
import { fromAddress, toAddress } from "../index.js";

export const initRewardFold = async (
  lucid: Lucid,
  config: InitRewardFoldConfig
): Promise<Result<TxComplete>> => {

  lucid.selectWalletFrom({ address: config.userAddress });

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const tokenHolderValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderValidator,
  };

  const tokenHolderValidatorAddr =
    lucid.utils.validatorToAddress(tokenHolderValidator);

  const tokenHolderPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderPolicy,
  };
  const tokenHolderPolicyId = lucid.utils.mintingPolicyToId(tokenHolderPolicy);

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

  const ptHolderUnit = toUnit(tokenHolderPolicyId, fromText("PTHolder"));

  const tokenHolderUTxO = await lucid.utxoByUnit(ptHolderUnit);

  const [projectToken] = Object.keys(tokenHolderUTxO.assets).filter(
    (unit) => unit == ptHolderUnit
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

  if (!commitFoldUTxO || !commitFoldUTxO.datum)
    return { type: "error", error: new Error("missing commitFoldUTxO") };

  const commitFoldDatum = Data.from(commitFoldUTxO.datum, FoldDatum);
  console.log("projectToken", projectToken)
  console.log("tokenHolderUTxO assets", tokenHolderUTxO.assets)

  const datum = Data.to(
    {
      currNode: currentNode,
      totalProjectTokens: tokenHolderUTxO.assets[projectToken],
      totalCommitted: commitFoldDatum.committed,
      owner: fromAddress(config.userAddress),
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
      .collectFrom([tokenHolderUTxO], Data.void())
      .collectFrom([commitFoldUTxO], reclaimCommitFoldAct)
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
      .mintAssets({ [ptHolderUnit]: -1n }, burnPTHolderAct)
      .attachMintingPolicy(rewardFoldPolicy)
      .attachMintingPolicy(commitFoldPolicy)
      .attachMintingPolicy(tokenHolderPolicy)
      .attachSpendingValidator(commitFoldValidator)
      .attachSpendingValidator(tokenHolderValidator)
      .addSigner(toAddress(commitFoldDatum.owner, lucid))
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
