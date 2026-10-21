# Mainnet run · Robinhood Chain · 2026-10-21

The full protocol, played once on **Robinhood Chain mainnet (chain 4663)** with real USDG and
tiny amounts: an honest answer that a seal acts on, an executor that lies and is caught, and a second
executor that answers the reopened question. Every row links to the explorer. The raw log is
[`mainnet-run-2026-10-21.json`](mainnet-run-2026-10-21.json); the page that produced it is
[`site/run.html`](../site/run.html).

**Demo parameters, not production ones:** 1 USDG bond, 0.5 USDG fee, 5-minute challenge window,
toy-0 (50 steps). The contracts are unaudited.

## Contracts

| Contract | Address |
|---|---|
| DisputeGame | [`0x1Cf161D2b48DB3351335B1dDdE51253eD147D28D`](https://robinhoodchain.blockscout.com/address/0x1Cf161D2b48DB3351335B1dDdE51253eD147D28D) |
| YureiOracle | [`0x11DF365C8eed9325862A8ef35085BfDA4c610954`](https://robinhoodchain.blockscout.com/address/0x11DF365C8eed9325862A8ef35085BfDA4c610954) |
| Seal (pays only the funder, expires after 2 h) | [`0x0509cC279Aee846DA60d73dF6C623ae3a106B30e`](https://robinhoodchain.blockscout.com/address/0x0509cC279Aee846DA60d73dF6C623ae3a106B30e) |
| USDG (Paxos, existing) | [`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`](https://robinhoodchain.blockscout.com/address/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) |

## What happened

1. **Honest answer.** Executor A answered APPROVE with trace root `0xa072c6728f40e7b4…`. Nobody
   disputed; after the window the oracle paid A and the seal paid 1 USDG, inside its limits.
2. **A lie, caught.** On the same question A posted an answer with step 25 corrupted. The watcher
   challenged **3 seconds** later. Five rounds of bisection narrowed 50 steps to one. The chain executed
   that single instruction (`MULADDI r10`, step 25): computed `0xa8643ffd98ca…`, executor claimed
   `0x489c9e178849…`. A was slashed and the question reopened. Lie posted to slash: **89 seconds**.
3. **Reopened and answered.** Executor B, a separate wallet re-running the model from scratch, posted
   trace root `0xa072c6728f40e7b4…`, identical to A's honest root in story 1, as a deterministic VM
   requires. (Both ran the same reference code in one browser; executors on different machines and
   implementations are still to come.) B was paid after the window.

## Cost

| Path | Gas | Fee at this run's prices |
|---|---:|---:|
| Honest answer, end to end (request + answer + finalize with seal action) | 626,925 | ≈ 0.0000125 ETH |
| Full dispute (challenge + 5 rounds + one step) | 956,031 | ≈ 0.000019 ETH |
| Everything: 3 deploys, both stories, funding and returning funds (43 transactions) | — | **0.0001316 ETH** (≈ $0.32 at $2,466.91) |

Fees are execution plus parent-chain data, as charged. All USDG returned to the funder except what
the seal held, which is reclaimable after expiry.

## Every transaction (UTC)

| Time | Stage | Call | By | Gas | Tx |
|---|---|---|---|---:|---|
|  | 00 setup | deploy DisputeGame | operator | 1,206,043 | [`0x5bc35ed9…`](https://robinhoodchain.blockscout.com/tx/0x5bc35ed9b263c80d33b6a30b03219cf343e159e8867da5fffdc1e7029d10531d) |
|  | 00 setup | deploy YureiOracle | operator | 1,632,842 | [`0xc0dd7f9d…`](https://robinhoodchain.blockscout.com/tx/0xc0dd7f9d025bb8e937abdaa2d26b38585f7c4d891022be9c705fcc37f5977236) |
| 11:47:52 | 00 setup | register model toy-0 | operator | 70,430 | [`0x555c0765…`](https://robinhoodchain.blockscout.com/tx/0x555c0765992bf91e899b6cc4387d18526f9525283d0709f877cd3047ea6a7fd2) |
|  | 00 setup | deploy Seal | operator | 606,081 | [`0xf0186184…`](https://robinhoodchain.blockscout.com/tx/0xf0186184bcfae6662dd6f92264a0297e59ffbaedb2fd1673572a94173d72c8dc) |
| 11:48:30 | 01 request | request · seal check passed | requester | 308,650 | [`0x3f17c54c…`](https://robinhoodchain.blockscout.com/tx/0x3f17c54cfc6c814ff498f7b65f87f1b06e800e52debf115ef47ea4a0f4bbe11f) |
| 11:48:33 | 02 answer | answer · APPROVE | executor A | 158,960 | [`0x03b3b714…`](https://robinhoodchain.blockscout.com/tx/0x03b3b714182d9bdc16bc992c38cb95f9e334c403ad2c405fb26a2ff77686f0f6) |
| 11:53:38 | 05 action | finalize · seal acted | anyone | 159,315 | [`0x43a86ff4…`](https://robinhoodchain.blockscout.com/tx/0x43a86ff41619ccb85eb396479584d7ae2a3bccfc3c85374ff4439f3ea8f222a7) |
| 11:53:45 | 01 request | request | requester | 214,942 | [`0x934ba27e…`](https://robinhoodchain.blockscout.com/tx/0x934ba27e5856ac39b2701a407c38508b161d72d733dcdb9582aa8013a6263217) |
| 11:53:53 | 02 answer | answer · APPROVE | executor A | 163,748 | [`0xe2a51bd3…`](https://robinhoodchain.blockscout.com/tx/0xe2a51bd374b626e0166d86ae542f0aa4cd36a923576bdaa4701dbe54e50f95c1) |
| 11:53:56 | 03 challenge | challenge · final state differs | watcher | 331,893 | [`0x1ee8961a…`](https://robinhoodchain.blockscout.com/tx/0x1ee8961a5c27e0622215ca22c85b404c5313b4b431b885ee139b872a006e746a) |
| 11:54:09 | 04 proof | bisect · reveal step 25 | executor A | 84,660 | [`0x4d832354…`](https://robinhoodchain.blockscout.com/tx/0x4d8323549039e5560fc4fba6b9d375a8ffa9f86def931df990295fda6279018a) |
| 11:54:17 | 04 proof | respond · agree | watcher | 41,771 | [`0x5651b22c…`](https://robinhoodchain.blockscout.com/tx/0x5651b22c34afc2673b312876f26157c407294d35cc00833cce093065dabbbf36) |
| 11:54:25 | 04 proof | bisect · reveal step 37 | executor A | 50,472 | [`0xb0072d24…`](https://robinhoodchain.blockscout.com/tx/0xb0072d24536c458840d2f56ea3628f809292f6c160e1f49146f2a442406d05eb) |
| 11:54:36 | 04 proof | respond · differ | watcher | 41,771 | [`0xc59d4f9f…`](https://robinhoodchain.blockscout.com/tx/0xc59d4f9f319ec0bf371623fe2bf50a37ae42655f7b461027e7c8a9fda5a165e7) |
| 11:54:44 | 04 proof | bisect · reveal step 31 | executor A | 50,454 | [`0x0922cd96…`](https://robinhoodchain.blockscout.com/tx/0x0922cd9641c438492854caf9a855838520dba1a19252fd6821236f70befc6120) |
| 11:54:52 | 04 proof | respond · differ | watcher | 41,771 | [`0xb4ab8317…`](https://robinhoodchain.blockscout.com/tx/0xb4ab83178948ef557159c508f400873993dea2234392db198e09c4e1bdc196b9) |
| 11:54:58 | 04 proof | bisect · reveal step 28 | executor A | 50,472 | [`0x8fa2382d…`](https://robinhoodchain.blockscout.com/tx/0x8fa2382d97b6e53174aadd40635e3fa13425704f8240cad0056cd5a156e52a8a) |
| 11:55:07 | 04 proof | respond · differ | watcher | 41,771 | [`0x177f03bb…`](https://robinhoodchain.blockscout.com/tx/0x177f03bbad1cb41c43d188d4e7d4f06d2437b94aa3a505bed6fdbfdd1f890dc0) |
| 11:55:15 | 04 proof | bisect · reveal step 26 | executor A | 50,460 | [`0x71034063…`](https://robinhoodchain.blockscout.com/tx/0x71034063a07dff6cd868ed532d61fd562f92ae6386d9e3f8f383e81a7ecdb628) |
| 11:55:18 | 04 proof | respond · differ | watcher | 41,759 | [`0xccd264bc…`](https://robinhoodchain.blockscout.com/tx/0xccd264bc318c90dfac9a6fa7fd8fe80c7a97dbb9fd6d4c702025d4f039d1e117) |
| 11:55:22 | 04 proof | one step · execute step 25 | watcher | 128,777 | [`0xda1ecd30…`](https://robinhoodchain.blockscout.com/tx/0xda1ecd3072a9a1fd1274f2f497490326520109cd984323d21a42260e8673c67b) |
| 11:55:34 | 02 answer | answer · APPROVE | executor B | 141,860 | [`0xa720f82e…`](https://robinhoodchain.blockscout.com/tx/0xa720f82eee42bb46da0c3455ca7c4b1454bb0c99fb8e55112ed06edae1323832) |
| 12:00:41 | 05 action | finalize | anyone | 79,042 | [`0x4a3733d3…`](https://robinhoodchain.blockscout.com/tx/0x4a3733d374b89c2a2b52710f7d4e662bc3af676af699d6a47f1cc078060aad04) |
