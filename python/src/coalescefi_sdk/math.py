"""
Math utilities for CoalesceFi protocol calculations.

All functions use WAD precision (10^18) for lossless fixed-point arithmetic,
matching the on-chain Rust implementation exactly.

IMPORTANT: These functions must produce identical results to the Rust
implementations in `program/src/`. Any divergence will cause UI/on-chain
mismatches.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from .constants import BPS, SECONDS_PER_YEAR, WAD

if TYPE_CHECKING:
    from .types import Market

SECONDS_PER_DAY: int = 86_400
DAYS_PER_YEAR: int = 365

MAX_U128: int = (1 << 128) - 1


class MathOverflowError(ArithmeticError):
    """Raised when an intermediate calculation exceeds u128."""


def mul_wad(a: int, b: int) -> int:
    """WAD-precision multiplication: (a * b) / WAD.

    Raises:
        MathOverflowError: If the intermediate product exceeds u128.
    """
    product = a * b
    if product > MAX_U128:
        raise MathOverflowError("mulWad overflow: intermediate product exceeds u128")
    return product // WAD


def pow_wad(base: int, exp: int) -> int:
    """WAD-precision exponentiation via binary exponentiation.

    Args:
        base: Base value in WAD format.
        exp: Non-negative integer exponent.

    Returns:
        base^exp in WAD format.
    """
    result = WAD
    b = base
    e = exp

    while e > 0:
        if e & 1 == 1:
            result = mul_wad(result, b)
        e >>= 1
        if e > 0:
            b = mul_wad(b, b)

    return result


def growth_factor_wad(annual_rate_bps: int, elapsed_seconds: int) -> int:
    """Compute the growth factor for interest accrual.

    Uses daily compounding for whole days and linear interpolation for
    the sub-day remainder, matching the on-chain implementation exactly::

        growth = (1 + annual_rate/365)^whole_days
               * (1 + annual_rate * remaining_seconds / SECONDS_PER_YEAR)

    Args:
        annual_rate_bps: Annual interest rate in basis points.
        elapsed_seconds: Time elapsed in seconds.

    Returns:
        Growth factor in WAD format.
    """
    if elapsed_seconds <= 0:
        return WAD

    whole_days = elapsed_seconds // SECONDS_PER_DAY
    remaining_seconds = elapsed_seconds % SECONDS_PER_DAY

    daily_rate_wad = (annual_rate_bps * WAD) // (DAYS_PER_YEAR * BPS)
    daily_base_wad = WAD + daily_rate_wad
    days_growth_wad = pow_wad(daily_base_wad, whole_days)

    remaining_delta_wad = (annual_rate_bps * remaining_seconds * WAD) // (
        SECONDS_PER_YEAR * BPS
    )
    remaining_growth_wad = WAD + remaining_delta_wad

    return mul_wad(days_growth_wad, remaining_growth_wad)


def calculate_scaled_amount(amount: int, scale_factor: int) -> int:
    """Calculate scaled amount from normalized amount and scale factor.

    ``scaled_amount = amount * WAD / scale_factor``

    Converts a token amount to shares using the current scale factor.

    IMPORTANT: This must match the Rust implementation in deposit.rs exactly.

    Args:
        amount: Token amount in base units (e.g., 1000000 for 1 USDC).
        scale_factor: Current market scale factor (WAD format, 18 decimals).

    Returns:
        Scaled token amount (sTokens).

    Raises:
        ValueError: If scale_factor is zero or inputs are negative.
        MathOverflowError: If the intermediate product exceeds u128.
    """
    if scale_factor == 0:
        raise ValueError("Scale factor cannot be zero")
    if amount < 0:
        raise ValueError("Amount cannot be negative")
    if scale_factor < 0:
        raise ValueError("Scale factor cannot be negative")

    product = amount * WAD
    if product > MAX_U128:
        raise MathOverflowError("Amount overflow: value too large for u128")

    return product // scale_factor


def calculate_normalized_amount(scaled_amount: int, scale_factor: int) -> int:
    """Calculate normalized amount from scaled amount and scale factor.

    ``normalized_amount = scaled_amount * scale_factor / WAD``

    Converts shares back to token amount using the current scale factor.

    IMPORTANT: This must match the Rust implementation in withdraw.rs exactly.

    Args:
        scaled_amount: Scaled token balance (sTokens).
        scale_factor: Current market scale factor (WAD format, 18 decimals).

    Returns:
        Token amount in base units.

    Raises:
        ValueError: If inputs are negative.
        MathOverflowError: If the intermediate product exceeds u128.
    """
    if scaled_amount < 0:
        raise ValueError("Scaled amount cannot be negative")
    if scale_factor < 0:
        raise ValueError("Scale factor cannot be negative")

    product = scaled_amount * scale_factor
    if product > MAX_U128:
        raise MathOverflowError("Amount overflow: value too large for u128")

    return product // WAD


def calculate_settlement_payout(
    scaled_balance: int,
    scale_factor_wad: int,
    settlement_factor_wad: int,
) -> int:
    """Calculate the settlement payout for a given scaled balance.

    On-chain two-step computation (withdraw.rs lines 241-251)::

        normalized = scaled_balance * scale_factor / WAD
        payout = normalized * settlement_factor / WAD

    Settlement factor is ``max(1, min(WAD, vault * WAD / total_normalized))``.
    Capped at WAD (not scale_factor). Fully funded = WAD (100% payout).

    The settlement factor is computed from the full vault balance (no fee
    reservation). Fees are guarded separately in ``collect_fees`` (COAL-C01).
    When lenders withdraw at a haircut, the gap is tracked in a
    ``haircut_accumulator`` to prevent ``re_settle`` from inflating the factor
    for remaining lenders (COAL-H01).

    Args:
        scaled_balance: User's scaled token balance (sTokens).
        scale_factor_wad: Current scale factor (WAD format).
        settlement_factor_wad: Locked settlement factor (WAD format).

    Returns:
        Actual payout amount.
    """
    normalized = (scaled_balance * scale_factor_wad) // WAD
    return (normalized * settlement_factor_wad) // WAD


@dataclass
class InterestAccrualResult:
    """Result of interest accrual estimation."""

    new_scale_factor: int
    """Estimated scale factor after accrual."""

    interest_delta: int
    """Change in scale factor (WAD-space, not token amounts)."""

    fee_amount: int
    """Fee amount (0 for estimates without protocol config)."""

    capped_timestamp: int
    """Timestamp used for accrual (capped at maturity)."""


def estimate_interest_accrual(
    market: Market,
    current_timestamp: int,
) -> InterestAccrualResult:
    """Estimate interest accrual for a market.

    Mirrors the on-chain interest.rs logic for UI preview.
    Interest is capped at the maturity timestamp.

    Args:
        market: Market state including current scale factor and interest rate.
        current_timestamp: Current unix timestamp (seconds).

    Returns:
        Estimated values after accrual.
    """
    capped_timestamp = min(current_timestamp, market.maturity_timestamp)

    if capped_timestamp <= market.last_accrual_timestamp:
        return InterestAccrualResult(
            new_scale_factor=market.scale_factor,
            interest_delta=0,
            fee_amount=0,
            capped_timestamp=capped_timestamp,
        )

    time_elapsed = capped_timestamp - market.last_accrual_timestamp
    annual_rate_bps = market.annual_interest_bps

    total_growth_wad = growth_factor_wad(annual_rate_bps, time_elapsed)
    new_scale_factor = mul_wad(market.scale_factor, total_growth_wad)

    # Calculate interestDelta in WAD-space (scale factor units, not token amounts)
    interest_delta = new_scale_factor - market.scale_factor

    return InterestAccrualResult(
        new_scale_factor=new_scale_factor,
        interest_delta=interest_delta,
        fee_amount=0,
        capped_timestamp=capped_timestamp,
    )


def calculate_position_value(scaled_balance: int, scale_factor: int) -> int:
    """Calculate the current normalized value of a lender's position."""
    return calculate_normalized_amount(scaled_balance, scale_factor)


def calculate_apr(annual_interest_bps: int) -> float:
    """Calculate the APR from annual interest rate in basis points.

    Returns as a decimal (e.g., 0.05 for 5% APR).
    """
    return annual_interest_bps / 10_000


def estimate_value_at_maturity(
    scaled_balance: int,
    current_scale_factor: int,
    annual_interest_bps: int,
    current_timestamp: int,
    maturity_timestamp: int,
) -> int:
    """Calculate the estimated value at maturity for a position."""
    if current_timestamp >= maturity_timestamp:
        return calculate_normalized_amount(scaled_balance, current_scale_factor)

    time_remaining = maturity_timestamp - current_timestamp
    growth = growth_factor_wad(annual_interest_bps, time_remaining)
    estimated_scale_factor = mul_wad(current_scale_factor, growth)

    return calculate_normalized_amount(scaled_balance, estimated_scale_factor)


def calculate_total_supply(scaled_total_supply: int, scale_factor: int) -> int:
    """Calculate the total supply in normalized terms."""
    return calculate_normalized_amount(scaled_total_supply, scale_factor)


def calculate_available_vault_balance(market: Market) -> int:
    """Calculate available vault balance (deposits - borrows + repayments).

    .. deprecated::
        This is a counter-based approximation. The on-chain program uses actual
        vault token balances for borrowability. Prefer reading the vault token
        account balance directly via RPC. This value may diverge after fee
        collection, withdraw-excess, force-close, or withdrawal payouts.
    """
    return max(market.total_deposited - market.total_borrowed + market.total_repaid, 0)


@dataclass
class UtilizationRateResult:
    """Result of utilization rate calculation."""

    bps: int
    """Utilization rate as basis points (0-10000)."""

    decimal: float
    """Utilization rate as a decimal (0-1). Convenience for display only."""


def calculate_utilization_rate(market: Market) -> UtilizationRateResult:
    """Calculate utilization rate with full precision.

    ``utilization = outstandingPrincipal / totalSupply``

    Uses principal-only outstanding (totalBorrowed minus principal portion of
    repayments) so that interest-only repayments do not artificially reduce
    utilization. This matches the TypeScript/web/mobile implementations.

    Args:
        market: The market to calculate utilization for.

    Returns:
        UtilizationRateResult with bps (precise) and decimal (display).
    """
    total_supply = calculate_total_supply(market.scaled_total_supply, market.scale_factor)
    if total_supply == 0:
        return UtilizationRateResult(bps=0, decimal=0.0)

    principal_repaid = max(market.total_repaid - market.total_interest_repaid, 0)
    borrowed = market.total_borrowed - principal_repaid
    if borrowed <= 0:
        return UtilizationRateResult(bps=0, decimal=0.0)

    scaled_borrowed = borrowed * BPS
    if scaled_borrowed > MAX_U128:
        raise MathOverflowError(
            "Utilization calculation overflow: borrowed amount too large for u128"
        )

    utilization_bps = scaled_borrowed // total_supply
    capped_bps = min(utilization_bps, BPS)
    decimal = capped_bps / BPS

    return UtilizationRateResult(bps=capped_bps, decimal=decimal)


def calculate_utilization_rate_decimal(market: Market) -> float:
    """Calculate utilization rate as a decimal number.

    Convenience wrapper. Use ``calculate_utilization_rate()`` for precise calculations.

    Args:
        market: The market to calculate utilization for.

    Returns:
        Utilization rate as a decimal (0-1).
    """
    return calculate_utilization_rate(market).decimal


def safe_divide(numerator: int, denominator: int) -> int:
    """Safe division that returns 0 if divisor is 0."""
    if denominator == 0:
        return 0
    return numerator // denominator


def would_overflow_u64(value: int) -> bool:
    """Check if a number would overflow u64."""
    return value > (1 << 64) - 1


def would_overflow_u128(value: int) -> bool:
    """Check if a number would overflow u128."""
    return value > MAX_U128
