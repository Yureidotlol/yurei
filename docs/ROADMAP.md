# Roadmap

Each stage is done when its evidence is in `results/`, not when it is announced.

## Stage 0 · Prototype (this repository) — done
- One-step VM, identical in JS and Solidity, parity-tested
- Trace and program commitments
- Interactive dispute game with deadlines
- Oracle with bonds, windows and finality
- Immutable seal
- toy-0, 21 passing tests, measured gas and bisection benchmark

## Stage 1 · Testnet
- Deploy to Robinhood Chain testnet (46630) and publish every address and receipt in `results/`
- A public watcher anyone can run (`reference/` as a long-running service)
- Price bonds against measured gas

## Stage 2 · A useful spirit
- VM revision with block instructions (fixed-size dot product, lookup-table activations)
- A small open-weight model, quantized and compiled to the VM, with a measured quality report
- Trace checkpoints to shorten disputes

## Stage 3 · Seal v2
- Per-asset and per-contract policies
- Requester-run watchers bundled with the seal

## Stage 4 · Audit and mainnet
- Independent security audit, findings and fixes published
- Mainnet deployment on Robinhood Chain (4663), receipts in `results/`

## The token
$YUREI is not launched. If and when it is, its only official address will appear in the register on
the Yurei site and in this repository. Never trust an address you did not read there.
