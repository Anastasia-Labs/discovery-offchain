import {
  buildScripts,
  chunkArray,
  Data,
  deployRefScripts,
  Emulator,
  fromText,
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
  rewardFold,
  RewardFoldConfig,
  sortByOutRefWithIndex,
  toUnit,
  TWENTY_FOUR_HOURS_MS,
  utxosAtScript,
} from "price-discovery-offchain";
import { test, expect, beforeEach } from "vitest";
import discoveryValidator from "./compiled/discoveryValidator.json";
import discoveryPolicy from "./compiled/discoveryMinting.json";
import discoveryStake from "./compiled/discoveryStakeValidator.json";
import foldPolicy from "./compiled/foldMint.json";
import foldValidator from "./compiled/foldValidator.json";
import rewardPolicy from "./compiled/rewardFoldMint.json";
import rewardValidator from "./compiled/rewardFoldValidator.json";
import tokenHolderPolicy from "./compiled/tokenHolderPolicy.json";
import tokenHolderValidator from "./compiled/tokenHolderValidator.json";
import alwaysFailValidator from "./compiled/alwaysFails.json";
import { FoldDatum } from "price-discovery-offchain/dist/core/contract.types";

type LucidContext = {
  lucid: Lucid;
  users: any;
  emulator: Emulator;
};

//NOTE: INITIALIZE EMULATOR + ACCOUNTS
beforeEach<LucidContext>(async (context) => {
  context.users = {
    treasury1: await generateAccountSeedPhrase({
      lovelace: BigInt(800_000_000),
    }),
    project1: await generateAccountSeedPhrase({
      lovelace: BigInt(500_000_000),
      [toUnit(
        "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
        fromText("LOBSTER")
      )]: BigInt(100_000_000),
    }),
    account1: await generateAccountSeedPhrase({
      lovelace: BigInt(500_000_000),
    }),
    account2: await generateAccountSeedPhrase({
      lovelace: BigInt(500_000_000),
    }),
    account3: await generateAccountSeedPhrase({
      lovelace: BigInt(500_000_000),
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
  const [project1UTxO] = await lucid
    .selectWalletFromSeed(users.project1.seedPhrase)
    .wallet.getUtxos();

  const newScripts = buildScripts(lucid, {
    discoveryPolicy: {
      initUTXO: treasuryUTxO,
      deadline: deadline,
      penaltyAddress: treasuryAddress,
    },
    rewardValidator: {
      projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
      projectTN: "LOBSTER",
      projectAddr: treasuryAddress,
    },
    projectTokenHolder: {
      initUTXO: project1UTxO,
    },
    unapplied: {
      discoveryPolicy: discoveryPolicy.cborHex,
      discoveryValidator: discoveryValidator.cborHex,
      discoveryStake: discoveryStake.cborHex,
      foldPolicy: foldPolicy.cborHex,
      foldValidator: foldValidator.cborHex,
      rewardPolicy: rewardPolicy.cborHex,
      rewardValidator: rewardValidator.cborHex,
      tokenHolderPolicy: tokenHolderPolicy.cborHex,
      tokenHolderValidator: tokenHolderValidator.cborHex,
    },
  });

  expect(newScripts.type).toBe("ok");
  if (newScripts.type == "error") return;

  //NOTE: DEPLOY
  lucid.selectWalletFromSeed(users.account3.seedPhrase);

  const deploy1 = await deployRefScripts(lucid, {
    script: newScripts.data.discoveryPolicy,
    name: "DiscoveryPolicy",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy1.type).toBe("ok");
  if (deploy1.type == "ok") {
    (await deploy1.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy2 = await deployRefScripts(lucid, {
    script: newScripts.data.discoveryValidator,
    name: "DiscoveryValidator",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy2.type).toBe("ok");
  if (deploy2.type == "ok") {
    (await deploy2.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy3 = await deployRefScripts(lucid, {
    script: newScripts.data.foldPolicy,
    name: "FoldPolicy",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy3.type).toBe("ok");
  if (deploy3.type == "ok") {
    (await deploy3.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy4 = await deployRefScripts(lucid, {
    script: newScripts.data.foldValidator,
    name: "FoldValidator",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy4.type).toBe("ok");
  if (deploy4.type == "ok") {
    (await deploy4.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy5 = await deployRefScripts(lucid, {
    script: newScripts.data.rewardPolicy,
    name: "RewardFoldPolicy",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy5.type).toBe("ok");
  if (deploy5.type == "ok") {
    (await deploy5.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy6 = await deployRefScripts(lucid, {
    script: newScripts.data.rewardValidator,
    name: "RewardFoldValidator",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy6.type).toBe("ok");
  if (deploy6.type == "ok") {
    (await deploy6.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy7 = await deployRefScripts(lucid, {
    script: newScripts.data.tokenHolderPolicy,
    name: "TokenHolderPolicy",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy7.type).toBe("ok");
  if (deploy7.type == "ok") {
    (await deploy7.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy8 = await deployRefScripts(lucid, {
    script: newScripts.data.tokenHolderValidator,
    name: "TokenHolderValidator",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy8.type).toBe("ok");
  if (deploy8.type == "ok") {
    (await deploy8.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  const deploy9 = await deployRefScripts(lucid, {
    script: newScripts.data.discoveryStake,
    name: "DiscoveryStakeValidator",
    alwaysFails: alwaysFailValidator.cborHex,
  });

  expect(deploy9.type).toBe("ok");
  if (deploy9.type == "ok") {
    (await deploy9.data.tx.sign().complete()).submit();
    emulator.awaitBlock(4);
  }

  //Find node refs script
  const deployPolicyId =
    deploy1.type == "ok" ? deploy1.data.deployPolicyId : "";

  const [nodeValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("DiscoveryValidator"))
  );

  const [nodePolicyUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("DiscoveryPolicy"))
  );

  const [foldPolicyUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("FoldPolicy"))
  );

  const [foldValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("FoldValidator"))
  );

  const [rewardPolicyUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("RewardFoldPolicy"))
  );

  const [rewardValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("RewardFoldValidator"))
  );

  const [tokenHolderPolicyUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("TokenHolderPolicy"))
  );

  const [tokenHolderValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("TokenHolderValidator"))
  );

  const [discoveryStakeValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("DiscoveryStakeValidator"))
  );

  //NOTE: REGISTER STAKE VALIDATOR
  emulator.distributeRewards(BigInt(100_000_000));

  const discoveryStakeRewardAddress = lucid.utils.validatorToRewardAddress({
    type: "PlutusV2",
    script: newScripts.data.discoveryStake,
  });

  // console.log("stakeRewardAddress", discoveryStakeRewardAddress)
  await lucid.awaitTx(
    await (
      await (
        await lucid
          .newTx()
          .registerStake(discoveryStakeRewardAddress!)
          .complete()
      )
        .sign()
        .complete()
    ).submit()
  );

  //NOTE: INIT PROJECT TOKEN HOLDER
  const initTokenHolderConfig: InitTokenHolderConfig = {
    initUTXO: project1UTxO,
    projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
    projectTN: "LOBSTER",
    projectAmount: 100_000_000,
    scripts: {
      tokenHolderPolicy: newScripts.data.tokenHolderPolicy,
      tokenHolderValidator: newScripts.data.tokenHolderValidator,
    },
  };

  lucid.selectWalletFromSeed(users.project1.seedPhrase);
  const initTokenHolderUnsigned = await initTokenHolder(
    lucid,
    initTokenHolderConfig
  );
  // console.log(initTokenHolderUnsigned)

  expect(initTokenHolderUnsigned.type).toBe("ok");
  if (initTokenHolderUnsigned.type == "ok") {
    const initTokenHolderSigned = await initTokenHolderUnsigned.data
      .sign()
      .complete();
    const initTokenHolderHash = await initTokenHolderSigned.submit();
  }

  emulator.awaitBlock(4);
  // console.log(
  //   "utxos at tokenholderScript",
  //   await utxosAtScript(lucid, newScripts.data.tokenHolderValidator)
  // );

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
  };
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const initNodeUnsigned = await initNode(lucid, initNodeConfig);

  expect(initNodeUnsigned.type).toBe("ok");
  if (initNodeUnsigned.type == "error") return;

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
    currenTime: emulator.now(),
  };

  lucid.selectWalletFromSeed(users.account1.seedPhrase);
  const insertNodeUnsigned = await insertNode(lucid, insertNodeConfig);
  // console.log(insertNodeUnsigned);

  expect(insertNodeUnsigned.type).toBe("ok");
  if (insertNodeUnsigned.type == "error") return;

  // console.log(insertNodeUnsigned.data.txComplete.to_json())
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
    currenTime: emulator.now(),
  };

  lucid.selectWalletFromSeed(users.account2.seedPhrase);
  const insertNodeUnsigned2 = await insertNode(lucid, insertNodeConfig2);

  expect(insertNodeUnsigned2.type).toBe("ok");
  if (insertNodeUnsigned2.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
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
    currenTime: emulator.now(),
  };

  lucid.selectWalletFromSeed(users.account3.seedPhrase);
  const insertNodeUnsigned3 = await insertNode(lucid, insertNodeConfig3);

  expect(insertNodeUnsigned3.type).toBe("ok");
  if (insertNodeUnsigned3.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
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
    currenTime: emulator.now(),
  };

  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const initFoldUnsigned = await initFold(lucid, initFoldConfig);

  expect(initFoldUnsigned.type).toBe("ok");
  if (initFoldUnsigned.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
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

  // console.log("fold validator utxo", await utxosAtScript(lucid,newScripts.data.foldValidator))
  // console.log(Data.from((await utxosAtScript(lucid, newScripts.data.foldValidator))[0].datum! ,FoldDatum))
  //NOTE: INIT REWARD FOLD

  const initRewardFoldConfig: InitRewardFoldConfig = {
    projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
    projectTN: "LOBSTER",
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      nodePolicy: newScripts.data.discoveryPolicy,
      foldPolicy: newScripts.data.foldPolicy,
      foldValidator: newScripts.data.foldValidator,
      rewardFoldPolicy: newScripts.data.rewardPolicy,
      rewardFoldValidator: newScripts.data.rewardValidator,
      tokenHolderPolicy: newScripts.data.tokenHolderPolicy,
      tokenHolderValidator: newScripts.data.tokenHolderValidator,
    },
    refScripts: {
      nodePolicy: nodePolicyUTxO,
      nodeValidator: nodeValidatorUTxO,
      commitFoldPolicy: foldPolicyUTxO,
      commitFoldValidator: foldValidatorUTxO,
      rewardFoldPolicy: rewardPolicyUTxO,
      rewardFoldValidator: rewardValidatorUTxO,
      tokenHolderPolicy: tokenHolderPolicyUTxO,
      tokenHolderValidator: tokenHolderValidatorUTxO,
    },
    userAddress: users.treasury1.address,
  };

  const initRewardFoldUnsigned = await initRewardFold(
    lucid,
    initRewardFoldConfig
  );

  // console.log(initRewardFoldUnsigned)

  expect(initRewardFoldUnsigned.type).toBe("ok");
  if (initRewardFoldUnsigned.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const initRewardFoldSigned = await initRewardFoldUnsigned.data
    .sign()
    .complete();
  const initRewardFoldHash = await initRewardFoldSigned.submit();

  emulator.awaitBlock(4);

  // console.log(
  //   "discoveryValidator",
  //   await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
  // );

  //NOTE: REWARD FOLD 1

  const nodeUTxOs = await utxosAtScript(
    lucid,
    newScripts.data.discoveryValidator
  );

  const rewardFoldConfig: RewardFoldConfig = {
    nodeInputs: nodeUTxOs,
    projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
    projectTN: "LOBSTER",
    projectAddress: treasuryAddress,
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      discoveryStake: newScripts.data.discoveryStake,
      rewardFoldPolicy: newScripts.data.rewardPolicy,
      rewardFoldValidator: newScripts.data.rewardValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      discoveryStake: discoveryStakeValidatorUTxO,
      rewardFoldPolicy: rewardPolicyUTxO,
      rewardFoldValidator: rewardValidatorUTxO,
    },
    userAddress: users.treasury1.address,
  };

  const rewardFoldUnsigned = await rewardFold(lucid, rewardFoldConfig);
  // console.log(rewardFoldUnsigned);

  expect(rewardFoldUnsigned.type).toBe("ok");
  if (rewardFoldUnsigned.type == "error") return;
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const rewardFoldSigned = await rewardFoldUnsigned.data.sign().complete();
  const rewardFoldHash = await rewardFoldSigned.submit();

  emulator.awaitBlock(4);
  // console.log("users.treasury1.address", await lucid.utxosAt(users.treasury1.address))
  // console.log("utxos at discovery validator", await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator))

  //NOTE: REWARD FOLD 2

  const rewardFoldConfig2: RewardFoldConfig = {
    nodeInputs: nodeUTxOs,
    projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
    projectTN: "LOBSTER",
    projectAddress: treasuryAddress,
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      discoveryStake: newScripts.data.discoveryStake,
      rewardFoldPolicy: newScripts.data.rewardPolicy,
      rewardFoldValidator: newScripts.data.rewardValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      discoveryStake: discoveryStakeValidatorUTxO,
      rewardFoldPolicy: rewardPolicyUTxO,
      rewardFoldValidator: rewardValidatorUTxO,
    },
    userAddress: users.treasury1.address,
  };

  const rewardFoldUnsigned2 = await rewardFold(lucid, rewardFoldConfig2);
  // console.log(rewardFoldUnsigned2);

  expect(rewardFoldUnsigned2.type).toBe("ok");
  if (rewardFoldUnsigned2.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const rewardFoldSigned2 = await rewardFoldUnsigned2.data.sign().complete();
  const rewardFoldHash2 = await rewardFoldSigned2.submit();

  emulator.awaitBlock(4);

  //NOTE: REWARD FOLD 3

  const rewardFoldConfig3: RewardFoldConfig = {
    nodeInputs: nodeUTxOs,
    projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
    projectTN: "LOBSTER",
    projectAddress: treasuryAddress,
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      discoveryStake: newScripts.data.discoveryStake,
      rewardFoldPolicy: newScripts.data.rewardPolicy,
      rewardFoldValidator: newScripts.data.rewardValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      discoveryStake: discoveryStakeValidatorUTxO,
      rewardFoldPolicy: rewardPolicyUTxO,
      rewardFoldValidator: rewardValidatorUTxO,
    },
    userAddress: users.treasury1.address,
  };

  const rewardFoldUnsigned3 = await rewardFold(lucid, rewardFoldConfig3);
  // console.log(rewardFoldUnsigned2);

  expect(rewardFoldUnsigned3.type).toBe("ok");
  if (rewardFoldUnsigned3.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const rewardFoldSigned3 = await rewardFoldUnsigned3.data.sign().complete();
  const rewardFoldHash3 = await rewardFoldSigned3.submit();

  emulator.awaitBlock(4);

  //NOTE: REWARD FOLD 4

  const rewardFoldConfig4: RewardFoldConfig = {
    nodeInputs: nodeUTxOs,
    projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
    projectTN: "LOBSTER",
    projectAddress: treasuryAddress,
    scripts: {
      nodeValidator: newScripts.data.discoveryValidator,
      discoveryStake: newScripts.data.discoveryStake,
      rewardFoldPolicy: newScripts.data.rewardPolicy,
      rewardFoldValidator: newScripts.data.rewardValidator,
    },
    refScripts: {
      nodeValidator: nodeValidatorUTxO,
      discoveryStake: discoveryStakeValidatorUTxO,
      rewardFoldPolicy: rewardPolicyUTxO,
      rewardFoldValidator: rewardValidatorUTxO,
    },
    userAddress: users.treasury1.address,
  };

  const rewardFoldUnsigned4 = await rewardFold(lucid, rewardFoldConfig4);
  // console.log(rewardFoldUnsigned4);

  expect(rewardFoldUnsigned4.type).toBe("ok");
  if (rewardFoldUnsigned4.type == "error") return;
  // console.log(insertNodeUnsigned.data.txComplete.to_json())
  lucid.selectWalletFromSeed(users.treasury1.seedPhrase);
  const rewardFoldSigned4 = await rewardFoldUnsigned4.data.sign().complete();
  const rewardFoldHash4 = await rewardFoldSigned4.submit();

  emulator.awaitBlock(4);

  console.log(
    "users.treasury1.address",
    await lucid.utxosAt(users.treasury1.address)
  );
  console.log(
    "utxos at discovery validator",
    await parseUTxOsAtScript(lucid, newScripts.data.discoveryValidator)
  );
  console.log(
    "utxos at reward fold",
    await utxosAtScript(lucid, newScripts.data.rewardValidator)
  );

  //NOTE: MISSING REMOVE NODE WITH PROJECT TOKEN
});
