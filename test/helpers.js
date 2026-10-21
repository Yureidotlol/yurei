const { ethers } = require("hardhat");
const { compileToy0, commitProgram, inputState, run, decide, prng } = require("../reference/model");
const { Executor, Challenger } = require("../reference/executor");

const USDG = (n) => ethers.parseUnits(String(n), 6);
const BOND = USDG(50);
const WINDOW = 30 * 60; // challenge window, seconds
const MOVE = 60 * 60; // dispute move window, seconds
const ANSWER_TIMEOUT = 24 * 60 * 60;

const program = compileToy0();
const prog = commitProgram(program);

/** An input whose toy-0 output is `want` (1 = APPROVE, 0 = REFUSE). */
function findInput(want, seed = 1) {
  const rnd = prng(seed);
  for (let i = 0; i < 5000; i++) {
    const f = Array.from({ length: 8 }, () => Math.round((rnd() * 2 - 1) * 1000) / 1000);
    const input = inputState(f);
    if (decide(run(program, input).at(-1)) === want) return input;
  }
  throw new Error("no input found");
}

async function deploy() {
  const [deployer, requester, executor, watcher, recipient, other] = await ethers.getSigners();
  const usdg = await (await ethers.getContractFactory("MockUSDG")).deploy();
  const game = await (await ethers.getContractFactory("DisputeGame")).deploy(MOVE);
  const oracle = await (await ethers.getContractFactory("YureiOracle")).deploy(usdg.target, game.target, BOND, WINDOW, ANSWER_TIMEOUT);
  for (const s of [requester, executor, watcher, other]) {
    await usdg.mint(s.address, USDG(10_000));
    await usdg.connect(s).approve(oracle.target, ethers.MaxUint256);
  }
  await oracle.registerModel(prog.programRoot, prog.numSteps);
  const modelId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint32"], [prog.programRoot, prog.numSteps]));
  return { deployer, requester, executor, watcher, recipient, other, usdg, game, oracle, modelId };
}

async function makeSeal({ usdg, oracle, requester, recipient }, { perAction = USDG(5), perDay = USDG(20), fund = USDG(100), days = 30 } = {}) {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const seal = await (await ethers.getContractFactory("Seal")).deploy(usdg.target, oracle.target, requester.address, perAction, perDay, now + days * 86400, [recipient.address]);
  if (fund > 0n) await usdg.mint(seal.target, fund);
  return seal;
}

/** Post an answer from an Executor (honest or corrupt). */
async function postAnswer(oracle, signer, id, exec, input) {
  const a = exec.execute(input);
  await oracle.connect(signer).answer(id, a.traceRoot, a.finalState, a.startProof, a.endProof);
  return a;
}

/**
 * Play the on-chain bisection: the asserter reveals, the challenger compares with its own
 * honest run, and at the end the challenger proves the single disputed step.
 * Returns the number of rounds played.
 */
async function playDispute(game, gameId, { asserter, asserterExec, challenger, watcher, input, proveAtEnd = true }) {
  let rounds = 0;
  for (;;) {
    const g = await game.games(gameId);
    const turn = Number(g.turn);
    if (turn === 1) {
      const mid = Number((g.lo + g.hi) / 2n);
      const { hash, proof } = asserterExec.reveal(mid);
      await game.connect(asserter).bisect(gameId, hash, proof);
      rounds++;
    } else if (turn === 2) {
      await game.connect(challenger).respond(gameId, watcher.agrees(Number(g.mid), g.midHash));
    } else if (turn === 3) {
      if (!proveAtEnd) return rounds;
      const lo = Number(g.lo);
      const state = watcher.stateAt(lo);
      await game.connect(challenger).oneStep(gameId, state, program[lo], prog.tree.proof(lo));
      return rounds;
    } else return rounds;
  }
}

/** Corruption points whose error survives to the final state (a later ReLU can erase others). */
function lastingCorruptions(input) {
  const honest = run(program, input).at(-1).join();
  const out = [];
  for (let k = 0; k < program.length; k++) {
    const e = new Executor(program, { corruptAt: k });
    if (e.execute(input).finalState.join() !== honest) out.push(k);
  }
  return out;
}

module.exports = { lastingCorruptions, USDG, BOND, WINDOW, MOVE, ANSWER_TIMEOUT, program, prog, findInput, deploy, makeSeal, postAnswer, playDispute, Executor, Challenger };
