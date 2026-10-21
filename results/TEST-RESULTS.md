# Test results

Output of `npm test` on 2026-10-21, local Hardhat network, Solidity 0.8.28 (optimizer 200, via-IR).

What is covered:

- **VM parity**: the JavaScript reference and the Solidity one-step machine produce identical states and hashes on 400 random and edge-case instructions, including saturation and negative fixed-point shifts.
- **Reference**: toy-0 is deterministic; for every step whose error survives to the final answer, bisection finds exactly that step in at most 6 rounds.
- **Oracle, end to end**: honest answers finalize and the seal acts; lies at five positions across the trace are caught on chain and slashed; false challenges lose their bond; silent parties lose on timeout; forged commitments are rejected; the seal enforces per-action, daily, recipient and expiry limits and cannot be widened.

```
  YureiOracle: request, answer, challenge, proof, action
    ✔ 01-05 honest path: answer stands, executor is paid, the seal acts (52ms)
    ✔ a REFUSE answer finalizes without touching the seal
    ✔ a lie at step 9 is caught on chain in at most 6 rounds; the liar's bond is slashed (78ms)
    ✔ a lie at step 26 is caught on chain in at most 6 rounds; the liar's bond is slashed (80ms)
    ✔ a lie at step 34 is caught on chain in at most 6 rounds; the liar's bond is slashed (71ms)
    ✔ a lie at step 42 is caught on chain in at most 6 rounds; the liar's bond is slashed (77ms)
    ✔ a lie at step 49 is caught on chain in at most 6 rounds; the liar's bond is slashed (83ms)
    ✔ a false challenge against an honest answer loses its bond (46ms)
    ✔ timeouts: a silent asserter loses, a silent challenger loses (46ms)
    ✔ rejects forged trace commitments and forged one-step inputs
    ✔ the seal holds over its limits, and refuses impossible requests up front (57ms)
    ✔ the seal cannot be widened, and returns funds only after it expires
    ✔ an unanswered request can be cancelled after the timeout
  reference executor and bisection (off-chain)
    ✔ toy-0 compiles to 50 instructions and is deterministic (47ms)
    ✔ an honest executor and an honest watcher agree on every state
    ✔ finds the corrupted step for every position that changes the answer, in at most 6 rounds (860ms)
  VM parity: reference/vm.js vs YureiVM.sol
    ✔ matches on 400 random and edge-case steps (every opcode, saturation, negative shifts) (762ms)
    ✔ rounds the fixed-point shift toward negative infinity on both sides
    ✔ rejects bad registers and opcodes on both sides
    ✔ hashes every toy-0 instruction identically (65ms)
    ✔ verifies the same Merkle proofs, and refuses wrong index, leaf or depth
  21 passing (3s)
```
