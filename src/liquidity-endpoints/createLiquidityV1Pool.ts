import { Data, Lucid, MintingPolicy, TxComplete, toUnit } from "lucid-fork";
import { CreateV1PoolConfig, Result } from "../core/types.js";
import { LiquidityFactoryDatum, LiquidityPoolDatum, LiquidityProxyDatum, TIME_TOLERANCE_MS, utxosAtScript } from "../core/index.js";

export const createLiquidityV1Pool = async (
    lucid: Lucid,
    config: CreateV1PoolConfig
): Promise<Result<TxComplete>> => {
    const [proxyUtxo] = await utxosAtScript(
        lucid,
        config.scripts.proxyTokenHolderScript
    )

    const proxyDatumHex = config.datums[proxyUtxo.datumHash as string];
    const proxyDatum = Data.from(proxyDatumHex ?? proxyUtxo.datum as string, LiquidityProxyDatum)

    const [factoryUtxo] = await lucid.provider.getUtxosWithUnit(
        config.v1PoolScriptAddress,
        toUnit(config.v1PoolFactoryToken.policyId, config.v1PoolFactoryToken.assetName)
    );
    
    const { nextPoolIdent, ...rest } = Data.from(config.datums[factoryUtxo?.datumHash as string] as string, LiquidityFactoryDatum);
    
    const newNextPoolIdent = genNextPoolIdent(nextPoolIdent);
    const newFactoryDatum = Data.to({
        ...rest,
        nextPoolIdent: newNextPoolIdent
    }, LiquidityFactoryDatum)

    const circulatingLP = 0n;

    const poolDatum = Data.to({
        coins: {
            coinA: {
                policyId: "",
                tokenName: ""
            },
            coinB: {
                policyId: config.projectToken.policyId,
                tokenName: config.projectToken.assetName,
            },
        },
        poolIdent: nextPoolIdent,
        circulatingLP,
        swapFees: {
            denominator: 1000n,
            numerator: 3n,
        }
    }, LiquidityPoolDatum)

    const projectTokenUnit = toUnit(config.projectToken.policyId, config.projectToken.assetName);
    const poolPolicy: MintingPolicy = {
        type: "PlutusV1",
        script: config.scripts.v1PoolPolicyScript
    }
    const poolPolicyId = lucid.utils.mintingPolicyToId(poolPolicy);

    config.currenTime ??= Date.now();
    const upperBound = config.currenTime + TIME_TOLERANCE_MS;
    const lowerBound = config.currenTime - TIME_TOLERANCE_MS;

    try {
        const tx = await lucid.newTx()
            .collectFrom([proxyUtxo], "")
            .collectFrom([factoryUtxo], "")
            .payToContract(
                factoryUtxo.address,
                newFactoryDatum,
                factoryUtxo.assets
            )
            .payToContract(
                config.v1PoolScriptAddress,
                poolDatum,
                {
                    lovelace: proxyDatum.totalCommitted + 2_000_000n,
                    [projectTokenUnit]: proxyUtxo.assets[projectTokenUnit],
                    [toUnit(poolPolicyId, "7020" + nextPoolIdent)]: 1n
                }
            )
            .payToContract(
                lucid.utils.credentialToAddress({
                    type: "Script",
                    hash: (proxyDatum.returnAddress.paymentCredential as any).ScriptCredential
                }),
                "",
                {
                    lovelace: proxyUtxo.assets.lovelace - proxyDatum.totalCommitted,
                    [toUnit(poolPolicyId, "6c7020" + nextPoolIdent)]: circulatingLP
                }
            )
            .mintAssets({
                [toUnit(poolPolicyId, "7020" + nextPoolIdent)]: 1n,
                [toUnit(poolPolicyId, "6c7020" + nextPoolIdent)]: circulatingLP
            }, nextPoolIdent)
            .validFrom(lowerBound)
            .validTo(upperBound)
            .complete();
        return { type: "ok", data: tx };
    } catch (error) {
      if (error instanceof Error) return { type: "error", error: error };
  
      return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
}

function genNextPoolIdent(current: string) {
    const byteArray = Buffer.from(current, "hex");
    const result: number[] = [];

    let carry = 1;
    for (const byte of byteArray) {
        if (byte === 255 && carry === 1) {
            result.push(0);
            carry = 1;
        } else {
            result.push(byte + carry);
            carry = 0;
        }
    }

    if (carry === 1) {
        result.push(1);
    }

    return Buffer.from(result).toString("hex");
}