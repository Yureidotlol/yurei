# The dispute game

## Setup

The asserter (the executor) committed to `traceRoot`, a Merkle root over state hashes
`h(S0) … h(SN)`. Both parties agree on `h(S0)`: it is the request's input. They disagree on
`h(SN)`: that is why there is a dispute. The game keeps an interval `[lo, hi]` with the
invariant:

> the parties agree on the state at `lo`, and disagree on the state at `hi`.

Initially `lo = 0`, `hi = N`.

## Rounds

1. **Bisect (asserter).** Reveals `h_mid`, its hash at `mid = ⌊(lo + hi) / 2⌋`, with a Merkle proof
   against its own `traceRoot`. A reveal that isn't in the committed trace is rejected, so the
   asserter cannot change its story mid-game.
2. **Respond (challenger).** Agrees or disagrees with `h_mid`.
   - agree → `lo = mid` (the error is later)
   - disagree → `hi = mid` (the error is here or earlier)

The interval halves each round. After `⌈log₂ N⌉` rounds, `hi = lo + 1`.

## One step

Anyone may call `oneStep(state, instruction, programProof)` with:

- the full state `S_lo`, which must hash to the agreed `h(S_lo)`;
- the instruction at index `lo`, proven against the model's `programRoot`.

The contract executes that single instruction with `YureiVM.step` and compares the hash of the
result with the asserter's claimed `h(S_hi)`. Equal: the asserter was right. Different: the
asserter was wrong.

## Deadlines

Every move must happen within `moveWindow`. `timeout()` resolves a stalled game:

| Whose turn | Who loses |
|---|---|
| Asserter (must bisect) | asserter |
| Challenger (must respond) | challenger |
| One step (nobody proved the asserter wrong in time) | challenger |

## Why it is sound

Suppose the executor's posted final state is wrong and a watcher computes honestly. The watcher
agrees exactly where the asserter's revealed hash equals its own honest hash. Since the two traces
start equal (S0) and end different (SN), bisection always ends at an adjacent pair where the
honest state at `lo` matches and the asserter's state at `hi` does not. The honest watcher holds
`S_lo` and runs the true instruction; the asserter's claim cannot match, because the honest result
differs from it. So **one honest watcher always wins against a wrong final answer.**

Conversely, if the asserter's final state is correct, no sequence of challenger responses can make
the one-step check fail: whatever interval the challenger steers toward, the asserter's claim at
`hi` is consistent with honest execution from the agreed `lo`, or the challenger has agreed to a
state it should not have.

## A subtlety the tests found

A lying executor can corrupt an intermediate state whose error is later erased (for instance, a
negative value that a ReLU clamps to zero anyway). Its trace is wrong but its final answer is right.
Yurei judges the **final claim**, not the trace: an honest watcher whose final state matches has
nothing to dispute, and a challenge would lose. For the input used in the test suite, a +1 corruption
survives to the answer at 32 of toy-0's 50 steps; at the other 18 a later ReLU erases it. See
`test/reference.test.js`.

## Cost

Per round: one `bisect` (≈ 57k gas) and one `respond` (≈ 42k gas). One `oneStep` at the end
(≈ 97k gas). Rounds grow with `log₂ N`. Measured in [GAS](../results/GAS.md) and
[BISECTION](../results/BISECTION.md).
