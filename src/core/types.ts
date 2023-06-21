import { Address, PolicyId, UTxO } from "lucid-cardano";

export type CborHex = string;
export type RawHex = string;
export type POSIXTime = number;

export type Result<T> =
  | { type: "ok"; data: T }
  | { type: "error"; error: Error };

export type AppliedScripts = {
  nodePolicy: string;
};

export type AssetClass = {
  policyId: string;
  tokenName: string;
};

export type InitNodeConfig = {
  initUTXO: UTxO;
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
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
};

export type RemoveNodeConfig = {
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
};

export type BuildScriptsConfig = {
  discoveryPolicy: {
    initUTXO: UTxO;
    maxRaise: number;
    deadline: POSIXTime;
    penaltyAddress: Address;
  };
  rewardValidator:{
    projectCS: PolicyId
    projectTN: string
    projectAddr: Address
  }
  unapplied: {
    discoveryPolicy: RawHex;
    discoveryValidator: RawHex;
    foldPolicy: RawHex;
    foldValidator: RawHex;
    rewardPolicy: RawHex;
    rewardValidator: RawHex;
  };
};
