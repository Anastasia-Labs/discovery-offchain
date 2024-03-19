import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  Constr,
  fromText,
} from "lucid-fork";
import { cFold, SETNODE_PREFIX } from "../core/constants.js";
import { SetNode, FoldDatum, RewardFoldDatum, LiquiditySetNode, LiquidityRewardFoldDatum } from "../core/contract.types.js";
import { InitRewardFoldConfig, Result } from "../core/types.js";
import { fromAddress, toAddress } from "../index.js";

export const initLqRewardFold = async (
  lucid: Lucid,
  config: InitRewardFoldConfig
): Promise<Result<TxComplete>> => {
  const tokenHolderValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderValidator,
  };

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

  const headNodeDatum = Data.from(headNodeUTxO.datum, LiquiditySetNode);

  const ptHolderUnit = toUnit(tokenHolderPolicyId, fromText("PTHolder"));

  const tokenHolderUTxO = await lucid.utxoByUnit(ptHolderUnit);

  const commitFoldUnit = toUnit(commitFoldPolicyId, cFold);
  const commitFoldUTxO = (
    await lucid.utxosAtWithUnit(commitFoldValidatorAddr, commitFoldUnit)
  ).find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, FoldDatum);
      return datum.currNode.next == null;
    }
  });

  if (!commitFoldUTxO || !commitFoldUTxO.datum)
    return { type: "error", error: new Error("missing commitFoldUTxO") };

  const commitFoldDatum = Data.from(commitFoldUTxO.datum, FoldDatum);

  const projectUnit = toUnit(config.projectCS, fromText(config.projectTN));

  const datum = Data.to(
    {
      currNode: headNodeDatum,
      totalProjectTokens: tokenHolderUTxO.assets[projectUnit],
      totalCommitted: commitFoldDatum.committed,
      owner: fromAddress(await lucid.wallet.address()),
    },
    LiquidityRewardFoldDatum
  );

  const burnPTHolderAct = Data.to(new Constr(1, []));
  const burnCommitFoldAct = Data.to(new Constr(1, []));
  const reclaimCommitFoldAct = Data.to(new Constr(1, []));

  try {
    const tx = await lucid
      .newTx()
      .readFrom([headNodeUTxO])
      .collectFrom([tokenHolderUTxO], Data.void())
      .collectFrom([commitFoldUTxO], reclaimCommitFoldAct)
      .payToContract(
        rewardFoldValidatorAddr,
        { inline: datum },
        {
          [toUnit(rewardFoldPolicyId, fromText("RFold"))]: 1n,
          [projectUnit]: tokenHolderUTxO.assets[projectUnit],
        }
      )
      .mintAssets(
        { [toUnit(rewardFoldPolicyId, fromText("RFold"))]: 1n },
        Data.void()
      )
      .mintAssets({ [commitFoldUnit]: -1n }, burnCommitFoldAct)
      .mintAssets({ [ptHolderUnit]: -1n }, burnPTHolderAct)
      .compose(
        config.refScripts?.tokenHolderValidator
          ? lucid.newTx().readFrom([config.refScripts.tokenHolderValidator])
          : lucid.newTx().attachSpendingValidator(tokenHolderValidator)
      )
      .compose(
        config.refScripts?.commitFoldValidator
          ? lucid.newTx().readFrom([config.refScripts.commitFoldValidator])
          : lucid.newTx().attachSpendingValidator(commitFoldValidator)
      )
      .compose(
        config.refScripts?.rewardFoldPolicy
          ? lucid.newTx().readFrom([config.refScripts.rewardFoldPolicy])
          : lucid.newTx().attachMintingPolicy(rewardFoldPolicy)
      )
      .compose(
        config.refScripts?.commitFoldPolicy
          ? lucid.newTx().readFrom([config.refScripts.commitFoldPolicy])
          : lucid.newTx().attachMintingPolicy(commitFoldPolicy)
      )
      .compose(
        config.refScripts?.tokenHolderPolicy
          ? lucid.newTx().readFrom([config.refScripts.tokenHolderPolicy])
          : lucid.newTx().attachMintingPolicy(tokenHolderPolicy)
      )
      .addSigner(await lucid.wallet.address())
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
