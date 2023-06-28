import {
  buildScripts,
  deployRefScripts,
  DeployRefScriptsConfig,
  Emulator,
  generateAccountSeedPhrase,
  initNode,
  InitNodeConfig,
  insertNode,
  InsertNodeConfig,
  Lucid,
  ONE_HOUR_MS,
  parseUTxOsAtScript,
  removeNode,
  RemoveNodeConfig,
  replacer,
  TWENTY_FOUR_HOURS_MS,
} from "price-discovery-offchain";
import { test, expect, beforeEach } from "vitest";
import discoveryValidator from "./compiled/discoveryValidator.json";
import discoveryPolicy from "./compiled/discoveryMinting.json";
import foldPolicy from "./compiled/foldMint.json";
import foldValidator from "./compiled/foldValidator.json";
import rewardPolicy from "./compiled/rewardFoldMint.json";
import rewardValidator from "./compiled/rewardFoldValidator.json";
import alwaysFailValidator from "./compiled/alwaysFailValidator.json";

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
    account3: await generateAccountSeedPhrase({
      lovelace: BigInt(100_000_000),
    }),
  };

  context.emulator = new Emulator([
    context.users.treasury1,
    context.users.account1,
    context.users.account2,
    context.users.account3,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - initNode - aacount1 insertNode - aacount2 insertNode - aacount2 removeNode", async ({
  lucid,
  users,
  emulator,
}) => {
  const logFlag = false;
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const treasuryAddress = await lucid.wallet.address();
  const [treasuryUTxO] = await lucid.wallet.getUtxos();
  const deadline = emulator.now() + TWENTY_FOUR_HOURS_MS + ONE_HOUR_MS; // 48 hours + 1 hour

  const newScripts = buildScripts(lucid, {
    discoveryPolicy: {
      initUTXO: treasuryUTxO,
      deadline: deadline,
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
  if (newScripts.type == "error") return;
  //
  // writeFile("scripts.json", JSON.stringify(newScripts.data), (error) => {
  //   error ? console.log(error) : console.log("ok");
  // });
  // const appliedScripts = JSON.parse(readFileSync("./scripts.json", "utf8"));

  //NOTE: DEPLOY
  lucid.selectWalletFromSeed(users.account3.seedPhrase);
  const deployRefScriptsConfig: DeployRefScriptsConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    alwaysFails: alwaysFailValidator.cborHex,
    currenTime: emulator.now(),
  };

  const deployRefScriptsUnsigned = await deployRefScripts(
    lucid,
    deployRefScriptsConfig
  );

  expect(deployRefScriptsUnsigned.type).toBe("ok");
  if (deployRefScriptsUnsigned.type == "error") return;
  // console.log(tx.data.txComplete.to_json())
  const deployRefScrtipsSigned = await deployRefScriptsUnsigned.data.tx
    .sign()
    .complete();
  const deployRefScriptsHash = await deployRefScrtipsSigned.submit();

  emulator.awaitBlock(4);

  //Find node refs script
  const [nodeValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    deployRefScriptsUnsigned.data.unit.nodeValidator
  );

  const [nodePolicyUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    deployRefScriptsUnsigned.data.unit.nodePolicy
  );

  // console.log(await utxosAtScript(lucid,alwaysFailValidator.cborHex))

  //NOTE: INIT NODE
  const initNodeConfig: InitNodeConfig = {
    initUTXO: treasuryUTxO,
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    refScripts: {
      nodePolicy: nodePolicyUTxO,
    },
    userAddres: users.treasury1.address
  };
  const initNodeUnsigned = await initNode(lucid, initNodeConfig);

  expect(initNodeUnsigned.type).toBe("ok");
  if (initNodeUnsigned.type == "error") return;

  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  // console.log(tx.data.txComplete.to_json())
  const initNodeSigned = await initNodeUnsigned.data.sign().complete();
  const initNodeHash = await initNodeSigned.submit();
  // console.log(initNodeHash)
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
  // console.log("treasury1 before", await lucid.wallet.getUtxos());

  //NOTE: INSERT NODE

  const insertNodeConfig: InsertNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      nodePolicy: nodePolicyUTxO,
    },
    amountLovelace: 4_000_000,
    userAddres: users.account1.address,
    currenTime: emulator.now(),
  };

  const insertNodeUnsigned = await insertNode(lucid, insertNodeConfig);

  expect(insertNodeUnsigned.type).toBe("ok");

  if (insertNodeUnsigned.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.account1.seedPhrase);
  const insertNodeSigned = await insertNodeUnsigned.data.sign().complete();
  const insertNodeHash = await insertNodeSigned.submit();

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

  const insertNodeConfig2: InsertNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      nodePolicy: nodePolicyUTxO,
    },
    amountLovelace: 5_000_000,
    userAddres: users.account2.address,
    currenTime: emulator.now(),
  };

  const insertNodeUnsigned2 = await insertNode(lucid, insertNodeConfig2);

  expect(insertNodeUnsigned2.type).toBe("ok");
  if (insertNodeUnsigned2.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.account2.seedPhrase);
  const insertNodeSigned2 = await insertNodeUnsigned2.data.sign().complete();
  const insertNodeHash2 = await insertNodeSigned2.submit();

  //1 block = 20 secs
  //1 hour = 180 blocks
  //24 hours = 4320 blocks

  //NOTE: before 24 hours - up to 166 blocks
  // emulator.awaitBlock(100); //Pass

  //NOTE: within 24 hours of deadline
  // emulator.awaitBlock(167);

  //NOTE: after deadline 24 hours + 1 hour = 4500 - 12 blocks from previous = 4488
  //4486 is before deadline
  // emulator.awaitBlock(4486); //Pass

  //within 24 hours
  emulator.awaitBlock(200);

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

  //NOTE: REMOVE NODE
  const removeNodeConfig: RemoveNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      nodePolicy: nodePolicyUTxO,
    },
    currenTime: emulator.now(),
    deadline: deadline,
    penaltyAddress: treasuryAddress,
    userAddres: users.account2.address,
  };

  const removeNodeUnsigned = await removeNode(lucid, removeNodeConfig);

  expect(removeNodeUnsigned.type).toBe("ok");

  if (removeNodeUnsigned.type == "error") return
    // console.log(removeNodeUnsigned.data.txComplete.to_json())
    lucid.selectWalletFromSeed(users.account2.seedPhrase);
    const removeNodeSigned = await removeNodeUnsigned.data.sign().complete();
    const removeNodeHash = await removeNodeSigned.submit();

  emulator.awaitBlock(4);
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  // console.log("treasury1 address after", await lucid.wallet.getUtxos());

  logFlag
    ? console.log(
        "removeNode result",
        JSON.stringify(
          await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator),
          replacer,
          2
        )
      )
    : null;

  //NOTE: FAIL REMOVE NODE
  const removeNodeConfig2: RemoveNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      nodePolicy: nodePolicyUTxO,
    },
    userAddres: users.account2.address,
    deadline: deadline,
    penaltyAddress: treasuryAddress,
  };

  const removeNodeUnsigned2 = await removeNode(lucid, removeNodeConfig2);

  expect(removeNodeUnsigned2.type).toBe("error");

  if (removeNodeUnsigned2.type == "ok") {
    // console.log(insertNodeUnsigned.data.txComplete.to_json())
    lucid.selectWalletFromSeed(users.account2.seedPhrase);
    const removeNodeSigned2 = await removeNodeUnsigned2.data.sign().complete();
    const removeNodeHash = await removeNodeSigned2.submit();
  }

  emulator.awaitBlock(4);

  logFlag
    ? console.log(
        "removeNode result",
        JSON.stringify(
          await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator),
          replacer,
          2
        )
      )
    : null;
});
