import {
  Lucid,
  SpendingValidator,
  MintingPolicy,
  Data,
  toUnit,
  TxComplete,
  fromText,
} from "lucid-cardano";
import {
  cFold,
  SETNODE_PREFIX,
} from "../core/constants.js";
import {
  FoldDatum,
  FoldMintAct,
  SetNode,
} from "../core/contract.types.js";
import { InitFoldConfig, Result } from "../core/types.js";
import { fromAddress } from "../index.js";

export const initFold = async (
  lucid: Lucid,
  config: InitFoldConfig
): Promise<Result<TxComplete>> => {

  config.currenTime ??= Date.now();

  lucid.selectWalletFrom({ address: config.userAddress });

  const walletUtxos = await lucid.wallet.getUtxos();

  if (!walletUtxos.length)
    return { type: "error", error: new Error("No utxos in wallet") };

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

  const [ headNodeUTxO ] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress(discoveryValidator),
    toUnit(
      lucid.utils.mintingPolicyToId(discoveryPolicy),
      fromText(SETNODE_PREFIX)
    )
  );

  if (!headNodeUTxO || !headNodeUTxO.datum)
    return { type: "error", error: new Error("missing nodeRefInputUTxO") };

  const currentNode = Data.from(headNodeUTxO.datum, SetNode);

  const datum = Data.to(
    {
      currNode: currentNode,
      committed: 0n,
      owner: fromAddress(await lucid.wallet.address()), //NOTE: owner is not being used in fold minting or validator
    },
    FoldDatum
  );

  const redeemerNodePolicy = Data.to("MintFold",FoldMintAct);

  const assets = {
    [toUnit(foldPolicyId, cFold)]: 1n,
  };

  const upperBound = config.currenTime + 100_000;

  try {
    const tx = await lucid
      .newTx()
      .readFrom([headNodeUTxO])
      .payToContract(foldValidatorAddr, { inline: datum }, assets)
      .mintAssets(assets, redeemerNodePolicy)
      .attachMintingPolicy(foldPolicy)
      .validFrom(config.currenTime)
      .validTo(upperBound)
      .complete();

    return { type: "ok", data: tx };
  } catch (error) {
    if (error instanceof Error) return { type: "error", error: error };

    return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
  }
};
