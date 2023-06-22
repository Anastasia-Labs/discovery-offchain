import {fromText} from "lucid-cardano"

export const SETNODE_PREFIX = "FSN"
export const CORRNODE_PREFIX = "FCN"

export const originNodeTokenName = fromText(SETNODE_PREFIX)
export const corrNodeTokenName = fromText(CORRNODE_PREFIX)
