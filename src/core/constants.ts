import { fromText } from "lucid-fork";

export const SETNODE_PREFIX = "FSN";
export const CORRNODE_PREFIX = "FCN";
export const CFOLD = "CFold";
export const RFOLD = "RFold";
export const PTHOLDER = "PTHolder";
export const TWENTY_FOUR_HOURS_MS = 86_400_000;
export const ONE_HOUR_MS = 3_600_000;

export const originNodeTokenName = fromText(SETNODE_PREFIX);
export const corrNodeTokenName = fromText(CORRNODE_PREFIX);
export const cFold = fromText(CFOLD);
export const rFold = fromText(RFOLD);

export const NODE_ADA = 3_000_000n;
export const FOLDING_FEE_ADA = 1_000_000n;
export const MIN_COMMITMENT_ADA = 1_000_000n;
export const TT_UTXO_ADDITIONAL_ADA = NODE_ADA + FOLDING_FEE_ADA * 2n;

export const TIME_TOLERANCE_MS = 100_000;

export const PROTOCOL_PAYMENT_KEY =
  "014e9d57e1623f7eeef5d0a8d4e6734a562ba32cf910244cd74e1680";
export const PROTOCOL_STAKE_KEY =
  "5e8aa3f089868eaadf188426f49db6566624844b6c5d529b38f3b8a7";
