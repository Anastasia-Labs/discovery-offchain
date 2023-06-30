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

//NOTE: remove head node before, sorting the node utxos
export const sortByKeysNodeUTxOs = (utxos: ReadableUTxO[]) => {
  return (
    utxos
      // .flatMap((readableUTxO) => {
      //   return readableUTxO.datum.key == null ? [] : readableUTxO;
      // })
      .sort((a, b) => {
        if (a.datum.key == null) {
          return -1;
        } else if (b.datum.key == null) {
          return -1;
        } else if (a.datum.key < b.datum.key) {
          return -1;
        } else if (a.datum.key > b.datum.key) {
          return 1;
        } else return 0;
      })
  );
};

export type ResultSorted = {
  index: number;
  value: ReadableUTxO;
};

export const reduceByKeysNodeUTxOs = (
  utxos: ResultSorted[],
  startKey: string | null
) => {
  console.log(startKey)
  console.log("ResultSorted", utxos)
  const firstItem = utxos.find((readableUTxO) => {
    return readableUTxO.value.datum.key == startKey;
  });
  if (!firstItem) throw new Error("firstItem error");
  if (!startKey) throw new Error("startKey error")

  return utxos.reduce(
    (result, current) => {
      if (current.value.datum.next == null) return result;
      const item = utxos.find((readableUTxO) => {
        return (
          readableUTxO.value.datum.key ==
          result[result.length - 1].value.datum.next
        );
      });
      if (!item) throw new Error("item error");
      result.push(item);
      return result;
    },
    [firstItem] as ResultSorted[]
  );
};

export const sortByOutRefWithIndex = (utxos: ReadableUTxO[]) => {
  // const sorted = reduceByKeysNodeUTxOs(utxos)
  // sorted.shift()
  // if (!sorted) return [];
  // return sorted
  //   .map((value, index) => {
  //     return {
  //       value,
  //       index,
  //     };
  //   })
  //   .
  const head = utxos.find((utxo) => {
    return utxo.datum.key == null;
  });
  if (!head) throw new Error("head error");

  const sortedByOutRef = utxos
    .filter((utxo) => {
      return head != utxo;
    })
    .sort((a, b) => {
      if (a.outRef.txHash < b.outRef.txHash) {
        return -1;
      } else if (a.outRef.txHash > b.outRef.txHash) {
        return 1;
      } else if (a.outRef.txHash == b.outRef.txHash) {
        if (a.outRef.outputIndex < b.outRef.outputIndex) {
          return -1;
        } else return 1;
      } else return 0;
    })
    .map((value, index) => {
      return {
        value,
        index,
      };
    });

  return reduceByKeysNodeUTxOs(sortedByOutRef, head.datum.next)
};

// export const sortByOutRefWithIndex = (utxos: ReadableUTxO[]) => {
//   const sorted = reduceByKeysNodeUTxOs(utxos)
//   sorted.shift()
//   if (!sorted) return [];
//   return sorted
//     .map((value, index) => {
//       return {
//         value,
//         index,
//       };
//     })
//     .sort((a, b) => {
//       if (a.value.outRef.txHash < b.value.outRef.txHash) {
//         return -1;
//       } else if (a.value.outRef.txHash > b.value.outRef.txHash) {
//         return 1;
//       } else if (a.value.outRef.txHash == b.value.outRef.txHash) {
//         if (a.value.outRef.outputIndex < b.value.outRef.outputIndex) {
//           return -1;
//         } else return 1;
//       } else return 0;
//     });
// };

//
// //NOTE: use mod to make groups of 10
// export const groupUTxOs = (utxos: ReadableUTxO[]) => {
//   const test = utxos.console.log(test);
// };
//
export const chunkArray = <T>(array: T[], chunkSize: number) => {
  const numberOfChunks = Math.ceil(array.length / chunkSize);

  return [...Array(numberOfChunks)].map((value, index) => {
    return array.slice(index * chunkSize, (index + 1) * chunkSize);
  });
};

export const replacer = (key: unknown, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export const divCeil = (a: bigint, b: bigint) => {
  return 1n + (a - 1n) / b;
};
