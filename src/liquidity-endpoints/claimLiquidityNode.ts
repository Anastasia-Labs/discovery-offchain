import {
  Data,
  Lucid,
  MintingPolicy,
  SpendingValidator,
  TxComplete,
  toUnit,
} from "lucid-fork";
import { ClaimNodeConfig, Result } from "../core/types.js";
import {
  LiquidityNodeAction,
  LiquiditySetNode,
  NodeValidatorAction,
  TIME_TOLERANCE_MS,
  mkNodeKeyTN,
  rFold,
} from "../index.js";

export const claimLiquidityNode = async (
  lucid: Lucid,
  config: ClaimNodeConfig,
): Promise<Result<TxComplete>> => {
  config.currenTime ??= Date.now();

  const liquidityValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.liquidityValidator,
  };

  const liquidityValidatorAddr =
    lucid.utils.validatorToAddress(liquidityValidator);

  const liquidityPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.liquidityPolicy,
  };

  const liquidityPolicyId = lucid.utils.mintingPolicyToId(liquidityPolicy);

  const rewardFoldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.rewardFoldPolicy,
  };

  const rewardFoldPolicyId = lucid.utils.mintingPolicyToId(rewardFoldPolicy);

  const rewardFoldUtxo = await lucid.utxoByUnit(
    toUnit(rewardFoldPolicyId, rFold),
  );

  const userPubKeyHash = lucid.utils.getAddressDetails(
    await lucid.wallet.address(),
  ).paymentCredential?.hash;

  if (!userPubKeyHash)
    return { type: "error", error: new Error("missing PubKeyHash") };

  const nodeUTXOs = config.nodeUTxOs
    ? config.nodeUTxOs
    : await lucid.utxosAt(liquidityValidatorAddr);

  const node = nodeUTXOs.find((value) => {
    if (value.datum) {
      const datum = Data.from(value.datum, LiquiditySetNode);
      return datum.key !== null && datum.key == userPubKeyHash;
    }
  });

  if (!node || !node.datum)
    return { type: "error", error: new Error("missing node") };

  const redeemerNodeValidator = Data.to("LinkedListAct", NodeValidatorAction);

  const burnRedeemer = Data.to(
    {
      PRemove: {
        keyToRemove: userPubKeyHash,
        coveringNode: {
          commitment: 0n,
          key: null,
          next: null,
        },
      },
    },
    LiquidityNodeAction,
  );

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const tx = lucid
      .newTx()
      .collectFrom([node], redeemerNodeValidator)
      .readFrom([rewardFoldUtxo])
      .addSignerKey(userPubKeyHash)
      .mintAssets(
        {
          [toUnit(liquidityPolicyId, mkNodeKeyTN(userPubKeyHash))]: -1n,
        },
        burnRedeemer,
      )
      .validFrom(lowerBound)
      .validTo(upperBound);

    if (config.refScripts) {
      tx.readFrom([config.refScripts.liquidityPolicy]).readFrom([
        config.refScripts.liquidityValidator,
      ]);
    } else {
      tx.attachSpendingValidator(liquidityValidator).attachSpendingValidator(
        liquidityPolicy,
      );
    }

    const txComplete = await tx.complete();

    return { type: "ok", data: txComplete };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
