// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {YureiVM} from "../YureiVM.sol";
import {MerkleLib} from "../lib/MerkleLib.sol";

/// @notice Exposes the libraries so tests can compare them with the JS reference.
contract VMHarness {
    function step(int32[] memory s, YureiVM.Instr memory ins) external pure returns (int32[] memory) {
        return YureiVM.step(s, ins);
    }

    function hashState(int32[] memory s) external pure returns (bytes32) {
        return YureiVM.hashState(s);
    }

    function hashInstr(YureiVM.Instr memory i) external pure returns (bytes32) {
        return YureiVM.hashInstr(i);
    }

    function verify(bytes32 root, bytes32 leaf, uint256 index, bytes32[] calldata proof, uint8 depth)
        external
        pure
        returns (bool)
    {
        return MerkleLib.verify(root, leaf, index, proof, depth);
    }
}
