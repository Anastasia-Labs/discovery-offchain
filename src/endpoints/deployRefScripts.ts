import {
  Lucid,
  SpendingValidator,
  Tx,
  toUnit,
  fromText,
  Script,
} from "lucid-fork";
import { DeployRefScriptsConfig, Result } from "../core/types.js";

export type Deploy = {
  tx: Tx;
  deployPolicyId: string;
};

//TODO: make this generic
export const deployRefScripts = async (
  lucid: Lucid,
  config: DeployRefScriptsConfig
): Promise<Result<Deploy>> => {

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const script: Script = {
    type: "PlutusV2",
    script: config.script,
  };

  const alwaysFailsValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.alwaysFails,
  };

  const alwaysFailsAddr = lucid.utils.validatorToAddress(alwaysFailsValidator);

  const deployKey = lucid.utils.getAddressDetails(await lucid.wallet.address())
    .paymentCredential?.hash;

  if (!deployKey)
    return { type: "error", error: new Error("missing PubKeyHash") };

  const deployPolicy = lucid.utils.nativeScriptFromJson({
    type: "all",
    scripts: [
      { type: "sig", keyHash: deployKey },
      {
        type: "before",
        slot: lucid.utils.unixTimeToSlot(config.currenTime + 900_000), // 15 minutes
      },
    ],
  });

  const deployPolicyId = lucid.utils.mintingPolicyToId(deployPolicy);

  try {
    const tx = lucid
      .newTx()
      .attachMintingPolicy(deployPolicy)
      .mintAssets({
        [toUnit(deployPolicyId, fromText(config.name))]: 1n,
      })
      .payToAddressWithData(
        alwaysFailsAddr,
        { scriptRef: script },
        { [toUnit(deployPolicyId, fromText(config.name))]: 1n }
      )
      .validTo(config.currenTime + 800_000);

    if (config.spendingInput) {
      tx.collectFrom([config.spendingInput])
    }

    return {
      type: "ok",
      data: {
        tx,
        deployPolicyId: deployPolicyId
      }
    };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
