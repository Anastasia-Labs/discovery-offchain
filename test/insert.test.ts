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
  replacer,
  utxosAtScript,
} from "price-discovery-offchain";
import { test, beforeAll, expect, beforeEach } from "vitest";
import scripts from "./plutus.json";
import discoveryValidator from "./compiled/discoveryValidator.json";
import discoveryPolicy from "./compiled/discoveryMinting.json";
import foldPolicy from "./compiled/foldMint.json";
import foldValidator from "./compiled/foldValidator.json";
import rewardPolicy from "./compiled/rewardFoldMint.json";
import rewardValidator from "./compiled/rewardFoldValidator.json";

type LucidContext = {
  lucid: Lucid;
  users: any;
  emulator: Emulator;
};

//NOTE: INITIALIZE EMULATOR + ACCOUNTS
beforeEach<LucidContext>(async (context) => {
  context.users = {
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

  context.emulator = new Emulator([
    context.users.treasury1,
    context.users.account1,
    context.users.account2,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - initNode - aacount1 insertNode - aacount2 insertNode", async ({
  lucid,
  users,
  emulator,
}) => {
  const logFlag = false;
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const treasuryAddress = await lucid.wallet.address();
  const [treasuryUTxO] = await lucid.wallet.getUtxos();

  const newScripts = buildScripts(lucid, {
    discoveryPolicy: {
      initUTXO: treasuryUTxO,
      deadline: emulator.now() + 600_000, // 10 minutes
      penaltyAddress: treasuryAddress,
    },
    rewardValidator: {
      projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
      projectTN: "test",
      projectAddr: treasuryAddress,
    },
    unapplied: {
      discoveryPolicy: discoveryPolicy.cborHex,
      discoveryValidator: discoveryValidator.cborHex,
      foldPolicy: foldPolicy.cborHex,
      foldValidator: foldValidator.cborHex,
      rewardPolicy: rewardPolicy.cborHex,
      rewardValidator: rewardValidator.cborHex,
    },
  });

  expect(newScripts.type).toBe("ok");

  if (newScripts.type == "error") return console.log(newScripts.error);

  //NOTE: INIT NODE
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const initNodeConfig: InitNodeConfig = {
    initUTXO: treasuryUTxO,
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
  };
  const initNodeUnsigned = await initNode(lucid, initNodeConfig);

  expect(initNodeUnsigned.type).toBe("ok");
  if (initNodeUnsigned.type == "ok") {
    // console.log(tx.data.txComplete.to_json())
    const initNodeSigned = await initNodeUnsigned.data.sign().complete();
    const initNodeHash = await initNodeSigned.submit();
    // console.log(initNodeHash)
  }

  emulator.awaitBlock(4);

  logFlag
    ? console.log(
        "initNode result ",
        JSON.stringify(
          await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator),
          replacer,
          2
        )
      )
    : null;

  //NOTE: INSERT NODE
  lucid.selectWalletFromSeed(users.account1.seedPhrase);

  const insertNodeConfig: InsertNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    currenTime: emulator.now(),
  };

  const insertNodeUnsigned = await insertNode(lucid, insertNodeConfig);

  expect(insertNodeUnsigned.type).toBe("ok");

  if (insertNodeUnsigned.type == "ok") {
    // console.log(insertNodeUnsigned.data.txComplete.to_json())
    const insertNodeSigned = await insertNodeUnsigned.data.sign().complete();
    const insertNodeHash = await insertNodeSigned.submit();
  }

  emulator.awaitBlock(4);

  logFlag
    ? console.log(
        "insertNode result",
        JSON.stringify(
          await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator),
          replacer,
          2
        )
      )
    : null;

  //NOTE: INSERT NODE
  lucid.selectWalletFromSeed(users.account2.seedPhrase);

  const insertNodeConfig2: InsertNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    currenTime: emulator.now(),
  };

  const insertNodeUnsigned2 = await insertNode(lucid, insertNodeConfig2);

  expect(insertNodeUnsigned2.type).toBe("ok");

  if (insertNodeUnsigned2.type == "ok") {
    // console.log(insertNodeUnsigned.data.txComplete.to_json())
    const insertNodeSigned2 = await insertNodeUnsigned2.data.sign().complete();
    const insertNodeHash2 = await insertNodeSigned2.submit();
  }

  emulator.awaitBlock(4);

  logFlag
    ? console.log(
        "insertNode result",
        JSON.stringify(
          await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator),
          replacer,
          2
        )
      )
    : null;
});
