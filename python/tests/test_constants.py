"""
Tests for SDK constants.

These tests verify that constants match the TypeScript SDK.
"""

from coalescefi_sdk import (
    BORROWER_WHITELIST_SIZE,
    BPS,
    DISC_BORROWER_WL,
    DISC_LENDER_POSITION,
    DISC_MARKET,
    # Account Discriminators
    DISC_PROTOCOL_CONFIG,
    LENDER_POSITION_SIZE,
    MARKET_SIZE,
    # Protocol Limits
    MAX_ANNUAL_INTEREST_BPS,
    MAX_FEE_RATE_BPS,
    # Numeric Type Bounds
    MAX_U64,
    MAX_U128,
    MIN_MATURITY_DELTA,
    # Account Sizes
    PROTOCOL_CONFIG_SIZE,
    SECONDS_PER_YEAR,
    SETTLEMENT_GRACE_PERIOD,
    USDC_DECIMALS,
    # Mathematical Constants
    WAD,
    # Instruction Discriminators
    InstructionDiscriminator,
)


class TestMathematicalConstants:
    """Test mathematical constants match TypeScript SDK."""

    def test_wad(self):
        """WAD should be 10^18."""
        assert WAD == 10**18
        assert WAD == 1_000_000_000_000_000_000

    def test_bps(self):
        """BPS should be 10,000."""
        assert BPS == 10_000

    def test_seconds_per_year(self):
        """SECONDS_PER_YEAR should be 365 days in seconds."""
        assert SECONDS_PER_YEAR == 31_536_000
        assert SECONDS_PER_YEAR == 365 * 24 * 60 * 60


class TestProtocolLimits:
    """Test protocol limit constants match TypeScript SDK."""

    def test_max_annual_interest_bps(self):
        """MAX_ANNUAL_INTEREST_BPS should be 10,000 (100%)."""
        assert MAX_ANNUAL_INTEREST_BPS == 10_000

    def test_max_fee_rate_bps(self):
        """MAX_FEE_RATE_BPS should be 10,000 (100%)."""
        assert MAX_FEE_RATE_BPS == 10_000

    def test_usdc_decimals(self):
        """USDC_DECIMALS should be 6."""
        assert USDC_DECIMALS == 6

    def test_min_maturity_delta(self):
        """MIN_MATURITY_DELTA should be 60 seconds."""
        assert MIN_MATURITY_DELTA == 60

    def test_settlement_grace_period(self):
        """SETTLEMENT_GRACE_PERIOD should be 300 seconds (5 minutes)."""
        assert SETTLEMENT_GRACE_PERIOD == 300


class TestAccountSizes:
    """Test account sizes match TypeScript SDK."""

    def test_protocol_config_size(self):
        """PROTOCOL_CONFIG_SIZE should be 194 bytes."""
        assert PROTOCOL_CONFIG_SIZE == 194

    def test_market_size(self):
        """MARKET_SIZE should be 250 bytes."""
        assert MARKET_SIZE == 250

    def test_lender_position_size(self):
        """LENDER_POSITION_SIZE should be 128 bytes."""
        assert LENDER_POSITION_SIZE == 128

    def test_borrower_whitelist_size(self):
        """BORROWER_WHITELIST_SIZE should be 96 bytes."""
        assert BORROWER_WHITELIST_SIZE == 96


class TestAccountDiscriminators:
    """Test account discriminators match TypeScript SDK."""

    def test_disc_protocol_config(self):
        """DISC_PROTOCOL_CONFIG should be 'COALPC__'."""
        assert DISC_PROTOCOL_CONFIG == b"COALPC__"
        assert len(DISC_PROTOCOL_CONFIG) == 8

    def test_disc_market(self):
        """DISC_MARKET should be 'COALMKT_'."""
        assert DISC_MARKET == b"COALMKT_"
        assert len(DISC_MARKET) == 8

    def test_disc_lender_position(self):
        """DISC_LENDER_POSITION should be 'COALLPOS'."""
        assert DISC_LENDER_POSITION == b"COALLPOS"
        assert len(DISC_LENDER_POSITION) == 8

    def test_disc_borrower_wl(self):
        """DISC_BORROWER_WL should be 'COALBWL_'."""
        assert DISC_BORROWER_WL == b"COALBWL_"
        assert len(DISC_BORROWER_WL) == 8


class TestInstructionDiscriminators:
    """Test instruction discriminator values match TypeScript SDK."""

    def test_admin_setup_discriminators(self):
        """Admin/setup discriminators should be 0-2."""
        assert InstructionDiscriminator.InitializeProtocol == 0
        assert InstructionDiscriminator.SetFeeConfig == 1
        assert InstructionDiscriminator.CreateMarket == 2

    def test_core_lending_discriminators(self):
        """Core lending discriminators should be 3-7."""
        assert InstructionDiscriminator.Deposit == 3
        assert InstructionDiscriminator.Borrow == 4
        assert InstructionDiscriminator.Repay == 5
        assert InstructionDiscriminator.RepayInterest == 6
        assert InstructionDiscriminator.Withdraw == 7

    def test_settlement_discriminators(self):
        """Settlement discriminators should be 8-11."""
        assert InstructionDiscriminator.CollectFees == 8
        assert InstructionDiscriminator.ReSettle == 9
        assert InstructionDiscriminator.CloseLenderPosition == 10
        assert InstructionDiscriminator.WithdrawExcess == 11

    def test_access_control_discriminators(self):
        """Access control discriminators should be 12-16."""
        assert InstructionDiscriminator.SetBorrowerWhitelist == 12
        assert InstructionDiscriminator.SetPause == 13
        assert InstructionDiscriminator.SetBlacklistMode == 14
        assert InstructionDiscriminator.SetAdmin == 15
        assert InstructionDiscriminator.SetWhitelistManager == 16


class TestNumericTypeBounds:
    """Test numeric type bounds."""

    def test_max_u64(self):
        """MAX_U64 should be 2^64 - 1."""
        assert MAX_U64 == (1 << 64) - 1
        assert MAX_U64 == 18_446_744_073_709_551_615

    def test_max_u128(self):
        """MAX_U128 should be 2^128 - 1."""
        assert MAX_U128 == (1 << 128) - 1
