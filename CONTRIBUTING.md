# Contributing

Contributions are welcome, especially on the [open questions](docs/OPEN-QUESTIONS.md).

1. `npm install`, then `npm test`. Everything must pass before and after your change.
2. If you touch the VM, change `reference/vm.js` and `contracts/YureiVM.sol` together. The parity
   test will tell you if they drift.
3. Never hand-edit `results/`. Regenerate it with `npm run results` and commit the output.
4. Keep claims honest: a number in a doc must link to the script or receipt that produced it.
