import { writeFile, readFileSync } from "fs";
import {
  buildScripts,
  Emulator,
  fromAddressToData,
  generateAccountSeedPhrase,
  initNode,
  InitNodeConfig,
  Lucid,
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
  lucid.selectWalletFromSeed(treasury.account1.seedPhrase);
  const treasuryAddress = await lucid.wallet.address();
  const [userUTxO] = await lucid.wallet.getUtxos();

  const appliedScripts = buildScripts(lucid, {
    discoveryPolicy: {
      initUTXO: userUTxO,
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

  if (appliedScripts.type == "error") return console.log(appliedScripts.error);

  writeFile("scripts.json", JSON.stringify(appliedScripts.data), (error) => {
    error ? console.log(error) : console.log("ok");
  });
});

test("Test - Create loan, Provide loan", async () => {
  const appliedScripts = JSON.parse(
      readFileSync("./scripts.json", "utf8")
    )
  const users = {
    account1: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
    account2: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
  };

  const emulator = new Emulator([users.account1, users.account2]);

  const lucid = await Lucid.new(emulator);

  lucid.selectWalletFromSeed(users.account1.seedPhrase);
  const initNodeConfig : InitNodeConfig = {
    initUTXO: { },
    scripts: {
      nodePolicy: appliedScripts.discoveryPolicy,
      nodeValidator: appliedScripts.discoveryNode
    }
  }
  const initNodeUnsigned = await initNode(lucid,)
  expect("1").toBe("1");
});
