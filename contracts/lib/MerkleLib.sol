// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Fixed-depth Merkle proofs. parent = keccak256(left || right).
///         The caller fixes the depth, so a proof can't be replayed at a different
///         height of the tree. Mirrors reference/merkle.js.
library MerkleLib {
    function verify(bytes32 root, bytes32 leaf, uint256 index, bytes32[] calldata proof, uint8 depth)
        internal
        pure
        returns (bool)
    {
        if (proof.length != depth || index >> depth != 0) return false;
        bytes32 node = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            node = (index & 1) == 1
                ? keccak256(abi.encodePacked(proof[i], node))
                : keccak256(abi.encodePacked(node, proof[i]));
            index >>= 1;
        }
        return node == root;
    }
}
