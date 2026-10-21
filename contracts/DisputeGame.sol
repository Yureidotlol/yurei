// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {YureiVM} from "./YureiVM.sol";
import {MerkleLib} from "./lib/MerkleLib.sol";

interface IGameResolver {
    function onGameResolved(uint256 gameId, bool asserterWon) external;
}

/// @title DisputeGame
/// @notice Interactive bisection over an execution trace, ending in one on-chain step.
///
///         The asserter committed to a Merkle root over state hashes S0..SN. Both sides
///         agree on S0 (it is the request's input) and disagree on SN. Each round the
///         asserter reveals the hash at the midpoint of the disputed range, proven
///         against its own root, and the challenger says whether it agrees. The range
///         halves every round. When it is one step wide, anyone may supply the full
///         agreed state and the instruction (proven against the program root); the
///         contract runs that single instruction and compares the result with the
///         asserter's claim.
///
///         A party that does not move before its deadline loses.
contract DisputeGame {
    enum Turn {
        None,
        Asserter,
        Challenger,
        OneStep,
        Done
    }

    struct Game {
        address resolver;
        address asserter;
        address challenger;
        bytes32 traceRoot;
        bytes32 programRoot;
        uint8 traceDepth;
        uint8 programDepth;
        Turn turn;
        bool asserterWon;
        uint64 deadline;
        uint64 lo;
        uint64 hi;
        uint64 mid;
        uint32 rounds;
        bytes32 loHash;
        bytes32 hiHash;
        bytes32 midHash;
    }

    struct Params {
        address asserter;
        address challenger;
        bytes32 traceRoot;
        uint8 traceDepth;
        bytes32 programRoot;
        uint8 programDepth;
        uint64 numSteps;
        bytes32 startHash;
        bytes32 endHash;
    }

    uint64 public immutable moveWindow;
    uint256 public gameCount;
    mapping(uint256 => Game) internal _games;

    event GameCreated(uint256 indexed id, address indexed asserter, address indexed challenger, uint64 numSteps);
    event Bisected(uint256 indexed id, uint32 round, uint64 mid, bytes32 midHash);
    event Responded(uint256 indexed id, uint32 round, bool agree, uint64 lo, uint64 hi);
    event OneStepExecuted(uint256 indexed id, uint64 stepIndex, bytes32 computed, bytes32 claimed);
    event Resolved(uint256 indexed id, bool asserterWon, bool byTimeout);

    error NotYourTurn();
    error TooLate();
    error NotLate();
    error BadProof();
    error StateMismatch();
    error BadParams();

    constructor(uint64 moveWindow_) {
        moveWindow = moveWindow_;
    }

    function games(uint256 id) external view returns (Game memory) {
        return _games[id];
    }

    /// @notice Opens a game. The caller becomes its resolver and is told the result.
    function create(Params calldata p) external returns (uint256 id) {
        if (p.numSteps == 0 || p.asserter == address(0) || p.challenger == address(0)) revert BadParams();
        id = ++gameCount;
        Game storage g = _games[id];
        g.resolver = msg.sender;
        g.asserter = p.asserter;
        g.challenger = p.challenger;
        g.traceRoot = p.traceRoot;
        g.traceDepth = p.traceDepth;
        g.programRoot = p.programRoot;
        g.programDepth = p.programDepth;
        g.lo = 0;
        g.hi = p.numSteps;
        g.loHash = p.startHash;
        g.hiHash = p.endHash;
        g.turn = p.numSteps == 1 ? Turn.OneStep : Turn.Asserter;
        g.deadline = uint64(block.timestamp) + moveWindow;
        emit GameCreated(id, p.asserter, p.challenger, p.numSteps);
    }

    /// @notice Asserter reveals its state hash at the midpoint of the disputed range.
    function bisect(uint256 id, bytes32 midHash, bytes32[] calldata proof) external {
        Game storage g = _games[id];
        if (g.turn != Turn.Asserter || msg.sender != g.asserter) revert NotYourTurn();
        if (block.timestamp > g.deadline) revert TooLate();
        uint64 mid = (g.lo + g.hi) / 2;
        if (!MerkleLib.verify(g.traceRoot, midHash, mid, proof, g.traceDepth)) revert BadProof();
        g.mid = mid;
        g.midHash = midHash;
        g.rounds += 1;
        g.turn = Turn.Challenger;
        g.deadline = uint64(block.timestamp) + moveWindow;
        emit Bisected(id, g.rounds, mid, midHash);
    }

    /// @notice Challenger agrees or disagrees with the revealed midpoint.
    function respond(uint256 id, bool agree) external {
        Game storage g = _games[id];
        if (g.turn != Turn.Challenger || msg.sender != g.challenger) revert NotYourTurn();
        if (block.timestamp > g.deadline) revert TooLate();
        if (agree) {
            g.lo = g.mid;
            g.loHash = g.midHash;
        } else {
            g.hi = g.mid;
            g.hiHash = g.midHash;
        }
        g.turn = g.hi - g.lo == 1 ? Turn.OneStep : Turn.Asserter;
        g.deadline = uint64(block.timestamp) + moveWindow;
        emit Responded(id, g.rounds, agree, g.lo, g.hi);
    }

    /// @notice Runs the single disputed instruction. Anyone may call it.
    function oneStep(
        uint256 id,
        int32[] calldata state,
        YureiVM.Instr calldata ins,
        bytes32[] calldata programProof
    ) external {
        Game storage g = _games[id];
        if (g.turn != Turn.OneStep) revert NotYourTurn();
        if (block.timestamp > g.deadline) revert TooLate();
        int32[] memory s = state;
        if (YureiVM.hashState(s) != g.loHash) revert StateMismatch();
        YureiVM.Instr memory i = ins;
        if (!MerkleLib.verify(g.programRoot, YureiVM.hashInstr(i), g.lo, programProof, g.programDepth)) revert BadProof();
        bytes32 computed = YureiVM.hashState(YureiVM.step(s, i));
        emit OneStepExecuted(id, g.lo, computed, g.hiHash);
        _resolve(id, g, computed == g.hiHash, false);
    }

    /// @notice Whoever is late loses. In the one-step phase the asserter's claim stands
    ///         unless someone proves it wrong in time.
    function timeout(uint256 id) external {
        Game storage g = _games[id];
        if (g.turn == Turn.None || g.turn == Turn.Done) revert NotYourTurn();
        if (block.timestamp <= g.deadline) revert NotLate();
        _resolve(id, g, g.turn != Turn.Asserter, true);
    }

    function _resolve(uint256 id, Game storage g, bool asserterWon, bool byTimeout) private {
        g.turn = Turn.Done;
        g.asserterWon = asserterWon;
        emit Resolved(id, asserterWon, byTimeout);
        IGameResolver(g.resolver).onGameResolved(id, asserterWon);
    }
}
