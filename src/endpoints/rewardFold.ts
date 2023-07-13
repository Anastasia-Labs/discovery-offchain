import {
  Lucid,
  SpendingValidator,
  Data,
  TxComplete,
  MintingPolicy,
  fromText,
  toUnit,
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
  lucid.selectWalletFrom({ address: config.userAddress });

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

  const [rewardUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(rewardFoldValidator),
    toUnit(lucid.utils.mintingPolicyToId(rewardFoldPolicy), fromText("RFold"))
  );
  if (!rewardUTxO.datum)
    return { type: "error", error: new Error("missing RewardFoldDatum") };

  console.log("rewardUTxO", rewardUTxO);

  const oldRewardFoldDatum = Data.from(rewardUTxO.datum, RewardFoldDatum);
  console.log("RewardFoldDatum", oldRewardFoldDatum);

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
    RewardFoldDatum
  );

  const rewardFoldAct = Data.to("RewardFoldAct", NodeValidatorAction);
  const rewardFoldNodesAct = Data.to("RewardsFoldNode", RewardFoldAct);
  const nodeCommitment = nodeInput.assets["lovelace"] - NODE_ADA;
  console.log("nodeCommitment", nodeCommitment);
  const owedProjectTokenAmount =
    (nodeCommitment * oldRewardFoldDatum.totalProjectTokens) /
    oldRewardFoldDatum.totalCommitted;
  console.log("owedProjectTokenAmount", owedProjectTokenAmount);

  const [nodeAsset] = Object.entries(nodeInput.assets).filter(
    ([key, value]) => {
      return key != "lovelace";
    }
  );
  const projetTokenAmount =
    rewardUTxO.assets[toUnit(config.projectCS, fromText(config.projectTN))];
  console.log("projectTokenAmount", projetTokenAmount);

  const remainingProjectTokenAmount =
    rewardUTxO.assets[toUnit(config.projectCS, fromText(config.projectTN))] -
    owedProjectTokenAmount;
  console.log("remainingProjectTokenAmount", remainingProjectTokenAmount);
  console.log("nodeAsset", nodeAsset);
  console.log(
    "rewardUTxO.assets",
    rewardUTxO.assets[toUnit(config.projectCS, fromText(config.projectTN))]
  );
  console.log("config.projectCS", config.projectCS);
  console.log("config.projectTN", fromText(config.projectTN));
  console.log('rewardUTxO.assets["lovelace"]', rewardUTxO.assets["lovelace"]);
  //TODO:
  //- we shuold make sure all nodes including headnode locks 3 ADA as minimum, i think this is not happening with head node
  //- we need to test the remove node logic once all users receive their project token
  //- rewarFold function shuold work with a list of utxos receives from the upstream logic, the  list of utxos should be query only once to minimize api calls
  //- rewardFold function should iterate over all node utxos
  //- currently redeemer RewardFoldAct logic is disable with "pconstant ()"

  try {
    const tx = await lucid
      .newTx()
      .collectFrom([nodeInput], rewardFoldAct)
      .collectFrom([rewardUTxO], rewardFoldNodesAct)
      .payToContract(
        rewardFoldValidatorAddr,
        { inline: newFoldDatum },
        {
          ["lovelace"]: rewardUTxO.assets["lovelace"],
          [toUnit( lucid.utils.mintingPolicyToId(rewardFoldPolicy), fromText("RFold"))]: 1n,
          [toUnit(config.projectCS, fromText(config.projectTN))]: remainingProjectTokenAmount,
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
      .compose(
        config.refScripts?.rewardFoldValidator
          ? lucid.newTx().readFrom([config.refScripts.rewardFoldValidator])
          : lucid.newTx().attachSpendingValidator(rewardFoldValidator)
      )
      .compose(
        config.refScripts?.nodeValidator
          ? lucid.newTx().readFrom([config.refScripts.nodeValidator])
          : lucid.newTx().attachSpendingValidator(nodeValidator)
      )
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
