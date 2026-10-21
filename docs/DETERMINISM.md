# Determinism: the Q16.16 machine

Fraud proofs only work if two honest machines produce **bit-identical** traces. Floating point
does not give you that: results depend on instruction ordering, fused multiply-add, compiler flags
and hardware. So Yurei's VM uses integers only.

## State

16 signed 32-bit registers. Values are **Q16.16** fixed point: `65536` is `1.0`, so the range is
about ±32768 with a resolution of 1/65536.

## Instructions

| Opcode | Effect |
|---|---|
| `SETI dst, imm` | `r[dst] = imm` |
| `MULADDI dst, a, imm` | `r[dst] = sat(r[dst] + (r[a] · imm) >> 16)` |
| `RELU dst, a` | `r[dst] = max(r[a], 0)` |
| `ADD dst, a, b` | `r[dst] = sat(r[a] + r[b])` |
| `MOV dst, a` | `r[dst] = r[a]` |

Every instruction is encoded as `(op: uint8, dst: uint8, a: uint8, b: uint8, imm: int32)`.
Registers must be `< 16` and the opcode must be known, or the step reverts (and the JS throws).

## The two rules that make it portable

1. **Saturation, not wraparound.** Results are clamped to `[-2³¹, 2³¹ − 1]`. Two's-complement
   wraparound would also be deterministic, but saturation keeps overflow from turning a large
   positive activation into a large negative one.
2. **The shift rounds toward negative infinity.** `(−3 · 1) >> 16` is `−1`, not `0`. Solidity's
   signed `>>` and JavaScript's `BigInt >>` both floor; integer division would truncate toward
   zero and silently disagree on negative values. `test/vm.parity.test.js` pins this case.

## Parity testing

The JavaScript reference (`reference/vm.js`) and the Solidity library (`contracts/YureiVM.sol`)
are tested against each other on 400 random and edge-case instructions per run, covering every
opcode, `INT32_MIN`/`INT32_MAX`, and negative shifts. Any divergence fails CI.

## Toward real models

A language model is mostly matrix-vector products. Compiled naïvely to `MULADDI`, a small model
has billions of steps; bisection handles that in ~30 rounds, but the executor must store or
regenerate the trace. The next VM revision adds coarser instructions (a fixed-size dot-product
block, a lookup-table activation) so that one step stays small enough to execute on chain while
the trace gets much shorter. See [OPEN-QUESTIONS](OPEN-QUESTIONS.md).
