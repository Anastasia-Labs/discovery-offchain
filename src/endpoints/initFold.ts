import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  fromText,
} from "lucid-fork";
import { cFold, SETNODE_PREFIX, TIME_TOLERANCE_MS } from "../core/constants.js";
import { AddressD, FoldDatum, FoldMintAct, LiquidityFoldDatum, LiquiditySetNode, SetNode } from "../core/contract.types.js";
import { InitFoldConfig, Result } from "../core/types.js";
import { fromAddress } from "../index.js";

export const initFold = async (
  lucid: Lucid,
  config: InitFoldConfig,
  type: "Direct" | "Liquidity" = "Liquidity"
): Promise<Result<TxComplete>> => {
  config.currenTime ??= Date.now();

  const foldValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.foldValidator,
  };

  const foldValidatorAddr = lucid.utils.validatorToAddress(foldValidator);

  const foldPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.foldPolicy,
  };

  const foldPolicyId = lucid.utils.mintingPolicyToId(foldPolicy);

  const discoveryPolicy: MintingPolicy = {
    type: "PlutusV2",
    script: config.scripts.nodePolicy,
  };

  const discoveryValidator: SpendingValidator = {
    type: "PlutusV2",
    script: config.scripts.nodeValidator,
  };

  const [headNodeUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(discoveryValidator),
    toUnit(
      lucid.utils.mintingPolicyToId(discoveryPolicy),
      fromText(SETNODE_PREFIX)
    )
  );

  if (!headNodeUTxO || !headNodeUTxO.datum)
    return { type: "error", error: new Error("missing nodeRefInputUTxO") };

  const owner: AddressD = fromAddress(await lucid.wallet.address());
  let datum: string;
  if (type === "Liquidity") {
    datum = Data.to(
      {
        currNode: Data.from(headNodeUTxO.datum, LiquiditySetNode),
        committed: 0n,
        owner
      },
      LiquidityFoldDatum
    )
  } else {
    datum = Data.to(
      {
        currNode: Data.from(headNodeUTxO.datum, SetNode),
        committed: 0n,
        owner
      },
      FoldDatum
    );
  }

  const redeemerFoldPolicy = Data.to("MintFold", FoldMintAct);

  const assets = {
    [toUnit(foldPolicyId, cFold)]: 1n,
  };

  const upperBound = config.currenTime + TIME_TOLERANCE_MS;
  const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

  try {
    const tx = await lucid
      .newTx()
      .readFrom([headNodeUTxO])
      .payToContract(foldValidatorAddr, { inline: datum }, assets)
      .mintAssets(assets, redeemerFoldPolicy)
      .attachMintingPolicy(foldPolicy)
      .validFrom(lowerBound)
      .validTo(upperBound)
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
