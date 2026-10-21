// The one-step machine must be bit-for-bit identical on and off chain. If these drift,
// an honest executor could lose a dispute, so they are tested against each other directly.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const vm = require("../reference/vm");
const merkle = require("../reference/merkle");
const { prng } = require("../reference/model");
const { program, prog } = require("./helpers");

describe("VM parity: reference/vm.js vs YureiVM.sol", function () {
  let h;
  before(async () => { h = await (await ethers.getContractFactory("VMHarness")).deploy(); });

  const EDGE = [0, 1, -1, 65536, -65536, 2147483647, -2147483648, 2147483646, -2147483647, 123456789, -987654321, 3, -3];

  it("matches on 400 random and edge-case steps (every opcode, saturation, negative shifts)", async () => {
    const rnd = prng(42);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const rint = () => (rnd() < 0.35 ? pick(EDGE) : Math.floor((rnd() * 2 - 1) * 2 ** 31) | 0);
    for (let n = 0; n < 400; n++) {
      const s = Array.from({ length: 16 }, rint);
      const ins = { op: n % 5, dst: Math.floor(rnd() * 16), a: Math.floor(rnd() * 16), b: Math.floor(rnd() * 16), imm: rint() };
      const js = vm.step(s, ins);
      const sol = (await h.step(s, ins)).map(Number);
      expect(sol, `case ${n}: op ${ins.op}`).to.deep.equal(js);
      if (n % 20 === 0) expect(await h.hashState(s)).to.equal(vm.hashState(s));
    }
  });

  it("rounds the fixed-point shift toward negative infinity on both sides", async () => {
    const s = Array(16).fill(0); s[1] = -3; s[0] = 0;
    const ins = { op: vm.OP.MULADDI, dst: 0, a: 1, b: 0, imm: 1 }; // (-3 * 1) >> 16 = -1, not 0
    expect(vm.step(s, ins)[0]).to.equal(-1);
    expect(Number((await h.step(s, ins))[0])).to.equal(-1);
  });

  it("rejects bad registers and opcodes on both sides", async () => {
    const s = Array(16).fill(0);
    expect(() => vm.step(s, { op: 0, dst: 16, a: 0, b: 0, imm: 0 })).to.throw();
    await expect(h.step(s, { op: 0, dst: 16, a: 0, b: 0, imm: 0 })).to.be.reverted;
    expect(() => vm.step(s, { op: 9, dst: 0, a: 0, b: 0, imm: 0 })).to.throw();
    await expect(h.step(s, { op: 9, dst: 0, a: 0, b: 0, imm: 0 })).to.be.reverted;
  });

  it("hashes every toy-0 instruction identically", async () => {
    for (const ins of program) expect(await h.hashInstr(ins)).to.equal(vm.hashInstr(ins));
  });

  it("verifies the same Merkle proofs, and refuses wrong index, leaf or depth", async () => {
    for (const i of [0, 1, 17, program.length - 1]) {
      const p = prog.tree.proof(i), leaf = prog.tree.leaf(i);
      expect(merkle.verify(prog.programRoot, leaf, i, p)).to.equal(true);
      expect(await h.verify(prog.programRoot, leaf, i, p, prog.programDepth)).to.equal(true);
      expect(await h.verify(prog.programRoot, leaf, i ^ 1, p, prog.programDepth)).to.equal(false);
      expect(await h.verify(prog.programRoot, ethers.ZeroHash, i, p, prog.programDepth)).to.equal(false);
      expect(await h.verify(prog.programRoot, leaf, i, p, prog.programDepth + 1)).to.equal(false);
    }
  });
});
