// Executors and challengers, as off-chain actors.
//
// An Executor runs the committed program and builds the trace commitment it posts
// with its answer. A dishonest executor can be told to corrupt one step; everything
// after that step is then computed from the corrupted state, which is what a real
// faulty or malicious executor would produce.

const { run, step, hashState } = require("./vm");
const { commitTrace, decide } = require("./model");

class Executor {
  constructor(program, { corruptAt = null, corruptBy = 1 } = {}) {
    this.program = program;
    this.corruptAt = corruptAt;
    this.corruptBy = corruptBy;
  }

  execute(input) {
    let states;
    if (this.corruptAt === null) states = run(this.program, input);
    else {
      states = [input.slice()];
      for (let i = 0; i < this.program.length; i++) {
        let next = step(states[i], this.program[i]);
        if (i === this.corruptAt) {
          next = next.slice();
          const dst = this.program[i].dst;
          next[dst] = (next[dst] + this.corruptBy) | 0; // one wrong value, in the register this step writes
        }
        states.push(next);
      }
    }
    const c = commitTrace(states);
    this.states = states;
    this.commit = c;
    const final = states[states.length - 1];
    return {
      states, traceRoot: c.traceRoot, traceDepth: c.traceDepth, finalState: final, output: decide(final),
      startProof: c.tree.proof(0), endProof: c.tree.proof(states.length - 1),
    };
  }

  /** Bisection move: reveal our hash at `index` with a Merkle proof. */
  reveal(index) {
    return { hash: this.commit.hashes[index], proof: this.commit.tree.proof(index) };
  }
}

/** A watcher recomputes honestly and compares. */
class Challenger {
  constructor(program) { this.program = program; }
  watch(input) {
    this.states = run(this.program, input);
    this.hashes = this.states.map(hashState);
    return this.hashes[this.hashes.length - 1];
  }
  agrees(index, hash) { return this.hashes[index] === hash; }
  stateAt(index) { return this.states[index]; }
}

/**
 * Pure off-chain simulation of the bisection game. Returns the rounds played and the
 * single step that has to be re-executed. Used by the docs and the benchmark; the
 * on-chain version of the same game lives in contracts/DisputeGame.sol.
 */
function simulateDispute(asserter, challenger, numSteps) {
  let lo = 0, hi = numSteps, rounds = 0;
  const log = [];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    rounds++;
    const { hash } = asserter.reveal(mid);
    const agree = challenger.agrees(mid, hash);
    log.push({ round: rounds, mid, agree });
    if (agree) lo = mid; else hi = mid;
  }
  return { rounds, step: lo, log };
}

module.exports = { Executor, Challenger, simulateDispute };
