"""
CoalesceFi SDK Error Handling.

This module provides error codes, error parsing, and error handling utilities
for the CoalesceFi protocol.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import IntEnum
from typing import Any

# =============================================================================
# Error Codes
# =============================================================================


class CoalescefiErrorCode(IntEnum):
    """
    CoalesceFi program error codes.
    Must match the Rust LendingError enum exactly.

    Errors are organized by category:
    - INITIALIZATION ERRORS (0-4)
    - AUTHORIZATION ERRORS (5-9)
    - ACCOUNT VALIDATION ERRORS (10-16)
    - INPUT VALIDATION ERRORS (17-20)
    - BALANCE/CAPACITY ERRORS (21-27)
    - MARKET STATE ERRORS (28-35)
    - FEE/WITHDRAWAL ERRORS (36-40)
    - OPERATIONAL ERRORS (41-42)
    """

    # INITIALIZATION ERRORS (0-4)
    AlreadyInitialized = 0  # ERR-001: ProtocolConfig already exists
    InvalidFeeRate = 1  # ERR-002: Fee rate exceeds 10,000 bps
    InvalidCapacity = 2  # ERR-003: max_total_supply is 0
    InvalidMaturity = 3  # ERR-004: Maturity not in future
    MarketAlreadyExists = 4  # ERR-005: Market PDA already initialized

    # AUTHORIZATION ERRORS (5-9)
    Unauthorized = 5  # ERR-006: Signer lacks authority
    NotWhitelisted = 6  # ERR-007: Borrower not whitelisted
    Blacklisted = 7  # ERR-008: Address on blacklist
    ProtocolPaused = 8  # ERR-009: Protocol is paused
    BorrowerHasActiveDebt = 9  # ERR-010: Cannot blacklist with debt

    # ACCOUNT VALIDATION ERRORS (10-16)
    InvalidAddress = 10  # ERR-011: Zero pubkey
    InvalidMint = 11  # ERR-012: Wrong mint or decimals
    InvalidVault = 12  # ERR-013: Vault mismatch
    InvalidPDA = 13  # ERR-014: PDA derivation mismatch
    InvalidAccountOwner = 14  # ERR-015: Wrong program owner
    InvalidTokenProgram = 15  # ERR-016: Wrong token program
    InvalidTokenAccountOwner = 16  # ERR-017: Token account owner mismatch

    # INPUT VALIDATION ERRORS (17-20)
    ZeroAmount = 17  # ERR-018: Amount is 0
    ZeroScaledAmount = 18  # ERR-019: Scaled amount rounds to 0
    InvalidScaleFactor = 19  # ERR-020: Scale factor is 0
    InvalidTimestamp = 20  # ERR-021: Timestamp < last_accrual

    # BALANCE/CAPACITY ERRORS (21-27)
    InsufficientBalance = 21  # ERR-022: Insufficient token balance
    InsufficientScaledBalance = 22  # ERR-023: Insufficient scaled balance
    NoBalance = 23  # ERR-024: No scaled balance
    ZeroPayout = 24  # ERR-025: Vault empty, nothing to withdraw
    CapExceeded = 25  # ERR-026: Deposit exceeds max_total_supply
    BorrowAmountTooHigh = 26  # ERR-027: Borrow exceeds vault funds
    GlobalCapacityExceeded = 27  # ERR-028: Exceeds borrower capacity

    # MARKET STATE ERRORS (28-35)
    MarketMatured = 28  # ERR-029: Operation blocked after maturity
    NotMatured = 29  # ERR-030: Withdrawal before maturity
    NotSettled = 30  # ERR-031: Market not settled yet
    SettlementNotImproved = 31  # ERR-032: New factor not > current
    SettlementGracePeriod = 32  # ERR-033: Grace period not elapsed
    SettlementNotComplete = 33  # ERR-034: settlement_factor == 0
    PositionNotEmpty = 34  # ERR-035: Cannot close, balance > 0
    RepaymentExceedsDebt = 35  # ERR-036: Repayment > borrowed

    # FEE/WITHDRAWAL ERRORS (36-40)
    NoFeesToCollect = 36  # ERR-037: No accrued protocol fees
    FeeCollectionDuringDistress = 37  # ERR-038: Blocked during distress
    LendersPendingWithdrawals = 38  # ERR-039: Lenders have pending
    FeesNotCollected = 39  # ERR-040: Protocol fees not collected
    NoExcessToWithdraw = 40  # ERR-041: No excess in vault

    # OPERATIONAL ERRORS (41-42)
    MathOverflow = 41  # ERR-042: Arithmetic overflow
    PayoutBelowMinimum = 42  # ERR-043: Slippage protection triggered


# =============================================================================
# Error Messages
# =============================================================================

ERROR_MESSAGES: dict[CoalescefiErrorCode, str] = {
    # Initialization errors
    CoalescefiErrorCode.AlreadyInitialized: "Protocol configuration already exists",
    CoalescefiErrorCode.InvalidFeeRate: "Fee rate exceeds maximum of 10,000 basis points (100%)",
    CoalescefiErrorCode.InvalidCapacity: "Invalid capacity: max total supply must be greater than 0",
    CoalescefiErrorCode.InvalidMaturity: "Invalid maturity: must be in the future",
    CoalescefiErrorCode.MarketAlreadyExists: "Market with this nonce already exists",
    # Authorization errors
    CoalescefiErrorCode.Unauthorized: "Unauthorized: signer does not have required authority",
    CoalescefiErrorCode.NotWhitelisted: "Borrower is not whitelisted for this market",
    CoalescefiErrorCode.Blacklisted: "Address is on the global blacklist",
    CoalescefiErrorCode.ProtocolPaused: "Protocol is paused: no operations allowed",
    CoalescefiErrorCode.BorrowerHasActiveDebt: "Cannot blacklist borrower: borrower has outstanding debt",
    # Account validation errors
    CoalescefiErrorCode.InvalidAddress: "Invalid address: cannot use zero pubkey",
    CoalescefiErrorCode.InvalidMint: "Invalid mint: wrong token mint or unsupported decimals",
    CoalescefiErrorCode.InvalidVault: "Invalid vault: account mismatch or wrong owner",
    CoalescefiErrorCode.InvalidPDA: "Account is not the expected PDA",
    CoalescefiErrorCode.InvalidAccountOwner: "Account is not owned by the program",
    CoalescefiErrorCode.InvalidTokenProgram: "Invalid token program",
    CoalescefiErrorCode.InvalidTokenAccountOwner: "Token account owner does not match expected authority",
    # Input validation errors
    CoalescefiErrorCode.ZeroAmount: "Amount must be greater than 0",
    CoalescefiErrorCode.ZeroScaledAmount: "Deposit amount too small: rounds to zero shares",
    CoalescefiErrorCode.InvalidScaleFactor: "Scale factor is zero (invalid market state)",
    CoalescefiErrorCode.InvalidTimestamp: "Timestamp is invalid: effective time cannot be before last accrual time",
    # Balance/capacity errors
    CoalescefiErrorCode.InsufficientBalance: "Insufficient token balance",
    CoalescefiErrorCode.InsufficientScaledBalance: "Withdrawal exceeds position balance",
    CoalescefiErrorCode.NoBalance: "No position balance to withdraw",
    CoalescefiErrorCode.ZeroPayout: "Vault is empty: no funds to withdraw",
    CoalescefiErrorCode.CapExceeded: "Deposit would exceed market capacity",
    CoalescefiErrorCode.BorrowAmountTooHigh: "Borrow amount exceeds available vault funds",
    CoalescefiErrorCode.GlobalCapacityExceeded: "Borrow exceeds global whitelist capacity",
    # Market state errors
    CoalescefiErrorCode.MarketMatured: "Market has matured: operation not allowed",
    CoalescefiErrorCode.NotMatured: "Market has not matured: withdrawal not allowed",
    CoalescefiErrorCode.NotSettled: "Market is not yet settled",
    CoalescefiErrorCode.SettlementNotImproved: "New settlement factor must be greater than current",
    CoalescefiErrorCode.SettlementGracePeriod: "Settlement grace period has not elapsed yet (wait 5 minutes after maturity)",
    CoalescefiErrorCode.SettlementNotComplete: "Settlement has not occurred (settlement_factor == 0)",
    CoalescefiErrorCode.PositionNotEmpty: "Position still has balance: cannot close",
    CoalescefiErrorCode.RepaymentExceedsDebt: "Repayment amount exceeds the current borrowed amount",
    # Fee/withdrawal errors
    CoalescefiErrorCode.NoFeesToCollect: "No accrued fees to collect",
    CoalescefiErrorCode.FeeCollectionDuringDistress: "Fee collection blocked during market distress (settlement < 100%)",
    CoalescefiErrorCode.LendersPendingWithdrawals: "Fee collection blocked while lenders have pending withdrawals",
    CoalescefiErrorCode.FeesNotCollected: "Protocol fees have not been collected yet",
    CoalescefiErrorCode.NoExcessToWithdraw: "No excess funds in vault to withdraw",
    # Operational errors
    CoalescefiErrorCode.MathOverflow: "Mathematical overflow or underflow",
    CoalescefiErrorCode.PayoutBelowMinimum: "Payout is below the minimum specified (slippage protection triggered)",
}


# =============================================================================
# Recovery Actions
# =============================================================================

ERROR_RECOVERY_ACTIONS: dict[CoalescefiErrorCode, str] = {
    # Validation errors (user can fix)
    CoalescefiErrorCode.ZeroAmount: "Enter an amount greater than 0",
    CoalescefiErrorCode.ZeroScaledAmount: "Increase deposit amount - the current amount rounds to zero shares",
    CoalescefiErrorCode.InvalidFeeRate: "Fee rate must be between 0 and 10,000 basis points (0-100%)",
    CoalescefiErrorCode.InvalidMaturity: "Set a maturity date in the future (at least 60 seconds from now)",
    CoalescefiErrorCode.InvalidCapacity: "Set a max total supply greater than 0",
    CoalescefiErrorCode.InvalidAddress: "Provide a valid Solana address (not the zero address)",
    CoalescefiErrorCode.InvalidMint: "Use a supported token mint (USDC with 6 decimals)",
    # Balance/capacity errors (user can adjust amounts)
    CoalescefiErrorCode.InsufficientBalance: "Add more tokens to your wallet or reduce the amount",
    CoalescefiErrorCode.BorrowAmountTooHigh: "Reduce borrow amount to available vault balance, or wait for more deposits",
    CoalescefiErrorCode.InsufficientScaledBalance: "Reduce withdrawal amount to your available position balance",
    CoalescefiErrorCode.CapExceeded: "Reduce deposit amount - market has reached its capacity limit",
    CoalescefiErrorCode.GlobalCapacityExceeded: "Reduce borrow amount - you have reached your global borrowing capacity",
    CoalescefiErrorCode.NoBalance: "You have no position in this market to withdraw",
    CoalescefiErrorCode.ZeroPayout: "Vault is empty - borrower must repay before withdrawals are possible",
    CoalescefiErrorCode.PayoutBelowMinimum: "Increase min_payout tolerance or wait for better settlement conditions",
    # Market lifecycle errors (timing-related)
    CoalescefiErrorCode.NotMatured: "Wait until the market maturity date to withdraw funds",
    CoalescefiErrorCode.MarketMatured: "Market has matured - deposits and borrows are no longer allowed",
    CoalescefiErrorCode.SettlementGracePeriod: "Wait 5 minutes after maturity for the settlement grace period to elapse",
    CoalescefiErrorCode.NotSettled: "Market must be settled first - call withdraw to trigger settlement",
    CoalescefiErrorCode.SettlementNotImproved: "New settlement must be better than current - ensure more funds were added to vault",
    CoalescefiErrorCode.SettlementNotComplete: "Settlement has not occurred yet - wait for first withdrawal after maturity",
    # Authorization errors (need different permissions)
    CoalescefiErrorCode.Unauthorized: "This operation requires admin or whitelist manager authority",
    CoalescefiErrorCode.NotWhitelisted: "Contact the whitelist manager to request borrowing access",
    CoalescefiErrorCode.Blacklisted: "Your address is on the blacklist - contact support if you believe this is an error",
    # Protocol state errors (wait or contact admin)
    CoalescefiErrorCode.ProtocolPaused: "Protocol is paused - wait for admin to resume operations",
    CoalescefiErrorCode.AlreadyInitialized: "Protocol is already initialized - no action needed",
    CoalescefiErrorCode.MarketAlreadyExists: "Use a different nonce to create a new market",
    # Fee collection errors
    CoalescefiErrorCode.NoFeesToCollect: "No fees have accrued yet - wait for interest to accrue",
    CoalescefiErrorCode.FeeCollectionDuringDistress: "Fee collection blocked - market is in distress with settlement factor below 100%",
    CoalescefiErrorCode.LendersPendingWithdrawals: "Fee collection blocked - wait for all lenders to withdraw first",
    CoalescefiErrorCode.FeesNotCollected: "Protocol fees must be collected before withdrawing excess",
    CoalescefiErrorCode.NoExcessToWithdraw: "No excess funds available - all funds allocated to lenders/fees",
    # Position management
    CoalescefiErrorCode.PositionNotEmpty: "Withdraw all funds before closing your position",
    # Token/account configuration errors
    CoalescefiErrorCode.InvalidTokenAccountOwner: "Token account owner does not match expected signer - use the correct token account",
    CoalescefiErrorCode.InvalidVault: "Vault account mismatch - ensure you are using the correct market vault",
    CoalescefiErrorCode.InvalidTokenProgram: "Use the SPL Token Program (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)",
    # System errors (these typically need developer investigation)
    CoalescefiErrorCode.MathOverflow: "Mathematical overflow occurred - try with smaller amounts or contact support",
    CoalescefiErrorCode.InvalidPDA: "Account derivation mismatch - ensure PDAs are derived correctly",
    CoalescefiErrorCode.InvalidAccountOwner: "Account not owned by the CoalesceFi program - verify account addresses",
    CoalescefiErrorCode.InvalidScaleFactor: "Market is in an invalid state - contact support",
    # Timestamp and debt errors
    CoalescefiErrorCode.InvalidTimestamp: "Invalid timestamp detected - this may indicate clock skew, please retry",
    CoalescefiErrorCode.RepaymentExceedsDebt: "Reduce repayment amount to match or be less than the outstanding debt",
    CoalescefiErrorCode.BorrowerHasActiveDebt: "Borrower must repay all outstanding debt before being blacklisted",
}


# =============================================================================
# Error Class
# =============================================================================


class CoalescefiError(Exception):
    """CoalesceFi error class for structured error handling."""

    def __init__(self, code: CoalescefiErrorCode, message: str | None = None):
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, f"Unknown error: {code}")
        self.program_error = True
        super().__init__(self.message)

    @property
    def code_name(self) -> str:
        """Get the error code name."""
        return self.code.name


# =============================================================================
# Error Parsing
# =============================================================================

# Error code extraction patterns for different Solana runtime versions
_ERROR_PATTERNS = [
    # Standard Solana pattern: "custom program error: 0x{hex}"
    re.compile(r"custom program error:\s*0x([0-9a-fA-F]+)", re.IGNORECASE),
    # Alternative hex format: "Custom(0x{hex})"
    re.compile(r"Custom\s*\(\s*0x([0-9a-fA-F]+)\s*\)", re.IGNORECASE),
    # Decimal format: "custom program error: {decimal}"
    re.compile(r"custom program error:\s*(\d+)(?!\s*x)", re.IGNORECASE),
    # Decimal in Custom(): "Custom({decimal})"
    re.compile(r"Custom\s*\(\s*(\d+)\s*\)"),
    # Anchor-style: "Error Code: {code}"
    re.compile(r"Error Code:\s*(\d+)", re.IGNORECASE),
    # Program error format: "Program failed with error: {code}"
    re.compile(r"Program failed with error:\s*(\d+)", re.IGNORECASE),
    # Simple error number in logs
    re.compile(r"\berror\s+(\d+)\b", re.IGNORECASE),
]


def _extract_error_code_from_log(log: str) -> int | None:
    """Try to extract an error code from a log line using multiple patterns."""
    if not isinstance(log, str) or not log:
        return None

    for pattern in _ERROR_PATTERNS:
        match = pattern.search(log)
        if match:
            matched = match.group(1)
            # Check if it's a hex pattern
            is_hex = "0x" in pattern.pattern.lower() or (
                matched.isalnum() and not matched.isdigit()
            )
            base = 16 if is_hex else 10

            try:
                code = int(matched, base)
                if 0 <= code <= 0xFFFFFFFF:
                    return code
            except ValueError:
                continue

    return None


def parse_coalescefi_error(error: Any) -> CoalescefiError | None:
    """
    Parse a program error from transaction error.
    Handles multiple Solana runtime versions and error formats gracefully.
    Returns None if the error is not a CoalesceFi program error.

    Supported formats:
    - SendTransactionError with logs
    - InstructionError with Custom code
    - TransactionError format
    - Nested error objects

    Args:
        error: The error to parse (can be any type).

    Returns:
        CoalescefiError if parsing succeeds, None otherwise.
    """
    # Already a CoalescefiError
    if isinstance(error, CoalescefiError):
        return error

    # Handle None
    if error is None:
        return None

    # Handle string errors
    if isinstance(error, str):
        code = _extract_error_code_from_log(error)
        if code is not None and code in [e.value for e in CoalescefiErrorCode]:
            return CoalescefiError(CoalescefiErrorCode(code))
        return None

    # Handle exception with message
    if isinstance(error, Exception):
        code = _extract_error_code_from_log(str(error))
        if code is not None and code in [e.value for e in CoalescefiErrorCode]:
            return CoalescefiError(CoalescefiErrorCode(code))

        # Check cause chain
        if hasattr(error, "__cause__") and error.__cause__ is not None:
            cause_result = parse_coalescefi_error(error.__cause__)
            if cause_result:
                return cause_result

    # Handle dict-like objects
    if isinstance(error, dict):
        # Strategy 1: Parse from logs array
        if "logs" in error and isinstance(error["logs"], list):
            for log in error["logs"]:
                if isinstance(log, str):
                    code = _extract_error_code_from_log(log)
                    if code is not None and code in [e.value for e in CoalescefiErrorCode]:
                        return CoalescefiError(CoalescefiErrorCode(code))

        # Strategy 2: InstructionError format
        if "InstructionError" in error:
            instruction_error = error["InstructionError"]
            if isinstance(instruction_error, (list, tuple)) and len(instruction_error) >= 2:
                custom_error = instruction_error[1]
                if isinstance(custom_error, dict) and "Custom" in custom_error:
                    code = custom_error["Custom"]
                    if isinstance(code, int) and code in [e.value for e in CoalescefiErrorCode]:
                        return CoalescefiError(CoalescefiErrorCode(code))

        # Strategy 3: Nested error in 'err' field
        if "err" in error and error["err"] is not None:
            nested_result = parse_coalescefi_error(error["err"])
            if nested_result:
                return nested_result

        # Strategy 4: Nested error in 'error' field
        if "error" in error and error["error"] is not None:
            nested_result = parse_coalescefi_error(error["error"])
            if nested_result:
                return nested_result

        # Strategy 5: Check message field
        if "message" in error and isinstance(error["message"], str):
            code = _extract_error_code_from_log(error["message"])
            if code is not None and code in [e.value for e in CoalescefiErrorCode]:
                return CoalescefiError(CoalescefiErrorCode(code))

    return None


# =============================================================================
# Error Utilities
# =============================================================================


def is_user_recoverable_error(code: CoalescefiErrorCode) -> bool:
    """
    Check if an error code represents a user-recoverable error.
    These errors typically require user action to resolve.
    """
    user_recoverable_errors = {
        CoalescefiErrorCode.ZeroAmount,
        CoalescefiErrorCode.InsufficientBalance,
        CoalescefiErrorCode.BorrowAmountTooHigh,
        CoalescefiErrorCode.InsufficientScaledBalance,
        CoalescefiErrorCode.CapExceeded,
        CoalescefiErrorCode.GlobalCapacityExceeded,
        CoalescefiErrorCode.ZeroScaledAmount,
    }
    return code in user_recoverable_errors


def get_error_recovery_action(code: CoalescefiErrorCode) -> str | None:
    """
    Get a user-friendly recovery action for an error.
    Provides actionable guidance for resolving common errors.
    """
    return ERROR_RECOVERY_ACTIONS.get(code)


class ErrorSeverity(IntEnum):
    """Error severity levels for categorizing errors."""

    Warning = 0  # User input or recoverable errors
    Error = 1  # Transaction failures that may be retried
    Critical = 2  # Critical protocol or system errors


def get_error_severity(code: CoalescefiErrorCode) -> ErrorSeverity:
    """Get the severity level of an error."""
    critical_errors = {
        CoalescefiErrorCode.MathOverflow,
        CoalescefiErrorCode.InvalidPDA,
        CoalescefiErrorCode.InvalidAccountOwner,
        CoalescefiErrorCode.InvalidTokenProgram,
        CoalescefiErrorCode.InvalidScaleFactor,
    }

    warning_errors = {
        CoalescefiErrorCode.ZeroAmount,
        CoalescefiErrorCode.InsufficientBalance,
        CoalescefiErrorCode.ZeroScaledAmount,
        CoalescefiErrorCode.NotMatured,
        CoalescefiErrorCode.SettlementGracePeriod,
    }

    if code in critical_errors:
        return ErrorSeverity.Critical
    if code in warning_errors:
        return ErrorSeverity.Warning
    return ErrorSeverity.Error


class ErrorCategory(IntEnum):
    """Error categories for grouping related errors."""

    Initialization = 0  # Protocol initialization and configuration errors
    Authorization = 1  # Authorization and permission errors
    AccountValidation = 2  # Account validation errors
    InputValidation = 3  # Input validation errors
    Balance = 4  # User balance and capacity errors
    MarketState = 5  # Market state errors
    FeeWithdrawal = 6  # Fee and withdrawal errors
    Operational = 7  # Operational errors


def get_error_category(code: CoalescefiErrorCode) -> ErrorCategory:
    """Get the category of an error."""
    numeric_code = int(code)

    if 0 <= numeric_code <= 4:
        return ErrorCategory.Initialization
    elif 5 <= numeric_code <= 9:
        return ErrorCategory.Authorization
    elif 10 <= numeric_code <= 16:
        return ErrorCategory.AccountValidation
    elif 17 <= numeric_code <= 20:
        return ErrorCategory.InputValidation
    elif 21 <= numeric_code <= 27:
        return ErrorCategory.Balance
    elif 28 <= numeric_code <= 35:
        return ErrorCategory.MarketState
    elif 36 <= numeric_code <= 40:
        return ErrorCategory.FeeWithdrawal
    else:
        return ErrorCategory.Operational


@dataclass
class ErrorDetails:
    """Detailed error information for logging and debugging."""

    code: int
    name: str
    message: str
    severity: ErrorSeverity
    category: ErrorCategory
    is_recoverable: bool
    recovery_action: str | None


def get_error_details(code: CoalescefiErrorCode) -> ErrorDetails:
    """Get detailed information about an error."""
    return ErrorDetails(
        code=int(code),
        name=code.name,
        message=ERROR_MESSAGES.get(code, f"Unknown error: {code}"),
        severity=get_error_severity(code),
        category=get_error_category(code),
        is_recoverable=is_user_recoverable_error(code),
        recovery_action=get_error_recovery_action(code),
    )


# =============================================================================
# SDK Error
# =============================================================================


class SdkError(Exception):
    """SDK-level error for non-program errors."""

    def __init__(
        self,
        message: str,
        error_type: str = "unknown",
        cause: Exception | None = None,
    ):
        self.error_type = error_type  # 'configuration', 'network', 'validation', 'unknown'
        self.cause = cause
        super().__init__(message)


def is_retryable_error(error: Any) -> bool:
    """Check if an error is retryable (typically network or transient errors)."""
    # Program errors are generally not retryable (except for some specific cases)
    if isinstance(error, CoalescefiError):
        retryable_codes = {
            CoalescefiErrorCode.ProtocolPaused,  # May be unpaused
            CoalescefiErrorCode.SettlementGracePeriod,  # Will elapse
        }
        return error.code in retryable_codes

    # Network errors are often retryable
    if isinstance(error, SdkError):
        return error.error_type == "network"

    # Check for common network error patterns
    if isinstance(error, Exception):
        message = str(error).lower()
        return any(
            x in message
            for x in [
                "timeout",
                "network",
                "connection",
                "blockhash not found",
                "rate limit",
            ]
        )

    return False
