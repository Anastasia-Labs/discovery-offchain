import {
  Lucid,
  MintingPolicy,
  SpendingValidator,
  TxComplete,
} from "lucid-fork";
import { ClaimNodeConfig, Result } from "../core/types.js";
import { TIME_TOLERANCE_MS } from "../index.js";

export const claimLqNode = async (
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

  const userPubKeyHash = lucid.utils.getAddressDetails(
    await lucid.wallet.address(),
  ).paymentCredential?.hash;

  if (!userPubKeyHash)
    return { type: "error", error: new Error("missing PubKeyHash") };

  const nodeUTXOs = config.nodeUTxOs
    ? config.nodeUTxOs
    : await lucid.utxosAt(liquidityValidatorAddr);

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const tx = await lucid.newTx().complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
