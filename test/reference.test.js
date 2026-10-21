// Off-chain properties of the reference executor and the bisection game.
const { expect } = require("chai");
const { run, hashState } = require("../reference/vm");
const { compileToy0, commitTrace, decide } = require("../reference/model");
const { Executor, Challenger, simulateDispute } = require("../reference/executor");
const { findInput, program } = require("./helpers");

describe("reference executor and bisection (off-chain)", function () {
  const input = findInput(1);

  it("toy-0 compiles to 50 instructions and is deterministic", () => {
    expect(program.length).to.equal(50);
    expect(compileToy0()).to.deep.equal(program);
    const a = run(program, input), b = run(program, input);
    expect(a.map(hashState)).to.deep.equal(b.map(hashState));
    expect(commitTrace(a).traceRoot).to.equal(commitTrace(b).traceRoot);
  });

  it("an honest executor and an honest watcher agree on every state", () => {
    const e = new Executor(program); const a = e.execute(input);
    const w = new Challenger(program); w.watch(input);
    for (let i = 0; i < a.states.length; i++) expect(w.agrees(i, e.reveal(i).hash)).to.equal(true);
    expect(decide(a.finalState)).to.equal(a.output);
  });

  it("finds the corrupted step for every position that changes the answer, in at most 6 rounds", () => {
    let disputed = 0, harmless = 0;
    for (let k = 0; k < program.length; k++) {
      const liar = new Executor(program, { corruptAt: k }); const a = liar.execute(input);
      const w = new Challenger(program); const honestFinal = w.watch(input);
      if (hashState(a.finalState) === honestFinal) {
        // a later ReLU erased the error, so the posted answer is still correct and an
        // honest watcher has nothing to dispute. The game only judges the final claim.
        harmless++;
        continue;
      }
      disputed++;
      const { rounds, step } = simulateDispute(liar, w, program.length);
      expect(step, `corrupt at ${k}`).to.equal(k);
      expect(rounds).to.be.at.most(Math.ceil(Math.log2(program.length)));
    }
    expect(disputed + harmless).to.equal(program.length);
    expect(disputed).to.be.greaterThan(30);
  });
});
