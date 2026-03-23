/**
 * Math utilities for CoalesceFi protocol calculations.
 *
 * All functions use WAD precision (10^18) for lossless fixed-point arithmetic,
 * matching the on-chain Rust implementation exactly.
 *
 * IMPORTANT: These functions must produce identical results to the Rust
 * implementations in `program/src/`. Any divergence will cause UI/on-chain
 * mismatches. Changes here require re-validation against golden vectors
 * (see tests/math.test.ts).
 */

import { WAD, BPS, SECONDS_PER_YEAR } from './constants';

import type { Market } from './types';

export const SECONDS_PER_DAY = BigInt(86_400);
export const DAYS_PER_YEAR = BigInt(365);

const MAX_U128 = BigInt('340282366920938463463374607431768211455');

export function mulWad(a: bigint, b: bigint): bigint {
  const product = a * b;
  if (product > MAX_U128) {
    throw new Error('mulWad overflow: intermediate product exceeds u128');
  }
  return product / WAD;
}

export function powWad(base: bigint, exp: bigint): bigint {
  let result = WAD;
  let b = base;
  let e = exp;

  while (e > BigInt(0)) {
    if ((e & BigInt(1)) === BigInt(1)) {
      result = mulWad(result, b);
    }
    e >>= BigInt(1);
    if (e > BigInt(0)) {
      b = mulWad(b, b);
    }
  }

  return result;
}

export function growthFactorWad(annualRateBps: bigint, elapsedSeconds: bigint): bigint {
  if (elapsedSeconds <= BigInt(0)) {
    return WAD;
  }

  const wholeDays = elapsedSeconds / SECONDS_PER_DAY;
  const remainingSeconds = elapsedSeconds % SECONDS_PER_DAY;

  const dailyRateWad = (annualRateBps * WAD) / (DAYS_PER_YEAR * BPS);
  const dailyBaseWad = WAD + dailyRateWad;
  const daysGrowthWad = powWad(dailyBaseWad, wholeDays);

  const remainingDeltaWad = (annualRateBps * remainingSeconds * WAD) / (SECONDS_PER_YEAR * BPS);
  const remainingGrowthWad = WAD + remainingDeltaWad;

  return mulWad(daysGrowthWad, remainingGrowthWad);
}

/**
 * Calculate scaled amount from normalized amount and scale factor.
 * scaled_amount = amount * WAD / scale_factor
 *
 * This converts a token amount to shares using the current scale factor.
 *
 * Example:
 *   - User deposits 1000 USDC when scale_factor = 1.05 WAD (5% interest accrued)
 *   - scaled_amount = 1000 * WAD / 1.05 WAD = 952.38 sTokens
 *   - The user gets fewer shares because existing shares are worth more
 *
 * IMPORTANT: This must match the Rust implementation in deposit.rs exactly.
 *
 * @param amount - Token amount in base units (e.g., 1000000 for 1 USDC with 6 decimals)
 * @param scaleFactor - Current market scale factor (WAD format, 18 decimals)
 * @returns Scaled token amount (sTokens)
 * @throws Error if scaleFactor is zero
 */
export function calculateScaledAmount(amount: bigint, scaleFactor: bigint): bigint {
  if (scaleFactor === BigInt(0)) {
    throw new Error('Scale factor cannot be zero');
  }
  if (amount < BigInt(0)) {
    throw new Error('Amount cannot be negative');
  }
  if (scaleFactor < BigInt(0)) {
    throw new Error('Scale factor cannot be negative');
  }

  // Check for overflow before multiplication
  const product = amount * WAD;
  if (wouldOverflowU128(product)) {
    throw new Error('Amount overflow: value too large for u128');
  }

  // Multiply by WAD first to maintain precision before dividing
  return product / scaleFactor;
}

/**
 * Calculate normalized amount from scaled amount and scale factor.
 * normalized_amount = scaled_amount * scale_factor / WAD
 *
 * This converts shares back to token amount using the current scale factor.
 *
 * Example:
 *   - User has 1000 sTokens when scale_factor = 1.10 WAD (10% interest accrued)
 *   - normalized_amount = 1000 * 1.10 WAD / WAD = 1100 tokens
 *   - The user can withdraw more tokens because their shares appreciated
 *
 * IMPORTANT: This must match the Rust implementation in withdraw.rs exactly.
 *
 * @param scaledAmount - Scaled token balance (sTokens)
 * @param scaleFactor - Current market scale factor (WAD format, 18 decimals)
 * @returns Token amount in base units
 */
export function calculateNormalizedAmount(scaledAmount: bigint, scaleFactor: bigint): bigint {
  if (scaledAmount < BigInt(0)) {
    throw new Error('Scaled amount cannot be negative');
  }
  if (scaleFactor < BigInt(0)) {
    throw new Error('Scale factor cannot be negative');
  }

  // Check for overflow before multiplication
  const product = scaledAmount * scaleFactor;
  if (wouldOverflowU128(product)) {
    throw new Error('Amount overflow: value too large for u128');
  }

  // Multiply first, then divide to maintain precision
  return product / WAD;
}

/**
 * Calculate the settlement payout for a given scaled balance.
 *
 * On-chain two-step computation (withdraw.rs lines 241-251):
 *   1. normalized = scaled_balance * scale_factor / WAD
 *   2. payout = normalized * settlement_factor / WAD
 *
 * SETTLEMENT MECHANISM:
 * --------------------
 * When a market reaches maturity, the settlement factor is locked based on
 * the full vault balance (no fee reservation). This determines what fraction
 * of their entitled payout lenders actually receive.
 *
 * settlement_factor = max(1, min(WAD, vault_balance * WAD / total_normalized))
 *
 * - If vault is fully funded: settlement_factor = WAD (100% payout)
 * - If vault is underfunded: settlement_factor < WAD (haircut)
 *
 * Fees are NOT deducted from the vault before computing the settlement factor.
 * Instead, the collect_fees instruction has its own distress guard that prevents
 * fee extraction when the market is underfunded (COAL-C01).
 *
 * When a lender withdraws at a haircut, the gap between their entitled and
 * actual payout is tracked in a haircut_accumulator. This prevents re_settle
 * from recycling those tokens into an inflated factor for remaining lenders
 * (COAL-H01).
 *
 * Example (underfunded market):
 *   - Lender has 1000 sTokens, scale_factor = 1.10 WAD
 *   - Normalized (entitled) payout: 1000 * 1.10 = 1100 tokens
 *   - But vault only has 88% of entitled: settlement_factor = 0.88 WAD
 *   - Actual payout: 1100 * 0.88 = 968 tokens
 *   - Haircut gap (132 tokens) is accumulated to prevent re_settle inflation
 *
 * SECURITY: Settlement factor is locked on first post-maturity withdrawal
 * to prevent front-running. See ADR 006 for details.
 *
 * @param scaledBalance - User's scaled token balance (sTokens)
 * @param scaleFactorWad - Current scale factor (WAD format)
 * @param settlementFactorWad - Locked settlement factor (WAD format)
 * @returns Actual payout amount
 */
export function calculateSettlementPayout(
  scaledBalance: bigint,
  scaleFactorWad: bigint,
  settlementFactorWad: bigint
): bigint {
  const normalized = (scaledBalance * scaleFactorWad) / WAD;
  return (normalized * settlementFactorWad) / WAD;
}

/**
 * Estimate interest accrual for a market.
 * This mirrors the Rust interest.rs logic for UI preview.
 *
 * Returns the estimated new scale factor after accrual.
 *
 * INTEREST ACCRUAL MODEL:
 * -----------------------
 * CoalesceFi uses a scale factor model for interest accrual:
 *
 * 1. Scale factor starts at 1.0 WAD (10^18) when market is created
 * 2. Interest accrues using daily compounding + linear sub-day remainder:
 *    - whole_days = elapsed_seconds / 86400
 *    - remaining_seconds = elapsed_seconds % 86400
 *    - growth = (1 + annual_rate/365)^whole_days
 *               * (1 + annual_rate * remaining_seconds / SECONDS_PER_YEAR)
 *    - new_scale_factor = scale_factor * growth
 * 3. Interest stops at maturity (no compound after term ends)
 * 4. Lender shares (sTokens) are redeemable for: sTokens * scale_factor / WAD
 *
 * SECURITY: This is a preview calculation. The actual accrual happens on-chain.
 *
 * @param market - Market state including current scale factor and interest rate
 * @param currentTimestamp - Current unix timestamp (seconds)
 * @returns Estimated values after accrual
 */
export function estimateInterestAccrual(
  market: Market,
  currentTimestamp: bigint
): {
  newScaleFactor: bigint;
  interestDelta: bigint;
  feeAmount: bigint;
  cappedTimestamp: bigint;
} {
  // STEP 1: Cap accrual at maturity timestamp
  // This prevents interest from accumulating beyond the term
  const cappedTimestamp =
    currentTimestamp > market.maturityTimestamp ? market.maturityTimestamp : currentTimestamp;

  // STEP 2: Check if any time has elapsed since last accrual
  // If not, no interest to accrue
  if (cappedTimestamp <= market.lastAccrualTimestamp) {
    return {
      newScaleFactor: market.scaleFactor,
      interestDelta: BigInt(0),
      feeAmount: BigInt(0),
      cappedTimestamp,
    };
  }

  // STEP 3: Calculate time elapsed in seconds
  const timeElapsed = cappedTimestamp - market.lastAccrualTimestamp;
  const annualRateBps = BigInt(market.annualInterestBps);

  // STEP 4: Compute total growth factor:
  // growth = (1 + annual_rate/365)^whole_days
  //        * (1 + annual_rate * remaining_seconds / SECONDS_PER_YEAR)
  const totalGrowthWad = growthFactorWad(annualRateBps, timeElapsed);

  // STEP 5: Apply growth to current scale factor
  const newScaleFactor = mulWad(market.scaleFactor, totalGrowthWad);

  // Calculate interestDelta in WAD-space (scale factor units, not token amounts)
  const interestDelta = newScaleFactor - market.scaleFactor;

  // Note: Fee calculation would require protocol config, return 0 for estimate
  return {
    newScaleFactor,
    interestDelta,
    feeAmount: BigInt(0), // Would need feeRateBps from ProtocolConfig
    cappedTimestamp,
  };
}

/**
 * Calculate the current normalized value of a lender's position.
 */
export function calculatePositionValue(scaledBalance: bigint, scaleFactor: bigint): bigint {
  return calculateNormalizedAmount(scaledBalance, scaleFactor);
}

/**
 * Calculate the APR from annual interest rate in basis points.
 * Returns as a decimal (e.g., 0.05 for 5% APR).
 */
export function calculateAPR(annualInterestBps: number): number {
  return annualInterestBps / 10000;
}

/**
 * Calculate the estimated value at maturity for a position.
 */
export function estimateValueAtMaturity(
  scaledBalance: bigint,
  currentScaleFactor: bigint,
  annualInterestBps: number,
  currentTimestamp: bigint,
  maturityTimestamp: bigint
): bigint {
  if (currentTimestamp >= maturityTimestamp) {
    return calculateNormalizedAmount(scaledBalance, currentScaleFactor);
  }

  const timeRemaining = maturityTimestamp - currentTimestamp;
  const annualRateBps = BigInt(annualInterestBps);
  const estimatedScaleFactor = mulWad(
    currentScaleFactor,
    growthFactorWad(annualRateBps, timeRemaining)
  );

  return calculateNormalizedAmount(scaledBalance, estimatedScaleFactor);
}

/**
 * Calculate the total supply in normalized terms.
 */
export function calculateTotalSupply(scaledTotalSupply: bigint, scaleFactor: bigint): bigint {
  return calculateNormalizedAmount(scaledTotalSupply, scaleFactor);
}

/**
 * Estimate available vault balance from on-chain counters.
 *
 * This is a best-effort approximation. The authoritative vault balance is the
 * SPL Token account balance, which should be read via RPC when precision
 * matters. This estimate diverges from the true balance after fee collection,
 * force-close, or withdraw-excess operations because those outflows are not
 * fully captured by the counters used here.
 *
 * @deprecated Prefer reading the vault token account balance directly via RPC.
 */
export function calculateAvailableVaultBalance(market: Market): bigint {
  const available = market.totalDeposited - market.totalBorrowed + market.totalRepaid;
  return available > 0n ? available : 0n;
}

/**
 * Result of utilization rate calculation.
 * Provides both a precise BigInt representation (in BPS) and a convenience number.
 */
export interface UtilizationRateResult {
  /**
   * Utilization rate as basis points (0-10000).
   * This is the precise value for financial calculations.
   * 10000 BPS = 100% utilization.
   */
  bps: bigint;

  /**
   * Utilization rate as a decimal number (0-1).
   * This is a convenience value for display purposes only.
   * WARNING: May lose precision for very large values. Use `bps` for calculations.
   */
  decimal: number;
}

/**
 * Calculate utilization rate with full precision.
 * Returns utilization as both basis points (BigInt) and decimal (number).
 *
 * Utilization = outstandingPrincipal / totalSupply
 *
 * Uses principal-only outstanding (totalBorrowed minus principal portion of
 * repayments) so that interest-only repayments do not artificially reduce
 * utilization. This matches the web implementation in getOutstandingPrincipal.
 *
 * @param market - The market to calculate utilization for
 * @returns UtilizationRateResult with bps (precise) and decimal (display)
 */
export function calculateUtilizationRate(market: Market): UtilizationRateResult {
  const totalSupply = calculateTotalSupply(market.scaledTotalSupply, market.scaleFactor);
  if (totalSupply === BigInt(0)) {
    return { bps: BigInt(0), decimal: 0 };
  }

  const principalRepaid =
    market.totalRepaid > market.totalInterestRepaid
      ? market.totalRepaid - market.totalInterestRepaid
      : BigInt(0);
  const borrowed =
    market.totalBorrowed > principalRepaid ? market.totalBorrowed - principalRepaid : BigInt(0);

  if (borrowed === BigInt(0)) {
    return { bps: BigInt(0), decimal: 0 };
  }

  // Check for overflow before multiplication: borrowed * BPS
  const scaledBorrowed = borrowed * BPS;
  if (wouldOverflowU128(scaledBorrowed)) {
    throw new Error('Utilization calculation overflow: borrowed amount too large for u128');
  }

  // Calculate utilization in basis points: (borrowed * BPS) / totalSupply
  const utilizationBps = scaledBorrowed / totalSupply;

  // Cap at 10000 BPS (100%)
  const cappedBps = utilizationBps > BPS ? BPS : utilizationBps;

  // Convert to decimal for display purposes only
  const decimal = Number(cappedBps) / Number(BPS);

  return { bps: cappedBps, decimal };
}

/**
 * Calculate utilization rate as a decimal number.
 * This is a convenience wrapper that returns only the decimal value.
 *
 * WARNING: Use calculateUtilizationRate() for financial calculations
 * as this function loses precision for very large values.
 *
 * @param market - The market to calculate utilization for
 * @returns Utilization rate as a decimal (0-1)
 * @deprecated Use calculateUtilizationRate() for precise calculations
 */
export function calculateUtilizationRateDecimal(market: Market): number {
  return calculateUtilizationRate(market).decimal;
}

/**
 * Calculate the net APR after protocol fees.
 * netAprBps = annualInterestBps * (10000 - protocolFeeBps) / 10000
 *
 * @param grossAprBps - Annual interest rate in basis points (e.g., 800 = 8%)
 * @param protocolFeeBps - Protocol fee in basis points (e.g., 1000 = 10% of interest)
 * @returns Net APR in basis points after fees
 */
export function calculateNetAPR(grossAprBps: number, protocolFeeBps: number): number {
  return Math.floor((grossAprBps * (10000 - protocolFeeBps)) / 10000);
}

/**
 * Calculate the TVL (Total Value Locked) for a market.
 * TVL = totalDeposited - totalBorrowed + totalRepaid (available vault balance)
 *
 * @param market - Market with totalDeposited, totalBorrowed, totalRepaid
 * @returns TVL in base token units as bigint
 */
export function calculateTVL(
  market: Pick<Market, 'totalDeposited' | 'totalBorrowed' | 'totalRepaid'>
): bigint {
  return market.totalDeposited - market.totalBorrowed + market.totalRepaid;
}

/**
 * Safe division that returns 0 if divisor is 0.
 */
export function safeDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) {
    return BigInt(0);
  }
  return numerator / denominator;
}

/**
 * Check if a number would overflow u64.
 */
export function wouldOverflowU64(value: bigint): boolean {
  const MAX_U64 = BigInt('18446744073709551615');
  return value > MAX_U64;
}

/**
 * Check if a number would overflow u128.
 */
export function wouldOverflowU128(value: bigint): boolean {
  return value > MAX_U128;
}
