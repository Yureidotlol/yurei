// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {YureiVM} from "./YureiVM.sol";
import {MerkleLib} from "./lib/MerkleLib.sol";
import {DisputeGame, IGameResolver} from "./DisputeGame.sol";

interface ISeal {
    function wouldAllow(address to, uint256 amount) external view returns (bool);
    function act(address to, uint256 amount) external;
}

/// @title YureiOracle
/// @notice Optimistic inference with a seal. The five stages of the thesis:
///         01 request   - the question and its fee are escrowed; the seal is consulted first
///         02 answer    - a bonded executor posts the answer and a trace commitment
///         03 challenge - anyone may dispute within the window by posting a bond
///         04 proof     - DisputeGame bisects to one step and runs it; the liar's bond is slashed
///         05 action    - after the window the answer is final; the seal acts, or holds
contract YureiOracle is IGameResolver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Model {
        bytes32 programRoot;
        uint8 programDepth;
        uint8 traceDepth;
        uint32 numSteps;
        bool exists;
    }

    enum Status {
        None,
        Open,
        Answered,
        Disputed,
        Final,
        Cancelled
    }

    struct Request {
        address requester;
        bytes32 modelId;
        bytes32 inputHash;
        uint256 fee;
        address seal;
        address actionTo;
        uint256 actionAmount;
        Status status;
        uint64 openedAt;
        // the current answer
        address executor;
        bytes32 traceRoot;
        bytes32 finalHash;
        uint8 output; // 1 = APPROVE, 0 = REFUSE
        uint64 answeredAt;
        address challenger;
        uint256 gameId;
    }

    IERC20 public immutable usdg;
    DisputeGame public immutable game;
    uint256 public immutable bond;
    uint64 public immutable challengeWindow;
    uint64 public immutable answerTimeout;

    mapping(bytes32 => Model) public models;
    mapping(uint256 => Request) internal _requests;
    mapping(uint256 => uint256) public requestOfGame;
    uint256 public requestCount;

    event ModelRegistered(bytes32 indexed modelId, bytes32 programRoot, uint32 numSteps);
    event Requested(uint256 indexed id, bytes32 indexed modelId, address indexed requester, int32[] input, uint256 fee, address seal);
    event Answered(uint256 indexed id, address indexed executor, bytes32 traceRoot, uint8 output);
    event Challenged(uint256 indexed id, address indexed challenger, uint256 gameId);
    event DisputeSettled(uint256 indexed id, uint256 gameId, bool executorWon);
    event Finalized(uint256 indexed id, uint8 output);
    event ActionExecuted(uint256 indexed id, address to, uint256 amount);
    event ActionHeld(uint256 indexed id, address to, uint256 amount, bytes reason);
    event Cancelled(uint256 indexed id);

    error UnknownModel();
    error BadInput();
    error SealWouldRefuse();
    error WrongStatus();
    error BadProof();
    error WindowClosed();
    error WindowOpen();
    error SelfChallenge();
    error OnlyGame();
    error NotRequester();
    error TooEarly();

    constructor(IERC20 usdg_, DisputeGame game_, uint256 bond_, uint64 challengeWindow_, uint64 answerTimeout_) {
        usdg = usdg_;
        game = game_;
        bond = bond_;
        challengeWindow = challengeWindow_;
        answerTimeout = answerTimeout_;
    }

    function requests(uint256 id) external view returns (Request memory) {
        return _requests[id];
    }

    function _depthFor(uint256 n) private pure returns (uint8 d) {
        while ((uint256(1) << d) < n) d++;
    }

    /// @notice Anyone may register a committed program. Its id binds the root and length.
    function registerModel(bytes32 programRoot, uint32 numSteps) external returns (bytes32 id) {
        id = keccak256(abi.encode(programRoot, numSteps));
        if (!models[id].exists) {
            models[id] = Model(programRoot, _depthFor(numSteps), _depthFor(uint256(numSteps) + 1), numSteps, true);
            emit ModelRegistered(id, programRoot, numSteps);
        }
    }

    // ---------------------------------------------------------------- 01 request

    function request(
        bytes32 modelId,
        int32[] calldata input,
        uint256 fee,
        address seal,
        address actionTo,
        uint256 actionAmount
    ) external nonReentrant returns (uint256 id) {
        if (!models[modelId].exists) revert UnknownModel();
        if (input.length != YureiVM.REGS) revert BadInput();
        // a request whose action the seal would never allow is refused before any work is done
        if (seal != address(0) && !ISeal(seal).wouldAllow(actionTo, actionAmount)) revert SealWouldRefuse();
        usdg.safeTransferFrom(msg.sender, address(this), fee);
        id = ++requestCount;
        Request storage r = _requests[id];
        r.requester = msg.sender;
        r.modelId = modelId;
        r.inputHash = YureiVM.hashState(input);
        r.fee = fee;
        r.seal = seal;
        r.actionTo = actionTo;
        r.actionAmount = actionAmount;
        r.status = Status.Open;
        r.openedAt = uint64(block.timestamp);
        emit Requested(id, modelId, msg.sender, input, fee, seal);
    }

    // ---------------------------------------------------------------- 02 answer

    /// @param traceRoot   Merkle root over state hashes S0..SN
    /// @param finalState  SN in full, so the chain derives the output itself
    /// @param startProof  proves leaf 0 is the request's input
    /// @param endProof    proves leaf N is hash(finalState)
    function answer(
        uint256 id,
        bytes32 traceRoot,
        int32[] calldata finalState,
        bytes32[] calldata startProof,
        bytes32[] calldata endProof
    ) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert WrongStatus();
        if (finalState.length != YureiVM.REGS) revert BadInput();
        Model memory m = models[r.modelId];
        bytes32 finalHash = YureiVM.hashState(finalState);
        if (!MerkleLib.verify(traceRoot, r.inputHash, 0, startProof, m.traceDepth)) revert BadProof();
        if (!MerkleLib.verify(traceRoot, finalHash, m.numSteps, endProof, m.traceDepth)) revert BadProof();
        usdg.safeTransferFrom(msg.sender, address(this), bond);
        r.executor = msg.sender;
        r.traceRoot = traceRoot;
        r.finalHash = finalHash;
        r.output = finalState[13] > finalState[12] ? 1 : 0;
        r.answeredAt = uint64(block.timestamp);
        r.status = Status.Answered;
        emit Answered(id, msg.sender, traceRoot, r.output);
    }

    // ---------------------------------------------------------------- 03 challenge

    function challenge(uint256 id) external nonReentrant returns (uint256 gameId) {
        Request storage r = _requests[id];
        if (r.status != Status.Answered) revert WrongStatus();
        if (block.timestamp > r.answeredAt + challengeWindow) revert WindowClosed();
        if (msg.sender == r.executor) revert SelfChallenge();
        usdg.safeTransferFrom(msg.sender, address(this), bond);
        Model memory m = models[r.modelId];
        gameId = game.create(
            DisputeGame.Params({
                asserter: r.executor,
                challenger: msg.sender,
                traceRoot: r.traceRoot,
                traceDepth: m.traceDepth,
                programRoot: m.programRoot,
                programDepth: m.programDepth,
                numSteps: m.numSteps,
                startHash: r.inputHash,
                endHash: r.finalHash
            })
        );
        r.challenger = msg.sender;
        r.gameId = gameId;
        r.status = Status.Disputed;
        requestOfGame[gameId] = id;
        emit Challenged(id, msg.sender, gameId);
    }

    // ---------------------------------------------------------------- 04 proof (settled by DisputeGame)

    function onGameResolved(uint256 gameId, bool asserterWon) external override nonReentrant {
        if (msg.sender != address(game)) revert OnlyGame();
        uint256 id = requestOfGame[gameId];
        Request storage r = _requests[id];
        if (r.status != Status.Disputed || r.gameId != gameId) revert WrongStatus();
        if (asserterWon) {
            // the challenger was wrong: its bond goes to the executor, and the answer
            // stands with a fresh window
            usdg.safeTransfer(r.executor, bond);
            r.status = Status.Answered;
            r.answeredAt = uint64(block.timestamp);
        } else {
            // the executor lied: both bonds go to the challenger and the question reopens
            usdg.safeTransfer(r.challenger, bond * 2);
            r.status = Status.Open;
            r.executor = address(0);
            r.traceRoot = bytes32(0);
            r.finalHash = bytes32(0);
            r.output = 0;
            r.openedAt = uint64(block.timestamp);
        }
        emit DisputeSettled(id, gameId, asserterWon);
        r.challenger = address(0);
        r.gameId = 0;
    }

    // ---------------------------------------------------------------- 05 action

    function finalize(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Answered) revert WrongStatus();
        if (block.timestamp <= r.answeredAt + challengeWindow) revert WindowOpen();
        r.status = Status.Final;
        usdg.safeTransfer(r.executor, r.fee + bond);
        emit Finalized(id, r.output);
        if (r.seal != address(0) && r.output == 1) {
            try ISeal(r.seal).act(r.actionTo, r.actionAmount) {
                emit ActionExecuted(id, r.actionTo, r.actionAmount);
            } catch (bytes memory reason) {
                emit ActionHeld(id, r.actionTo, r.actionAmount, reason);
            }
        }
    }

    function cancel(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (msg.sender != r.requester) revert NotRequester();
        if (r.status != Status.Open) revert WrongStatus();
        if (block.timestamp <= r.openedAt + answerTimeout) revert TooEarly();
        r.status = Status.Cancelled;
        usdg.safeTransfer(r.requester, r.fee);
        emit Cancelled(id);
    }
}
