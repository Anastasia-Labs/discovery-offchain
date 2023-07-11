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
  initRewardFold,
  InitRewardFoldConfig,
  initTokenHolder,
  InitTokenHolderConfig,
  insertNode,
  InsertNodeConfig,
  Lucid,
  multiFold,
  MultiFoldConfig,
  ONE_HOUR_MS,
  parseUTxOsAtScript,
  replacer,
  sortByOutRefWithIndex,
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
import projectTokenHolderPolicy from "./compiled/projectTokenHolderMint.json"
import projectTokenHolderValidator from "./compiled/projectTokenHolderValidator.json"
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

test.skip<LucidContext>("Test - initNode - aacount1 insertNode - aacount2 insertNode - account3 insertNode - treasury1 initFold - treasury1 multiFold", async ({
  lucid,
  users,
  emulator,
}) => {
  const logFlag = false;
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const treasuryAddress = await lucid.wallet.address();
  const [treasuryUTxO] = await lucid.wallet.getUtxos();
  const deadline = emulator.now() + TWENTY_FOUR_HOURS_MS + ONE_HOUR_MS; // 48 hours + 1 hour
  const [project1UTxO] = await lucid.selectWalletFromSeed(users.project1.seedPhrase).wallet.getUtxos()

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
    projectTokenHolder:{
      initUTXO: project1UTxO
    },
    unapplied: {
      discoveryPolicy: discoveryPolicy.cborHex,
      discoveryValidator: discoveryValidator.cborHex,
      foldPolicy: foldPolicy.cborHex,
      foldValidator: foldValidator.cborHex,
      rewardPolicy: rewardPolicy.cborHex,
      rewardValidator: rewardValidator.cborHex,
      tokenHolderPolicy: projectTokenHolderPolicy.cborHex,
      tokenHolderValidator: projectTokenHolderValidator.cborHex
    },
  });

  expect(newScripts.type).toBe("ok");
  if (newScripts.type == "error") return;

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

  //NOTE: INIT PROJECT TOKEN HOLDER
  const initTokenHolderConfig: InitTokenHolderConfig = {
    initUTXO: project1UTxO,
    scripts: {
      tokenHolderPolicy: newScripts.data.tokenHolderPolicy,
      tokenHolderValidator: newScripts.data.tokenHolderValidator,
    },
    userAddress: users.project1.address,
  };

  const initTokenHolderUnsigned = await initTokenHolder(
    lucid,
    initTokenHolderConfig
  );
  expect(initTokenHolderUnsigned.type).toBe("ok");
  if (initTokenHolderUnsigned.type == "ok") {
    lucid.selectWalletFromSeed(users.project1.seedPhrase);
    const initTokenHolderSigned = await initTokenHolderUnsigned.data
      .sign()
      .complete();
    const initTokenHolderHash = await initTokenHolderSigned.submit();
  }

  emulator.awaitBlock(4);
  console.log(
    "utxos at tokenholderScript",
    await utxosAtScript(lucid, newScripts.data.tokenHolderValidator)
  );

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
    userAddress: users.treasury1.address,
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
    userAddress: users.account1.address,
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
    userAddress: users.account2.address,
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
    userAddress: users.account3.address,
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
    userAddress: users.treasury1.address,
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

  //NOTE: TEST NEW FUNCTIONS

  // console.log(
  //   "unsorted keys",
  //   await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
  // );
  //
  // console.log(
  //   "reduce sorted keys with index",
  //   JSON.stringify(
  //     sortByOutRefWithIndex(
  //       await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
  //     ),
  //     replacer,
  //     2
  //   )
  // );

  const chunksNodeRefInputs = chunkArray(
    (await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)).map(
      (readableUTxO) => {
        return readableUTxO.outRef;
      }
    ),
    2
  );

  //NOTE: MULTIFOLD

  const multiFoldConfig: MultiFoldConfig = {
    nodeRefInputs: sortByOutRefWithIndex(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    ).map((data) => {
      return data.value.outRef;
    }),
    indices: sortByOutRefWithIndex(
      await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
    ).map((data) => {
      return data.index;
    }),
    scripts: {
      foldPolicy: newScripts.data.foldPolicy,
      foldValidator: newScripts.data.foldValidator,
    },
    userAddress: users.treasury1.address,
    currenTime: emulator.now(),
  };

  const multiFoldUnsigned = await multiFold(lucid, multiFoldConfig);
  // console.log(multiFoldUnsigned)

  expect(multiFoldUnsigned.type).toBe("ok");
  if (multiFoldUnsigned.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const multiFoldSigned = await multiFoldUnsigned.data.sign().complete();
  const multiFoldHash = await multiFoldSigned.submit();

  emulator.awaitBlock(4);

  // console.log(await utxosAtScript(lucid,newScripts.data.foldValidator))
  // console.log(Data.from((await utxosAtScript(lucid,newScripts.data.foldValidator))[0].datum,FoldDatum))

  const initRewardFoldConfig : InitRewardFoldConfig = {
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      nodePolicy: newScripts.data.discoveryPolicy,
      foldPolicy: newScripts.data.foldPolicy,
      foldValidator: newScripts.data.foldValidator,
      rewardFoldPolicy: newScripts.data.rewardPolicy,
      rewardFoldValidator: newScripts.data.rewardValidator,
      tokenHolderPolicy: newScripts.data.tokenHolderPolicy,
      tokenHolderValidator: newScripts.data.tokenHolderPolicy
    },
    userAddress: users.treasury1.address
  }
  const initRewardFoldUnsigned = await initRewardFold(lucid,initRewardFoldConfig)

  console.log(initRewardFoldUnsigned)


});
