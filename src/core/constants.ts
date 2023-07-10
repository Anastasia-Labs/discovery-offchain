import { fromText } from "lucid-cardano";

export const SETNODE_PREFIX = "FSN";
export const CORRNODE_PREFIX = "FCN";
export const CFOLD = "CFold";
export const PTHOLDER = "PTHolder"
export const TWENTY_FOUR_HOURS_MS = 86_400_000;
export const ONE_HOUR_MS = 3_600_000
export const MINIMUM_LOVELACE = 3_000_000n

export const originNodeTokenName = fromText(SETNODE_PREFIX);
export const corrNodeTokenName = fromText(CORRNODE_PREFIX);
export const cFold = fromText(CFOLD);
