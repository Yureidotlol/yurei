# Glossary

| Term | Meaning |
|---|---|
| **幽霊 yūrei** | "Faint spirit." In folklore, a soul that could not rest. Here: the model and the answers it gives. |
| **お札 ofuda** | A paper charm written in red ink that keeps a spirit out. Here: the seal. |
| **封 fū** | "Sealed." Stamped on the seal; the fifth stage, action. |
| **急急如律令** | "Swiftly, in accordance with the law." A closing formula on talismans. Here: the contract is the law. |
| **Executor / asserter** | Runs the committed program and posts an answer with a bond. |
| **Watcher / challenger** | Recomputes answers and disputes wrong ones with a bond. |
| **Program root** | Merkle root over a model's instructions. Changing one weight makes a new spirit. |
| **Trace root** | Merkle root over every intermediate state of one execution. |
| **Bisection** | Halving the disputed interval each round until it is one step wide. |
| **One-step proof** | Executing the single disputed instruction on chain to settle a dispute. |
| **Challenge window** | The time after an answer during which anyone may dispute it. |
| **Q16.16** | Fixed-point format: 16 integer bits, 16 fractional bits, stored in an int32. |
| **Saturation** | Clamping a result to the int32 range instead of wrapping around. |
| **toy-0** | The first committed program: an 8→4→2 MLP with random weights, for exercising the protocol. |
