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
  state: boolean
  sorted: ReadableUTxO[]
}

export const reduceByKeysNodeUTxOs = (utxos: ReadableUTxO[]) => {
  return utxos.reduce( (result, current): ResultSorted  => {
      if (!result.state) {
        const head = utxos.find((readableUTxO) => {
          readableUTxO.datum.key == null;
        });
        if (!head) throw new Error("head error");
        result.state = true;
        result.sorted.push(head)
        return result
      }

      const node = utxos.find((readableUTxO) =>{
        readableUTxO.datum.key == result.sorted[result.sorted.length -1].datum.next
      })

      if (!node) throw new Error("head error");
      result.sorted.push(node)
      return result
    },
    { state: false, sorted: [] as ReadableUTxO[] }
  );
};


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
