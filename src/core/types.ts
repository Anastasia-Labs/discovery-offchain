import { Address, OutRef, PolicyId, UTxO } from "lucid-cardano";
import { SetNode } from "./contract.types.js";

export type CborHex = string;
export type RawHex = string;
export type POSIXTime = number;

export type Result<T> =
  | { type: "ok"; data: T }
  | { type: "error"; error: Error };

export type Either<L, R> =
  | { type: "left"; value: L }
  | { type: "right"; value: R };

export type AppliedScripts = {
  nodePolicy: string;
};

export type AssetClass = {
  policyId: string;
  tokenName: string;
};

export type DeployRefScriptsConfig = {
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
  alwaysFails: CborHex;
  currenTime?: POSIXTime;
};

export type InitNodeConfig = {
  initUTXO: UTxO;
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
  refScripts?: {
    nodePolicy?: UTxO;
  };
  userAddres: Address;
};

export type DInitNodeConfig = {
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
};

export type InsertNodeConfig = {
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
  refScripts?: {
    nodeValidator?: UTxO;
    nodePolicy?: UTxO;
  };
  userAddres: Address;
  amountLovelace: number;
  currenTime?: POSIXTime;
};

export type RemoveNodeConfig = {
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
  refScripts?: {
    nodeValidator?: UTxO;
    nodePolicy?: UTxO;
  };
  userAddres: Address;
  deadline: POSIXTime;
  penaltyAddress: Address;
  currenTime?: POSIXTime;
};

export type InitFoldConfig = {
  nodeRefInput: OutRef;
  scripts: {
    nodeValidator: CborHex;
    nodePolicy: CborHex;
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
  userAddres: Address;
  currenTime?: POSIXTime;
};

export type FoldNodesConfig = {
  nodeRefInputs: OutRef[];
  foldOutRef: OutRef;
  scripts: {
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
};

export type BuildScriptsConfig = {
  discoveryPolicy: {
    initUTXO: UTxO;
    deadline: POSIXTime;
    penaltyAddress: Address;
  };
  rewardValidator: {
    projectCS: PolicyId;
    projectTN: string;
    projectAddr: Address;
  };
  unapplied: {
    discoveryPolicy: RawHex;
    discoveryValidator: RawHex;
    foldPolicy: RawHex;
    foldValidator: RawHex;
    rewardPolicy: RawHex;
    rewardValidator: RawHex;
  };
};

export type ReadableUTxO = {
  outRef: OutRef;
  datum: SetNode;
};
