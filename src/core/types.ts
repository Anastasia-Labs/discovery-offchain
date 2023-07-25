import {
  Address,
  Assets,
  MintingPolicy,
  OutRef,
  PolicyId,
  SpendingValidator,
  UTxO,
} from "lucid-cardano";
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
  script: CborHex;
  name: string;
  alwaysFails: CborHex;
};

export type InitTokenHolderConfig = {
  initUTXO: UTxO;
  projectCS: string;
  projectTN: string;
  projectAmount: number;
  scripts: {
    tokenHolderPolicy: CborHex;
    tokenHolderValidator: CborHex;
  };
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
  currenTime?: POSIXTime;
};

export type MultiFoldConfig = {
  nodeRefInputs: OutRef[];
  indices: number[];
  scripts: {
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
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
  projectCS: string;
  projectTN: string;
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
  refScripts?: {
    nodeValidator?: UTxO;
    nodePolicy?: UTxO;
    commitFoldPolicy?: UTxO;
    commitFoldValidator?: UTxO;
    rewardFoldPolicy?: UTxO;
    rewardFoldValidator?: UTxO;
    tokenHolderPolicy?: UTxO;
    tokenHolderValidator?: UTxO;
  };
};

export type RewardFoldConfig = {
  nodeInputs: UTxO[];
  scripts: {
    nodeValidator: CborHex;
    discoveryStake: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
  };
  refScripts: {
    nodeValidator: UTxO;
    discoveryStake: UTxO;
    rewardFoldPolicy: UTxO;
    rewardFoldValidator: UTxO;
  };
  projectAddress: Address;
  projectCS: PolicyId;
  projectTN: string;
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
    discoveryStake: RawHex;
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
