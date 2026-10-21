# Open questions

A seal is only as strong as its weakest assumption. These are ours.

## Determinism at scale
Fixed-point integer arithmetic makes toy-0 bit-exact across implementations. A real language model
needs quantized weights and activations, integer softmax and normalization, and a tokenizer, all
deterministic. How much quality is lost when a small open-weight model is pushed fully into integer
arithmetic, and which operations need lookup tables?

## Liveness: who watches?
Optimistic security needs at least one honest watcher per answer. Watching means recomputing.
What reward makes running a watcher worth it when most answers are honest and challenges are rare?
Options: a share of fees, slashing rewards, or the requester running their own watcher.

## Trace availability
Only the root is on chain. For toy-0 a watcher simply recomputes. For a model with billions of steps,
the watcher must regenerate the trace to answer bisection queries, which is the same cost as running
the model. Can checkpoints (posting every k-th state root) shorten disputes without bloating answers?

## Step granularity
Each step must be small enough to execute on chain in one transaction, but the more steps a model has,
the longer the trace. A coarser VM instruction (say, a fixed 16-wide dot product) shortens the trace
16× and still fits in a block. Where is the optimum on Robinhood Chain's gas limits?

## Concurrent challenges
The prototype runs one game per answer. Running several challengers in parallel, as some rollup
designs do, removes the delay attack in [THREAT-MODEL](THREAT-MODEL.md) at the cost of complexity.

## Seal expressiveness
Today's seal speaks in amounts, days, recipients and expiry. Real agents need richer policies:
per-asset limits, rate limits, contract-call allowlists with argument constraints. How expressive can
a seal get while staying simple enough to audit by reading?
