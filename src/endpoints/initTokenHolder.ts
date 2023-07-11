import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  fromText,
} from "lucid-cardano";
import { PTHOLDER } from "../core/constants.js";
import { InitTokenHolderConfig, Result } from "../core/types.js";

export const TokenHolderMintActionSchema = Data.Enum([
  Data.Literal("PMintHolder"),
  Data.Literal("PBurnHolder"),
]);
export type TokenHolderMintAction = Data.Static<
  typeof TokenHolderMintActionSchema
>;
export const TokenHolderMintAction =
  TokenHolderMintActionSchema as unknown as TokenHolderMintAction;

export const initTokenHolder = async (
  lucid: Lucid,
  config: InitTokenHolderConfig
): Promise<Result<TxComplete>> => {

  lucid.selectWalletFrom({ address: config.userAddress });

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

  const tokenHolderValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderValidator,
  };

  const tokenHolderValidatorAddr =
    lucid.utils.validatorToAddress(tokenHolderValidator);

  const tokenHolderPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.tokenHolderPolicy,
  };

  const tokenHolderPolicyId = lucid.utils.mintingPolicyToId(tokenHolderPolicy);

  const ptHolderAsset = toUnit(tokenHolderPolicyId, fromText(PTHOLDER));
  const mintPTHolderAct = Data.to("PMintHolder", TokenHolderMintAction);
  console.log(walletUtxos)
  console.log(toUnit(config.projectCS, fromText(config.projectTN)))
  console.log(fromText(config.projectTN))

  //TODO: Need to lock the project token?
  try {
    const tx = await lucid
      .newTx()
      .collectFrom([config.initUTXO])
      .payToContract(
        tokenHolderValidatorAddr,
        { inline: Data.void() },
        { [ptHolderAsset]: BigInt(1), 
          // ["2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e265050563425443"]: 100000000n
          [toUnit(config.projectCS, fromText(config.projectTN))]: BigInt(config.projectAmount)
        }
      )
      .mintAssets({ [ptHolderAsset]: BigInt(1) }, mintPTHolderAct)
      .attachMintingPolicy(tokenHolderPolicy)
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
