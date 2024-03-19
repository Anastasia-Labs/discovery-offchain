import {
    Lucid,
    SpendingValidator,
    MintingPolicy,
    Data,
    toUnit,
    TxComplete,
  } from "lucid-fork";
  import {
    LiquidityNodeAction,
    LiquiditySetNode,
    NodeValidatorAction,
  } from "../core/contract.types.js";
  import { InsertNodeConfig, Result } from "../core/types.js";
  import { mkNodeKeyTN, TIME_TOLERANCE_MS, MIN_COMMITMENT_ADA, TT_UTXO_ADDITIONAL_ADA } from "../index.js";
  
  export const insertLqNode = async (
    lucid: Lucid,
    config: InsertNodeConfig
  ): Promise<Result<TxComplete>> => {
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
  
    const userKey = lucid.utils.getAddressDetails(await lucid.wallet.address())
      .paymentCredential?.hash;
  
    if (!userKey)
      return { type: "error", error: new Error("missing PubKeyHash") };
  
    const nodeUTXOs = config.nodeUTxOs
      ? config.nodeUTxOs
      : await lucid.utxosAt(nodeValidatorAddr);
    
    const coveringNode = nodeUTXOs.find((value) => {
      if (value.datum) {
        const datum = Data.from(value.datum, LiquiditySetNode);
        return (
          (datum.key == null || datum.key < userKey) &&
          (datum.next == null || userKey < datum.next)
        );
      }
    });
  
    if (!coveringNode || !coveringNode.datum)
      return { type: "error", error: new Error("missing coveringNode") };
  
    const coveringNodeDatum = Data.from(coveringNode.datum, LiquiditySetNode);
  
    const prevNodeDatum = Data.to(
      {
        key: coveringNodeDatum.key,
        next: userKey,
        commitment: BigInt(0),
      },
      LiquiditySetNode
    );
  
    const nodeDatum = Data.to(
      {
        key: userKey,
        next: coveringNodeDatum.next,
        commitment: BigInt(0),
      },
      LiquiditySetNode
    );
  
    const redeemerNodePolicy = Data.to(
      {
        PInsert: {
          keyToInsert: userKey,
          coveringNode: coveringNodeDatum,
        },
      },
      LiquidityNodeAction
    );
  
    const redeemerNodeValidator = Data.to("LinkedListAct", NodeValidatorAction);
  
    const assets = {
      [toUnit(nodePolicyId, mkNodeKeyTN(userKey))]: 1n,
    };
  
    if (config.amountLovelace < MIN_COMMITMENT_ADA) {
      throw new Error("Amount deposited is less than the minimum amount.");
    }

    const correctAmount = config.amountLovelace + TT_UTXO_ADDITIONAL_ADA;
    
    config.currenTime ??= Date.now();
    const upperBound = config.currenTime + TIME_TOLERANCE_MS;
    const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

    try {
      const tx = lucid
        .newTx()
        .collectFrom([coveringNode], redeemerNodeValidator)
        .compose(
          config.refScripts?.nodeValidator
            ? lucid.newTx().readFrom([config.refScripts.nodeValidator])
            : lucid.newTx().attachSpendingValidator(nodeValidator)
        )
        .payToContract(
          nodeValidatorAddr,
          { inline: prevNodeDatum },
          coveringNode.assets
        )
        .payToContract(
          nodeValidatorAddr,
          { inline: nodeDatum },
          { ...assets, lovelace: correctAmount }
        )
        .addSignerKey(userKey)
        .mintAssets(assets, redeemerNodePolicy)
        .validFrom(lowerBound)
        .validTo(upperBound)
        .compose(
          config.refScripts?.nodePolicy
            ? lucid.newTx().readFrom([config.refScripts.nodePolicy])
            : lucid.newTx().attachMintingPolicy(nodePolicy)
        );

      const txComplete = await tx.complete({
        nativeUplc: true
      });
  
      return { type: "ok", data: txComplete };
    } catch (error) {
      if (error instanceof Error) return { type: "error", error: error };
  
      return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
  };
  