// Fixed-depth binary Merkle tree over bytes32 leaves.
// parent = keccak256(left || right); missing leaves are bytes32(0).
// Mirrors contracts/lib/MerkleLib.sol.

const { keccak256, concat, ZeroHash } = require("ethers");

function depthFor(n) {
  let d = 0;
  while ((1 << d) < n) d++;
  return d;
}

function build(leaves) {
  const depth = depthFor(leaves.length);
  const size = 1 << depth;
  const levels = [leaves.concat(Array(size - leaves.length).fill(ZeroHash))];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1], next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(keccak256(concat([prev[i], prev[i + 1]])));
    levels.push(next);
  }
  return {
    depth,
    root: levels[levels.length - 1][0],
    leaf: (i) => levels[0][i],
    proof(index) {
      const out = [];
      let idx = index;
      for (let l = 0; l < depth; l++) { out.push(levels[l][idx ^ 1]); idx >>= 1; }
      return out;
    },
  };
}

function verify(root, leaf, index, proof) {
  let node = leaf, idx = index;
  for (const sib of proof) {
    node = idx & 1 ? keccak256(concat([sib, node])) : keccak256(concat([node, sib]));
    idx >>= 1;
  }
  return node === root;
}

module.exports = { build, verify, depthFor };
