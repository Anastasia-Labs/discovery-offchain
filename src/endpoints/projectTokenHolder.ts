import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  fromText,
} from "lucid-cardano";
import { Result } from "../core/types.js";

export type InitTokenHolderConfig = {
  scripts: {
    tokenHolderPolicy: string;
    tokenHolderValidator: string;
  };
  userAddress: string;
};

export const TokenHolderMintActionSchema = Data.Enum([
  Data.Literal("PMintHolder"),
  Data.Literal("PBurnHolder"),
]);
export type TokenHolderMintAction = Data.Static<
  typeof TokenHolderMintActionSchema
>;
export const TokenHolderMintAction =
  TokenHolderMintActionSchema as unknown as TokenHolderMintAction;

export const tokenHolderInit = async (
  lucid: Lucid,
  config: InitTokenHolderConfig
): Promise<Result<TxComplete>> => {
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

  const [initUTxO] = await lucid.utxosAt(config.userAddress);

  const ptHolderAsset = toUnit(tokenHolderPolicyId, fromText("PTHolder"));
  const mintPTHolderAct = Data.to("PMintHolder", TokenHolderMintAction);
  try {
    const tx = await lucid
      .newTx()
      .collectFrom([initUTxO])
      .payToContract(
        tokenHolderValidatorAddr,
        { inline: Data.void() },
        { [ptHolderAsset]: BigInt(1) }
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
