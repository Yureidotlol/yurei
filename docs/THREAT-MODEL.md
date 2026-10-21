# Threat model

The prototype's security rests on one assumption: **at least one honest, live watcher checks every
answer within the challenge window.** Below, each actor is assumed malicious in turn.

| Attacker | Attack | What happens |
|---|---|---|
| Executor | Posts a wrong final answer | Any honest watcher challenges and wins the game; the executor's bond goes to the watcher; the request reopens |
| Executor | Reveals a hash that isn't in its committed trace | `bisect` rejects it: every reveal is proven against `traceRoot` |
| Executor | Stops responding mid-dispute | Loses on `timeout` |
| Executor | Posts a trace whose ends don't match the input or the final state | `answer` rejects it: leaf 0 and leaf N are proven on submission |
| Challenger | Challenges a correct answer | Loses the game and its bond to the executor |
| Challenger | Colludes with a lying executor and plays to lose, to make a wrong answer stand | The answer returns to `Answered` with a **fresh** window, so honest watchers can still challenge. Collusion delays a wrong answer; it cannot finalize one. |
| Challenger | Opens a game and goes silent to stall | Loses on `timeout` after one `moveWindow`; delay is bounded and costs a bond |
| Requester | Names a seal and an action the seal can't allow | `request` reverts with `SealWouldRefuse` |
| Anyone | Calls `oneStep` with a forged state or instruction | Rejected: the state must hash to the agreed hash and the instruction must be proven against `programRoot` |
| Seal funder | Tries to widen limits after the fact | Impossible: no function changes them |
| Oracle operator | — | There is none. The oracle has no owner or admin functions |

## Known limitations of the prototype

- **One game at a time per answer.** While a game runs, other watchers wait. Bonded and
  time-limited, but a determined colluder can delay finality by roughly one `moveWindow` per
  round, repeatedly, at the cost of a bond each time.
- **Bond sizing.** Bonds must exceed the gas cost of playing the game, or a rational challenger
  won't bother. The prototype uses a fixed bond; production needs it priced against gas.
- **Trace availability.** Only the trace root is on chain. A watcher recomputes the trace itself
  from the public input and program, so this is fine for toy-0, but for large models, regenerating
  the trace is expensive. See [OPEN-QUESTIONS](OPEN-QUESTIONS.md).
- **Answer racing.** The first valid answer wins the slot. Honest executors may lose races; this
  is a liveness and fairness question, not a safety one.
- **Model quality.** A program commitment proves *which* model ran, not that it is any good.
  toy-0's weights are random.
- **Unaudited.** None of this has been reviewed. See [SECURITY.md](../SECURITY.md).
