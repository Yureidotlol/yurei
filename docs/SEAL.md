# The seal

The ofuda. An immutable policy contract that decides what a finalized answer may do.

## Construction

```solidity
new Seal(token, oracle, beneficiary, maxPerAction, maxPerDay, expiresAt, recipients[])
```

Every parameter is immutable. There is no owner, no admin, no upgrade path, and no function that
changes a limit. The test suite checks that the only state-changing functions are `act` and
`reclaim`.

## The checks

`check(to, amount)` returns `OK` or the first reason the seal would hold, in this order:

| Reason | Meaning |
|---|---|
| `Expired()` | the seal's time has run out |
| `RecipientNotAllowed()` | `to` was not in the list given at construction |
| `OverPerAction()` | `amount > maxPerAction` |
| `OverPerDay()` | today's spending plus `amount` would exceed `maxPerDay` |
| `Underfunded()` | the seal doesn't hold enough |

`act(to, amount)` may only be called by the oracle, re-runs `check`, and reverts with
`SealHolds(reason)` unless it is `OK`.

## Two checkpoints

1. **Before work.** `YureiOracle.request` calls `wouldAllow` and refuses a request whose action the
   seal could never allow.
2. **At finality.** `YureiOracle.finalize` asks the seal to act. If something changed in between
   (another action used today's limit), the seal holds, the oracle records `ActionHeld`, and the
   answer stays final. A held action is never retried automatically.

## Expiry and funds

Every seal must expire (the constructor rejects an expiry in the past). Anyone may fund a seal by
sending it tokens. After expiry, `reclaim()` sends the remaining balance to the beneficiary; before
expiry, nobody can withdraw except through `act`.

## What the seal does not do

It does not judge whether an action is wise. It bounds the damage of any answer, including a
correct answer from a correct model, to limits a human chose in advance.
