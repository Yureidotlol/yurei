// Rebuilds the files site/run.html loads, from the tested contracts and reference code.
//   npx hardhat compile && node scripts/build-web.js
// Needs esbuild (npx downloads it on first use).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const root = path.join(__dirname, "..");
const L = { DisputeGame: "DisputeGame.sol/DisputeGame.json", YureiOracle: "YureiOracle.sol/YureiOracle.json", Seal: "Seal.sol/Seal.json", MockUSDG: "test/MockUSDG.sol/MockUSDG.json" };
const out = {};
for (const [n, f] of Object.entries(L)) { const a = JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts", f))); out[n] = { abi: a.abi, bytecode: a.bytecode }; }
fs.writeFileSync(path.join(root, "site/yurei-artifacts.js"), "// Generated from the tested build (npx hardhat compile). Do not edit by hand.\nwindow.YUREI_ARTIFACTS=" + JSON.stringify(out) + ";\n");
execSync("npx --yes esbuild@0.24.0 scripts/web-entry.js --bundle --minify --format=iife --alias:ethers=./scripts/web-ethers-shim.js --outfile=site/yurei-ref.js", { cwd: root, stdio: "inherit" });
console.log("wrote site/yurei-artifacts.js and site/yurei-ref.js");
