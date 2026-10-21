require("@nomicfoundation/hardhat-toolbox");
const fs = require("fs");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// If solc-js is installed locally, compile with it instead of downloading a compiler
// (useful in sandboxes without network access). Otherwise Hardhat downloads 0.8.28.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  const local = path.join(__dirname, "node_modules", "solc", "soljson.js");
  if (args.solcVersion === "0.8.28" && process.env.YUREI_LOCAL_SOLC && fs.existsSync(local)) {
    return { compilerPath: local, isSolcJs: true, version: args.solcVersion, longVersion: "0.8.28" };
  }
  return runSuper();
});

const PK = process.env.DEPLOYER_PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" },
  },
  networks: {
    rhTestnet: { url: process.env.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com", chainId: 46630, accounts: PK ? [PK] : [] },
    rhMainnet: { url: process.env.RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com", chainId: 4663, accounts: PK ? [PK] : [] },
  },
  gasReporter: { enabled: !!process.env.REPORT_GAS, currency: "USD", noColors: true, outputFile: process.env.REPORT_GAS ? "results/gas-report.txt" : undefined },
};
