import {
  Lucid,
  SpendingValidator,
  Data,
  TxComplete,
  MintingPolicy,
  fromText,
  toUnit,
  UTxO,
  Constr,
} from "@anastasia-labs/lucid-cardano-fork";
import { FoldAct, FoldDatum, LiquidityFoldDatum, LiquidityNodeValidatorAction, LiquiditySetNode, NodeValidatorAction, SetNode } from "../core/contract.types.js";
import { MultiFoldConfig, Result } from "../core/types.js";
import { CFOLD, FOLDING_FEE_ADA, NODE_ADA, TIME_TOLERANCE_MS } from "../index.js";

export const multiLqFold = async (
  lucid: Lucid,
  config: MultiFoldConfig
): Promise<Result<TxComplete>> => {
  config.currenTime ??= Date.now();

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const foldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.foldValidator,
  };

  const stakeValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.collectStake
  }

  const liquidityValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.liquidityValidator
  }

  const foldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.foldPolicy,
  };

  const foldValidatorAddr = lucid.utils.validatorToAddress(foldValidator);

  const [foldUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(foldValidator),
    toUnit(lucid.utils.mintingPolicyToId(foldPolicy), fromText(CFOLD))
  );

  if (!foldUTxO || !foldUTxO.datum)
    return { type: "error", error: new Error("missing foldUTxO") };

  const oldFoldDatum = Data.from(foldUTxO.datum, LiquidityFoldDatum);

  //NOTE: node nodeRefUTxOs shuold be already ordered by keys, utxo type is better than outref since outref does not holds datum information, not sure yet if using utxo though
  const nodeUtxos = await lucid.utxosByOutRef(config.nodeRefInputs);

  const lastNodeRef = nodeUtxos[config.indices.length - 1].datum;
  if (!lastNodeRef) return { type: "error", error: new Error("missing datum") };

  const lastNodeRefDatum = Data.from(lastNodeRef, LiquiditySetNode);
  const committed = nodeUtxos.reduce((result: bigint, utxo: UTxO) => {
    return result + utxo.assets.lovelace - NODE_ADA;
  }, 0n);
  const totalAda = nodeUtxos.reduce((result: bigint, utxo: UTxO) => {
    return result + utxo.assets.lovelace - NODE_ADA - FOLDING_FEE_ADA;
  }, 0n);

  const newFoldDatum = Data.to(
    {
      currNode: {
        key: oldFoldDatum.currNode.key,
        next: lastNodeRefDatum.next,
      },
      committed: oldFoldDatum.committed + committed,
      owner: oldFoldDatum.owner,
    },
    FoldDatum
  );

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const sortedUtxos = [...nodeUtxos, foldUTxO, config.feeInput].sort((a, b) => {
      // First, compare by txHash
      if (a.txHash < b.txHash) return -1;
      if (a.txHash > b.txHash) return 1;

      // If txHash is equal, then compare by index
      return a.outputIndex - b.outputIndex;
    });

    const foldNodes = {
      nodeIdxs: sortedUtxos.reduce((acc, node, index) => {
        if (nodeUtxos.map(({ txHash }) => txHash).includes(node.txHash)) {
          acc.push(BigInt(index))
        }

        return acc;
      }, [] as bigint[]),
      outputIdxs: [...new Array(nodeUtxos.length).keys()].map(BigInt)
    };

    const foldRedeemer = Data.to(
      {
        FoldNodes: foldNodes,
      },
      FoldAct
    );

    const tx = lucid.newTx()
      .collectFrom([foldUTxO], foldRedeemer)
      .attachSpendingValidator(foldValidator)
      .attachSpendingValidator(liquidityValidator)
      .attachWithdrawalValidator(stakeValidator)

    nodeUtxos.forEach((utxo, index) => {
      const redeemer = Data.to({
        CommitFoldAct: {
          commitIndex: 0n
        }
      }, LiquidityNodeValidatorAction);
      
      console.log(`Attaching: ${utxo.txHash}#${index} from ${utxo.address}`)
      tx.collectFrom([utxo], redeemer)
    });

    nodeUtxos.forEach(utxo => {
      const datumCommitment = utxo.assets.lovelace - NODE_ADA;
      const oldDatum = Data.from(utxo.datum as string, LiquiditySetNode);
      const newDatum = Data.to({
        ...oldDatum,
        commitment: datumCommitment
      }, LiquiditySetNode);

      const newAssets = {
        ...utxo.assets,
        lovelace: NODE_ADA
      };

      console.log(newAssets, datumCommitment)

      tx.payToContract(
        lucid.utils.validatorToAddress(liquidityValidator),
        { inline: newDatum },
        newAssets
      )
    })

    const assets = {
      ...foldUTxO.assets,
      lovelace: foldUTxO.assets.lovelace + totalAda
    };
    
    const txComplete = await tx
      .payToContract(
        foldValidatorAddr,
        { inline: newFoldDatum },
        assets
      )
      .withdraw(
        lucid.utils.validatorToRewardAddress(stakeValidator),
        0n,
        Data.void()
      )
      .validFrom(lowerBound)
      .validTo(upperBound)
      .complete({
        coinSelection: false,
        change: {
          address: config.changeAddress,
        }
      });

    return { type: "ok", data: txComplete };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
