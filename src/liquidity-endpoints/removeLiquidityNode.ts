import {
    Lucid,
    SpendingValidator,
    MintingPolicy,
    Data,
    toUnit,
    TxComplete,
  } from "@anastasia-labs/lucid-cardano-fork";
  import {
    LiquidityNodeAction,
    NodeValidatorAction,
    LiquiditySetNode,
  } from "../core/contract.types.js";
  import { RemoveNodeConfig, Result } from "../core/types.js";
  import {
    divCeil,
    mkNodeKeyTN,
    TIME_TOLERANCE_MS,
    TWENTY_FOUR_HOURS_MS,
  } from "../index.js";
  
  export const removeLqNode = async (
    lucid: Lucid,
    config: RemoveNodeConfig
  ): Promise<Result<TxComplete>> => {
    config.currenTime ??= Date.now();
  
    const walletUtxos = await lucid.wallet.getUtxos();
  
    if (!walletUtxos.length)
      return { type: "error", error: new Error("No utxos in wallet") };
  
    const nodeValidator: SpendingValidator = {
      type: "PlutusV2",
      script: config.scripts.nodeValidator,
    };
  
    const nodeValidatorAddr = lucid.utils.validatorToAddress(nodeValidator);
  
    const nodePolicy: MintingPolicy = {
      type: "PlutusV2",
      script: config.scripts.nodePolicy,
    };
  
    const nodePolicyId = lucid.utils.mintingPolicyToId(nodePolicy);
  
    const userPubKeyHash = lucid.utils.getAddressDetails(
      await lucid.wallet.address()
    ).paymentCredential?.hash;
  
    if (!userPubKeyHash)
      return { type: "error", error: new Error("missing PubKeyHash") };
  
    const nodeUTXOs = config.nodeUTxOs
      ? config.nodeUTxOs
      : await lucid.utxosAt(nodeValidatorAddr);
  
    const redeemerNodeValidator = Data.to("LinkedListAct", NodeValidatorAction);
    const upperBound = config.currenTime + TIME_TOLERANCE_MS;
    const lowerBound = config.currenTime - TIME_TOLERANCE_MS;
  
    const beforeDeadline = upperBound < config.deadline;
    const beforeTwentyFourHours =
      upperBound < config.deadline - TWENTY_FOUR_HOURS_MS;
  
    // console.log("beforeDeadline", beforeDeadline);
    // console.log("beforeTwentyFourHours", beforeTwentyFourHours);
    // console.log(
    //   "time delta deadline - upperBound ms",
    //   config.deadline - upperBound
    // );
    // console.log(
    //   "time delta deadline - upperBound secs",
    //   (config.deadline - upperBound) / 1_000
    // );
    // console.log(
    //   "time delta deadline - upperBound min",
    //   (config.deadline - upperBound) / 60_000
    // );
    // console.log(
    //   "time delta deadline - upperBound hours",
    //   (config.deadline - upperBound) / 3_600_000
    // );
  
    try {
      if (beforeDeadline && beforeTwentyFourHours) {
        const node = nodeUTXOs.find((value) => {
          if (value.datum) {
            const datum = Data.from(value.datum, LiquiditySetNode);
            return datum.key !== null && datum.key == userPubKeyHash;
          }
        });
  
        if (!node || !node.datum)
          return { type: "error", error: new Error("missing node") };
  
        const nodeDatum = Data.from(node.datum, LiquiditySetNode);
  
        const prevNode = nodeUTXOs.find((value) => {
          if (value.datum) {
            const datum = Data.from(value.datum, LiquiditySetNode);
            return datum.next !== null && datum.next == userPubKeyHash;
          }
        });
  
        if (!prevNode || !prevNode.datum)
          return { type: "error", error: new Error("missing prevNode") };
  
        const prevNodeDatum = Data.from(prevNode.datum, LiquiditySetNode);
  
        const assets = {
          [toUnit(nodePolicyId, mkNodeKeyTN(userPubKeyHash))]: -1n,
        };
  
        const newPrevNode: LiquiditySetNode = {
          key: prevNodeDatum.key,
          next: nodeDatum.next,
          commitment: BigInt(0),
        };
  
        const newPrevNodeDatum = Data.to(newPrevNode, LiquiditySetNode);
  
        const redeemerNodePolicy = Data.to(
          {
            PRemove: {
              keyToRemove: userPubKeyHash,
              coveringNode: newPrevNode,
            },
          },
          LiquidityNodeAction
        );
        // console.log("beforeDeadline && beforeTwentyFourHours");
        const tx = await lucid
          .newTx()
          .collectFrom([node, prevNode], redeemerNodeValidator)
          .compose(
            config.refScripts?.nodeValidator
              ? lucid.newTx().readFrom([config.refScripts.nodeValidator])
              : lucid.newTx().attachSpendingValidator(nodeValidator)
          )
          .payToContract(
            nodeValidatorAddr,
            { inline: newPrevNodeDatum },
            prevNode.assets
          )
          .addSignerKey(userPubKeyHash)
          .mintAssets(assets, redeemerNodePolicy)
          .compose(
            config.refScripts?.nodePolicy
              ? lucid.newTx().readFrom([config.refScripts.nodePolicy])
              : lucid.newTx().attachMintingPolicy(nodePolicy)
          )
          .validFrom(lowerBound)
          .validTo(upperBound)
          .complete();
        return { type: "ok", data: tx };
      } else if (beforeDeadline && !beforeTwentyFourHours) {
        // console.log("beforeDeadline && !beforeTwentyFourHours");
        // console.log("node value", node.assets);
        // console.log("penaly ", divCeil(node.assets["lovelace"], 4n));
        const node = nodeUTXOs.find((value) => {
          if (value.datum) {
            const datum = Data.from(value.datum, LiquiditySetNode);
            return datum.key !== null && datum.key == userPubKeyHash;
          }
        });
  
        if (!node || !node.datum)
          return { type: "error", error: new Error("missing node") };
  
        const nodeDatum = Data.from(node.datum, LiquiditySetNode);
  
        const prevNode = nodeUTXOs.find((value) => {
          if (value.datum) {
            const datum = Data.from(value.datum, LiquiditySetNode);
            return datum.next !== null && datum.next == userPubKeyHash;
          }
        });
  
        if (!prevNode || !prevNode.datum)
          return { type: "error", error: new Error("missing prevNode") };
  
        const prevNodeDatum = Data.from(prevNode.datum, LiquiditySetNode);
  
        const assets = {
          [toUnit(nodePolicyId, mkNodeKeyTN(userPubKeyHash))]: -1n,
        };
  
        const newPrevNode: LiquiditySetNode = {
          key: prevNodeDatum.key,
          next: nodeDatum.next,
          commitment: BigInt(0),
        };
  
        const newPrevNodeDatum = Data.to(newPrevNode, LiquiditySetNode);
  
        const redeemerNodePolicy = Data.to(
          {
            PRemove: {
              keyToRemove: userPubKeyHash,
              coveringNode: newPrevNode,
            },
          },
          LiquidityNodeAction
        );
  
        const penaltyAmount = divCeil(node.assets["lovelace"], 4n);
  
        const tx = await lucid
          .newTx()
          .collectFrom([node, prevNode], redeemerNodeValidator)
          .compose(
            config.refScripts?.nodeValidator
              ? lucid.newTx().readFrom([config.refScripts.nodeValidator])
              : lucid.newTx().attachSpendingValidator(nodeValidator)
          )
          .payToContract(
            nodeValidatorAddr,
            { inline: newPrevNodeDatum },
            prevNode.assets
          )
          .payToAddress(config.penaltyAddress, {
            lovelace: penaltyAmount,
          })
          .addSignerKey(userPubKeyHash)
          .mintAssets(assets, redeemerNodePolicy)
          .compose(
            config.refScripts?.nodePolicy
              ? lucid.newTx().readFrom([config.refScripts.nodePolicy])
              : lucid.newTx().attachMintingPolicy(nodePolicy)
          )
          .validFrom(lowerBound)
          .validTo(upperBound)
          .complete();
  
        return { type: "ok", data: tx };
      } else {
        //TODO: tests removing the node once project token is in user's wallet
        const node = nodeUTXOs.find((value) => {
          if (value.datum) {
            const datum = Data.from(value.datum, LiquiditySetNode);
            return datum.key !== null && datum.key == userPubKeyHash;
          }
        });
  
        if (!node || !node.datum)
          return { type: "error", error: new Error("missing node") };
  
        const assets = {
          [toUnit(nodePolicyId, mkNodeKeyTN(userPubKeyHash))]: -1n,
        };
  
        const newPrevNode: LiquiditySetNode = {
          key: null,
          next: null,
          commitment: BigInt(0),
        };
  
        const redeemerNodePolicy = Data.to(
          {
            PRemove: {
              keyToRemove: userPubKeyHash,
              coveringNode: newPrevNode,
            },
          },
          LiquidityNodeAction
        );
  
        const tx = await lucid
          .newTx()
          .collectFrom([node], redeemerNodeValidator)
          .compose(
            config.refScripts?.nodeValidator
              ? lucid.newTx().readFrom([config.refScripts.nodeValidator])
              : lucid.newTx().attachSpendingValidator(nodeValidator)
          )
          .addSignerKey(userPubKeyHash)
          .mintAssets(assets, redeemerNodePolicy)
          .compose(
            config.refScripts?.nodePolicy
              ? lucid.newTx().readFrom([config.refScripts.nodePolicy])
              : lucid.newTx().attachMintingPolicy(nodePolicy)
          )
          .complete();
        return { type: "ok", data: tx };
      }
    } catch (error) {
      if (error instanceof Error) return { type: "error", error: error };
  
      return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
  };
  