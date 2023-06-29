import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  TxComplete,
  toUnit,
  fromText,
  Data,
} from "lucid-cardano";
import { DeployRefScriptsConfig, Result } from "../core/types.js";

type Deploy = {
  tx: TxComplete;
  unit: {
    nodeValidator: string;
    nodePolicy: string;
  };
};

export const deployRefScripts = async (
  lucid: Lucid,
  config: DeployRefScriptsConfig
): Promise<Result<Deploy>> => {
  config.currenTime ??= Date.now();

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const nodeValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.nodeValidator,
  };

  const nodePolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.nodePolicy,
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
        slot: lucid.utils.unixTimeToSlot(config.currenTime + 1000000),
      },
    ],
  });

  const deployPolicyId = lucid.utils.mintingPolicyToId(deployPolicy);

  const nodeValidatorUnit = toUnit(deployPolicyId, fromText("NodeValidator"));
  const nodePolicyUnit = toUnit(deployPolicyId, fromText("NodePolicy"));

  const nodeValidatorAsset = {
    [nodeValidatorUnit]: 1n,
  };
  const nodePolicyAsset = {
    [nodePolicyUnit]: 1n,
  };

  try {
    const tx = await lucid
      .newTx()
      .attachMintingPolicy(deployPolicy)
      .mintAssets({
        [nodeValidatorUnit]: 1n,
        [nodePolicyUnit]: 1n,
      })
      .payToAddressWithData(
        alwaysFailsAddr,
        { scriptRef: nodeValidator },
        nodeValidatorAsset
      )
      .payToAddressWithData(
        alwaysFailsAddr,
        { scriptRef: nodePolicy },
        nodePolicyAsset
      )
      .validTo(config.currenTime + 30_000)
      .complete();

    return {
      type: "ok",
      data: {
        tx: tx,
        unit: {
          nodeValidator: nodeValidatorUnit,
          nodePolicy: nodePolicyUnit,
        },
      },
    };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
