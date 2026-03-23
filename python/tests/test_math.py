"""Tests for CoalesceFi math utilities."""

import pytest
from solders.pubkey import Pubkey

from coalescefi_sdk.constants import BPS, SECONDS_PER_YEAR, WAD
from coalescefi_sdk.math import (
    DAYS_PER_YEAR,
    SECONDS_PER_DAY,
    MathOverflowError,
    calculate_apr,
    calculate_available_vault_balance,
    calculate_normalized_amount,
    calculate_position_value,
    calculate_scaled_amount,
    calculate_settlement_payout,
    calculate_total_supply,
    calculate_utilization_rate,
    calculate_utilization_rate_decimal,
    estimate_interest_accrual,
    estimate_value_at_maturity,
    growth_factor_wad,
    mul_wad,
    pow_wad,
    safe_divide,
    would_overflow_u64,
    would_overflow_u128,
)
from coalescefi_sdk.types import Market

# Mirrors `program/tests/cross_compilation_tests.rs` hardcoded Python-Decimal vectors.
GOLDEN_VECTORS = [
    # (label, annual_interest_bps, elapsed_seconds, expected_scale_factor)
    ("V1: 10% APR for 1 year", 1000, 31_536_000, 1_105_155_781_616_264_095),
    ("V2: 10% APR for 1 day", 1000, 86_400, 1_000_273_972_602_739_726),
    ("V3: 10% APR for 12 hours", 1000, 43_200, 1_000_136_986_301_369_863),
    ("V4: 100% APR for 1 year", 10_000, 31_536_000, 2_714_567_482_021_873_489),
    ("V5: 0.01% APR for 1 year", 1, 31_536_000, 1_000_100_004_986_466_169),
]


def _mock_market(**overrides: object) -> Market:
    """Create a mock Market for testing."""
    defaults = {
        "version": 1,
        "borrower": Pubkey.new_unique(),
        "mint": Pubkey.new_unique(),
        "vault": Pubkey.new_unique(),
        "market_authority_bump": 255,
        "annual_interest_bps": 1000,
        "maturity_timestamp": 1700000000 + 31536000,
        "max_total_supply": 1_000_000_000_000,
        "market_nonce": 1,
        "scaled_total_supply": 500_000_000_000,
        "scale_factor": WAD,
        "accrued_protocol_fees": 0,
        "total_deposited": 500_000_000_000,
        "total_borrowed": 0,
        "total_repaid": 0,
        "total_interest_repaid": 0,
        "last_accrual_timestamp": 1700000000,
        "settlement_factor_wad": 0,
        "bump": 254,
        "haircut_accumulator": 0,
    }
    defaults.update(overrides)
    return Market(**defaults)  # type: ignore[arg-type]


# ─── mul_wad ──────────────────────────────────────────────────


class TestMulWad:
    def test_basic_product(self) -> None:
        assert mul_wad(WAD * 2, WAD * 3) == WAD * 6

    def test_identity(self) -> None:
        value = 5 * WAD
        assert mul_wad(value, WAD) == value

    def test_zero_inputs(self) -> None:
        assert mul_wad(0, WAD) == 0
        assert mul_wad(WAD, 0) == 0
        assert mul_wad(0, 0) == 0

    def test_fractional(self) -> None:
        half = WAD // 2
        quarter = WAD // 4
        assert mul_wad(half, half) == quarter

    def test_overflow(self) -> None:
        max_u128 = (1 << 128) - 1
        with pytest.raises(MathOverflowError):
            mul_wad(max_u128, WAD * 2)


# ─── pow_wad ──────────────────────────────────────────────────


class TestPowWad:
    def test_exponent_zero(self) -> None:
        assert pow_wad(WAD * 2, 0) == WAD
        assert pow_wad(WAD * 100, 0) == WAD

    def test_exponent_one(self) -> None:
        base = WAD * 3
        assert pow_wad(base, 1) == base

    def test_square(self) -> None:
        assert pow_wad(WAD * 2, 2) == WAD * 4

    def test_base_wad(self) -> None:
        assert pow_wad(WAD, 365) == WAD

    def test_large_exponent(self) -> None:
        base = WAD + WAD // 10_000  # 1.0001
        result = pow_wad(base, 365)
        assert result > WAD
        assert result < WAD * 2


# ─── growth_factor_wad ────────────────────────────────────────


class TestGrowthFactorWad:
    def test_zero_elapsed(self) -> None:
        assert growth_factor_wad(1000, 0) == WAD

    def test_negative_elapsed(self) -> None:
        assert growth_factor_wad(1000, -1) == WAD

    def test_sub_day(self) -> None:
        result = growth_factor_wad(1000, 43_200)
        assert result > WAD
        assert result < WAD + WAD // 100

    def test_one_day(self) -> None:
        assert growth_factor_wad(1000, SECONDS_PER_DAY) == 1_000_273_972_602_739_726

    def test_combined_compound_and_linear(self) -> None:
        one_day = growth_factor_wad(1000, SECONDS_PER_DAY)
        half_day = growth_factor_wad(1000, 43_200)
        combined = growth_factor_wad(1000, SECONDS_PER_DAY + 43_200)
        assert combined > one_day
        assert combined > half_day

    def test_zero_rate(self) -> None:
        assert growth_factor_wad(0, SECONDS_PER_DAY * 365) == WAD


# ─── golden vectors ──────────────────────────────────────────


class TestGoldenVectors:
    @pytest.mark.parametrize("label,bps,elapsed,expected", GOLDEN_VECTORS)
    def test_matches_rust(
        self, label: str, bps: int, elapsed: int, expected: int
    ) -> None:
        result = growth_factor_wad(bps, elapsed)
        assert result == expected, f"{label}: got {result}, expected {expected}"


# ─── calculate_scaled_amount ─────────────────────────────────


class TestCalculateScaledAmount:
    def test_identity(self) -> None:
        assert calculate_scaled_amount(1_000_000, WAD) == 1_000_000

    def test_with_interest(self) -> None:
        scale_factor = WAD * 11 // 10
        scaled = calculate_scaled_amount(1_000_000, scale_factor)
        assert scaled < 1_000_000

    def test_zero_scale_factor(self) -> None:
        with pytest.raises(ValueError, match="zero"):
            calculate_scaled_amount(1000, 0)

    def test_negative_amount(self) -> None:
        with pytest.raises(ValueError, match="negative"):
            calculate_scaled_amount(-1, WAD)

    def test_negative_scale_factor(self) -> None:
        with pytest.raises(ValueError, match="negative"):
            calculate_scaled_amount(1000, -1)

    def test_overflow(self) -> None:
        huge = (1 << 128)
        with pytest.raises(MathOverflowError):
            calculate_scaled_amount(huge, WAD)


# ─── calculate_normalized_amount ─────────────────────────────


class TestCalculateNormalizedAmount:
    def test_identity(self) -> None:
        assert calculate_normalized_amount(1_000_000, WAD) == 1_000_000

    def test_with_interest(self) -> None:
        scale_factor = WAD * 11 // 10
        normalized = calculate_normalized_amount(1_000_000, scale_factor)
        assert normalized == 1_100_000

    def test_inverse_of_scaled(self) -> None:
        amount = 1_000_000
        scale_factor = WAD * 105 // 100
        scaled = calculate_scaled_amount(amount, scale_factor)
        normalized = calculate_normalized_amount(scaled, scale_factor)
        assert amount - 1 <= normalized <= amount

    def test_negative_scaled(self) -> None:
        with pytest.raises(ValueError, match="negative"):
            calculate_normalized_amount(-1, WAD)

    def test_negative_scale_factor(self) -> None:
        with pytest.raises(ValueError, match="negative"):
            calculate_normalized_amount(1000, -1)


# ─── calculate_settlement_payout ─────────────────────────────


class TestCalculateSettlementPayout:
    def test_full_payout(self) -> None:
        assert calculate_settlement_payout(1_000_000, WAD, WAD) == 1_000_000

    def test_with_interest(self) -> None:
        # 10% interest: scale_factor = 1.10 WAD, fully funded
        scale_factor = WAD * 110 // 100
        assert calculate_settlement_payout(1_000_000, scale_factor, WAD) == 1_100_000

    def test_half_payout(self) -> None:
        assert calculate_settlement_payout(1_000_000, WAD, WAD // 2) == 500_000

    def test_zero_factor(self) -> None:
        assert calculate_settlement_payout(1_000_000, WAD, 0) == 0


# ─── calculate_apr ───────────────────────────────────────────


class TestCalculateAPR:
    def test_five_percent(self) -> None:
        assert calculate_apr(500) == pytest.approx(0.05)

    def test_ten_percent(self) -> None:
        assert calculate_apr(1000) == pytest.approx(0.10)

    def test_hundred_percent(self) -> None:
        assert calculate_apr(10_000) == pytest.approx(1.0)

    def test_zero(self) -> None:
        assert calculate_apr(0) == 0.0


# ─── estimate_interest_accrual ───────────────────────────────


class TestEstimateInterestAccrual:
    def test_golden_vectors(self) -> None:
        start_ts = 1_700_000_000
        for label, bps, elapsed, expected_sf in GOLDEN_VECTORS:
            market = _mock_market(
                annual_interest_bps=bps,
                scale_factor=WAD,
                last_accrual_timestamp=start_ts,
                maturity_timestamp=start_ts + elapsed,
            )
            result = estimate_interest_accrual(market, start_ts + elapsed)
            assert result.new_scale_factor == expected_sf, label

    def test_no_time_elapsed(self) -> None:
        market = _mock_market(last_accrual_timestamp=1_700_000_000)
        result = estimate_interest_accrual(market, 1_700_000_000)
        assert result.new_scale_factor == WAD
        assert result.interest_delta == 0
        assert result.fee_amount == 0

    def test_before_last_accrual(self) -> None:
        market = _mock_market(last_accrual_timestamp=1_700_000_000)
        result = estimate_interest_accrual(market, 1_699_999_999)
        assert result.new_scale_factor == WAD
        assert result.interest_delta == 0

    def test_caps_at_maturity(self) -> None:
        market = _mock_market(
            annual_interest_bps=1000,
            scale_factor=WAD,
            last_accrual_timestamp=1_700_000_000,
            maturity_timestamp=1_700_000_000 + 31_536_000,
        )
        result = estimate_interest_accrual(
            market, 1_700_000_000 + 31_536_000 + 15_768_000
        )
        expected = GOLDEN_VECTORS[0][3]
        assert result.new_scale_factor == expected
        assert result.capped_timestamp == 1_700_000_000 + 31_536_000

    def test_zero_rate(self) -> None:
        market = _mock_market(annual_interest_bps=0)
        result = estimate_interest_accrual(market, 1_700_000_000 + 31_536_000)
        assert result.interest_delta == 0
        assert result.new_scale_factor == WAD


# ─── estimate_value_at_maturity ──────────────────────────────


class TestEstimateValueAtMaturity:
    def test_at_maturity(self) -> None:
        sf = WAD * 11 // 10
        value = estimate_value_at_maturity(
            1_000_000, sf, 1000, 1_700_000_000, 1_700_000_000
        )
        assert value == (1_000_000 * sf) // WAD

    def test_past_maturity(self) -> None:
        sf = WAD * 11 // 10
        value = estimate_value_at_maturity(
            1_000_000, sf, 1000, 1_700_000_100, 1_700_000_000
        )
        assert value == (1_000_000 * sf) // WAD

    def test_zero_balance(self) -> None:
        value = estimate_value_at_maturity(
            0, WAD, 1000, 1_700_000_000, 1_700_000_000 + 31_536_000
        )
        assert value == 0


# ─── calculate_available_vault_balance ───────────────────────


class TestCalculateAvailableVaultBalance:
    def test_full_deposits(self) -> None:
        market = _mock_market(
            total_deposited=1_000_000, total_borrowed=0, total_repaid=0
        )
        assert calculate_available_vault_balance(market) == 1_000_000

    def test_with_borrows(self) -> None:
        market = _mock_market(
            total_deposited=1_000_000, total_borrowed=400_000, total_repaid=0
        )
        assert calculate_available_vault_balance(market) == 600_000

    def test_with_repayments(self) -> None:
        market = _mock_market(
            total_deposited=1_000_000, total_borrowed=400_000, total_repaid=200_000
        )
        assert calculate_available_vault_balance(market) == 800_000

    def test_fully_repaid(self) -> None:
        market = _mock_market(
            total_deposited=1_000_000, total_borrowed=500_000, total_repaid=500_000
        )
        assert calculate_available_vault_balance(market) == 1_000_000

    def test_zero_deposits(self) -> None:
        market = _mock_market(
            total_deposited=0, total_borrowed=0, total_repaid=0
        )
        assert calculate_available_vault_balance(market) == 0


# ─── calculate_utilization_rate ──────────────────────────────


class TestCalculateUtilizationRate:
    def test_no_borrows(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=0,
            total_repaid=0,
        )
        result = calculate_utilization_rate(market)
        assert result.bps == 0
        assert result.decimal == 0.0

    def test_zero_supply(self) -> None:
        market = _mock_market(scaled_total_supply=0, total_borrowed=0, total_repaid=0)
        result = calculate_utilization_rate(market)
        assert result.bps == 0

    def test_fifty_percent(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=500_000,
            total_repaid=0,
        )
        result = calculate_utilization_rate(market)
        assert result.bps == 5000
        assert result.decimal == pytest.approx(0.5)

    def test_hundred_percent(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=1_000_000,
            total_repaid=0,
        )
        result = calculate_utilization_rate(market)
        assert result.bps == 10_000
        assert result.decimal == pytest.approx(1.0)

    def test_caps_at_hundred(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=1_500_000,
            total_repaid=0,
        )
        result = calculate_utilization_rate(market)
        assert result.bps == 10_000
        assert result.decimal == 1.0

    def test_principal_repaid_exceeds_borrowed(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=100_000,
            total_repaid=200_000,
            total_interest_repaid=0,
        )
        # principal_repaid = 200k - 0 = 200k >= borrowed 100k → 0
        result = calculate_utilization_rate(market)
        assert result.bps == 0

    def test_interest_only_repayment_does_not_reduce_utilization(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=500_000,
            total_repaid=50_000,
            total_interest_repaid=50_000,
        )
        # principal_repaid = 50k - 50k = 0, outstanding = 500k → 50%
        result = calculate_utilization_rate(market)
        assert result.bps == 5000
        assert result.decimal == pytest.approx(0.5)

    def test_mixed_repayment(self) -> None:
        market = _mock_market(
            scaled_total_supply=1_000_000,
            total_borrowed=500_000,
            total_repaid=200_000,
            total_interest_repaid=50_000,
        )
        # principal_repaid = 200k - 50k = 150k, outstanding = 500k - 150k = 350k
        # utilization = 350k / 1M = 35% = 3500 bps
        result = calculate_utilization_rate(market)
        assert result.bps == 3500
        assert result.decimal == pytest.approx(0.35)


# ─── safe_divide / overflow checks ──────────────────────────


class TestUtilities:
    def test_safe_divide(self) -> None:
        assert safe_divide(100, 10) == 10
        assert safe_divide(100, 0) == 0

    def test_would_overflow_u64(self) -> None:
        assert not would_overflow_u64(0)
        assert not would_overflow_u64((1 << 64) - 1)
        assert would_overflow_u64(1 << 64)

    def test_would_overflow_u128(self) -> None:
        assert not would_overflow_u128(0)
        assert not would_overflow_u128((1 << 128) - 1)
        assert would_overflow_u128(1 << 128)
