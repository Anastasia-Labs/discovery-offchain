import { Address, Assets, OutRef, PolicyId, UTxO } from "lucid-fork";
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
  spendingInput?: UTxO;
  script: CborHex;
  name: string;
  alwaysFails: CborHex;
  currenTime: POSIXTime;
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

export type AddCollectedConfig = {
  currenTime?: POSIXTime;
  scripts: {
    collectFoldPolicy: CborHex;
    collectFoldValidator: CborHex;
  };
  refScripts: {
    tokenHolderPolicy: OutRef;
    tokenHolderValidator: OutRef;
  };
};

export type SpendToProxyConfig = {
  currenTime?: POSIXTime;
  v1PoolPolicyId: string;
  scripts: {
    tokenHolderValidator: CborHex;
    proxyTokenHolderValidator: CborHex;
  };
  refScripts: {
    liquidityTokenHolderPolicy: OutRef;
    liquidityTokenHolderValidator: OutRef;
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
  nodeUTxOs?: UTxO[];
  scripts: {
    nodePolicy: CborHex;
    nodeValidator: CborHex;
  };
  refScripts?: {
    nodeValidator?: UTxO;
    nodePolicy?: UTxO;
  };
  amountLovelace: bigint;
  currenTime?: POSIXTime;
};

export type RemoveNodeConfig = {
  nodeUTxOs?: UTxO[];
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

export type ClaimNodeConfig = {
  currenTime?: POSIXTime;
  nodeUTxOs?: UTxO[];
  burnToken?: boolean;
  scripts: {
    liquidityPolicy: CborHex;
    liquidityValidator: CborHex;
    rewardFoldPolicy: CborHex;
  };
  refScripts?: {
    liquidityPolicy: UTxO;
    liquidityValidator: UTxO;
  };
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

export type CreateV1PoolConfig = {
  currenTime?: POSIXTime;
  v1PoolAddress: string;
  v1PoolPolicyId: string;
  v1FactoryToken: {
    policyId: CborHex;
    assetName: CborHex;
  };
  projectToken: {
    policyId: CborHex;
    assetName: CborHex;
  };
  datums: {
    [hash: CborHex]: CborHex;
  };
  scripts: {
    proxyTokenHolderScript: CborHex;
    v1PoolPolicyScript: CborHex;
    v1FactoryValidatorScript: CborHex;
    tokenHolderPolicy: CborHex;
  };
  emulator?: boolean;
};

export type MultiFoldConfig = {
  nodeRefInputs: OutRef[];
  feeInput: UTxO;
  changeAddress: string;
  indices: number[];
  scripts: {
    liquidityValidator: CborHex;
    collectStake: CborHex;
    foldPolicy: CborHex;
    foldValidator: CborHex;
  };
  refInputs?: {
    liquidityValidator: UTxO;
    collectStake: UTxO;
    foldValidator: UTxO;
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
  currenTime?: POSIXTime;
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

export type InitLiquidityRewardFoldConfig = {
  currenTime?: POSIXTime;
  project: {
    policyId: string;
    tokenName: string;
    address: string;
    lpTokenPolicyId: string;
    lpTokenAssetName: string;
  };
  datums?: {
    [hash: string]: CborHex;
  };
  scripts: {
    liquidityValidator: CborHex;
    liquidityPolicy: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
    tokenHolderPolicy: CborHex;
    tokenHolderValidator: CborHex;
  };
  refScripts?: {
    liquidityValidator?: UTxO;
    liquidityPolicy?: UTxO;
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

export type RewardLiquidityFoldConfig = {
  currenTime?: number;
  disableNativeUplc?: boolean;
  nodeRefInputs: OutRef[];
  indices: number[];
  feeInput: UTxO;
  changeAddress: string;
  scripts: {
    liquidityValidator: CborHex;
    rewardStake: CborHex;
    rewardFoldPolicy: CborHex;
    rewardFoldValidator: CborHex;
  };
  refInputs: {
    liquidityValidator: UTxO;
    rewardStake: UTxO;
    rewardFoldPolicy: UTxO;
    rewardFoldValidator: UTxO;
  };
  lpTokenAssetId: string;
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

export type BuildLiquidityScriptsConfig = {
  liquidityPolicy: {
    initUTXO: UTxO;
    deadline: POSIXTime;
    penaltyAddress: Address;
  };
  rewardFoldValidator: {
    projectCS: PolicyId;
    projectLpPolicyId: PolicyId;
    projectAddr: Address;
  };
  proxyTokenHolderValidator: {
    poolPolicyId: PolicyId;
  };
  projectTokenHolder: {
    initUTXO: UTxO;
  };
  unapplied: {
    liquidityPolicy: RawHex;
    liquidityValidator: RawHex;
    liquidityStake: RawHex;
    collectFoldPolicy: RawHex;
    collectFoldValidator: RawHex;
    distributionFoldPolicy: RawHex;
    distributionFoldValidator: RawHex;
    tokenHolderValidator: RawHex;
    tokenHolderPolicy: RawHex;
    proxyTokenHolderValidator: RawHex;
  };
};

export type ReadableUTxO<T = SetNode> = {
  outRef: OutRef;
  datum: T;
  assets: Assets;
};
