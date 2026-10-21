// The five stages end to end, on a local chain.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const H = require("./helpers");
const { USDG, BOND, WINDOW, MOVE, program, findInput, deploy, makeSeal, postAnswer, playDispute, Executor, Challenger } = H;

const STATUS = { Open: 1n, Answered: 2n, Disputed: 3n, Final: 4n, Cancelled: 5n };

async function openRequest(ctx, input, { fee = USDG(2), seal = ethers.ZeroAddress, to = ethers.ZeroAddress, amount = 0n } = {}) {
  const tx = await ctx.oracle.connect(ctx.requester).request(ctx.modelId, input, fee, seal, to, amount);
  const rc = await tx.wait();
  return ctx.oracle.interface.parseLog(rc.logs.find((l) => l.address === ctx.oracle.target && ctx.oracle.interface.parseLog(l)?.name === "Requested")).args.id;
}

describe("YureiOracle: request, answer, challenge, proof, action", function () {
  let ctx;
  beforeEach(async () => { ctx = await deploy(); });

  it("01-05 honest path: answer stands, executor is paid, the seal acts", async () => {
    const seal = await makeSeal(ctx);
    const input = findInput(1);
    const id = await openRequest(ctx, input, { seal: seal.target, to: ctx.recipient.address, amount: USDG(4) });
    const a = await postAnswer(ctx.oracle, ctx.executor, id, new Executor(program), input);
    expect(a.output).to.equal(1);
    await expect(ctx.oracle.finalize(id)).to.be.revertedWithCustomError(ctx.oracle, "WindowOpen");
    await time.increase(WINDOW + 1);
    const before = await ctx.usdg.balanceOf(ctx.executor.address);
    await expect(ctx.oracle.finalize(id)).to.emit(ctx.oracle, "ActionExecuted").withArgs(id, ctx.recipient.address, USDG(4));
    expect(await ctx.usdg.balanceOf(ctx.executor.address) - before).to.equal(USDG(2) + BOND);
    expect(await ctx.usdg.balanceOf(ctx.recipient.address)).to.equal(USDG(4));
    expect((await ctx.oracle.requests(id)).status).to.equal(STATUS.Final);
  });

  it("a REFUSE answer finalizes without touching the seal", async () => {
    const seal = await makeSeal(ctx);
    const input = findInput(0);
    const id = await openRequest(ctx, input, { seal: seal.target, to: ctx.recipient.address, amount: USDG(4) });
    await postAnswer(ctx.oracle, ctx.executor, id, new Executor(program), input);
    await time.increase(WINDOW + 1);
    await expect(ctx.oracle.finalize(id)).to.not.emit(ctx.oracle, "ActionExecuted");
    expect(await ctx.usdg.balanceOf(ctx.recipient.address)).to.equal(0n);
  });

  const LIE_INPUT = findInput(1);
  const lasting = H.lastingCorruptions(LIE_INPUT);
  const picks = [...new Set([lasting[0], lasting[Math.floor(lasting.length / 4)], lasting[Math.floor(lasting.length / 2)], lasting[Math.floor(lasting.length * 3 / 4)], lasting.at(-1)])];
  for (const k of picks) {
    it(`a lie at step ${k} is caught on chain in at most 6 rounds; the liar's bond is slashed`, async () => {
      const input = LIE_INPUT;
      const id = await openRequest(ctx, input);
      const liar = new Executor(program, { corruptAt: k });
      await postAnswer(ctx.oracle, ctx.executor, id, liar, input);
      const watcher = new Challenger(program); watcher.watch(input);
      const gameId = await ctx.oracle.connect(ctx.watcher).challenge.staticCall(id);
      await ctx.oracle.connect(ctx.watcher).challenge(id);
      const before = await ctx.usdg.balanceOf(ctx.watcher.address);
      const rounds = await playDispute(ctx.game, gameId, { asserter: ctx.executor, asserterExec: liar, challenger: ctx.watcher, watcher, input });
      expect(rounds).to.be.at.most(6);
      const g = await ctx.game.games(gameId);
      expect(g.asserterWon).to.equal(false);
      expect(g.lo).to.equal(BigInt(k));
      expect(await ctx.usdg.balanceOf(ctx.watcher.address) - before).to.equal(BOND * 2n);
      const r = await ctx.oracle.requests(id);
      expect(r.status).to.equal(STATUS.Open); // the question reopens for an honest executor
      await postAnswer(ctx.oracle, ctx.other, id, new Executor(program), input);
      await time.increase(WINDOW + 1);
      await ctx.oracle.finalize(id);
      expect((await ctx.oracle.requests(id)).executor).to.equal(ctx.other.address);
    });
  }

  it("a false challenge against an honest answer loses its bond", async () => {
    const input = findInput(1);
    const id = await openRequest(ctx, input);
    const honest = new Executor(program);
    await postAnswer(ctx.oracle, ctx.executor, id, honest, input);
    const gameId = await ctx.oracle.connect(ctx.watcher).challenge.staticCall(id);
    await ctx.oracle.connect(ctx.watcher).challenge(id);
    // a dishonest watcher disagrees with everything, then tries to prove the last step wrong
    const liarWatcher = { agrees: () => false, stateAt: (i) => honest.states[i] };
    const before = await ctx.usdg.balanceOf(ctx.executor.address);
    await playDispute(ctx.game, gameId, { asserter: ctx.executor, asserterExec: honest, challenger: ctx.watcher, watcher: liarWatcher, input });
    expect((await ctx.game.games(gameId)).asserterWon).to.equal(true);
    expect(await ctx.usdg.balanceOf(ctx.executor.address) - before).to.equal(BOND);
    expect((await ctx.oracle.requests(id)).status).to.equal(STATUS.Answered);
  });

  it("timeouts: a silent asserter loses, a silent challenger loses", async () => {
    const input = findInput(1);
    // asserter goes silent
    let id = await openRequest(ctx, input);
    await postAnswer(ctx.oracle, ctx.executor, id, new Executor(program, { corruptAt: lasting[0] }), input);
    let gameId = await ctx.oracle.connect(ctx.watcher).challenge.staticCall(id);
    await ctx.oracle.connect(ctx.watcher).challenge(id);
    await expect(ctx.game.timeout(gameId)).to.be.revertedWithCustomError(ctx.game, "NotLate");
    await time.increase(MOVE + 1);
    await ctx.game.timeout(gameId);
    expect((await ctx.game.games(gameId)).asserterWon).to.equal(false);
    // challenger goes silent after the first reveal
    const honest = new Executor(program);
    id = await openRequest(ctx, input);
    await postAnswer(ctx.oracle, ctx.executor, id, honest, input);
    gameId = await ctx.oracle.connect(ctx.watcher).challenge.staticCall(id);
    await ctx.oracle.connect(ctx.watcher).challenge(id);
    const { hash, proof } = honest.reveal(25);
    await ctx.game.connect(ctx.executor).bisect(gameId, hash, proof);
    await time.increase(MOVE + 1);
    await ctx.game.timeout(gameId);
    expect((await ctx.game.games(gameId)).asserterWon).to.equal(true);
  });

  it("rejects forged trace commitments and forged one-step inputs", async () => {
    const input = findInput(1);
    const id = await openRequest(ctx, input);
    const e = new Executor(program); const a = e.execute(input);
    const wrongFinal = a.finalState.slice(); wrongFinal[13] += 1;
    await expect(ctx.oracle.connect(ctx.executor).answer(id, a.traceRoot, wrongFinal, a.startProof, a.endProof)).to.be.revertedWithCustomError(ctx.oracle, "BadProof");
    await ctx.oracle.connect(ctx.executor).answer(id, a.traceRoot, a.finalState, a.startProof, a.endProof);
    const gameId = await ctx.oracle.connect(ctx.watcher).challenge.staticCall(id);
    await ctx.oracle.connect(ctx.watcher).challenge(id);
    const { hash, proof } = e.reveal(25);
    await expect(ctx.game.connect(ctx.executor).bisect(gameId, ethers.ZeroHash, proof)).to.be.revertedWithCustomError(ctx.game, "BadProof");
    await expect(ctx.game.connect(ctx.watcher).bisect(gameId, hash, proof)).to.be.revertedWithCustomError(ctx.game, "NotYourTurn");
  });

  it("the seal holds over its limits, and refuses impossible requests up front", async () => {
    const seal = await makeSeal(ctx, { perAction: USDG(5), perDay: USDG(8) });
    const input = findInput(1);
    await expect(openRequest(ctx, input, { seal: seal.target, to: ctx.recipient.address, amount: USDG(6) })).to.be.revertedWithCustomError(ctx.oracle, "SealWouldRefuse");
    await expect(openRequest(ctx, input, { seal: seal.target, to: ctx.other.address, amount: USDG(1) })).to.be.revertedWithCustomError(ctx.oracle, "SealWouldRefuse");
    // two requests that each pass alone, but together exceed the daily limit
    const id1 = await openRequest(ctx, input, { seal: seal.target, to: ctx.recipient.address, amount: USDG(5) });
    const id2 = await openRequest(ctx, input, { seal: seal.target, to: ctx.recipient.address, amount: USDG(5) });
    for (const id of [id1, id2]) await postAnswer(ctx.oracle, ctx.executor, id, new Executor(program), input);
    await time.increase(WINDOW + 1);
    await expect(ctx.oracle.finalize(id1)).to.emit(ctx.oracle, "ActionExecuted");
    await expect(ctx.oracle.finalize(id2)).to.emit(ctx.oracle, "ActionHeld");
    expect(await ctx.usdg.balanceOf(ctx.recipient.address)).to.equal(USDG(5));
    await expect(seal.act(ctx.recipient.address, 1)).to.be.revertedWithCustomError(seal, "OnlyOracle");
  });

  it("the seal cannot be widened, and returns funds only after it expires", async () => {
    const seal = await makeSeal(ctx, { days: 1 });
    expect(seal.interface.fragments.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort()).to.deep.equal(["act", "reclaim"]);
    await expect(seal.reclaim()).to.be.revertedWithCustomError(seal, "NotExpired");
    await time.increase(86400 + 1);
    await seal.reclaim();
    expect(await ctx.usdg.balanceOf(ctx.requester.address)).to.equal(USDG(10_000) + USDG(100));
  });

  it("an unanswered request can be cancelled after the timeout", async () => {
    const id = await openRequest(ctx, findInput(1));
    await expect(ctx.oracle.connect(ctx.requester).cancel(id)).to.be.revertedWithCustomError(ctx.oracle, "TooEarly");
    await time.increase(H.ANSWER_TIMEOUT + 1);
    await ctx.oracle.connect(ctx.requester).cancel(id);
    expect(await ctx.usdg.balanceOf(ctx.requester.address)).to.equal(USDG(10_000));
  });
});
