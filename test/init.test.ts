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
import { test, beforeAll, expect, beforeEach } from "vitest";
import scripts from "./plutus.json";

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

test<LucidContext>("Test - initNode", async ({ lucid, users, emulator }) => {
  const logFlag = false
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
  logFlag ? console.log(
    "initNode result ",
    JSON.stringify(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator),
      undefined,
      2
    )
  ) : null

});
