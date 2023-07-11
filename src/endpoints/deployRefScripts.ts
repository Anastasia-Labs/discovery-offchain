import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  TxComplete,
  toUnit,
  fromText,
  Data,
  Script,
} from "lucid-cardano";
import { DeployRefScriptsConfig, Result } from "../core/types.js";

// type RefScripts = {
//   discoveryValidator: string;
//   discoveryPolicy: string;
//   commitFoldPolicy: string;
//   commitFoldValidator: string;
//   rewardFoldPolicy: string;
//   rewardFoldValidator: string;
//   tokenHolderPolicy: string;
//   tokenHolderValidator: string;
// };
type RefScripts = Record<string, { unit: string; script: Script }>;

type Deploy = {
  tx: TxComplete;
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
      // {
      //   type: "before",
      //   slot: lucid.utils.unixTimeToSlot(config.currenTime + 1000000),
      // },
    ],
  });

  const deployPolicyId = lucid.utils.mintingPolicyToId(deployPolicy);

  // const tuple = ['discoveryPolicy', 'discoveryValidator', 'commitFoldPolicy', 'commitFoldValidator', 'rewardFoldPolicy', 'rewardFoldValidator'] as const
  //
  // type MyType<T extends string[]> = {
  //   [P in T[number]]: string
  // }
  //

  // const refScripts: RefScripts = {
  //   discoveryPolicy: {
  //     unit: toUnit(deployPolicyId, fromText("DiscoveryPolicy")),
  //     script: discoveryPolicy,
  //   },
  //   discoveryValidator: {
  //     unit: toUnit(deployPolicyId, fromText("DiscoveryValidator")),
  //     script: discoveryValidator,
  //   },
  //   commitFoldPolicy: {
  //     unit: toUnit(deployPolicyId, fromText("CommitFoldPolicy")),
  //     script: commitFoldPolicy,
  //   },
  //   commitFoldValidator: {
  //     unit: toUnit(deployPolicyId, fromText("CommitFoldValidator")),
  //     script: commitFoldValidator,
  //   },
  //
  //   rewardFoldPolicy: {
  //     unit: toUnit(deployPolicyId, fromText("RewardFoldPolicy")),
  //     script: rewardFoldPolicy,
  //   },
  //   rewardFoldValidator: {
  //     unit: toUnit(deployPolicyId, fromText("RewardFoldValidator")),
  //     script: rewardFoldValidator,
  //   },
  //   tokenHolderPolicy: {
  //     unit: toUnit(deployPolicyId, fromText("TokenHolderPolicy")),
  //     script: tokenHolderPolicy,
  //   },
  //   tokenHolderValidator: {
  //     unit: toUnit(deployPolicyId, fromText("TokenHolderValidator")),
  //     script: tokenHolderValidator,
  //   },
  // };

  try {
    const tx = await lucid
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
      .complete();
    // const tx1 = await lucid
    //   .newTx()
    //   .attachMintingPolicy(deployPolicy)
    //   .mintAssets({
    //     [units.discoveryPolicy]: 1n,
    //     [units.discoveryValidator]: 1n,
    //   })
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: discoveryPolicy },
    //     { [units.discoveryPolicy]: 1n }
    //   )
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: discoveryValidator },
    //     { [units.discoveryValidator]: 1n }
    //   )
    //   .complete();
    //
    // const tx2 = await lucid
    //   .newTx()
    //   .attachMintingPolicy(deployPolicy)
    //   .mintAssets({
    //     [units.commitFoldPolicy]: 1n,
    //     [units.commitFoldValidator]: 1n,
    //   })
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: commitFoldPolicy },
    //     { [units.commitFoldPolicy]: 1n }
    //   )
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: commitFoldValidator },
    //     { [units.commitFoldValidator]: 1n }
    //   )
    //   .complete();
    //
    // const tx3 = await lucid
    //   .newTx()
    //   .attachMintingPolicy(deployPolicy)
    //   .mintAssets({
    //     [units.rewardFoldPolicy]: 1n,
    //     [units.rewardFoldValidator]: 1n,
    //   })
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: rewardFoldPolicy },
    //     { [units.rewardFoldPolicy]: 1n }
    //   )
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: rewardFoldValidator },
    //     { [units.rewardFoldValidator]: 1n }
    //   )
    //   .complete();
    //
    // const tx4 = await lucid
    //   .newTx()
    //   .attachMintingPolicy(deployPolicy)
    //   .mintAssets({
    //     [units.tokenHolderPolicy]: 1n,
    //     [units.tokenHolderValidator]: 1n,
    //   })
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: tokenHolderPolicy },
    //     { [units.tokenHolderPolicy]: 1n }
    //   )
    //   .payToAddressWithData(
    //     alwaysFailsAddr,
    //     { scriptRef: tokenHolderValidator },
    //     { [units.tokenHolderValidator]: 1n }
    //   )
    //   .complete();

    return {
      type: "ok",
      data: {
        tx: tx,
        deployPolicyId: deployPolicyId
      }
    };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
