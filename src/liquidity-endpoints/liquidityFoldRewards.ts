import {
  Assets,
  Data,
  Lucid,
  MintingPolicy,
  SpendingValidator,
  TxComplete,
  WithdrawalValidator,
  toUnit,
} from "lucid-fork";
import {
  LiquidityNodeValidatorAction,
  LiquidityRewardFoldDatum,
  LiquiditySetNode,
  RewardFoldAct,
} from "../core/contract.types.js";
import { Result, RewardLiquidityFoldConfig } from "../core/types.js";
import { FOLDING_FEE_ADA, TIME_TOLERANCE_MS, rFold } from "../index.js";

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

  const [rewardFoldUTxO] = await lucid.provider.getUtxosWithUnit(
    rewardFoldValidatorAddr,
    toUnit(lucid.utils.mintingPolicyToId(rewardFoldPolicy), rFold),
  );

  if (!rewardFoldUTxO || !rewardFoldUTxO.datum)
    return { type: "error", error: new Error("missing foldUTxO") };

  const oldFoldDatum = Data.from(
    rewardFoldUTxO.datum,
    LiquidityRewardFoldDatum,
  );

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

  const newFoldDatum = Data.to(
    {
      ...oldFoldDatum,
      currNode: {
        ...oldFoldDatum.currNode,
        next: lastNodeRefDatum.next,
      },
    },
    LiquidityRewardFoldDatum,
  );

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const indexingSet = sortedIndexingPairs.map(({ index }) => BigInt(index));

    const foldNodes = {
      nodeIdxs: indexingSet,
      nodeOutIdxs: [...new Array(nodeUtxos.length).keys()].map(BigInt),
    };

    const foldRedeemer = Data.to(
      {
        RewardsFoldNodes: foldNodes,
      },
      RewardFoldAct,
    );

    const tx = lucid
      .newTx()
      .collectFrom([config.feeInput])
      .collectFrom([rewardFoldUTxO], foldRedeemer);

    if (config.refInputs) {
      tx.readFrom([config.refInputs.liquidityValidator])
        .readFrom([config.refInputs.rewardFoldValidator])
        .readFrom([config.refInputs.rewardStake]);
    } else {
      tx.attachSpendingValidator(rewardFoldValidator)
        .attachSpendingValidator(liquidityValidator)
        .attachWithdrawalValidator(rewardStakeValidator);
    }

    nodeUtxos.forEach((utxo) => {
      const redeemer = Data.to("RewardFoldAct", LiquidityNodeValidatorAction);
      tx.collectFrom([utxo], redeemer);
    });

    let leftOverLpTokens = rewardFoldUTxO.assets[config.lpTokenAssetId];
    sortedIndexingPairs.forEach(({ item: utxo }) => {
      const datum = Data.from(utxo.datum as string, LiquiditySetNode);
      const utxoLpTokenAmount =
        (datum.commitment * oldFoldDatum.totalLPTokens) /
        oldFoldDatum.totalCommitted;

      const newAssets: Assets = {
        ...utxo.assets,
        lovelace: utxo.assets.lovelace - FOLDING_FEE_ADA,
        [config.lpTokenAssetId]: utxoLpTokenAmount,
      };

      tx.payToContract(
        lucid.utils.validatorToAddress(liquidityValidator),
        { inline: utxo.datum as string },
        newAssets,
      );

      console.log(
        `Folding: ${utxo.txHash}#${utxo.outputIndex} with ${utxoLpTokenAmount} LP Tokens`,
      );

      leftOverLpTokens -= utxoLpTokenAmount;
    });

    const rewardFoldAssets: Assets = {
      ...rewardFoldUTxO.assets,
      lovelace: rewardFoldUTxO.assets.lovelace,
    };

    if (leftOverLpTokens > 0n) {
      rewardFoldAssets[config.lpTokenAssetId] = leftOverLpTokens;
    } else if (leftOverLpTokens === 0n) {
      delete rewardFoldAssets[config.lpTokenAssetId];
    } else if (leftOverLpTokens < 0n) {
      throw new Error(
        "Attempted to send negative lp tokens to reward fold utxo.",
      );
    }

    tx.payToContract(
      rewardFoldValidatorAddr,
      { inline: newFoldDatum },
      rewardFoldAssets,
    )
      .withdraw(
        lucid.utils.validatorToRewardAddress(rewardStakeValidator),
        0n,
        Data.void(),
      )
      .validFrom(lowerBound)
      .validTo(upperBound);

    const nativeUplc = !Boolean(config.disableNativeUplc === true);
    const txComplete = await tx.complete({
      coinSelection: false,
      nativeUplc,
      change: {
        address: config.changeAddress,
      },
    });

    return { type: "ok", data: txComplete };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(JSON.stringify(error)) };
  }
};
