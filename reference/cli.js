#!/usr/bin/env node
// Yurei reference CLI.
//   node reference/cli.js run      [f1,...,f8]          run toy-0 and print the trace commitment
//   node reference/cli.js dispute  [--corrupt k]        simulate a dispute against a lying executor
//   node reference/cli.js export                        write models/toy-0.json

const fs = require("fs");
const path = require("path");
const { OP_NAME, fromFixed, hashState } = require("./vm");
const { compileToy0, commitProgram, commitTrace, inputState, decide, run } = require("./model");
const { Executor, Challenger, simulateDispute } = require("./executor");

const program = compileToy0();
const prog = commitProgram(program);
const args = process.argv.slice(2);
const cmd = args[0] || "run";
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const DEFAULT = [0.42, -0.31, 0.77, 0.05, -0.62, 0.18, 0.91, -0.27];
const features = args[1] && !args[1].startsWith("--") ? args[1].split(",").map(Number) : DEFAULT;
const short = (h) => h.slice(0, 10) + "…" + h.slice(-6);

if (cmd === "run") {
  const input = inputState(features);
  const states = run(program, input);
  const c = commitTrace(states);
  const out = states.at(-1);
  console.log(`model        toy-0 (8 -> 4 -> 2 fixed-point MLP, ${program.length} instructions)`);
  console.log(`programRoot  ${prog.programRoot}`);
  console.log(`input        [${features.join(", ")}]`);
  console.log(`traceRoot    ${c.traceRoot}  (${states.length} states, depth ${c.traceDepth})`);
  console.log(`scores       refuse ${fromFixed(out[12]).toFixed(5)}  approve ${fromFixed(out[13]).toFixed(5)}`);
  console.log(`answer       ${decide(out) ? "APPROVE" : "REFUSE"}`);
  console.log("");
  for (const i of [0, 1, 2, 9, 10, 40, 49]) {
    const ins = program[i];
    console.log(`step ${String(i).padStart(2)}  ${OP_NAME[ins.op].padEnd(7)} r${ins.dst}${ins.op === 1 ? ` += r${ins.a} * ${fromFixed(ins.imm).toFixed(4)}` : ins.op === 0 ? ` = ${fromFixed(ins.imm).toFixed(4)}` : ` = relu(r${ins.a})`}  -> state ${short(hashState(states[i + 1]))}`);
  }
} else if (cmd === "dispute") {
  const input = inputState(features);
  // default: the first corruption point from the middle on whose error survives to the answer
  const honestEnd = run(program, input).at(-1).join();
  const lasting = program.map((_, i) => i).filter((i) => new Executor(program, { corruptAt: i }).execute(input).finalState.join() !== honestEnd);
  const k = Number(flag("--corrupt", lasting.find((i) => i >= 25) ?? lasting[0]));
  const liar = new Executor(program, { corruptAt: k }); const a = liar.execute(input);
  const w = new Challenger(program); const honestFinal = w.watch(input);
  console.log(`executor posts answer ${a.output ? "APPROVE" : "REFUSE"}  traceRoot ${short(a.traceRoot)}  (step ${k} corrupted)`);
  if (hashState(a.finalState) === honestFinal) {
    console.log("watcher recomputes: final state matches. The error was erased by a later ReLU, so the answer is correct and there is nothing to dispute.");
    process.exit(0);
  }
  console.log(`watcher recomputes: final state differs -> challenge`);
  const { rounds, step, log } = simulateDispute(liar, w, program.length);
  for (const l of log) console.log(`  round ${l.round}  state at step ${String(l.mid).padStart(2)}  ${l.agree ? "agree   -> error is later" : "differ  -> error is here or earlier"}`);
  const s = w.stateAt(step), ins = program[step];
  console.log(`one-step proof: re-execute step ${step} (${OP_NAME[ins.op]}) on the agreed state`);
  console.log(`  honest result ${short(hashState(w.stateAt(step + 1)))}  executor claimed ${short(liar.reveal(step + 1).hash)}`);
  console.log(`verdict: executor wrong at step ${step}, found in ${rounds} rounds, 1 step executed on chain`);
} else if (cmd === "export") {
  const file = path.join(__dirname, "..", "models", "toy-0.json");
  fs.writeFileSync(file, JSON.stringify({
    name: "toy-0",
    description: "8 -> 4 -> 2 fixed-point MLP (Q16.16), ReLU hidden layer, seeded random weights. Exists to exercise the protocol, not to be useful.",
    seed: "0x7e1", registers: 16, numSteps: program.length,
    programRoot: prog.programRoot, programDepth: prog.programDepth,
    io: { inputs: "r0..r7", hidden: "r8..r11", outputs: { r12: "REFUSE", r13: "APPROVE" } },
    program,
  }, null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), file));
} else {
  console.log("usage: node reference/cli.js run|dispute|export");
}
