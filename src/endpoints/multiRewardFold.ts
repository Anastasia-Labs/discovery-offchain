import {
  Lucid,
  SpendingValidator,
  Data,
  TxComplete,
  MintingPolicy,
  fromText,
  toUnit,
  UTxO,
  OutRef,
  Address,
  PolicyId,
} from "lucid-cardano";
import { AddressSchema, FoldAct, FoldDatum, NodeValidatorAction, SetNode, SetNodeSchema } from "../core/contract.types.js";
import { CborHex, POSIXTime, Result } from "../core/types.js";
import { CFOLD } from "../index.js";

export type MultiRewardsFoldConfig = {
  nodeInputs: OutRef[];
  inputIdxs: number[];
  outputIdxs: number[];
  scripts: {
    foldPolicy: CborHex;
    foldValidator: CborHex;
    nodeValidator: CborHex
  };
  userAddress: Address;
  projectAddress: Address;
  projectCS: PolicyId;
  projectTN: string; 
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

export const RewardFoldActSchema = Data.Enum([
  Data.Object({
      FoldNodes: Data.Object({
      nodeIdxs: Data.Array(Data.Integer()),
      nodeOutIdxs: Data.Array(Data.Integer()),
      }),
  }),
  Data.Literal("FoldNode"),
  Data.Literal("Reclaim"),
]);
export type RewardFoldAct = Data.Static<typeof RewardFoldActSchema>
export const RewardFoldAct = RewardFoldActSchema as unknown as RewardFoldAct

export const multiRewardsFold = async (
  lucid: Lucid,
  config: MultiRewardsFoldConfig
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

  const foldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.foldValidator,
  };

  const foldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.foldPolicy,
  };

  const foldValidatorAddr = lucid.utils.validatorToAddress(foldValidator);

  const [foldUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(foldValidator),
    toUnit(lucid.utils.mintingPolicyToId(foldPolicy), fromText("RFold"))
  );

  if (!foldUTxO || !foldUTxO.datum)
    return { type: "error", error: new Error("missing foldUTxO") };

  const oldFoldDatum = Data.from(foldUTxO.datum, RewardFoldDatum);

  //NOTE: node Inputs should be already ordered by keys, utxo type is better than outref since outref does not holds datum information, not sure yet if using utxo though
  const nodeInputUTxOs = await lucid.utxosByOutRef(config.nodeInputs);

  const lastNode = nodeInputUTxOs[config.inputIdxs.length - 1 ].datum;
  if (!lastNode) return { type: "error", error: new Error("missing datum") };

  const lastNodeDatum = Data.from(lastNode, SetNode);
  console.log("lastNodeRefDatum", lastNodeDatum )

  const newFoldDatum = Data.to(
    {
      currNode: {
        key: oldFoldDatum.currNode.key,
        next: lastNodeDatum.next,
      },
      totalProjectTokens: oldFoldDatum.totalProjectTokens,
      totalCommitted: oldFoldDatum.totalCommitted,
      owner: oldFoldDatum.owner,
    },
    RewardFoldDatum
  );
  console.log(config.inputIdxs);

  const rewardFoldNodesAct = Data.to(
    {
      FoldNodes: {
        nodeIdxs: config.inputIdxs.map((index) => {
          return BigInt(index); 
        }),
        nodeOutIdxs: config.outputIdxs.map((index) => {
          return BigInt(index);
        }),
      },
    },
    RewardFoldAct
  );

const rewardFoldAct = Data.to("RewardFoldAct", NodeValidatorAction)

  try {
    const tx = await lucid
      .newTx()
      .collectFrom(nodeInputUTxOs, rewardFoldAct)
      .collectFrom([foldUTxO], rewardFoldNodesAct)
      .attachSpendingValidator(foldValidator)
      .payToContract(
        foldValidatorAddr,
        { inline: newFoldDatum },
        foldUTxO.assets
      )
    
    for (let i = 0; i < nodeInputUTxOs.length; i++){
      let currVal = nodeInputUTxOs[i].assets
      const nodeCommitment = currVal["lovelace"] - 3_000_000n
      const owedProjectTokens = (nodeCommitment * oldFoldDatum.totalProjectTokens) / oldFoldDatum.totalCommitted
      currVal["lovelace"] = 2_000_000n
      currVal[toUnit(config.projectCS, config.projectTN)] = owedProjectTokens
      tx.payToContract(nodeValidatorAddr, {inline: nodeInputUTxOs[i].datum!}, currVal)
    }
 
    const completeTx = await tx.complete();
    return { type: "ok", data: completeTx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
