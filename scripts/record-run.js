// Plays one full protocol story on a local chain and records every transaction:
//   1. an honest answer that finalizes and makes the seal act
//   2. a lying executor, challenged, bisected to one step and slashed
//   3. an honest executor answering the reopened question
// Writes results/run-log.json (used by the proof-of-tech video and the site).
// Run: npx hardhat run scripts/record-run.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const H = require("../test/helpers");
const { OP_NAME } = require("../reference/vm");

const log = [];
async function rec(stage, label, txp, extra = {}) {
  const tx = await txp; const rc = await tx.wait();
  const b = await ethers.provider.getBlock(rc.blockNumber);
  log.push({ stage, label, hash: rc.hash, block: rc.blockNumber, time: b.timestamp, gas: Number(rc.gasUsed), ...extra });
  return rc;
}

async function main() {
  const ctx = await H.deploy();
  const { oracle, game, usdg, requester, executor, watcher, other, recipient, modelId } = ctx;
  const seal = await H.makeSeal(ctx, { perAction: H.USDG(5), perDay: H.USDG(20) });
  const input = H.findInput(1);
  const role = { [requester.address]: "requester", [executor.address]: "executor A", [watcher.address]: "watcher", [other.address]: "executor B" };
  const meta = { chainId: Number((await ethers.provider.getNetwork()).chainId), oracle: oracle.target, game: game.target, seal: seal.target, model: "toy-0", programRoot: H.prog.programRoot, numSteps: H.program.length, bond: "50 USDG", window: "30 min", seal_limits: "5 USDG per action, 20 per day" };

  // ---- story 1: honest answer, seal acts
  let rc = await rec("01 request", "request · seal check passed", oracle.connect(requester).request(modelId, input, H.USDG(2), seal.target, recipient.address, H.USDG(4)), { who: "requester", note: "fee 2 USDG · action: pay 4 USDG" });
  let id = oracle.interface.parseLog(rc.logs.find((l) => l.address === oracle.target)).args.id;
  const honest = new H.Executor(H.program); const a = honest.execute(input);
  await rec("02 answer", "answer · APPROVE", oracle.connect(executor).answer(id, a.traceRoot, a.finalState, a.startProof, a.endProof), { who: "executor A", note: `traceRoot ${a.traceRoot.slice(0, 10)}… · bond 50 USDG`, traceRoot: a.traceRoot });
  await time.increase(H.WINDOW + 1);
  await rec("05 action", "finalize · seal acted", oracle.finalize(id), { who: "anyone", note: "4 USDG paid inside the seal's limits" });

  // ---- story 2: a lie, caught
  const lasting = H.lastingCorruptions(input); const k = lasting.find((i) => i >= 25) ?? lasting[0];
  rc = await rec("01 request", "request", oracle.connect(requester).request(modelId, input, H.USDG(2), ethers.ZeroAddress, ethers.ZeroAddress, 0), { who: "requester", note: "fee 2 USDG" });
  id = oracle.interface.parseLog(rc.logs.find((l) => l.address === oracle.target)).args.id;
  const liar = new H.Executor(H.program, { corruptAt: k }); const la = liar.execute(input);
  await rec("02 answer", "answer · APPROVE", oracle.connect(executor).answer(id, la.traceRoot, la.finalState, la.startProof, la.endProof), { who: "executor A", note: `traceRoot ${la.traceRoot.slice(0, 10)}… · bond 50 USDG`, traceRoot: la.traceRoot, lie: k });
  const w = new H.Challenger(H.program); w.watch(input);
  const gameId = await oracle.connect(watcher).challenge.staticCall(id);
  await rec("03 challenge", "challenge · final state differs", oracle.connect(watcher).challenge(id), { who: "watcher", note: "bond 50 USDG · dispute game opened" });
  for (;;) {
    const st = await game.games(gameId), turn = Number(st.turn);
    if (turn === 1) { const mid = Number((st.lo + st.hi) / 2n); const r = liar.reveal(mid);
      await rec("04 proof", `bisect · reveal step ${mid}`, game.connect(executor).bisect(gameId, r.hash, r.proof), { who: "executor A", note: `state hash ${r.hash.slice(0, 10)}…`, lo: Number(st.lo), hi: Number(st.hi), mid }); }
    else if (turn === 2) { const agree = w.agrees(Number(st.mid), st.midHash);
      await rec("04 proof", agree ? "respond · agree" : "respond · differ", game.connect(watcher).respond(gameId, agree), { who: "watcher", note: agree ? "the error is later" : "the error is here or earlier", agree, mid: Number(st.mid) }); }
    else if (turn === 3) { const lo = Number(st.lo); const ins = H.program[lo];
      const orc = await rec("04 proof", `one step · execute step ${lo}`, game.connect(watcher).oneStep(gameId, w.stateAt(lo), ins, H.prog.tree.proof(lo)), { who: "watcher", note: `${OP_NAME[ins.op]} r${ins.dst} · result ≠ executor's claim`, step: lo, verdict: "executor wrong", op: OP_NAME[ins.op], dst: ins.dst, a: ins.a });
      const ev = orc.logs.map((l) => { try { return game.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "OneStepExecuted");
      Object.assign(log[log.length - 1], { computed: ev.args.computed, claimed: ev.args.claimed }); break; }
    else break;
  }
  log[log.length - 1].settled = "executor A slashed · 100 USDG to watcher · question reopened";

  // ---- story 3: an honest executor answers the reopened question
  const b = new H.Executor(H.program); const ba = b.execute(input);
  await rec("02 answer", "answer · APPROVE", oracle.connect(other).answer(id, ba.traceRoot, ba.finalState, ba.startProof, ba.endProof), { who: "executor B", note: `traceRoot ${ba.traceRoot.slice(0, 10)}…`, traceRoot: ba.traceRoot });
  await time.increase(H.WINDOW + 1);
  await rec("05 action", "finalize", oracle.finalize(id), { who: "anyone", note: "executor B paid fee + bond" });

  const out = { generated: new Date().toISOString(), network: "local devnet (Hardhat)", meta, roles: role, log };
  fs.writeFileSync(path.join(__dirname, "..", "results", "run-log.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`recorded ${log.length} transactions; lie at step ${k}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
