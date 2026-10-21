// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title YureiVM
/// @notice The one-step machine. It executes exactly one instruction on a 16-register
///         Q16.16 fixed-point state, with the same rules as reference/vm.js:
///         saturating arithmetic, and a signed right shift that rounds toward
///         negative infinity. A dispute ends with the chain running this once.
library YureiVM {
    uint256 internal constant REGS = 16;

    uint8 internal constant SETI = 0; // r[dst] = imm
    uint8 internal constant MULADDI = 1; // r[dst] = sat(r[dst] + (r[a] * imm) >> 16)
    uint8 internal constant RELU = 2; // r[dst] = max(r[a], 0)
    uint8 internal constant ADD = 3; // r[dst] = sat(r[a] + r[b])
    uint8 internal constant MOV = 4; // r[dst] = r[a]

    struct Instr {
        uint8 op;
        uint8 dst;
        uint8 a;
        uint8 b;
        int32 imm;
    }

    error BadState();
    error BadInstr();

    function sat(int256 v) internal pure returns (int32) {
        if (v > type(int32).max) return type(int32).max;
        if (v < type(int32).min) return type(int32).min;
        return int32(v);
    }

    function step(int32[] memory s, Instr memory ins) internal pure returns (int32[] memory out) {
        if (s.length != REGS) revert BadState();
        if (ins.dst >= REGS || ins.a >= REGS || ins.b >= REGS) revert BadInstr();
        out = new int32[](REGS);
        for (uint256 i = 0; i < REGS; i++) out[i] = s[i];
        if (ins.op == SETI) {
            out[ins.dst] = ins.imm;
        } else if (ins.op == MULADDI) {
            out[ins.dst] = sat(int256(s[ins.dst]) + ((int256(s[ins.a]) * int256(ins.imm)) >> 16));
        } else if (ins.op == RELU) {
            out[ins.dst] = s[ins.a] < 0 ? int32(0) : s[ins.a];
        } else if (ins.op == ADD) {
            out[ins.dst] = sat(int256(s[ins.a]) + int256(s[ins.b]));
        } else if (ins.op == MOV) {
            out[ins.dst] = s[ins.a];
        } else {
            revert BadInstr();
        }
    }

    function hashState(int32[] memory s) internal pure returns (bytes32) {
        return keccak256(abi.encode(s));
    }

    function hashInstr(Instr memory i) internal pure returns (bytes32) {
        return keccak256(abi.encode(i.op, i.dst, i.a, i.b, i.imm));
    }
}
