//! Math utilities for CoalesceFi protocol calculations.
//!
//! All functions use WAD precision (10^18) for lossless fixed-point arithmetic,
//! matching the on-chain Rust implementation exactly.
//!
//! IMPORTANT: These functions must produce identical results to the Rust
//! implementations in `program/src/`. Any divergence will cause UI/on-chain
//! mismatches.

use crate::constants::{BPS, SECONDS_PER_YEAR, WAD};
use crate::types::Market;

/// Seconds per day (86,400).
pub const SECONDS_PER_DAY: u64 = 86_400;

/// Days per year (365).
pub const DAYS_PER_YEAR: u64 = 365;

/// Maximum u128 value.
const MAX_U128: u128 = u128::MAX;

/// Error type for math operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MathError {
    /// Intermediate product exceeds u128.
    MulWadOverflow,
    /// Scale factor is zero.
    ZeroScaleFactor,
    /// Amount overflow: value too large for u128.
    AmountOverflow,
}

impl core::fmt::Display for MathError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            MathError::MulWadOverflow => {
                write!(f, "mulWad overflow: intermediate product exceeds u128")
            }
            MathError::ZeroScaleFactor => write!(f, "Scale factor cannot be zero"),
            MathError::AmountOverflow => {
                write!(f, "Amount overflow: value too large for u128")
            }
        }
    }
}

/// WAD-precision multiplication: (a * b) / WAD.
///
/// Returns `Err(MathError::MulWadOverflow)` if the intermediate product exceeds u128.
pub fn mul_wad(a: u128, b: u128) -> Result<u128, MathError> {
    let product = a.checked_mul(b).ok_or(MathError::MulWadOverflow)?;
    Ok(product / WAD)
}

/// WAD-precision exponentiation via binary exponentiation.
///
/// Computes `base^exp` where base is in WAD format.
pub fn pow_wad(base: u128, exp: u64) -> Result<u128, MathError> {
    let mut result = WAD;
    let mut b = base;
    let mut e = exp;

    while e > 0 {
        if e & 1 == 1 {
            result = mul_wad(result, b)?;
        }
        e >>= 1;
        if e > 0 {
            b = mul_wad(b, b)?;
        }
    }

    Ok(result)
}

/// Compute the growth factor for interest accrual.
///
/// Uses daily compounding for whole days and linear interpolation for
/// the sub-day remainder, matching the on-chain implementation exactly:
///
/// ```text
/// growth = (1 + annual_rate/365)^whole_days
///        * (1 + annual_rate * remaining_seconds / SECONDS_PER_YEAR)
/// ```
pub fn growth_factor_wad(annual_rate_bps: u64, elapsed_seconds: u64) -> Result<u128, MathError> {
    if elapsed_seconds == 0 {
        return Ok(WAD);
    }

    let whole_days = elapsed_seconds / SECONDS_PER_DAY;
    let remaining_seconds = elapsed_seconds % SECONDS_PER_DAY;

    let bps = BPS as u128;
    let daily_rate_wad = (annual_rate_bps as u128 * WAD) / (DAYS_PER_YEAR as u128 * bps);
    let daily_base_wad = WAD + daily_rate_wad;
    let days_growth_wad = pow_wad(daily_base_wad, whole_days)?;

    let remaining_delta_wad = (annual_rate_bps as u128 * remaining_seconds as u128 * WAD)
        / (SECONDS_PER_YEAR as u128 * bps);
    let remaining_growth_wad = WAD + remaining_delta_wad;

    mul_wad(days_growth_wad, remaining_growth_wad)
}

/// Calculate scaled amount from normalized amount and scale factor.
///
/// `scaled_amount = amount * WAD / scale_factor`
///
/// Converts a token amount to shares using the current scale factor.
///
/// IMPORTANT: This must match the Rust implementation in deposit.rs exactly.
pub fn calculate_scaled_amount(amount: u64, scale_factor: u128) -> Result<u128, MathError> {
    if scale_factor == 0 {
        return Err(MathError::ZeroScaleFactor);
    }
    let product = (amount as u128)
        .checked_mul(WAD)
        .ok_or(MathError::AmountOverflow)?;
    Ok(product / scale_factor)
}

/// Calculate normalized amount from scaled amount and scale factor.
///
/// `normalized_amount = scaled_amount * scale_factor / WAD`
///
/// Converts shares back to token amount using the current scale factor.
///
/// IMPORTANT: This must match the Rust implementation in withdraw.rs exactly.
pub fn calculate_normalized_amount(
    scaled_amount: u128,
    scale_factor: u128,
) -> Result<u128, MathError> {
    let product = scaled_amount
        .checked_mul(scale_factor)
        .ok_or(MathError::AmountOverflow)?;
    Ok(product / WAD)
}

/// Calculate the settlement payout for a given scaled balance.
///
/// On-chain two-step computation (withdraw.rs lines 241-251):
///   1. `normalized = scaled_balance * scale_factor / WAD`
///   2. `payout = normalized * settlement_factor / WAD`
///
/// Settlement factor is `max(1, min(WAD, vault_balance * WAD / total_normalized))`.
/// Capped at WAD (not scale_factor). Fully funded = WAD (100% payout).
///
/// The settlement factor is computed from the full vault balance (no fee
/// reservation). Fees are guarded separately in `collect_fees` (COAL-C01).
/// When lenders withdraw at a haircut, the gap is tracked in a
/// `haircut_accumulator` to prevent `re_settle` from inflating the factor
/// for remaining lenders (COAL-H01).
pub fn calculate_settlement_payout(
    scaled_balance: u128,
    scale_factor_wad: u128,
    settlement_factor_wad: u128,
) -> u128 {
    let normalized = (scaled_balance * scale_factor_wad) / WAD;
    (normalized * settlement_factor_wad) / WAD
}

/// Result of interest accrual estimation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InterestAccrualResult {
    /// Estimated scale factor after accrual.
    pub new_scale_factor: u128,
    /// Change in scale factor (WAD-space, not token amounts).
    pub interest_delta: u128,
    /// Fee amount (0 for estimates without protocol config).
    pub fee_amount: u64,
    /// Timestamp used for accrual (capped at maturity).
    pub capped_timestamp: i64,
}

/// Estimate interest accrual for a market.
///
/// Mirrors the on-chain interest.rs logic for UI preview.
/// Interest is capped at the maturity timestamp.
pub fn estimate_interest_accrual(
    market: &Market,
    current_timestamp: i64,
) -> Result<InterestAccrualResult, MathError> {
    let maturity = market.maturity_timestamp();
    let capped_timestamp = if current_timestamp > maturity {
        maturity
    } else {
        current_timestamp
    };

    let last_accrual = market.last_accrual_timestamp();
    if capped_timestamp <= last_accrual {
        return Ok(InterestAccrualResult {
            new_scale_factor: market.scale_factor(),
            interest_delta: 0,
            fee_amount: 0,
            capped_timestamp,
        });
    }

    let time_elapsed = (capped_timestamp - last_accrual) as u64;
    let annual_rate_bps = market.annual_interest_bps() as u64;

    let total_growth_wad = growth_factor_wad(annual_rate_bps, time_elapsed)?;
    let new_scale_factor = mul_wad(market.scale_factor(), total_growth_wad)?;

    // Calculate interestDelta in WAD-space (scale factor units, not token amounts)
    let interest_delta = new_scale_factor - market.scale_factor();

    Ok(InterestAccrualResult {
        new_scale_factor,
        interest_delta,
        fee_amount: 0,
        capped_timestamp,
    })
}

/// Calculate the current normalized value of a lender's position.
pub fn calculate_position_value(
    scaled_balance: u128,
    scale_factor: u128,
) -> Result<u128, MathError> {
    calculate_normalized_amount(scaled_balance, scale_factor)
}

/// Calculate the APR from annual interest rate in basis points.
///
/// Returns as a decimal (e.g., 0.05 for 5% APR).
pub fn calculate_apr(annual_interest_bps: u16) -> f64 {
    annual_interest_bps as f64 / 10000.0
}

/// Calculate the estimated value at maturity for a position.
pub fn estimate_value_at_maturity(
    scaled_balance: u128,
    current_scale_factor: u128,
    annual_interest_bps: u16,
    current_timestamp: i64,
    maturity_timestamp: i64,
) -> Result<u128, MathError> {
    if current_timestamp >= maturity_timestamp {
        return calculate_normalized_amount(scaled_balance, current_scale_factor);
    }

    let time_remaining = (maturity_timestamp - current_timestamp) as u64;
    let growth = growth_factor_wad(annual_interest_bps as u64, time_remaining)?;
    let estimated_scale_factor = mul_wad(current_scale_factor, growth)?;

    calculate_normalized_amount(scaled_balance, estimated_scale_factor)
}

/// Calculate the total supply in normalized terms.
pub fn calculate_total_supply(
    scaled_total_supply: u128,
    scale_factor: u128,
) -> Result<u128, MathError> {
    calculate_normalized_amount(scaled_total_supply, scale_factor)
}

/// Calculate available vault balance (deposits - borrows + repayments).
///
/// **Deprecated:** This is a counter-based approximation. The on-chain program
/// uses actual vault token balances for borrowability. Prefer reading the vault
/// token account balance directly via RPC. This value may diverge after fee
/// collection, withdraw-excess, force-close, or withdrawal payouts.
pub fn calculate_available_vault_balance(market: &Market) -> u64 {
    let available = u128::from(market.total_deposited()) + u128::from(market.total_repaid());
    let net = available.saturating_sub(u128::from(market.total_borrowed()));
    net.min(u128::from(u64::MAX)) as u64
}

/// Result of utilization rate calculation.
#[derive(Debug, Clone, PartialEq)]
pub struct UtilizationRateResult {
    /// Utilization rate as basis points (0-10000).
    pub bps: u64,
    /// Utilization rate as a decimal (0.0-1.0). Convenience value for display.
    pub decimal: f64,
}

/// Calculate utilization rate with full precision.
///
/// `utilization = outstandingPrincipal / totalSupply`
///
/// Uses principal-only outstanding (totalBorrowed minus principal portion of
/// repayments) so that interest-only repayments do not artificially reduce
/// utilization. This matches the TypeScript/web/mobile implementations.
pub fn calculate_utilization_rate(market: &Market) -> Result<UtilizationRateResult, MathError> {
    let total_supply = calculate_total_supply(market.scaled_total_supply(), market.scale_factor())?;
    if total_supply == 0 {
        return Ok(UtilizationRateResult {
            bps: 0,
            decimal: 0.0,
        });
    }

    let borrowed = market.total_borrowed();
    let repaid = market.total_repaid();
    let interest_repaid = market.total_interest_repaid();
    let principal_repaid = if repaid > interest_repaid {
        repaid - interest_repaid
    } else {
        0
    };
    if principal_repaid >= borrowed {
        return Ok(UtilizationRateResult {
            bps: 0,
            decimal: 0.0,
        });
    }

    let net_borrowed = (borrowed - principal_repaid) as u128;
    let bps_val = BPS as u128;

    let scaled_borrowed = net_borrowed
        .checked_mul(bps_val)
        .ok_or(MathError::AmountOverflow)?;

    let utilization_bps = scaled_borrowed / total_supply;
    let capped_bps = if utilization_bps > bps_val {
        bps_val
    } else {
        utilization_bps
    };

    let decimal = capped_bps as f64 / bps_val as f64;

    Ok(UtilizationRateResult {
        bps: capped_bps as u64,
        decimal,
    })
}

/// Safe division that returns 0 if divisor is 0.
pub fn safe_divide(numerator: u128, denominator: u128) -> u128 {
    if denominator == 0 {
        return 0;
    }
    numerator / denominator
}

/// Check if a value would overflow u64.
pub fn would_overflow_u64(value: u128) -> bool {
    value > u64::MAX as u128
}

/// Check if a value would overflow u128.
///
/// For u128 inputs this always returns false (the type itself can't overflow).
/// This exists for API parity with the TypeScript SDK where BigInt has no upper bound.
pub fn would_overflow_u128(value: u128) -> bool {
    value > MAX_U128
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Market;
    use bytemuck::Zeroable;

    // Golden vectors from `program/tests/cross_compilation_tests.rs`
    const GOLDEN_VECTORS: &[(u64, u64, u128)] = &[
        // (annual_interest_bps, elapsed_seconds, expected_scale_factor)
        (1000, 31_536_000, 1_105_155_781_616_264_095), // V1: 10% APR, 1 year
        (1000, 86_400, 1_000_273_972_602_739_726),     // V2: 10% APR, 1 day
        (1000, 43_200, 1_000_136_986_301_369_863),     // V3: 10% APR, 12 hours
        (10_000, 31_536_000, 2_714_567_482_021_873_489), // V4: 100% APR, 1 year
        (1, 31_536_000, 1_000_100_004_986_466_169),    // V5: 0.01% APR, 1 year
    ];

    #[test]
    fn test_mul_wad_basic() {
        // 2.0 * 3.0 = 6.0
        assert_eq!(mul_wad(WAD * 2, WAD * 3).unwrap(), WAD * 6);
    }

    #[test]
    fn test_mul_wad_identity() {
        let value = 5 * WAD;
        assert_eq!(mul_wad(value, WAD).unwrap(), value);
    }

    #[test]
    fn test_mul_wad_zero() {
        assert_eq!(mul_wad(0, WAD).unwrap(), 0);
        assert_eq!(mul_wad(WAD, 0).unwrap(), 0);
    }

    #[test]
    fn test_mul_wad_fractional() {
        let half = WAD / 2;
        let quarter = WAD / 4;
        assert_eq!(mul_wad(half, half).unwrap(), quarter);
    }

    #[test]
    fn test_mul_wad_overflow() {
        assert!(mul_wad(u128::MAX, WAD * 2).is_err());
    }

    #[test]
    fn test_pow_wad_exponent_zero() {
        assert_eq!(pow_wad(WAD * 2, 0).unwrap(), WAD);
        assert_eq!(pow_wad(WAD * 100, 0).unwrap(), WAD);
    }

    #[test]
    fn test_pow_wad_exponent_one() {
        let base = WAD * 3;
        assert_eq!(pow_wad(base, 1).unwrap(), base);
    }

    #[test]
    fn test_pow_wad_square() {
        assert_eq!(pow_wad(WAD * 2, 2).unwrap(), WAD * 4);
    }

    #[test]
    fn test_pow_wad_base_wad() {
        assert_eq!(pow_wad(WAD, 365).unwrap(), WAD);
    }

    #[test]
    fn test_growth_factor_zero_elapsed() {
        assert_eq!(growth_factor_wad(1000, 0).unwrap(), WAD);
    }

    #[test]
    fn test_growth_factor_zero_rate() {
        assert_eq!(growth_factor_wad(0, SECONDS_PER_DAY * 365).unwrap(), WAD);
    }

    #[test]
    fn test_growth_factor_one_day() {
        assert_eq!(
            growth_factor_wad(1000, SECONDS_PER_DAY).unwrap(),
            1_000_273_972_602_739_726
        );
    }

    #[test]
    fn test_growth_factor_sub_day() {
        let result = growth_factor_wad(1000, 43_200).unwrap();
        assert!(result > WAD);
        assert!(result < WAD + WAD / 100);
    }

    #[test]
    fn test_golden_vectors() {
        for &(bps, elapsed, expected) in GOLDEN_VECTORS {
            let result = growth_factor_wad(bps, elapsed).unwrap();
            assert_eq!(
                result, expected,
                "Vector failed: bps={}, elapsed={}",
                bps, elapsed
            );
        }
    }

    #[test]
    fn test_calculate_scaled_amount_identity() {
        assert_eq!(calculate_scaled_amount(1_000_000, WAD).unwrap(), 1_000_000);
    }

    #[test]
    fn test_calculate_scaled_amount_with_interest() {
        let scale_factor = WAD * 11 / 10; // 1.1
        let scaled = calculate_scaled_amount(1_000_000, scale_factor).unwrap();
        assert!(scaled < 1_000_000);
    }

    #[test]
    fn test_calculate_scaled_amount_zero_factor() {
        assert!(calculate_scaled_amount(1000, 0).is_err());
    }

    #[test]
    fn test_calculate_normalized_amount_identity() {
        assert_eq!(
            calculate_normalized_amount(1_000_000, WAD).unwrap(),
            1_000_000
        );
    }

    #[test]
    fn test_calculate_normalized_amount_with_interest() {
        let scale_factor = WAD * 11 / 10; // 1.1
        let normalized = calculate_normalized_amount(1_000_000, scale_factor).unwrap();
        assert_eq!(normalized, 1_100_000);
    }

    #[test]
    fn test_scaled_normalized_inverse() {
        let amount = 1_000_000u64;
        let scale_factor = WAD * 105 / 100; // 1.05
        let scaled = calculate_scaled_amount(amount, scale_factor).unwrap();
        let normalized = calculate_normalized_amount(scaled, scale_factor).unwrap();
        // Allow 1 unit of rounding error
        assert!(normalized >= amount as u128 - 1 && normalized <= amount as u128);
    }

    #[test]
    fn test_settlement_payout_full() {
        assert_eq!(calculate_settlement_payout(1_000_000, WAD, WAD), 1_000_000);
    }

    #[test]
    fn test_settlement_payout_with_interest() {
        // 10% interest: scale_factor = 1.10 WAD, fully funded
        let scale_factor = WAD * 110 / 100;
        assert_eq!(
            calculate_settlement_payout(1_000_000, scale_factor, WAD),
            1_100_000
        );
    }

    #[test]
    fn test_settlement_payout_partial() {
        assert_eq!(
            calculate_settlement_payout(1_000_000, WAD, WAD / 2),
            500_000
        );
    }

    #[test]
    fn test_settlement_payout_zero() {
        assert_eq!(calculate_settlement_payout(1_000_000, WAD, 0), 0);
    }

    #[test]
    fn test_calculate_apr() {
        assert!((calculate_apr(500) - 0.05).abs() < f64::EPSILON);
        assert!((calculate_apr(1000) - 0.10).abs() < f64::EPSILON);
        assert!((calculate_apr(10000) - 1.0).abs() < f64::EPSILON);
        assert!((calculate_apr(0) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_calculate_available_vault_balance_clamps_after_full_expression() {
        let mut market = Market::zeroed();
        market.total_deposited = 100u64.to_le_bytes();
        market.total_borrowed = 200u64.to_le_bytes();
        market.total_repaid = 150u64.to_le_bytes();

        assert_eq!(calculate_available_vault_balance(&market), 50);
    }

    #[test]
    fn test_safe_divide() {
        assert_eq!(safe_divide(100, 10), 10);
        assert_eq!(safe_divide(100, 0), 0);
    }

    #[test]
    fn test_would_overflow_u64() {
        assert!(!would_overflow_u64(0));
        assert!(!would_overflow_u64(u64::MAX as u128));
        assert!(would_overflow_u64(u64::MAX as u128 + 1));
    }

    #[test]
    fn test_would_overflow_u128() {
        // u128 can't actually exceed MAX_U128 in Rust
        assert!(!would_overflow_u128(0));
        assert!(!would_overflow_u128(u128::MAX));
    }
}
