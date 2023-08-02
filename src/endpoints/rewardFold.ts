import {
  Lucid,
  SpendingValidator,
  Data,
  TxComplete,
  MintingPolicy,
  fromText,
  toUnit,
  WithdrawalValidator,
} from "lucid-cardano";
import {
  AddressSchema,
  NodeValidatorAction,
  SetNode,
  SetNodeSchema,
} from "../core/contract.types.js";
import { Result, RewardFoldConfig } from "../core/types.js";
import { NODE_ADA } from "../index.js";

export const RewardFoldDatumSchema = Data.Object({
  currNode: SetNodeSchema,
  totalProjectTokens: Data.Integer(),
  totalCommitted: Data.Integer(),
  owner: AddressSchema,
});
export type RewardFoldDatum = Data.Static<typeof RewardFoldDatumSchema>;
export const RewardFoldDatum =
  RewardFoldDatumSchema as unknown as RewardFoldDatum;

export const RewardFoldActSchema = Data.Enum([
  Data.Object({
    RewardsFoldNodes: Data.Object({
      nodeIdxs: Data.Array(Data.Integer()),
      nodeOutIdxs: Data.Array(Data.Integer()),
    }),
  }),
  Data.Literal("RewardsFoldNode"),
  Data.Literal("RewardsReclaim"),
]);
export type RewardFoldAct = Data.Static<typeof RewardFoldActSchema>;
export const RewardFoldAct = RewardFoldActSchema as unknown as RewardFoldAct;

export const rewardFold = async (
  lucid: Lucid,
  config: RewardFoldConfig
): Promise<Result<TxComplete>> => {

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

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
    toUnit(lucid.utils.mintingPolicyToId(rewardFoldPolicy), fromText("RFold"))
  );
  if (!rewardUTxO.datum)
    return { type: "error", error: new Error("missing RewardFoldDatum") };

  // console.log("rewardUTxO", rewardUTxO);

  const oldRewardFoldDatum = Data.from(rewardUTxO.datum, RewardFoldDatum);
  // console.log("RewardFoldDatum", oldRewardFoldDatum);

  const nodeInput = config.nodeInputs.find((utxo) => {
    if (utxo.datum) {
      const nodeDatum = Data.from(utxo.datum, SetNode);
      return nodeDatum.key == oldRewardFoldDatum.currNode.next;
    }
  });

  if (!nodeInput?.datum)
    return { type: "error", error: new Error("missing SetNodeDatum") };

  const nodeDatum = Data.from(nodeInput.datum, SetNode);
  // console.log("nodeDatum", nodeDatum);

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
    RewardFoldDatum
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
    }
  );

  const remainingProjectTokenAmount =
    rewardUTxO.assets[toUnit(config.projectCS, fromText(config.projectTN))] -
    owedProjectTokenAmount;
  // console.log("remainingProjectTokenAmount", remainingProjectTokenAmount);
  // console.log("nodeAsset", nodeAsset);
  // console.log(
  //   "rewardUTxO.assets",
  //   rewardUTxO.assets[toUnit(config.projectCS, fromText(config.projectTN))]
  // );
  // console.log("config.projectCS", config.projectCS);
  // console.log("config.projectTN", fromText(config.projectTN));
  // console.log('rewardUTxO.assets["lovelace"]', rewardUTxO.assets["lovelace"]);
  // console.log(
  //   "stakeCredential address",
  //   lucid.utils.validatorToRewardAddress(discoveryStakeValidator)
  // );

  try {
    if (oldRewardFoldDatum.currNode.next != null) {
      const tx = await lucid
        .newTx()
        .collectFrom([nodeInput], Data.to("RewardFoldAct", NodeValidatorAction))
        .collectFrom([rewardUTxO], Data.to("RewardsFoldNode", RewardFoldAct))
        .withdraw(
          lucid.utils.validatorToRewardAddress(discoveryStakeValidator),
          0n,
          Data.void()
        )
        .payToContract(
          rewardFoldValidatorAddr,
          { inline: newFoldDatum },
          {
            ["lovelace"]: rewardUTxO.assets["lovelace"],
            [toUnit(
              lucid.utils.mintingPolicyToId(rewardFoldPolicy),
              fromText("RFold")
            )]: 1n,
            [toUnit(config.projectCS, fromText(config.projectTN))]:
              remainingProjectTokenAmount,
          }
        )
        .payToContract(
          nodeValidatorAddr,
          { inline: nodeInput.datum },
          {
            [nodeAsset[0]]: nodeAsset[1],
            [toUnit(config.projectCS, fromText(config.projectTN))]:
              owedProjectTokenAmount,
            ["lovelace"]: NODE_ADA,
          }
        )
        .payToAddress(config.projectAddress, { lovelace: nodeCommitment })
        .readFrom([config.refScripts.rewardFoldValidator])
        .readFrom([config.refScripts.nodeValidator])
        .readFrom([config.refScripts.discoveryStake])
        .complete({nativeUplc: false});
      return { type: "ok", data: tx };
    } else {
      const tx = await lucid
        .newTx()
        .collectFrom([nodeInput], Data.to("RewardFoldAct", NodeValidatorAction))
        .collectFrom([rewardUTxO], Data.to("RewardsReclaim", RewardFoldAct))
        .withdraw(
          lucid.utils.validatorToRewardAddress(discoveryStakeValidator),
          0n,
          Data.void()
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
            ["lovelace"]: NODE_ADA,
          }
        )
        .payToAddress(config.projectAddress, { lovelace: nodeCommitment })
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
