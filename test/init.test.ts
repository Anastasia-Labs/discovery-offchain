import {
  buildScripts,
  deployRefScripts,
  DeployRefScriptsConfig,
  Emulator,
  generateAccountSeedPhrase,
  initNode,
  InitNodeConfig,
  Lucid,
  parseUTxOsAtScript,
  replacer,
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

test<LucidContext>("Test - initNode", async ({ lucid, users, emulator }) => {
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
});
