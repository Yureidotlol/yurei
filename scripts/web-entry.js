const vm = require("../reference/vm");
const model = require("../reference/model");
const { Executor, Challenger } = require("../reference/executor");
const program = model.compileToy0();
const prog = model.commitProgram(program);
function findInput(want, seed = 1) { const rnd = model.prng(seed);
  for (let i = 0; i < 5000; i++) { const f = Array.from({ length: 8 }, () => Math.round((rnd() * 2 - 1) * 1000) / 1000); const input = model.inputState(f);
    if (model.decide(model.run(program, input).at(-1)) === want) return input; } throw new Error("no input"); }
function lastingCorruptions(input) { const honest = model.run(program, input).at(-1).join(); const out = [];
  for (let k = 0; k < program.length; k++) { if (new Executor(program, { corruptAt: k }).execute(input).finalState.join() !== honest) out.push(k); } return out; }
window.YUREI_REF = { vm, model, Executor, Challenger, program, prog: { programRoot: prog.programRoot, numSteps: prog.numSteps, proof: (i) => prog.tree.proof(i) }, findInput, lastingCorruptions };
