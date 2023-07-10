import { Address, Assets, OutRef, PolicyId, UTxO } from "lucid-cardano";
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
    foldPolicy: CborHex;
    foldValidator: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
    tokenHolderPolicy: CborHex;
    tokenHolderValidator: CborHex;
  };
  alwaysFails: CborHex;
  currenTime?: POSIXTime;
};

export type InitTokenHolderConfig = {
  initUTXO: UTxO;
  scripts: {
    tokenHolderPolicy: CborHex;
    tokenHolderValidator: CborHex;
  };
  userAddress: Address;
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
  userAddress: Address;
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
  userAddress: Address;
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
  userAddress: Address;
  deadline: POSIXTime;
  penaltyAddress: Address;
  currenTime?: POSIXTime;
};

export type InitFoldConfig = {
  scripts: {
    nodeValidator: CborHex;
    nodePolicy: CborHex;
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
  userAddress: Address;
  currenTime?: POSIXTime;
};

export type MultiFoldConfig = {
  nodeRefInputs: OutRef[];
  indices: number[];
  scripts: {
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
  userAddress: Address;
  currenTime?: POSIXTime;
};

export type FoldNodeConfig = {
  nodeRefInput: OutRef;
  foldOutRef: OutRef;
  scripts: {
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
};

export type InitRewardFoldConfig = {
  scripts: {
    nodeValidator: CborHex;
    nodePolicy: CborHex;
    foldPolicy: CborHex;
    foldValidator: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
    tokenHolderPolicy: CborHex;
    tokenHolderValidator: CborHex;
  };
  userAddress: Address
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
  projectTokenHolder: {
    initUTXO: UTxO;
  };
  unapplied: {
    discoveryPolicy: RawHex;
    discoveryValidator: RawHex;
    foldPolicy: RawHex;
    foldValidator: RawHex;
    rewardPolicy: RawHex;
    rewardValidator: RawHex;
    tokenHolderValidator: RawHex;
    tokenHolderPolicy: RawHex;
  };
};

export type ReadableUTxO = {
  outRef: OutRef;
  datum: SetNode;
  assets: Assets;
};
