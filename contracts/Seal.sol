// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Seal
/// @notice The ofuda. A policy contract that decides what a finalized answer may do.
///
///         Every limit is fixed in the constructor and there is no owner, so nobody can
///         widen it later: not the funder, not the oracle, not us. The oracle may ask the
///         seal to pay; the seal pays only inside its limits. Whatever is left can be
///         reclaimed by the beneficiary once the seal expires. Every seal must expire.
contract Seal {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable oracle;
    address public immutable beneficiary;
    uint256 public immutable maxPerAction;
    uint256 public immutable maxPerDay;
    uint64 public immutable expiresAt;

    mapping(address => bool) public allowedRecipient;
    uint256 public spentToday;
    uint64 public day;

    // reasons, returned by check() and carried by SealHolds
    bytes4 public constant OK = 0x00000000;
    bytes4 public constant EXPIRED = bytes4(keccak256("Expired()"));
    bytes4 public constant NOT_ALLOWED = bytes4(keccak256("RecipientNotAllowed()"));
    bytes4 public constant OVER_ACTION = bytes4(keccak256("OverPerAction()"));
    bytes4 public constant OVER_DAY = bytes4(keccak256("OverPerDay()"));
    bytes4 public constant UNDERFUNDED = bytes4(keccak256("Underfunded()"));

    event Acted(address indexed to, uint256 amount);
    event Reclaimed(address indexed to, uint256 amount);

    error SealHolds(bytes4 reason);
    error OnlyOracle();
    error NotExpired();
    error BadSeal();

    constructor(
        IERC20 token_,
        address oracle_,
        address beneficiary_,
        uint256 maxPerAction_,
        uint256 maxPerDay_,
        uint64 expiresAt_,
        address[] memory recipients
    ) {
        if (
            oracle_ == address(0) || beneficiary_ == address(0) || maxPerAction_ > maxPerDay_ || recipients.length == 0
                || expiresAt_ <= block.timestamp
        ) revert BadSeal();
        token = token_;
        oracle = oracle_;
        beneficiary = beneficiary_;
        maxPerAction = maxPerAction_;
        maxPerDay = maxPerDay_;
        expiresAt = expiresAt_;
        for (uint256 i = 0; i < recipients.length; i++) allowedRecipient[recipients[i]] = true;
    }

    function _today() private view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    /// @notice OK, or the reason the seal would hold.
    function check(address to, uint256 amount) public view returns (bytes4) {
        if (block.timestamp >= expiresAt) return EXPIRED;
        if (!allowedRecipient[to]) return NOT_ALLOWED;
        if (amount > maxPerAction) return OVER_ACTION;
        uint256 spent = day == _today() ? spentToday : 0;
        if (spent + amount > maxPerDay) return OVER_DAY;
        if (token.balanceOf(address(this)) < amount) return UNDERFUNDED;
        return OK;
    }

    function wouldAllow(address to, uint256 amount) external view returns (bool) {
        return check(to, amount) == OK;
    }

    function act(address to, uint256 amount) external {
        if (msg.sender != oracle) revert OnlyOracle();
        bytes4 r = check(to, amount);
        if (r != OK) revert SealHolds(r);
        uint64 d = _today();
        if (day != d) {
            day = d;
            spentToday = 0;
        }
        spentToday += amount;
        token.safeTransfer(to, amount);
        emit Acted(to, amount);
    }

    function reclaim() external {
        if (block.timestamp < expiresAt) revert NotExpired();
        uint256 bal = token.balanceOf(address(this));
        token.safeTransfer(beneficiary, bal);
        emit Reclaimed(beneficiary, bal);
    }
}
