import {
  Data,
  Lucid,
  MintingPolicy,
  SpendingValidator,
  TxComplete,
  fromText,
  toUnit,
} from "lucid-fork";
import { SETNODE_PREFIX, TIME_TOLERANCE_MS, cFold } from "../core/constants.js";
import {
  FoldMintAct,
  LiquidityFoldDatum,
  LiquiditySetNode,
} from "../core/contract.types.js";
import { InitFoldConfig, Result } from "../core/types.js";
import { fromAddress } from "../index.js";

export const initLqFold = async (
  lucid: Lucid,
  config: InitFoldConfig,
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

  const headNodeAddr = lucid.utils.validatorToAddress(discoveryValidator);
  const headNodeUnit = toUnit(
    lucid.utils.mintingPolicyToId(discoveryPolicy),
    fromText(SETNODE_PREFIX),
  );

  const [headNodeUTxO] = await lucid.utxosAtWithUnit(
    headNodeAddr,
    headNodeUnit,
  );

  if (!headNodeUTxO) {
    return {
      type: "error",
      error: new Error(
        `missing head node at ${headNodeAddr} with ${headNodeUnit}`,
      ),
    };
  }

  if (!headNodeUTxO.datum) {
    console.log({ headNodeUTxO });
    return {
      type: "error",
      error: new Error(`could not retrieve head node datum.`),
    };
  }

  const currentNode = Data.from(headNodeUTxO.datum, LiquiditySetNode);

  const datum = Data.to(
    {
      currNode: currentNode,
      committed: 0n,
      owner: fromAddress(await lucid.wallet.address()), //NOTE: owner is not being used in fold minting or validator
    },
    LiquidityFoldDatum,
  );

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
