import {
  buildScripts,
  CborHex,
  deployRefScripts,
  DeployRefScriptsConfig,
  Emulator,
  fromText,
  generateAccountSeedPhrase,
  initNode,
  InitNodeConfig,
  initTokenHolder,
  InitTokenHolderConfig,
  Lucid,
  parseUTxOsAtScript,
  replacer,
  Script,
  toUnit,
  utxosAtScript,
} from "price-discovery-offchain";
import { test, expect, beforeEach } from "vitest";
import discoveryValidator from "./compiled/discoveryValidator.json";
import discoveryPolicy from "./compiled/discoveryMinting.json";
import foldPolicy from "./compiled/foldMint.json";
import foldValidator from "./compiled/foldValidator.json";
import rewardPolicy from "./compiled/rewardFoldMint.json";
import rewardValidator from "./compiled/rewardFoldValidator.json";
import tokenHolderPolicy from "./compiled/tokenHolderPolicy.json"
import tokenHolderValidator from "./compiled/tokenHolderValidator.json"
import alwaysFailValidator from "./compiled/alwaysFails.json";

type LucidContext = {
  lucid: Lucid;
  users: any;
  emulator: Emulator;
};

//NOTE: INITIALIZE EMULATOR + ACCOUNTS
beforeEach<LucidContext>(async (context) => {
  context.users = {
    treasury1: await generateAccountSeedPhrase({
      lovelace: BigInt(500_000_000),
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

test<LucidContext>("Test - deploy - initTokenHolder - initNode", async ({
  lucid,
  users,
  emulator,
}) => {
  const logFlag = false;

  const [treasuryUTxO] = await lucid
    .selectWalletFrom({ address: users.treasury1.address })
    .wallet.getUtxos();
  const [project1UTxO] = await lucid
    .selectWalletFrom({ address: users.project1.address })
    .wallet.getUtxos();

  const newScripts = buildScripts(lucid, {
    discoveryPolicy: {
      initUTXO: treasuryUTxO,
      deadline: emulator.now() + 600_000, // 10 minutes
      penaltyAddress: users.treasury1.address,
    },
    rewardValidator: {
      projectCS: "2c04fa26b36a376440b0615a7cdf1a0c2df061df89c8c055e2650505",
      projectTN: "LOBSTER",
      projectAddr: users.treasury1.address,
    },
    projectTokenHolder: {
      initUTXO: project1UTxO,
    },
    unapplied: {
      discoveryPolicy: discoveryPolicy.cborHex,
      discoveryValidator: discoveryValidator.cborHex,
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
    toUnit(deployPolicyId, fromText("RewardPolicy"))
  );

  const [rewardValidatorUTxO] = await lucid.utxosAtWithUnit(
    lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: alwaysFailValidator.cborHex,
    }),
    toUnit(deployPolicyId, fromText("RewardValidator"))
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
  // console.log(
  //   "utxos at tokenholderScript",
  //   await utxosAtScript(lucid, newScripts.data.tokenHolderValidator)
  // );

  //NOTE: INIT NODE - treasury1 account
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
});
