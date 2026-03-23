/**
 * Example: Math Functions
 *
 * Protocol math utilities using WAD precision (10^18).
 * These functions match the on-chain Rust implementation exactly.
 */

import { Connection, PublicKey } from '@solana/web3.js';

import {
  configureSdk,
  fetchMarket,
  fetchLenderPosition,
  findLenderPositionPda,
  WAD,
  calculateScaledAmount,
  calculateNormalizedAmount,
  calculateSettlementPayout,
  calculatePositionValue,
  calculateAPR,
  calculateTotalSupply,
  calculateAvailableVaultBalance,
  calculateUtilizationRate,
  estimateInterestAccrual,
  estimateValueAtMaturity,
} from '@coalescefi/sdk';
import type { Market, LenderPosition } from '@coalescefi/sdk';

// ─── Deposit Preview ────────────────────────────────────────
// Calculate how many shares a deposit would yield.

export function previewDeposit(amount: bigint, scaleFactor: bigint): bigint {
  const shares = calculateScaledAmount(amount, scaleFactor);
  console.log(`Depositing ${amount} tokens → ${shares} sTokens`);
  return shares;
}

// ─── Position Value ─────────────────────────────────────────
// Calculate the current token value of a lender position.

export function currentPositionValue(position: LenderPosition, market: Market): bigint {
  const value = calculatePositionValue(position.scaledBalance, market.scaleFactor);
  console.log(`Position: ${position.scaledBalance} sTokens → ${value} tokens`);
  return value;
}

// ─── Interest Accrual Preview ───────────────────────────────
// Estimate how much interest has accrued since the last on-chain update.

export function previewInterestAccrual(market: Market): void {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { newScaleFactor, interestDelta, cappedTimestamp } = estimateInterestAccrual(market, now);

  console.log('Current scale factor:', market.scaleFactor);
  console.log('Estimated scale factor:', newScaleFactor);
  console.log('Interest delta:', interestDelta);
  console.log('Accrual capped at:', new Date(Number(cappedTimestamp) * 1000).toISOString());
}

// ─── Maturity Estimate ──────────────────────────────────────
// Project what a position will be worth at maturity.

export function projectedMaturityValue(
  position: LenderPosition,
  market: Market
): { currentValue: bigint; maturityValue: bigint; estimatedYield: bigint } {
  const now = BigInt(Math.floor(Date.now() / 1000));

  const currentValue = calculatePositionValue(position.scaledBalance, market.scaleFactor);
  const maturityValue = estimateValueAtMaturity(
    position.scaledBalance,
    market.scaleFactor,
    market.annualInterestBps,
    now,
    market.maturityTimestamp
  );
  const estimatedYield = maturityValue - currentValue;

  console.log('Current value:', currentValue);
  console.log('Projected maturity value:', maturityValue);
  console.log('Estimated yield:', estimatedYield);

  return { currentValue, maturityValue, estimatedYield };
}

// ─── Settlement Payout ──────────────────────────────────────
// After maturity, calculate what a lender actually receives.

export function calculatePayout(position: LenderPosition, market: Market): bigint {
  if (market.settlementFactorWad === 0n) {
    console.log('Market not yet settled');
    return 0n;
  }

  const payout = calculateSettlementPayout(
    position.scaledBalance,
    market.scaleFactor,
    market.settlementFactorWad
  );
  const fullValue = calculateNormalizedAmount(position.scaledBalance, market.scaleFactor);
  const haircut = fullValue > 0n ? ((fullValue - payout) * 10000n) / fullValue : 0n;

  console.log('Full value:', fullValue);
  console.log('Actual payout:', payout);
  console.log('Haircut:', Number(haircut) / 100, '%');

  return payout;
}

// ─── Market Analytics ───────────────────────────────────────

export function marketAnalytics(market: Market): void {
  const apr = calculateAPR(market.annualInterestBps);
  const totalSupply = calculateTotalSupply(market.scaledTotalSupply, market.scaleFactor);
  const estimatedAvailable = calculateAvailableVaultBalance(market);
  const { bps, decimal } = calculateUtilizationRate(market);

  console.log('APR:', (apr * 100).toFixed(2) + '%');
  console.log('Total supply (normalized):', totalSupply);
  console.log('Estimated vault balance (prefer live RPC for exactness):', estimatedAvailable);
  console.log('Utilization:', (decimal * 100).toFixed(2) + '%', `(${bps} bps)`);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  configureSdk({ network: 'mainnet' });

  const marketPda = new PublicKey('...');
  const lenderPubkey = new PublicKey('...');

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  // Preview depositing 10,000 USDC
  previewDeposit(10_000_000_000n, market.scaleFactor);

  // Market overview
  marketAnalytics(market);

  // Interest accrual preview
  previewInterestAccrual(market);

  // Lender position analysis
  const [positionPda] = findLenderPositionPda(marketPda, lenderPubkey);
  const position = await fetchLenderPosition(connection, positionPda);
  if (position) {
    currentPositionValue(position, market);
    projectedMaturityValue(position, market);
  }
}
