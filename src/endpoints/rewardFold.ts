import {
  Lucid,
  SpendingValidator,
  Data,
  TxComplete,
  MintingPolicy,
  fromText,
  toUnit,
  WithdrawalValidator,
} from "lucid-fork";
import {
  NodeValidatorAction,
  SetNode,
  RewardFoldDatum,
  RewardFoldAct,
} from "../core/contract.types.js";
import { Result, RewardFoldConfig } from "../core/types.js";
import {
  FOLDING_FEE_ADA,
  NODE_ADA,
  PROTOCOL_PAYMENT_KEY,
  PROTOCOL_STAKE_KEY,
} from "../index.js";

export const rewardFold = async (
  lucid: Lucid,
  config: RewardFoldConfig,
): Promise<Result<TxComplete>> => {
  const nodeValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.nodeValidator,
  };
  const nodeValidatorAddr = lucid.utils.validatorToAddress(nodeValidator);

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

  const discoveryStakeValidator: WithdrawalValidator = {
    type: "PlutusV2",
    script: config.scripts.discoveryStake,
  };

  const [rewardUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(rewardFoldValidator),
    toUnit(lucid.utils.mintingPolicyToId(rewardFoldPolicy), fromText("RFold")),
  );
  if (!rewardUTxO.datum)
    return { type: "error", error: new Error("missing RewardFoldDatum") };

  const oldRewardFoldDatum = Data.from(rewardUTxO.datum, RewardFoldDatum);

  const nodeInput = config.nodeInputs.find((utxo) => {
    if (utxo.datum) {
      const nodeDatum = Data.from(utxo.datum, SetNode);
      return nodeDatum.key == oldRewardFoldDatum.currNode.next;
    }
  });

  if (!nodeInput?.datum)
    return { type: "error", error: new Error("missing SetNodeDatum") };

  const nodeDatum = Data.from(nodeInput.datum, SetNode);
  const newFoldDatum = Data.to(
    {
      currNode: {
        key: nodeDatum.key,
        next: nodeDatum.next,
      },
      totalProjectTokens: oldRewardFoldDatum.totalProjectTokens,
      totalCommitted: oldRewardFoldDatum.totalCommitted,
      owner: oldRewardFoldDatum.owner,
    },
    RewardFoldDatum,
  );

  const nodeCommitment = nodeInput.assets["lovelace"] - NODE_ADA;
  // console.log("nodeCommitment", nodeCommitment);
  const owedProjectTokenAmount =
    (nodeCommitment * oldRewardFoldDatum.totalProjectTokens) /
    oldRewardFoldDatum.totalCommitted;
  // console.log("owedProjectTokenAmount", owedProjectTokenAmount);

  const [nodeAsset] = Object.entries(nodeInput.assets).filter(
    ([key, value]) => {
      return key != "lovelace";
    },
  );

  const remainingProjectTokenAmount =
    rewardUTxO.assets[toUnit(config.projectCS, fromText(config.projectTN))] -
    owedProjectTokenAmount;

  try {
    if (oldRewardFoldDatum.currNode.next != null) {
      const tx = await lucid
        .newTx()
        .collectFrom([nodeInput], Data.to("RewardFoldAct", NodeValidatorAction))
        .collectFrom([rewardUTxO], Data.to("RewardsFoldNode", RewardFoldAct))
        .withdraw(
          lucid.utils.validatorToRewardAddress(discoveryStakeValidator),
          0n,
          Data.void(),
        )
        .payToContract(
          rewardFoldValidatorAddr,
          { inline: newFoldDatum },
          {
            ["lovelace"]: rewardUTxO.assets["lovelace"],
            [toUnit(
              lucid.utils.mintingPolicyToId(rewardFoldPolicy),
              fromText("RFold"),
            )]: 1n,
            [toUnit(config.projectCS, fromText(config.projectTN))]:
              remainingProjectTokenAmount,
          },
        )
        .payToContract(
          nodeValidatorAddr,
          { inline: nodeInput.datum },
          {
            [nodeAsset[0]]: nodeAsset[1],
            [toUnit(config.projectCS, fromText(config.projectTN))]:
              owedProjectTokenAmount,
            ["lovelace"]: NODE_ADA - FOLDING_FEE_ADA,
          },
        )
        .payToAddress(config.projectAddress, { lovelace: nodeCommitment })
        .payToAddress(
          lucid.utils.credentialToAddress(
            lucid.utils.keyHashToCredential(PROTOCOL_PAYMENT_KEY),
            lucid.utils.keyHashToCredential(PROTOCOL_STAKE_KEY),
          ),
          {
            lovelace: FOLDING_FEE_ADA,
          },
        )
        .readFrom([config.refScripts.rewardFoldValidator])
        .readFrom([config.refScripts.nodeValidator])
        .readFrom([config.refScripts.discoveryStake]);

      return {
        type: "ok",
        data: await (process.env.NODE_ENV == "emulator"
          ? tx.complete()
          : tx.complete({ nativeUplc: false })),
      };
    } else {
      const tx = await lucid
        .newTx()
        .collectFrom([nodeInput], Data.to("RewardFoldAct", NodeValidatorAction))
        .collectFrom([rewardUTxO], Data.to("RewardsReclaim", RewardFoldAct))
        .withdraw(
          lucid.utils.validatorToRewardAddress(discoveryStakeValidator),
          0n,
          Data.void(),
        )
        .payToContract(
          nodeValidatorAddr,
          { inline: nodeInput.datum },
          {
            [nodeAsset[0]]: nodeAsset[1],
            [toUnit(config.projectCS, fromText(config.projectTN))]:
              rewardUTxO.assets[
                toUnit(config.projectCS, fromText(config.projectTN))
              ],
            ["lovelace"]: NODE_ADA - FOLDING_FEE_ADA,
          },
        )
        .payToAddress(config.projectAddress, { lovelace: nodeCommitment })
        .payToAddress(
          lucid.utils.credentialToAddress(
            lucid.utils.keyHashToCredential(PROTOCOL_PAYMENT_KEY),
            lucid.utils.keyHashToCredential(PROTOCOL_STAKE_KEY),
          ),
          {
            lovelace: FOLDING_FEE_ADA,
          },
        )
        .readFrom([config.refScripts.rewardFoldValidator])
        .readFrom([config.refScripts.nodeValidator])
        .readFrom([config.refScripts.discoveryStake])
        .addSigner(await lucid.wallet.address())
        .complete();
      return { type: "ok", data: tx };
    }
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
