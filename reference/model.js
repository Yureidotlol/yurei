// toy-0: the first spirit.
//
// An 8 -> 4 -> 2 fixed-point MLP compiled to Yurei VM instructions.
//   registers r0..r7   input features (Q16.16)
//   registers r8..r11  hidden units (ReLU)
//   registers r12,r13  output scores: r12 = REFUSE, r13 = APPROVE
//
// The weights come from a seeded PRNG. toy-0 exists to exercise the protocol end to
// end (commit, answer, dispute, one-step proof, seal), not to be useful as a model.

const { OP, toFixed, hashInstr, run, hashState, REGS } = require("./vm");
const merkle = require("./merkle");

// mulberry32: tiny, deterministic PRNG
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compileToy0(seed = 0x7e1) {
  const rnd = prng(seed);
  const w = () => toFixed((rnd() * 2 - 1) * 0.9); // weights in (-0.9, 0.9)
  const program = [];
  // hidden layer
  for (let j = 0; j < 4; j++) {
    const h = 8 + j;
    program.push({ op: OP.SETI, dst: h, a: 0, b: 0, imm: w() / 4 | 0 }); // bias
    for (let i = 0; i < 8; i++) program.push({ op: OP.MULADDI, dst: h, a: i, b: 0, imm: w() });
    program.push({ op: OP.RELU, dst: h, a: h, b: 0, imm: 0 });
  }
  // output layer
  for (let k = 0; k < 2; k++) {
    const o = 12 + k;
    program.push({ op: OP.SETI, dst: o, a: 0, b: 0, imm: w() / 4 | 0 });
    for (let j = 0; j < 4; j++) program.push({ op: OP.MULADDI, dst: o, a: 8 + j, b: 0, imm: w() });
  }
  return program;
}

/** Commitment to a program: Merkle root over instruction hashes. */
function commitProgram(program) {
  const tree = merkle.build(program.map(hashInstr));
  return { tree, programRoot: tree.root, programDepth: tree.depth, numSteps: program.length };
}

/** Commitment to an execution: Merkle root over state hashes S0..SN. */
function commitTrace(states) {
  const hashes = states.map(hashState);
  const tree = merkle.build(hashes);
  return { tree, hashes, traceRoot: tree.root, traceDepth: tree.depth };
}

/** Pack 8 features (plain numbers) into a 16-register input state. */
function inputState(features) {
  if (features.length !== 8) throw new Error("toy-0 takes 8 features");
  const s = Array(REGS).fill(0);
  features.forEach((f, i) => (s[i] = toFixed(f)));
  return s;
}

const decide = (state) => (state[13] > state[12] ? 1 : 0); // 1 = APPROVE, 0 = REFUSE

module.exports = { compileToy0, commitProgram, commitTrace, inputState, decide, prng, run, hashState };
