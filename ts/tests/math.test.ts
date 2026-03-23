import { describe, it, expect } from 'vitest';

import { Keypair } from '@solana/web3.js';

import { WAD, BPS, SECONDS_PER_YEAR } from '../src/constants';
import {
  SECONDS_PER_DAY,
  DAYS_PER_YEAR,
  mulWad,
  powWad,
  growthFactorWad,
  calculateScaledAmount,
  calculateNormalizedAmount,
  calculateSettlementPayout,
  calculateAPR,
  calculateNetAPR,
  calculateTVL,
  calculatePositionValue,
  calculateTotalSupply,
  calculateAvailableVaultBalance,
  calculateUtilizationRate,
  calculateUtilizationRateDecimal,
  estimateInterestAccrual,
  estimateValueAtMaturity,
  safeDivide,
  wouldOverflowU64,
  wouldOverflowU128,
} from '../src/math';
import type { Market } from '../src/types';

// Helper to create a mock market for testing
function createMockMarket(overrides: Partial<Market> = {}): Market {
  return {
    version: 1,
    borrower: Keypair.generate().publicKey,
    mint: Keypair.generate().publicKey,
    vault: Keypair.generate().publicKey,
    marketAuthorityBump: 255,
    annualInterestBps: 1000, // 10% APR
    maturityTimestamp: BigInt(1700000000 + 31536000), // 1 year from base timestamp
    maxTotalSupply: BigInt(1000000000000), // 1M USDC
    marketNonce: BigInt(1),
    scaledTotalSupply: BigInt(500000000000), // 500K scaled
    scaleFactor: WAD,
    accruedProtocolFees: BigInt(0),
    totalDeposited: BigInt(500000000000),
    totalBorrowed: BigInt(0),
    totalRepaid: BigInt(0),
    totalInterestRepaid: BigInt(0),
    lastAccrualTimestamp: BigInt(1700000000),
    settlementFactorWad: BigInt(0),
    bump: 254,
    ...overrides,
  };
}

// Mirrors `program/tests/cross_compilation_tests.rs` hardcoded Python-Decimal vectors.
const INDEPENDENT_INTEREST_GOLDEN_VECTORS = [
  {
    label: 'V1: 10% APR for 1 year',
    annualInterestBps: 1000,
    elapsedSeconds: 31_536_000n,
    expectedScaleFactor: 1_105_155_781_616_264_095n,
  },
  {
    label: 'V2: 10% APR for 1 day',
    annualInterestBps: 1000,
    elapsedSeconds: 86_400n,
    expectedScaleFactor: 1_000_273_972_602_739_726n,
  },
  {
    label: 'V3: 10% APR for 12 hours',
    annualInterestBps: 1000,
    elapsedSeconds: 43_200n,
    expectedScaleFactor: 1_000_136_986_301_369_863n,
  },
  {
    label: 'V4: 100% APR for 1 year',
    annualInterestBps: 10_000,
    elapsedSeconds: 31_536_000n,
    expectedScaleFactor: 2_714_567_482_021_873_489n,
  },
  {
    label: 'V5: 0.01% APR for 1 year',
    annualInterestBps: 1,
    elapsedSeconds: 31_536_000n,
    expectedScaleFactor: 1_000_100_004_986_466_169n,
  },
] as const;

describe('Math Utilities', () => {
  describe('Constants', () => {
    it('should have correct WAD value (1e18)', () => {
      expect(WAD).toBe(BigInt('1000000000000000000'));
    });

    it('should have correct BPS value (10000)', () => {
      expect(BPS).toBe(BigInt(10000));
    });

    it('should have correct SECONDS_PER_YEAR', () => {
      expect(SECONDS_PER_YEAR).toBe(BigInt(31536000));
    });
  });

  describe('calculateScaledAmount', () => {
    it('should calculate scaled amount correctly', () => {
      const amount = BigInt(1000000); // 1 USDC
      const scaleFactor = WAD; // 1.0

      const scaled = calculateScaledAmount(amount, scaleFactor);

      // scaled = amount * WAD / scaleFactor = amount * WAD / WAD = amount
      expect(scaled).toBe(amount);
    });

    it('should handle scale factor > WAD (interest accrued)', () => {
      const amount = BigInt(1000000); // 1 USDC
      // Scale factor 1.1 (10% interest)
      const scaleFactor = (WAD * BigInt(11)) / BigInt(10);

      const scaled = calculateScaledAmount(amount, scaleFactor);

      // scaled = amount * WAD / (1.1 * WAD) = amount / 1.1
      // Should be less than amount (fewer shares for same deposit)
      expect(scaled).toBeLessThan(amount);
    });

    it('should throw for zero scale factor', () => {
      expect(() => calculateScaledAmount(BigInt(1000), BigInt(0))).toThrow(
        'Scale factor cannot be zero'
      );
    });

    it('should throw for negative amount', () => {
      expect(() => calculateScaledAmount(BigInt(-1), WAD)).toThrow('Amount cannot be negative');
    });

    it('should throw for negative scale factor', () => {
      expect(() => calculateScaledAmount(BigInt(1000), BigInt(-1))).toThrow(
        'Scale factor cannot be negative'
      );
    });

    it('should throw for u128 overflow', () => {
      // Amount that would overflow when multiplied by WAD
      const hugeAmount = BigInt('340282366920938463463374607431768211456'); // MAX_U128 + 1
      expect(() => calculateScaledAmount(hugeAmount, WAD)).toThrow('overflow');
    });

    it('should handle maximum safe values without overflow', () => {
      // Large but safe amount
      const safeAmount = BigInt('340282366920938463'); // Well below overflow threshold
      const result = calculateScaledAmount(safeAmount, WAD);
      expect(result).toBe(safeAmount);
    });
  });

  describe('calculateNormalizedAmount', () => {
    it('should calculate normalized amount correctly', () => {
      const scaledAmount = BigInt(1000000);
      const scaleFactor = WAD;

      const normalized = calculateNormalizedAmount(scaledAmount, scaleFactor);

      expect(normalized).toBe(scaledAmount);
    });

    it('should handle scale factor > WAD', () => {
      const scaledAmount = BigInt(1000000);
      // Scale factor 1.1 (10% interest)
      const scaleFactor = (WAD * BigInt(11)) / BigInt(10);

      const normalized = calculateNormalizedAmount(scaledAmount, scaleFactor);

      // normalized = scaledAmount * 1.1 * WAD / WAD = scaledAmount * 1.1
      expect(normalized).toBeGreaterThan(scaledAmount);
    });

    it('should be inverse of calculateScaledAmount', () => {
      const originalAmount = BigInt(1000000);
      const scaleFactor = (WAD * BigInt(105)) / BigInt(100); // 1.05

      const scaled = calculateScaledAmount(originalAmount, scaleFactor);
      const normalized = calculateNormalizedAmount(scaled, scaleFactor);

      // Should get back approximately the original (may lose precision due to rounding)
      // Allow for 1 unit of rounding error
      expect(normalized >= originalAmount - BigInt(1) && normalized <= originalAmount).toBe(true);
    });

    it('should throw for negative scaled amount', () => {
      expect(() => calculateNormalizedAmount(BigInt(-1), WAD)).toThrow(
        'Scaled amount cannot be negative'
      );
    });

    it('should throw for negative scale factor', () => {
      expect(() => calculateNormalizedAmount(BigInt(1000), BigInt(-1))).toThrow(
        'Scale factor cannot be negative'
      );
    });

    it('should throw for u128 overflow', () => {
      // Scaled amount and scale factor that would overflow when multiplied
      const hugeScaledAmount = BigInt('340282366920938463463374607431768211456'); // MAX_U128 + 1
      expect(() => calculateNormalizedAmount(hugeScaledAmount, WAD)).toThrow('overflow');
    });

    it('should handle maximum safe values without overflow', () => {
      // Large but safe amount
      const safeAmount = BigInt('340282366920938463'); // Well below overflow threshold
      const result = calculateNormalizedAmount(safeAmount, WAD);
      expect(result).toBe(safeAmount);
    });
  });

  describe('calculateSettlementPayout', () => {
    it('should calculate full payout when settlement factor is WAD', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = WAD; // no interest accrued
      const settlementFactorWad = WAD; // 100% payout

      const payout = calculateSettlementPayout(scaledBalance, scaleFactor, settlementFactorWad);

      expect(payout).toBe(scaledBalance);
    });

    it('should include scale factor in payout (interest accrued)', () => {
      const scaledBalance = BigInt(1000000);
      // 10% interest: scale_factor = 1.10 WAD
      const scaleFactor = (WAD * 110n) / 100n;
      const settlementFactorWad = WAD; // fully funded

      const payout = calculateSettlementPayout(scaledBalance, scaleFactor, settlementFactorWad);

      // normalized = 1000000 * 1.10 = 1100000, payout = 1100000 * 1.0 = 1100000
      expect(payout).toBe(BigInt(1100000));
    });

    it('should calculate partial payout correctly', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = WAD;
      // 50% settlement factor
      const settlementFactorWad = WAD / BigInt(2);

      const payout = calculateSettlementPayout(scaledBalance, scaleFactor, settlementFactorWad);

      expect(payout).toBe(BigInt(500000));
    });

    it('should return zero for zero settlement factor', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = WAD;
      const settlementFactorWad = BigInt(0);

      const payout = calculateSettlementPayout(scaledBalance, scaleFactor, settlementFactorWad);

      expect(payout).toBe(BigInt(0));
    });
  });

  describe('calculateAPR', () => {
    it('should convert 500 bps to 0.05 (5%)', () => {
      expect(calculateAPR(500)).toBe(0.05);
    });

    it('should convert 1000 bps to 0.10 (10%)', () => {
      expect(calculateAPR(1000)).toBe(0.1);
    });

    it('should convert 10000 bps to 1.0 (100%)', () => {
      expect(calculateAPR(10000)).toBe(1.0);
    });

    it('should handle 0 bps', () => {
      expect(calculateAPR(0)).toBe(0);
    });
  });

  describe('calculatePositionValue', () => {
    it('should return correct current value', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = (WAD * BigInt(110)) / BigInt(100); // 1.10

      const value = calculatePositionValue(scaledBalance, scaleFactor);

      // value = scaledBalance * 1.10
      expect(value).toBe(BigInt(1100000));
    });
  });

  describe('calculateTotalSupply', () => {
    it('should calculate total supply in normalized terms', () => {
      const scaledTotalSupply = BigInt(10000000000);
      const scaleFactor = WAD;

      const totalSupply = calculateTotalSupply(scaledTotalSupply, scaleFactor);

      expect(totalSupply).toBe(scaledTotalSupply);
    });
  });

  describe('safeDivide', () => {
    it('should divide normally when denominator is non-zero', () => {
      expect(safeDivide(BigInt(100), BigInt(10))).toBe(BigInt(10));
    });

    it('should return zero when denominator is zero', () => {
      expect(safeDivide(BigInt(100), BigInt(0))).toBe(BigInt(0));
    });
  });

  describe('wouldOverflowU64', () => {
    const MAX_U64 = BigInt('18446744073709551615');

    it('should return false for values within u64 range', () => {
      expect(wouldOverflowU64(BigInt(0))).toBe(false);
      expect(wouldOverflowU64(BigInt(1000000))).toBe(false);
      expect(wouldOverflowU64(MAX_U64)).toBe(false);
    });

    it('should return true for values exceeding u64', () => {
      expect(wouldOverflowU64(MAX_U64 + BigInt(1))).toBe(true);
    });
  });

  describe('wouldOverflowU128', () => {
    const MAX_U128 = BigInt('340282366920938463463374607431768211455');

    it('should return false for values within u128 range', () => {
      expect(wouldOverflowU128(BigInt(0))).toBe(false);
      expect(wouldOverflowU128(WAD * BigInt(1000000000000))).toBe(false);
      expect(wouldOverflowU128(MAX_U128)).toBe(false);
    });

    it('should return true for values exceeding u128', () => {
      expect(wouldOverflowU128(MAX_U128 + BigInt(1))).toBe(true);
    });
  });

  describe('estimateInterestAccrual', () => {
    it('should match Rust independent golden vectors exactly', () => {
      const startTs = 1700000000n;

      for (const vector of INDEPENDENT_INTEREST_GOLDEN_VECTORS) {
        const market = createMockMarket({
          annualInterestBps: vector.annualInterestBps,
          scaleFactor: WAD,
          lastAccrualTimestamp: startTs,
          maturityTimestamp: startTs + vector.elapsedSeconds,
        });

        const result = estimateInterestAccrual(market, startTs + vector.elapsedSeconds);
        expect(result.newScaleFactor, vector.label).toBe(vector.expectedScaleFactor);
      }
    });

    it('should return unchanged scale factor when no time has elapsed', () => {
      const market = createMockMarket({
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
      });

      const result = estimateInterestAccrual(market, BigInt(1700000000));

      expect(result.newScaleFactor).toBe(WAD);
      expect(result.interestDelta).toBe(BigInt(0));
      expect(result.feeAmount).toBe(BigInt(0));
    });

    it('should return unchanged scale factor when current time is before last accrual', () => {
      const market = createMockMarket({
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
      });

      // Current time is before last accrual (shouldn't happen, but test edge case)
      const result = estimateInterestAccrual(market, BigInt(1699999999));

      expect(result.newScaleFactor).toBe(WAD);
      expect(result.interestDelta).toBe(BigInt(0));
    });

    it('should calculate interest correctly for 10% APR over 1 year', () => {
      const expectedScaleFactor = INDEPENDENT_INTEREST_GOLDEN_VECTORS[0].expectedScaleFactor;
      const market = createMockMarket({
        annualInterestBps: 1000, // 10% APR
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
        maturityTimestamp: BigInt(1700000000 + 31536000), // 1 year
      });

      // Accrue for full year
      const result = estimateInterestAccrual(market, BigInt(1700000000 + 31536000));

      const expectedDelta = expectedScaleFactor - WAD;
      expect(result.interestDelta).toBe(expectedDelta);
      expect(result.newScaleFactor).toBe(expectedScaleFactor);
    });

    it('should calculate interest correctly for 5% APR over 6 months', () => {
      const sixMonths = BigInt(31536000 / 2); // Half a year in seconds
      const market = createMockMarket({
        annualInterestBps: 500, // 5% APR
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
        maturityTimestamp: BigInt(1700000000) + sixMonths * BigInt(2), // 1 year maturity
      });

      const result = estimateInterestAccrual(market, BigInt(1700000000) + sixMonths);

      const growth = growthFactorWad(BigInt(500), sixMonths);
      const expectedDelta = mulWad(WAD, growth) - WAD;
      expect(result.interestDelta).toBe(expectedDelta);
    });

    it('should cap accrual at maturity timestamp', () => {
      const expectedScaleFactor = INDEPENDENT_INTEREST_GOLDEN_VECTORS[0].expectedScaleFactor;
      const market = createMockMarket({
        annualInterestBps: 1000, // 10% APR
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
        maturityTimestamp: BigInt(1700000000 + 31536000), // 1 year
      });

      // Try to accrue 6 months past maturity (should cap at maturity)
      const result = estimateInterestAccrual(
        market,
        BigInt(1700000000 + 31536000 + 15768000) // 1.5 years
      );

      // Interest should be capped at maturity horizon
      const expectedDelta = expectedScaleFactor - WAD;
      expect(result.interestDelta).toBe(expectedDelta);
      expect(result.cappedTimestamp).toBe(BigInt(1700000000 + 31536000));
    });

    it('should handle 0% interest rate', () => {
      const market = createMockMarket({
        annualInterestBps: 0, // 0% APR
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
      });

      const result = estimateInterestAccrual(market, BigInt(1700000000 + 31536000));

      expect(result.interestDelta).toBe(BigInt(0));
      expect(result.newScaleFactor).toBe(WAD);
    });

    it('should handle maximum interest rate (100% APR)', () => {
      const expectedScaleFactor = INDEPENDENT_INTEREST_GOLDEN_VECTORS[3].expectedScaleFactor;
      const market = createMockMarket({
        annualInterestBps: 10000, // 100% APR
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
        maturityTimestamp: BigInt(1700000000 + 31536000),
      });

      const result = estimateInterestAccrual(market, BigInt(1700000000 + 31536000));

      expect(result.interestDelta).toBe(expectedScaleFactor - WAD);
      expect(result.newScaleFactor).toBe(expectedScaleFactor);
    });

    it('should handle very small time intervals (1 second)', () => {
      const market = createMockMarket({
        annualInterestBps: 1000, // 10% APR
        scaleFactor: WAD,
        lastAccrualTimestamp: BigInt(1700000000),
      });

      const result = estimateInterestAccrual(market, BigInt(1700000001));

      // Should have tiny but non-zero interest
      expect(result.interestDelta).toBeGreaterThan(BigInt(0));
      expect(result.interestDelta).toBeLessThan(WAD / BigInt(1000000)); // Less than 0.0001%
    });

    it('should work with non-WAD starting scale factor (compound interest)', () => {
      // Market already has 5% accrued interest
      const startingScaleFactor = (WAD * BigInt(105)) / BigInt(100); // 1.05 WAD
      const market = createMockMarket({
        annualInterestBps: 1000, // 10% APR
        scaleFactor: startingScaleFactor,
        lastAccrualTimestamp: BigInt(1700000000),
        maturityTimestamp: BigInt(1700000000 + 31536000),
      });

      // Accrue another 6 months
      const result = estimateInterestAccrual(market, BigInt(1700000000 + 15768000));

      const sixMonths = BigInt(15768000);
      const growth = growthFactorWad(BigInt(1000), sixMonths);
      const expectedScaleFactor = mulWad(startingScaleFactor, growth);
      const expectedDelta = expectedScaleFactor - startingScaleFactor;
      expect(result.newScaleFactor).toBe(expectedScaleFactor);
      expect(result.interestDelta).toBe(expectedDelta);
    });
  });

  describe('estimateValueAtMaturity', () => {
    it('should return current value if already at or past maturity', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = (WAD * BigInt(110)) / BigInt(100); // 1.10
      const currentTimestamp = BigInt(1700000000 + 31536000); // At maturity
      const maturityTimestamp = BigInt(1700000000 + 31536000);

      const value = estimateValueAtMaturity(
        scaledBalance,
        scaleFactor,
        1000, // 10% APR
        currentTimestamp,
        maturityTimestamp
      );

      // Should equal current normalized value
      const expectedValue = (scaledBalance * scaleFactor) / WAD;
      expect(value).toBe(expectedValue);
    });

    it('should return current value if past maturity', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = (WAD * BigInt(110)) / BigInt(100); // 1.10
      const currentTimestamp = BigInt(1700000000 + 31536000 + 100); // Past maturity
      const maturityTimestamp = BigInt(1700000000 + 31536000);

      const value = estimateValueAtMaturity(
        scaledBalance,
        scaleFactor,
        1000,
        currentTimestamp,
        maturityTimestamp
      );

      const expectedValue = (scaledBalance * scaleFactor) / WAD;
      expect(value).toBe(expectedValue);
    });

    it('should estimate correctly for 10% APR over 1 year', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = WAD; // Starting at 1.0
      const currentTimestamp = BigInt(1700000000);
      const maturityTimestamp = BigInt(1700000000 + 31536000); // 1 year

      const value = estimateValueAtMaturity(
        scaledBalance,
        scaleFactor,
        1000, // 10% APR
        currentTimestamp,
        maturityTimestamp
      );

      const growth = growthFactorWad(BigInt(1000), BigInt(31536000));
      const expectedScaleFactor = mulWad(scaleFactor, growth);
      expect(value).toBe((scaledBalance * expectedScaleFactor) / WAD);
    });

    it('should estimate correctly for 5% APR over 6 months remaining', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = (WAD * BigInt(1025)) / BigInt(1000); // 1.025 (2.5% already accrued)
      const sixMonths = BigInt(31536000 / 2);
      const currentTimestamp = BigInt(1700000000);
      const maturityTimestamp = BigInt(1700000000) + sixMonths;

      const value = estimateValueAtMaturity(
        scaledBalance,
        scaleFactor,
        500, // 5% APR
        currentTimestamp,
        maturityTimestamp
      );

      const expectedScaleFactor = mulWad(scaleFactor, growthFactorWad(BigInt(500), sixMonths));
      const expectedValue = (scaledBalance * expectedScaleFactor) / WAD;
      expect(value).toBe(expectedValue);
    });

    it('should handle 0% APR', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = WAD;
      const currentTimestamp = BigInt(1700000000);
      const maturityTimestamp = BigInt(1700000000 + 31536000);

      const value = estimateValueAtMaturity(
        scaledBalance,
        scaleFactor,
        0, // 0% APR
        currentTimestamp,
        maturityTimestamp
      );

      // Should equal current value (no interest)
      expect(value).toBe(scaledBalance);
    });

    it('should handle very short time to maturity', () => {
      const scaledBalance = BigInt(1000000);
      const scaleFactor = WAD;
      const currentTimestamp = BigInt(1700000000);
      const maturityTimestamp = BigInt(1700000001); // 1 second

      const value = estimateValueAtMaturity(
        scaledBalance,
        scaleFactor,
        1000, // 10% APR
        currentTimestamp,
        maturityTimestamp
      );

      // Should be very slightly more than scaled balance
      expect(value).toBeGreaterThanOrEqual(scaledBalance);
      expect(value).toBeLessThan(scaledBalance + BigInt(1000)); // Very small increase
    });

    it('should handle zero scaled balance', () => {
      const value = estimateValueAtMaturity(
        BigInt(0),
        WAD,
        1000,
        BigInt(1700000000),
        BigInt(1700000000 + 31536000)
      );

      expect(value).toBe(BigInt(0));
    });
  });

  describe('calculateUtilizationRate', () => {
    it('should return 0 when no borrows', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(0),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(0));
      expect(result.decimal).toBe(0);
    });

    it('should return 0 when total supply is 0', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(0),
        scaleFactor: WAD,
        totalBorrowed: BigInt(0),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(0));
      expect(result.decimal).toBe(0);
    });

    it('should calculate 50% utilization correctly', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(500000),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(5000));
      expect(result.decimal).toBeCloseTo(0.5, 10);
    });

    it('should calculate 100% utilization correctly', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(1000000),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(10000));
      expect(result.decimal).toBeCloseTo(1.0, 10);
    });

    it('should account for principal repaid amounts', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(1000000),
        totalRepaid: BigInt(500000),
        totalInterestRepaid: BigInt(0),
      });

      // principalRepaid = 500000 - 0 = 500000, outstanding = 1000000 - 500000 = 500000
      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(5000));
      expect(result.decimal).toBeCloseTo(0.5, 10);
    });

    it('should not reduce utilization for interest-only repayments', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(500000),
        totalRepaid: BigInt(50000),
        totalInterestRepaid: BigInt(50000),
      });

      // principalRepaid = 50000 - 50000 = 0, outstanding = 500000
      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(5000));
      expect(result.decimal).toBeCloseTo(0.5, 10);
    });

    it('should handle mixed repayments (principal + interest)', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(500000),
        totalRepaid: BigInt(200000),
        totalInterestRepaid: BigInt(50000),
      });

      // principalRepaid = 200000 - 50000 = 150000
      // outstanding = 500000 - 150000 = 350000, utilization = 350000/1000000 = 0.35
      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(3500));
      expect(result.decimal).toBeCloseTo(0.35, 10);
    });

    it('should handle scale factor > WAD (interest accrued)', () => {
      const scaleFactor = (WAD * BigInt(11)) / BigInt(10); // 1.1 WAD
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor,
        totalBorrowed: BigInt(550000),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(5000));
      expect(result.decimal).toBeCloseTo(0.5, 10);
    });

    it('should handle large values without precision loss', () => {
      const largeScaledSupply = BigInt('10000000000000000000');
      const largeBorrow = BigInt('5000000000000000000');
      const market = createMockMarket({
        scaledTotalSupply: largeScaledSupply,
        scaleFactor: WAD,
        totalBorrowed: largeBorrow,
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(5000));
      expect(result.decimal).toBeCloseTo(0.5, 10);
    });

    it('should cap utilization at 100%', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(1500000),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(10000));
      expect(result.decimal).toBe(1.0);
    });

    it('should return 0 for negative borrowed (defensive)', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(100000),
        totalRepaid: BigInt(200000),
        totalInterestRepaid: BigInt(0),
      });

      // principalRepaid = 200000, outstanding = max(100000 - 200000, 0) = 0
      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(0));
      expect(result.decimal).toBe(0);
    });

    it('should provide BPS with exact precision for financial calculations', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(4000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(1000000),
        totalRepaid: BigInt(0),
      });

      const result = calculateUtilizationRate(market);
      expect(result.bps).toBe(BigInt(2500));
      expect(result.decimal).toBe(0.25);
    });
  });

  describe('mulWad', () => {
    it('should return correct product for two WAD values', () => {
      // 2.0 * 3.0 = 6.0
      expect(mulWad(WAD * 2n, WAD * 3n)).toBe(WAD * 6n);
    });

    it('should return identity when multiplying by WAD', () => {
      // mulWad(a, WAD) = a * WAD / WAD = a
      // x * WAD * WAD must fit u128, so x <= 340
      const value = 5n * WAD; // 5.0 in WAD
      expect(mulWad(value, WAD)).toBe(value);
    });

    it('should return zero when either input is zero', () => {
      expect(mulWad(0n, WAD)).toBe(0n);
      expect(mulWad(WAD, 0n)).toBe(0n);
      expect(mulWad(0n, 0n)).toBe(0n);
    });

    it('should handle fractional WAD values', () => {
      // 0.5 * 0.5 = 0.25
      const half = WAD / 2n;
      const quarter = WAD / 4n;
      expect(mulWad(half, half)).toBe(quarter);
    });

    it('should throw on u128 overflow', () => {
      const MAX_U128 = BigInt('340282366920938463463374607431768211455');
      // Two values whose product exceeds MAX_U128
      expect(() => mulWad(MAX_U128, WAD * 2n)).toThrow('mulWad overflow');
    });
  });

  describe('powWad', () => {
    it('should return WAD for exponent 0 (x^0 = 1)', () => {
      expect(powWad(WAD * 2n, 0n)).toBe(WAD);
      expect(powWad(WAD * 100n, 0n)).toBe(WAD);
    });

    it('should return base for exponent 1 (x^1 = x)', () => {
      const base = WAD * 3n;
      expect(powWad(base, 1n)).toBe(base);
    });

    it('should calculate correct square (x^2)', () => {
      const base = WAD * 2n; // 2.0
      // 2.0^2 = 4.0
      expect(powWad(base, 2n)).toBe(WAD * 4n);
    });

    it('should return WAD when base is WAD (1^n = 1)', () => {
      expect(powWad(WAD, 10n)).toBe(WAD);
      expect(powWad(WAD, 365n)).toBe(WAD);
    });

    it('should handle large exponents', () => {
      // (1 + 0.01%)^365 — daily compounding of a tiny rate
      const base = WAD + WAD / 10000n; // 1.0001
      const result = powWad(base, 365n);
      // Should be slightly above WAD (compounding ~3.7% annually)
      expect(result).toBeGreaterThan(WAD);
      expect(result).toBeLessThan(WAD * 2n);
    });
  });

  describe('growthFactorWad', () => {
    it('should return WAD for zero elapsed time', () => {
      expect(growthFactorWad(1000n, 0n)).toBe(WAD);
    });

    it('should return WAD for negative elapsed time', () => {
      expect(growthFactorWad(1000n, -1n)).toBe(WAD);
    });

    it('should compute sub-day growth via linear interpolation', () => {
      // For 12 hours (43200s), growth should use linear sub-day path
      const result = growthFactorWad(1000n, 43200n);
      // 10% APR for 12 hours ≈ 0.0137% linear
      expect(result).toBeGreaterThan(WAD);
      expect(result).toBeLessThan(WAD + WAD / 100n); // Less than 1%
    });

    it('should compute whole-day-only growth via compounding', () => {
      // Exactly 1 day — no sub-day remainder
      const result = growthFactorWad(1000n, SECONDS_PER_DAY);
      // Should match golden vector V2
      expect(result).toBe(1_000_273_972_602_739_726n);
    });

    it('should combine compounding and linear for mixed durations', () => {
      // 1 day + 12 hours = daily compound for 1 day, then linear for 12 hours
      const oneDayResult = growthFactorWad(1000n, SECONDS_PER_DAY);
      const halfDayResult = growthFactorWad(1000n, 43200n);
      const combinedResult = growthFactorWad(1000n, SECONDS_PER_DAY + 43200n);

      // Combined should be greater than either alone
      expect(combinedResult).toBeGreaterThan(oneDayResult);
      expect(combinedResult).toBeGreaterThan(halfDayResult);
    });

    it('should return WAD for 0% APR regardless of time', () => {
      expect(growthFactorWad(0n, SECONDS_PER_DAY * 365n)).toBe(WAD);
    });
  });

  describe('calculateAvailableVaultBalance (deprecated — prefer live vault RPC read)', () => {
    it('should return full deposits when nothing borrowed', () => {
      const market = createMockMarket({
        totalDeposited: 1_000_000n,
        totalBorrowed: 0n,
        totalRepaid: 0n,
      });
      expect(calculateAvailableVaultBalance(market)).toBe(1_000_000n);
    });

    it('should subtract borrowed from deposited', () => {
      const market = createMockMarket({
        totalDeposited: 1_000_000n,
        totalBorrowed: 400_000n,
        totalRepaid: 0n,
      });
      expect(calculateAvailableVaultBalance(market)).toBe(600_000n);
    });

    it('should add repaid to available balance', () => {
      const market = createMockMarket({
        totalDeposited: 1_000_000n,
        totalBorrowed: 400_000n,
        totalRepaid: 200_000n,
      });
      // 1_000_000 - 400_000 + 200_000 = 800_000
      expect(calculateAvailableVaultBalance(market)).toBe(800_000n);
    });

    it('should return full balance when fully repaid', () => {
      const market = createMockMarket({
        totalDeposited: 1_000_000n,
        totalBorrowed: 500_000n,
        totalRepaid: 500_000n,
      });
      expect(calculateAvailableVaultBalance(market)).toBe(1_000_000n);
    });

    it('should handle zero deposits', () => {
      const market = createMockMarket({
        totalDeposited: 0n,
        totalBorrowed: 0n,
        totalRepaid: 0n,
      });
      expect(calculateAvailableVaultBalance(market)).toBe(0n);
    });

    it('should clamp negative counter-derived balances to zero', () => {
      const market = createMockMarket({
        totalDeposited: 100_000n,
        totalBorrowed: 200_000n,
        totalRepaid: 50_000n,
      });

      expect(calculateAvailableVaultBalance(market)).toBe(0n);
    });
  });

  describe('calculateUtilizationRateDecimal', () => {
    it('should return decimal value for backward compatibility', () => {
      const market = createMockMarket({
        scaledTotalSupply: BigInt(1000000),
        scaleFactor: WAD,
        totalBorrowed: BigInt(500000),
        totalRepaid: BigInt(0),
      });

      const rate = calculateUtilizationRateDecimal(market);
      expect(rate).toBeCloseTo(0.5, 10);
    });
  });

  describe('calculateNetAPR', () => {
    it('should compute net APR after 10% protocol fee', () => {
      // 800 bps gross, 1000 bps fee (10%) => 800 * 9000 / 10000 = 720
      expect(calculateNetAPR(800, 1000)).toBe(720);
    });

    it('should return gross APR when fee is 0', () => {
      expect(calculateNetAPR(800, 0)).toBe(800);
    });

    it('should return 0 when fee is 100%', () => {
      expect(calculateNetAPR(800, 10000)).toBe(0);
    });

    it('should floor fractional results', () => {
      // 1000 * (10000 - 333) / 10000 = 1000 * 9667 / 10000 = 966.7 => 966
      expect(calculateNetAPR(1000, 333)).toBe(966);
    });

    it('should handle 0 gross APR', () => {
      expect(calculateNetAPR(0, 1000)).toBe(0);
    });
  });

  describe('calculateTVL', () => {
    it('should compute TVL as deposited - borrowed + repaid', () => {
      const market = createMockMarket({
        totalDeposited: 10_000_000_000n,
        totalBorrowed: 5_000_000_000n,
        totalRepaid: 2_000_000_000n,
      });
      // 10B - 5B + 2B = 7B
      expect(calculateTVL(market)).toBe(7_000_000_000n);
    });

    it('should return full deposit when nothing borrowed', () => {
      const market = createMockMarket({
        totalDeposited: 5_000_000_000n,
        totalBorrowed: 0n,
        totalRepaid: 0n,
      });
      expect(calculateTVL(market)).toBe(5_000_000_000n);
    });

    it('should handle fully borrowed and repaid', () => {
      const market = createMockMarket({
        totalDeposited: 5_000_000_000n,
        totalBorrowed: 5_000_000_000n,
        totalRepaid: 5_000_000_000n,
      });
      expect(calculateTVL(market)).toBe(5_000_000_000n);
    });

    it('should handle zero deposits', () => {
      const market = createMockMarket({
        totalDeposited: 0n,
        totalBorrowed: 0n,
        totalRepaid: 0n,
      });
      expect(calculateTVL(market)).toBe(0n);
    });
  });
});
