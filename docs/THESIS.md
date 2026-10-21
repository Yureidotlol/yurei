# Thesis: verify the answer, don't recompute the mind

*Draft 0.1 · October 2026*

## Abstract

Machine intelligence that acts with real money has two bad options today. It can run on a
server you cannot inspect, which asks you to trust whoever runs it. Or it can run entirely
inside smart contracts, which makes every step verifiable but costs orders of magnitude more
than the answer is worth.

Yurei takes a third path, borrowed from how optimistic rollups secure their own state. A
committed model runs off-chain. Each answer is posted on-chain together with a cryptographic
commitment to the computation that produced it. Anyone may challenge an answer within a fixed
window. A dispute is narrowed, by bisection, to a single step of the model's arithmetic, and
only that one step is re-executed on-chain to decide who lied.

An honest answer costs one ordinary transaction. A dishonest one costs its author a bond.
Around both sits the seal: a policy contract, fixed at creation, that decides what any answer
is allowed to do, however persuasive the answer is.

## 1. The problem

An AI agent that can move money is only as trustworthy as two things: whether its answer is
the answer the model really gives, and whether that answer is allowed to act. Today both are
promises made by whoever runs the agent.

Proving every step on-chain answers the first question, but the cost scales with the size of
the model: every multiplication of every layer becomes contract execution. Even a very small
model makes a short reply expensive enough that nobody uses it. Proving every step with zero-knowledge
proofs moves the cost from the chain to the prover, where it is still large and grows with the model.

## 2. The claim

Most answers are honest, and most of the time nobody needs a proof. What matters is that a
proof *can* be forced, cheaply, by anyone, whenever an answer is wrong.

Yurei's claim is that for a deterministic model:

1. **An honest answer costs a constant amount on-chain**, independent of the model's size: a
   request, an answer with two Merkle proofs, and a finalization. ([GAS](../results/GAS.md):
   about 573k gas end to end on the prototype.)
2. **A wrong answer can always be proven wrong** by any single honest watcher, in a number of
   rounds that grows with the logarithm of the computation's length, ending in exactly one
   executed instruction. ([BISECTION](../results/BISECTION.md): 30 rounds for a billion steps.)
3. **What an answer may do is bounded independently of the answer.** Even a correct answer
   from a correct model acts only inside limits written before it existed.

Claims 1 and 2 are the optimistic-verification argument applied to model inference. Claim 3
is the seal.

## 3. Why the seal is separate

A verification game proves that the model said X. It cannot prove X is wise. A model can be
correctly executed and still wrong, or manipulated by its input. So Yurei never lets an answer
act directly. The seal is an immutable contract with its own limits (per action, per day,
which recipients, until when), and the oracle can only ask it to act after an answer is final.
The worst case of a fully compromised model is therefore bounded by the seal, not by the model.

## 4. What exists today

A complete local prototype: a 16-register fixed-point VM implemented identically in JavaScript
and Solidity, trace commitments, the interactive dispute game, the oracle, and the seal, with
21 passing tests and measured gas. The first committed program, `toy-0`, is a tiny MLP with
random weights. See the [roadmap](ROADMAP.md) for what comes next and the
[open questions](OPEN-QUESTIONS.md) for what is not yet known.
