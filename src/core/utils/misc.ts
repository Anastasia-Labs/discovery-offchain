import {Data, Lucid, SpendingValidator, UTxO} from "lucid-cardano";
import {SetNode} from "../contract.types.js";
import {Either, ReadableUTxO} from "../types.js";

export const utxosAtScript = async (
  lucid: Lucid,
  script: string,
  stakeCredentialHash?: string
) => {
  const scriptValidator: SpendingValidator = {
    type: "PlutusV2",
    script: script,
  };

  const scriptValidatorAddr = stakeCredentialHash
    ? lucid.utils.validatorToAddress(
        scriptValidator,
        lucid.utils.keyHashToCredential(stakeCredentialHash)
      )
    : lucid.utils.validatorToAddress(scriptValidator);

  return lucid.utxosAt(scriptValidatorAddr);
};

export const parseDatum = (
  lucid: Lucid,
  utxo: UTxO
): Either<string, SetNode> => {
  if (utxo.datum) {
    try {
      const parsedDatum = Data.from(utxo.datum, SetNode);
      return {
        type: "right",
        value: parsedDatum
      };
    } catch (error) {
      return { type: "left", value: `invalid datum : ${error}` };
    }
  } else {
    return { type: "left", value: "missing datum" };
  }
};

export const parseUTxOsAtScript = async (
  lucid: Lucid,
  script: string,
  stakeCredentialHash?: string
): Promise<ReadableUTxO[]> => {
  const utxos = await utxosAtScript(lucid, script, stakeCredentialHash);
  return utxos.flatMap((utxo) => {
    const result = parseDatum(lucid, utxo);
    if (result.type == "right") {
      return {
        outRef: {
          txHash: utxo.txHash,
          outputIndex: utxo.outputIndex,
        },
        datum: result.value,
      };
    } else {
      return [];
    }
  });
};
