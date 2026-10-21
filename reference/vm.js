// Yurei reference VM.
//
// A deliberately tiny, fully deterministic machine for running a fixed-point model.
// The same rules are implemented in contracts/YureiVM.sol; test/vm.parity.test.js
// checks that both produce identical states and identical hashes.
//
// State: 16 signed 32-bit registers. Values are Q16.16 fixed point (65536 = 1.0).
// Arithmetic saturates at the int32 range instead of wrapping, and the right shift in
// MULADDI rounds toward negative infinity, exactly like Solidity's signed `>>`.

const { AbiCoder, keccak256 } = require("ethers");

const REGS = 16;
const ONE = 65536; // 1.0 in Q16.16
const INT32_MAX = 2147483647n;
const INT32_MIN = -2147483648n;

const OP = { SETI: 0, MULADDI: 1, RELU: 2, ADD: 3, MOV: 4 };
const OP_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

const coder = AbiCoder.defaultAbiCoder();

function sat(v) {
  // v is a BigInt
  if (v > INT32_MAX) return Number(INT32_MAX);
  if (v < INT32_MIN) return Number(INT32_MIN);
  return Number(v);
}

function checkReg(r) {
  if (!Number.isInteger(r) || r < 0 || r >= REGS) throw new Error(`bad register ${r}`);
}

/** Apply one instruction to a state. Returns a new state; never mutates the input. */
function step(state, ins) {
  if (state.length !== REGS) throw new Error("bad state length");
  const s = state.slice();
  checkReg(ins.dst); checkReg(ins.a); checkReg(ins.b);
  switch (ins.op) {
    case OP.SETI: s[ins.dst] = ins.imm; break;
    case OP.MULADDI: s[ins.dst] = sat(BigInt(state[ins.dst]) + ((BigInt(state[ins.a]) * BigInt(ins.imm)) >> 16n)); break;
    case OP.RELU: s[ins.dst] = state[ins.a] < 0 ? 0 : state[ins.a]; break;
    case OP.ADD: s[ins.dst] = sat(BigInt(state[ins.a]) + BigInt(state[ins.b])); break;
    case OP.MOV: s[ins.dst] = state[ins.a]; break;
    default: throw new Error(`bad op ${ins.op}`);
  }
  return s;
}

/** keccak256(abi.encode(int32[])) — identical to YureiVM.hashState. */
function hashState(state) {
  return keccak256(coder.encode(["int32[]"], [state]));
}

/** keccak256(abi.encode(op, dst, a, b, imm)) — identical to YureiVM.hashInstr. */
function hashInstr(ins) {
  return keccak256(coder.encode(["uint8", "uint8", "uint8", "uint8", "int32"], [ins.op, ins.dst, ins.a, ins.b, ins.imm]));
}

/** Run a whole program. Returns every state, S0 (the input) through SN. */
function run(program, input) {
  const states = [input.slice()];
  for (const ins of program) states.push(step(states[states.length - 1], ins));
  return states;
}

const toFixed = (x) => Math.round(x * ONE);
const fromFixed = (v) => v / ONE;

module.exports = { REGS, ONE, OP, OP_NAME, step, run, hashState, hashInstr, toFixed, fromFixed };
