import {
  Data,
  Lucid,
  MintingPolicy,
  SpendingValidator,
  TxComplete,
  UTxO,
  WithdrawalValidator,
  fromText,
  toUnit,
} from "lucid-fork";
import {
  FoldAct,
  LiquidityFoldDatum,
  LiquidityNodeValidatorAction,
  LiquiditySetNode,
} from "../core/contract.types.js";
import { Result, RewardLiquidityFoldConfig } from "../core/types.js";
import {
  CFOLD,
  FOLDING_FEE_ADA,
  TIME_TOLERANCE_MS,
  TT_UTXO_ADDITIONAL_ADA,
} from "../index.js";

export const liquidityFoldRewards = async (
  lucid: Lucid,
  config: RewardLiquidityFoldConfig,
): Promise<Result<TxComplete>> => {
  config.currenTime ??= Date.now();

  const rewardStakeValidator: WithdrawalValidator = {
    type: "PlutusV2",
    script: config.scripts.rewardStake,
  };

  const rewardFoldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldValidator,
  };

  const rewardFoldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldPolicy,
  };

  const liquidityValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.liquidityValidator,
  };

  const rewardFoldValidatorAddr =
    lucid.utils.validatorToAddress(rewardFoldValidator);

  const [rewardFoldUTxO] = await lucid.utxosAtWithUnit(
    rewardFoldValidatorAddr,
    toUnit(lucid.utils.mintingPolicyToId(rewardFoldPolicy), fromText(CFOLD)),
  );

  if (!rewardFoldUTxO || !rewardFoldUTxO.datum)
    return { type: "error", error: new Error("missing foldUTxO") };

  const oldFoldDatum = Data.from(rewardFoldUTxO.datum, LiquidityFoldDatum);

  //NOTE: node nodeRefUTxOs shuold be already ordered by keys, utxo type is better than outref since outref does not holds datum information, not sure yet if using utxo though
  const nodeUtxos = await lucid.utxosByOutRef(config.nodeRefInputs);

  const sortedUtxos = [...nodeUtxos, rewardFoldUTxO, config.feeInput].sort(
    (a, b) => {
      // First, compare by txHash
      if (a.txHash < b.txHash) return -1;
      if (a.txHash > b.txHash) return 1;

      // If txHash is equal, then compare by index
      return a.outputIndex - b.outputIndex;
    },
  );

  const indexingPairs = sortedUtxos
    .map((item, index) => {
      return {
        item,
        index,
      };
    })
    .filter(({ item }) =>
      nodeUtxos.find(
        ({ txHash, outputIndex }) =>
          `${txHash}#${outputIndex}` === `${item.txHash}#${item.outputIndex}`,
      ),
    );

  const sortedIndexingPairs = indexingPairs.sort((a, b) => {
    const aKey = Data.from(a.item.datum as string, LiquiditySetNode);
    const bKey = Data.from(b.item.datum as string, LiquiditySetNode);

    if (aKey.key === null) return -1;
    if (bKey.key === null) return -1;

    if (aKey.key < bKey.key) return -1;

    return 1;
  });

  const lastNodeRef = sortedIndexingPairs[config.indices.length - 1].item.datum;
  if (!lastNodeRef) return { type: "error", error: new Error("missing datum") };

  const lastNodeRefDatum = Data.from(lastNodeRef, LiquiditySetNode);
  const totalAda = nodeUtxos.reduce((result: bigint, utxo: UTxO) => {
    return result + utxo.assets.lovelace - TT_UTXO_ADDITIONAL_ADA;
  }, 0n);

  const newFoldDatum = Data.to(
    {
      currNode: {
        key: oldFoldDatum.currNode.key,
        next: lastNodeRefDatum.next,
        commitment: 0n,
      },
      committed: oldFoldDatum.committed + totalAda,
      owner: oldFoldDatum.owner,
    },
    LiquidityFoldDatum,
  );

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const indexingSet = sortedIndexingPairs.map(({ index }) => BigInt(index));

    const foldNodes = {
      nodeIdxs: indexingSet,
      outputIdxs: [...new Array(nodeUtxos.length).keys()].map(BigInt),
    };

    const foldRedeemer = Data.to(
      {
        FoldNodes: foldNodes,
      },
      FoldAct,
    );

    const tx = lucid
      .newTx()
      .collectFrom([config.feeInput])
      .collectFrom([rewardFoldUTxO], foldRedeemer);

    if (config.refInputs) {
      tx.readFrom([config.refInputs.liquidityValidator])
        .readFrom([config.refInputs.rewardFoldPolicy])
        .readFrom([config.refInputs.rewardFoldValidator])
        .readFrom([config.refInputs.rewardStake]);
    } else {
      tx.attachSpendingValidator(rewardFoldValidator)
        .attachSpendingValidator(liquidityValidator)
        .attachWithdrawalValidator(rewardStakeValidator);
    }

    nodeUtxos.forEach((utxo) => {
      const redeemer = Data.to("CommitFoldAct", LiquidityNodeValidatorAction);

      const datum = Data.from(utxo.datum as string, LiquiditySetNode);
      console.log(
        `Folding: ${utxo.txHash}#${utxo.outputIndex} with key: ${datum.key}`,
      );
      tx.collectFrom([utxo], redeemer);
    });

    sortedIndexingPairs.forEach(({ item: utxo }) => {
      const datumCommitment = utxo.assets.lovelace - TT_UTXO_ADDITIONAL_ADA;
      const oldDatum = Data.from(utxo.datum as string, LiquiditySetNode);
      const newDatum = Data.to(
        {
          ...oldDatum,
          commitment: datumCommitment,
        },
        LiquiditySetNode,
      );

      const newAssets = {
        ...utxo.assets,
        lovelace: utxo.assets.lovelace - datumCommitment - FOLDING_FEE_ADA,
      };

      tx.payToContract(
        lucid.utils.validatorToAddress(liquidityValidator),
        { inline: newDatum },
        newAssets,
      );
    });

    tx.payToContract(
      rewardFoldValidatorAddr,
      { inline: newFoldDatum },
      {
        ...rewardFoldUTxO.assets,
        lovelace: rewardFoldUTxO.assets.lovelace + totalAda,
      },
    )
      .withdraw(
        lucid.utils.validatorToRewardAddress(rewardStakeValidator),
        0n,
        Data.void(),
      )
      .validFrom(lowerBound)
      .validTo(upperBound);

    const txComplete = await tx.complete({
      coinSelection: false,
      nativeUplc: true,
      change: {
        address: config.changeAddress,
      },
    });

    return { type: "ok", data: txComplete };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
