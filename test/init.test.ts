import { writeFile, readFileSync } from "fs";
import {
  buildScripts,
  Emulator,
  fromAddressToData,
  generateAccountSeedPhrase,
  initNode,
  InitNodeConfig,
  insertNode,
  InsertNodeConfig,
  Lucid,
  parseUTxOsAtScript,
  utxosAtScript,
} from "price-discovery-offchain";
import { test, beforeAll, expect } from "vitest";
import scripts from "./plutus.json";

beforeAll(async () => {
  //WARNING: move this down,also you need to build a deploy script
  const treasury = {
    account1: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
  };
  const emulator = new Emulator([treasury.account1]);

  const lucid = await Lucid.new(emulator);
});

test("Test - initNode", async () => {
  const users = {
    treasury1: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
    account1: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
    account2: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
  };

  const emulator = new Emulator([
    users.treasury1,
    users.account1,
    users.account2,
  ]);

  const lucid = await Lucid.new(emulator);
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const treasuryAddress = await lucid.wallet.address();
  const [treasuryUTxO] = await lucid.wallet.getUtxos();

  const newScripts = buildScripts(lucid, {
    discoveryPolicy: {
      initUTXO: treasuryUTxO,
      maxRaise: 100_000_000, // 100 ADA
      deadline: emulator.now() + 600_000, // 10 minutes
      penaltyAddress: treasuryAddress,
    },
    rewardValidator: {
      projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
      projectTN: "test",
      projectAddr: treasuryAddress,
    },
    unapplied: {
      discoveryPolicy: scripts.NodeMP,
      discoveryValidator: scripts.NodeValidator,
      foldPolicy: scripts.NodeMP,
      foldValidator: scripts.NodeValidator,
      rewardPolicy: scripts.NodeMP,
      rewardValidator: scripts.NodeValidator,
    },
  });

  if (newScripts.type == "error") return console.log(newScripts.error);
  //
  // writeFile("scripts.json", JSON.stringify(newScripts.data), (error) => {
  //   error ? console.log(error) : console.log("ok");
  // });
  // const appliedScripts = JSON.parse(readFileSync("./scripts.json", "utf8"));

  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const initNodeConfig: InitNodeConfig = {
    initUTXO: treasuryUTxO,
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
  };
  const initNodeUnsigned = await initNode(lucid, initNodeConfig);
  console.log(initNodeUnsigned);
  expect(initNodeUnsigned.type).toBe("ok");
  if (initNodeUnsigned.type == "ok") {
    // console.log(tx.data.txComplete.to_json())
    const initNodeSigned = await initNodeUnsigned.data.sign().complete();
    const initNodeHash = await initNodeSigned.submit();
    // console.log(initNodeHash)
  }
  emulator.awaitBlock(4);
  console.log(
    await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
  );

  lucid.selectWalletFromSeed(users.account1.seedPhrase)

  const insertNodeConfig: InsertNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
  };

  const insertNodeUnsigned = await insertNode(lucid, insertNodeConfig);
  console.log(insertNodeUnsigned);

  expect(insertNodeUnsigned.type).toBe("ok");

  if (insertNodeUnsigned.type == "ok") {
    // console.log(insertNodeUnsigned.data.txComplete.to_json())
    const insertNodeSigned = await insertNodeUnsigned.data.sign().complete();
    const insertNodeHash = await insertNodeSigned.submit();
  }

  emulator.awaitBlock(4);

  console.log(
    await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    // await utxosAtScript(lucid,newScripts.data.discoveryValidator)
  );

});
