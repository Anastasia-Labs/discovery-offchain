import {
  buildScripts,
  chunkArray,
  deployRefScripts,
  DeployRefScriptsConfig,
  Emulator,
  generateAccountSeedPhrase,
  initFold,
  InitFoldConfig,
  initNode,
  InitNodeConfig,
  insertNode,
  InsertNodeConfig,
  Lucid,
  multiFold,
  MultiFoldConfig,
  ONE_HOUR_MS,
  parseUTxOsAtScript,
  reduceByKeysNodeUTxOs,
  replacer,
  sortByKeysNodeUTxOs,
  TWENTY_FOUR_HOURS_MS,
  utxosAtScript,
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
    project1: await generateAccountSeedPhrase({
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
    context.users.project1,
    context.users.account1,
    context.users.account2,
    context.users.account3,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - initNode - aacount1 insertNode - aacount2 insertNode - account3 insertNode - treasury1 initFold - treasury1 multiFold", async ({
  lucid,
  users,
  emulator,
}) => {
  const logFlag = false;
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const treasuryAddress = await lucid.wallet.address();
  const [treasuryUTxO] = await lucid.wallet.getUtxos();
  const deadline = emulator.now() + TWENTY_FOUR_HOURS_MS + ONE_HOUR_MS; // 48 hours + 1 hour
  // console.log(deadline)

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

  //NOTE: DEPLOY
  lucid.selectWalletFromSeed(users.project1.seedPhrase);
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
    userAddres: users.treasury1.address,
  };
  const initNodeUnsigned = await initNode(lucid, initNodeConfig);

  expect(initNodeUnsigned.type).toBe("ok");
  if (initNodeUnsigned.type == "error") return;

  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  // console.log(initNodeUnsigned.data.txComplete.to_json());
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

  //NOTE: INSERT NODE ACCOUNT 1

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
  // console.log(insertNodeUnsigned);

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

  //NOTE: INSERT NODE ACCOUNT 2

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

  emulator.awaitBlock(500);

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

  //NOTE: INSERT NODE ACCOUNT 3

  const insertNodeConfig3: InsertNodeConfig = {
    scripts: {
      nodePolicy: newScripts.data.discoveryPolicy,
      nodeValidator: newScripts.data.discoveryValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      nodePolicy: nodePolicyUTxO,
    },
    amountLovelace: 5_000_000,
    userAddres: users.account3.address,
    currenTime: emulator.now(),
  };

  const insertNodeUnsigned3 = await insertNode(lucid, insertNodeConfig3);

  expect(insertNodeUnsigned3.type).toBe("ok");
  if (insertNodeUnsigned3.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.account3.seedPhrase);
  const insertNodeSigned3 = await insertNodeUnsigned3.data.sign().complete();
  const insertNodeHash3 = await insertNodeSigned3.submit();

  emulator.awaitBlock(6000);

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

  //NOTE: INIT FOLD
  const initFoldConfig: InitFoldConfig = {
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      nodePolicy: newScripts.data.discoveryPolicy,
      foldPolicy: newScripts.data.foldPolicy,
      foldValidator: newScripts.data.foldValidator,
    },
    userAddres: users.treasury1.address,
    currenTime: emulator.now(),
  };

  const initFoldUnsigned = await initFold(lucid, initFoldConfig);

  expect(initFoldUnsigned.type).toBe("ok");
  if (initFoldUnsigned.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const initFoldSigned = await initFoldUnsigned.data.sign().complete();
  const initFoldHash = await initFoldSigned.submit();

  emulator.awaitBlock(4);

  // console.log(await utxosAtScript(lucid, newScripts.data.foldValidator))

  //NOTE: TEST NEW FUNCTIONS

  console.log(
    "unsorted keys",
    await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
  );
  console.log(
    "sorted keys",
    sortByKeysNodeUTxOs(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    )
  );

  console.log(
    "reduce sorted keys",
    reduceByKeysNodeUTxOs(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    )
  );

  console.log(
    "sorted keys - OutRef only",
    sortByKeysNodeUTxOs(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    ).map((readableUTxO) => {
      return readableUTxO.outRef;
    })
  );

  console.log(
    "sorted key - OutRef only - chunks",
    chunkArray(
      sortByKeysNodeUTxOs(
        await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
      ).map((readableUTxO) => {
        return readableUTxO.outRef;
      }),
      2
    )
  );

  const chunksNodeRefInputs = chunkArray(
    sortByKeysNodeUTxOs(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    ).map((readableUTxO) => {
      return readableUTxO.outRef;
    }),
    2
  );

  const multiFoldConfig : MultiFoldConfig = {
    nodeRefInputs: sortByKeysNodeUTxOs( await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)).map((readableUTxO) => { return readableUTxO.outRef; }),
    scripts: {
      foldPolicy: newScripts.data.foldPolicy,
      foldValidator: newScripts.data.foldValidator,
    },
    userAddres: users.treasury1.address,
    currenTime: emulator.now()
  }

  const multiFoldUnsigned = await multiFold(lucid, multiFoldConfig)
  console.log(multiFoldUnsigned)
  console.log(multiFoldUnsigned.data.txComplete.to_json())
  
  //   {
  //     txHash: 'efadc0a6ff0026c9b6ecba2a1ca42e49b85ded7f86532f4a9eeb3037bfdcf322',
  //     outputIndex: 0
  //   },
  //   {
  //     txHash: 'efadc0a6ff0026c9b6ecba2a1ca42e49b85ded7f86532f4a9eeb3037bfdcf322',
  //     outputIndex: 1
  //   }
  // ],
  //  [
  //   {
  //     txHash: 'ee0147a7da918d5f2a15882509717908c65fa0be20d6070ff5779419483f0e0d',
  //     outputIndex: 1
  //   },
  //   {
  //     txHash: '006e15820d070b3f1c2ab5c99b1005a86e7040bce20008f27a522d3a06025c34',
  //     outputIndex: 1
  //   }
  // ],
  // [
  //   {
  //     txHash: '78f9c69dc1304dc7088a7c7925ff6a320abab74afe074a8baa0305b943ae7a57',
  //     outputIndex: 1
  //   }
  // ]



});
