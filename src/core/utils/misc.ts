import { Data, Lucid, SpendingValidator, UTxO } from "lucid-cardano";
import { SetNode } from "../contract.types.js";
import { Either, ReadableUTxO } from "../types.js";

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
        value: parsedDatum,
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
        assets: utxo.assets,
      };
    } else {
      return [];
    }
  });
};

// export const sortUTxOs = (utxos: ReadableUTxO[]) => {
//   utxos.sort((a, b) => {
//     if (a.datum.next == b.datum.key){
//       return -1
//     }
//     else return 1
//   });
// };
//
// //NOTE: use mod to make groups of 10
// export const groupUTxOs = (utxos: ReadableUTxO[]) => {
//   const test = utxos.console.log(test);
// };
//

export const replacer = (key: unknown, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export const divCeil = (a: bigint, b: bigint) => {
  return 1n + (a - 1n) / b;
};
