<div align="center">

# 幽霊 YUREI

**A spirit, bound by contract.**
Accountable AI on Robinhood Chain: a model that reasons off-chain, answers on-chain,
and can be proven wrong by anyone.

`research edition` · `draft 0.1` · `Robinhood Chain (4663)` · `settles in USDG`

[**yurei.lol**](https://yurei.lol) · [**X @yureidotlol**](https://x.com/yureidotlol) · [Thesis](docs/THESIS.md) · [Architecture](docs/ARCHITECTURE.md)

</div>

---

## Meet Yurei

Machine intelligence that acts with real money has two bad options today. It runs on a
server you cannot inspect, or it runs entirely inside smart contracts and costs far more
than the answer is worth.

Yurei takes a third path, borrowed from how optimistic rollups secure their own state.
A committed model runs off-chain. Each answer is posted on-chain with a Merkle commitment
to every intermediate state of the computation. Anyone may challenge within a window. A
dispute is bisected down to **one instruction**, and only that instruction is executed
on-chain to decide who lied. The liar's bond is slashed.

Around every answer sits **the seal**: an immutable policy contract that decides what an
answer is allowed to *do*, however persuasive the answer is.

> In Japanese folklore a yūrei (幽霊, "faint spirit") is a soul that could not rest, and an
> ofuda is the paper charm that keeps it out. The spirit can be anywhere. It cannot cross the seal.

## Milestone at a glance

| | Status | Evidence |
|---|---|---|
| One-step VM, identical in JavaScript and Solidity | **Working, tested** | [`test/vm.parity.test.js`](test/vm.parity.test.js) |
| Trace commitments (Merkle over state hashes) | **Working, tested** | [`reference/merkle.js`](reference/merkle.js), [`contracts/lib/MerkleLib.sol`](contracts/lib/MerkleLib.sol) |
| Interactive bisection dispute game | **Working, tested** | [`contracts/DisputeGame.sol`](contracts/DisputeGame.sol) |
| Oracle: request, answer, challenge, finalize | **Working, tested** | [`contracts/YureiOracle.sol`](contracts/YureiOracle.sol) |
| The seal (immutable policy contract) | **Working, tested** | [`contracts/Seal.sol`](contracts/Seal.sol) |
| First spirit: `toy-0`, an 8→4→2 fixed-point MLP | **Committed** | [`models/toy-0.json`](models/toy-0.json) |
| Test suite | **21 / 21 passing** | [`results/TEST-RESULTS.md`](results/TEST-RESULTS.md) |
| Demo run on Robinhood Chain mainnet | **Done**: a lie caught and slashed, 89 s, ≈ $0.32 total | [`results/MAINNET-RUN.md`](results/MAINNET-RUN.md) |
| A real language model compiled to the VM | Research | [Open questions](docs/OPEN-QUESTIONS.md) |
| Independent security audit | Not yet | [Security](SECURITY.md) |
| $YUREI token | Not launched | The only official address will be in the site's register |

The full protocol has run once on **Robinhood Chain mainnet** with demo parameters (1 USDG bonds):
every transaction is in [`results/MAINNET-RUN.md`](results/MAINNET-RUN.md). Other numbers below were
measured on a local chain and say so.

## Choose your route

**Read the idea.** Start with the [thesis](docs/THESIS.md), then the
[request lifecycle](docs/REQUEST-LIFECYCLE.md) and the [dispute game](docs/DISPUTE-GAME.md).

**Watch a lie get caught, in your terminal.**

```bash
npm install
npm run ref:run        # run toy-0, print its trace commitment and answer
npm run ref:dispute    # a lying executor, an honest watcher, bisection to one step
```

```
executor posts answer APPROVE  traceRoot 0x85f78bed…ad2781  (step 25 corrupted)
watcher recomputes: final state differs -> challenge
  round 1  state at step 25  agree   -> error is later
  round 2  state at step 37  differ  -> error is here or earlier
  round 3  state at step 31  differ  -> error is here or earlier
  round 4  state at step 28  differ  -> error is here or earlier
  round 5  state at step 26  differ  -> error is here or earlier
one-step proof: re-execute step 25 (MULADDI) on the agreed state
verdict: executor wrong at step 25, found in 5 rounds, 1 step executed on chain
```

**Play it on a chain.**

```bash
npm test               # 21 tests: VM parity, reference, the full protocol end to end
npm run results        # regenerate results/BISECTION.md and results/GAS.md
```

## Research index

| Document | What it answers |
|---|---|
| [THESIS](docs/THESIS.md) | Why verify-don't-recompute, and what Yurei claims |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | The four contracts and two off-chain actors, and how they connect |
| [REQUEST-LIFECYCLE](docs/REQUEST-LIFECYCLE.md) | The five stages, state by state, with every check |
| [DISPUTE-GAME](docs/DISPUTE-GAME.md) | Bisection, the one-step proof, timeouts, and why it is sound |
| [DETERMINISM](docs/DETERMINISM.md) | The Q16.16 machine, and why floating point cannot be used |
| [SEAL](docs/SEAL.md) | The policy contract: limits, reasons, expiry, and what it cannot do |
| [THREAT-MODEL](docs/THREAT-MODEL.md) | Who can cheat, how, and what it costs them |
| [OPEN-QUESTIONS](docs/OPEN-QUESTIONS.md) | What the research still has to answer |
| [ROADMAP](docs/ROADMAP.md) | From local prototype to an audited mainnet seal |
| [GLOSSARY](docs/GLOSSARY.md) | Terms, in English and in the folklore |

## Results

| Result | Headline |
|---|---|
| [TEST-RESULTS](results/TEST-RESULTS.md) | 21 / 21 passing, including lies at five positions caught on chain |
| [BISECTION](results/BISECTION.md) | 1,000,000,000-step traces settle in at most 30 rounds; 14,000 disputes, every fault found |
| [GAS](results/GAS.md) | Honest answer ≈ 573k gas end to end, independent of model size; full dispute on toy-0 ≈ 911k |

## Repository map

```
contracts/
  YureiVM.sol            the one-step machine (Q16.16, saturating, 5 opcodes)
  DisputeGame.sol        bisection over a committed trace, ending in one executed step
  YureiOracle.sol        request -> answer -> challenge -> finalize, bonds in USDG
  Seal.sol               immutable policy: per-action, per-day, recipients, expiry
  lib/MerkleLib.sol      fixed-depth Merkle proofs
reference/               the same machine and protocol in JavaScript (executor, watcher, CLI)
models/toy-0.json        the first committed program
test/                    parity, reference and end-to-end protocol tests
scripts/                 benchmark and gas measurement that write results/
results/                 generated, never hand-edited
docs/                    the research
site/                    the landing page
```

## Scope and licensing

Yurei is a research prototype. The contracts are **unaudited**. They have run once on mainnet as a demo with tiny amounts.
`toy-0` uses random weights: it exists to exercise the protocol, not to give good answers. Do
not put real funds behind any of this. See [SECURITY.md](SECURITY.md).

Code is released under the [MIT License](LICENSE). Contributions are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md).
