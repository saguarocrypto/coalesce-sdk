"""
Tests for error handling.

These tests verify that error codes and parsing match the TypeScript SDK.
"""

import pytest

from coalescefi_sdk import (
    ERROR_MESSAGES,
    CoalescefiError,
    CoalescefiErrorCode,
    ErrorCategory,
    ErrorSeverity,
    get_error_category,
    get_error_details,
    get_error_recovery_action,
    get_error_severity,
    is_user_recoverable_error,
    parse_coalescefi_error,
)


class TestErrorCodes:
    """Test that all 44 error codes are defined."""

    def test_initialization_errors(self):
        """Test initialization error codes (0-4)."""
        assert CoalescefiErrorCode.AlreadyInitialized == 0
        assert CoalescefiErrorCode.InvalidFeeRate == 1
        assert CoalescefiErrorCode.InvalidCapacity == 2
        assert CoalescefiErrorCode.InvalidMaturity == 3
        assert CoalescefiErrorCode.MarketAlreadyExists == 4

    def test_authorization_errors(self):
        """Test authorization error codes (5-9)."""
        assert CoalescefiErrorCode.Unauthorized == 5
        assert CoalescefiErrorCode.NotWhitelisted == 6
        assert CoalescefiErrorCode.Blacklisted == 7
        assert CoalescefiErrorCode.ProtocolPaused == 8
        assert CoalescefiErrorCode.BorrowerHasActiveDebt == 9

    def test_account_validation_errors(self):
        """Test account validation error codes (10-16)."""
        assert CoalescefiErrorCode.InvalidAddress == 10
        assert CoalescefiErrorCode.InvalidMint == 11
        assert CoalescefiErrorCode.InvalidVault == 12
        assert CoalescefiErrorCode.InvalidPDA == 13
        assert CoalescefiErrorCode.InvalidAccountOwner == 14
        assert CoalescefiErrorCode.InvalidTokenProgram == 15
        assert CoalescefiErrorCode.InvalidTokenAccountOwner == 16

    def test_input_validation_errors(self):
        """Test input validation error codes (17-20)."""
        assert CoalescefiErrorCode.ZeroAmount == 17
        assert CoalescefiErrorCode.ZeroScaledAmount == 18
        assert CoalescefiErrorCode.InvalidScaleFactor == 19
        assert CoalescefiErrorCode.InvalidTimestamp == 20

    def test_balance_capacity_errors(self):
        """Test balance/capacity error codes (21-27)."""
        assert CoalescefiErrorCode.InsufficientBalance == 21
        assert CoalescefiErrorCode.InsufficientScaledBalance == 22
        assert CoalescefiErrorCode.NoBalance == 23
        assert CoalescefiErrorCode.ZeroPayout == 24
        assert CoalescefiErrorCode.CapExceeded == 25
        assert CoalescefiErrorCode.BorrowAmountTooHigh == 26
        assert CoalescefiErrorCode.GlobalCapacityExceeded == 27

    def test_market_state_errors(self):
        """Test market state error codes (28-35)."""
        assert CoalescefiErrorCode.MarketMatured == 28
        assert CoalescefiErrorCode.NotMatured == 29
        assert CoalescefiErrorCode.NotSettled == 30
        assert CoalescefiErrorCode.SettlementNotImproved == 31
        assert CoalescefiErrorCode.SettlementGracePeriod == 32
        assert CoalescefiErrorCode.SettlementNotComplete == 33
        assert CoalescefiErrorCode.PositionNotEmpty == 34
        assert CoalescefiErrorCode.RepaymentExceedsDebt == 35

    def test_fee_withdrawal_errors(self):
        """Test fee/withdrawal error codes (36-40)."""
        assert CoalescefiErrorCode.NoFeesToCollect == 36
        assert CoalescefiErrorCode.FeeCollectionDuringDistress == 37
        assert CoalescefiErrorCode.LendersPendingWithdrawals == 38
        assert CoalescefiErrorCode.FeesNotCollected == 39
        assert CoalescefiErrorCode.NoExcessToWithdraw == 40

    def test_operational_errors(self):
        """Test operational error codes (41-42)."""
        assert CoalescefiErrorCode.MathOverflow == 41
        assert CoalescefiErrorCode.PayoutBelowMinimum == 42

    def test_all_44_error_codes_exist(self):
        """Verify all 44 error codes are defined (including NoHaircutToClaim)."""
        assert len(CoalescefiErrorCode) == 44


class TestErrorMessages:
    """Test that all error codes have messages."""

    def test_all_codes_have_messages(self):
        """Every error code should have a human-readable message."""
        for code in CoalescefiErrorCode:
            assert code in ERROR_MESSAGES
            assert ERROR_MESSAGES[code]  # Not empty

    def test_messages_are_descriptive(self):
        """Messages should be descriptive (more than 10 characters)."""
        for code in CoalescefiErrorCode:
            message = ERROR_MESSAGES[code]
            assert len(message) > 10, f"Message for {code.name} is too short"


class TestCoalescefiError:
    """Test the CoalescefiError class."""

    def test_creates_error_with_code(self):
        """Should create error with code and default message."""
        error = CoalescefiError(CoalescefiErrorCode.ZeroAmount)

        assert error.code == CoalescefiErrorCode.ZeroAmount
        assert error.message == ERROR_MESSAGES[CoalescefiErrorCode.ZeroAmount]
        assert error.program_error is True

    def test_creates_error_with_custom_message(self):
        """Should create error with custom message."""
        custom_msg = "Custom error message"
        error = CoalescefiError(CoalescefiErrorCode.ZeroAmount, custom_msg)

        assert error.code == CoalescefiErrorCode.ZeroAmount
        assert error.message == custom_msg

    def test_code_name_property(self):
        """Should return the code name."""
        error = CoalescefiError(CoalescefiErrorCode.ZeroAmount)
        assert error.code_name == "ZeroAmount"

    def test_is_exception(self):
        """Should be a proper Exception subclass."""
        error = CoalescefiError(CoalescefiErrorCode.ZeroAmount)
        assert isinstance(error, Exception)

        # Should be raisable
        with pytest.raises(CoalescefiError):
            raise error


class TestParseCoalescefiError:
    """Test error parsing from various formats."""

    def test_parse_already_coalescefi_error(self):
        """Should return same error if already CoalescefiError."""
        original = CoalescefiError(CoalescefiErrorCode.ZeroAmount)
        parsed = parse_coalescefi_error(original)

        assert parsed is original

    def test_parse_none_returns_none(self):
        """Should return None for None input."""
        assert parse_coalescefi_error(None) is None

    def test_parse_string_with_hex_code(self):
        """Should parse error code from hex string."""
        error_str = "custom program error: 0x11"  # 17 = ZeroAmount
        parsed = parse_coalescefi_error(error_str)

        assert parsed is not None
        assert parsed.code == CoalescefiErrorCode.ZeroAmount

    def test_parse_string_with_decimal_code(self):
        """Should parse error code from decimal string."""
        error_str = "custom program error: 17"
        parsed = parse_coalescefi_error(error_str)

        assert parsed is not None
        assert parsed.code == CoalescefiErrorCode.ZeroAmount

    def test_parse_dict_with_logs(self):
        """Should parse error code from logs array."""
        error_dict = {
            "logs": [
                "Program log: Error: custom program error: 0x11",
            ]
        }
        parsed = parse_coalescefi_error(error_dict)

        assert parsed is not None
        assert parsed.code == CoalescefiErrorCode.ZeroAmount

    def test_parse_dict_with_instruction_error(self):
        """Should parse error code from InstructionError format."""
        error_dict = {"InstructionError": [0, {"Custom": 17}]}
        parsed = parse_coalescefi_error(error_dict)

        assert parsed is not None
        assert parsed.code == CoalescefiErrorCode.ZeroAmount

    def test_parse_nested_error(self):
        """Should parse error from nested 'err' field."""
        error_dict = {"err": {"InstructionError": [0, {"Custom": 17}]}}
        parsed = parse_coalescefi_error(error_dict)

        assert parsed is not None
        assert parsed.code == CoalescefiErrorCode.ZeroAmount

    def test_parse_unknown_error_returns_none(self):
        """Should return None for unknown error format."""
        error_dict = {"unknown_format": True}
        parsed = parse_coalescefi_error(error_dict)

        assert parsed is None

    def test_parse_invalid_code_returns_none(self):
        """Should return None for error code not in enum."""
        error_str = "custom program error: 9999"
        parsed = parse_coalescefi_error(error_str)

        assert parsed is None


class TestErrorUtilities:
    """Test error utility functions."""

    def test_user_recoverable_errors(self):
        """Should correctly identify user-recoverable errors."""
        recoverable = [
            CoalescefiErrorCode.ZeroAmount,
            CoalescefiErrorCode.InsufficientBalance,
            CoalescefiErrorCode.BorrowAmountTooHigh,
            CoalescefiErrorCode.InsufficientScaledBalance,
            CoalescefiErrorCode.CapExceeded,
            CoalescefiErrorCode.GlobalCapacityExceeded,
            CoalescefiErrorCode.ZeroScaledAmount,
        ]

        for code in recoverable:
            assert is_user_recoverable_error(code), f"{code.name} should be recoverable"

        non_recoverable = [
            CoalescefiErrorCode.MathOverflow,
            CoalescefiErrorCode.InvalidPDA,
            CoalescefiErrorCode.Unauthorized,
        ]

        for code in non_recoverable:
            assert not is_user_recoverable_error(code), f"{code.name} should not be recoverable"

    def test_recovery_actions(self):
        """Should return recovery actions for errors."""
        action = get_error_recovery_action(CoalescefiErrorCode.ZeroAmount)
        assert action is not None
        assert "0" in action.lower() or "greater" in action.lower()

    def test_error_severity(self):
        """Should return correct severity levels."""
        assert get_error_severity(CoalescefiErrorCode.ZeroAmount) == ErrorSeverity.Warning
        assert get_error_severity(CoalescefiErrorCode.MathOverflow) == ErrorSeverity.Critical
        assert get_error_severity(CoalescefiErrorCode.Unauthorized) == ErrorSeverity.Error

    def test_error_category(self):
        """Should return correct categories."""
        assert (
            get_error_category(CoalescefiErrorCode.AlreadyInitialized)
            == ErrorCategory.Initialization
        )
        assert get_error_category(CoalescefiErrorCode.Unauthorized) == ErrorCategory.Authorization
        assert get_error_category(CoalescefiErrorCode.InvalidPDA) == ErrorCategory.AccountValidation
        assert get_error_category(CoalescefiErrorCode.ZeroAmount) == ErrorCategory.InputValidation
        assert get_error_category(CoalescefiErrorCode.InsufficientBalance) == ErrorCategory.Balance
        assert get_error_category(CoalescefiErrorCode.NotMatured) == ErrorCategory.MarketState
        assert (
            get_error_category(CoalescefiErrorCode.NoFeesToCollect) == ErrorCategory.FeeWithdrawal
        )
        assert get_error_category(CoalescefiErrorCode.MathOverflow) == ErrorCategory.Operational

    def test_error_details(self):
        """Should return comprehensive error details."""
        details = get_error_details(CoalescefiErrorCode.ZeroAmount)

        assert details.code == 17
        assert details.name == "ZeroAmount"
        assert details.message
        assert details.severity == ErrorSeverity.Warning
        assert details.category == ErrorCategory.InputValidation
        assert details.is_recoverable is True
        assert details.recovery_action is not None
