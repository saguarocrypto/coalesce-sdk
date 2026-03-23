/**
 * Example: Error Handling
 *
 * Parse, classify, and recover from CoalesceFi program errors.
 */

import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { SendTransactionError } from '@solana/web3.js';

import {
  parseCoalescefiError,
  isUserRecoverableError,
  getErrorRecoveryAction,
  isRetryableError,
  CoalescefiErrorCode,
  CoalescefiError,
} from '@coalescefi/sdk';

// ─── Basic Error Parsing ────────────────────────────────────

export async function sendWithErrorHandling(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[]
): Promise<string> {
  try {
    return await sendAndConfirmTransaction(connection, tx, signers);
  } catch (error) {
    const coalesceError = parseCoalescefiError(error);

    if (coalesceError) {
      console.error(`Program error ${coalesceError.code}: ${coalesceError.codeName}`);
      console.error('Message:', coalesceError.message);

      if (isUserRecoverableError(coalesceError.code)) {
        const action = getErrorRecoveryAction(coalesceError.code);
        console.log('Recovery action:', action);
      }

      throw coalesceError;
    }

    // Non-program error (network, serialization, etc.)
    if (error instanceof SendTransactionError) {
      console.error('Transaction failed:', error.message);
      console.error('Logs:', error.logs);
    }

    throw error;
  }
}

// ─── Pattern Matching on Error Codes ────────────────────────

export function handleDepositError(error: unknown): string {
  const parsed = parseCoalescefiError(error);
  if (!parsed) throw error;

  switch (parsed.code) {
    case CoalescefiErrorCode.MarketMatured:
      return 'This market has matured — deposits are no longer accepted.';
    case CoalescefiErrorCode.CapExceeded:
      return 'Market capacity reached — try a smaller amount.';
    case CoalescefiErrorCode.ProtocolPaused:
      return 'Protocol is temporarily paused — try again later.';
    case CoalescefiErrorCode.Blacklisted:
      return 'Your address has been blacklisted.';
    case CoalescefiErrorCode.ZeroAmount:
      return 'Deposit amount must be greater than zero.';
    case CoalescefiErrorCode.InsufficientBalance:
      return 'Not enough tokens in your wallet.';
    default:
      throw parsed;
  }
}

export function handleWithdrawError(error: unknown): string {
  const parsed = parseCoalescefiError(error);
  if (!parsed) throw error;

  switch (parsed.code) {
    case CoalescefiErrorCode.NotMatured:
      return 'Market has not matured yet — withdrawals available after maturity.';
    case CoalescefiErrorCode.SettlementGracePeriod:
      return 'Wait 5 minutes after settlement before withdrawing.';
    case CoalescefiErrorCode.PayoutBelowMinimum:
      return 'Withdrawal payout is below your specified minimum — adjust minPayout.';
    case CoalescefiErrorCode.InsufficientScaledBalance:
      return 'You do not have enough shares to withdraw this amount.';
    default:
      throw parsed;
  }
}

export function handleBorrowError(error: unknown): string {
  const parsed = parseCoalescefiError(error);
  if (!parsed) throw error;

  switch (parsed.code) {
    case CoalescefiErrorCode.NotWhitelisted:
      return 'Borrower is not whitelisted — contact the whitelist manager.';
    case CoalescefiErrorCode.BorrowAmountTooHigh:
      return 'Amount exceeds vault balance or whitelist capacity.';
    case CoalescefiErrorCode.MarketMatured:
      return 'Cannot borrow from a matured market.';
    case CoalescefiErrorCode.Unauthorized:
      return 'Only the market borrower can borrow from this market.';
    default:
      throw parsed;
  }
}

// ─── Retry Pattern ──────────────────────────────────────────

export async function sendWithRetry(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[],
  maxAttempts: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendAndConfirmTransaction(connection, tx, signers);
    } catch (error) {
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
      console.log(`Attempt ${attempt} failed (retryable), retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Refresh blockhash for retry
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
    }
  }

  throw new Error('Unreachable');
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const signer = Keypair.generate();
  const tx = new Transaction(); // Add instructions...

  try {
    const sig = await sendWithErrorHandling(connection, tx, [signer]);
    console.log('Success:', sig);
  } catch (error) {
    if (error instanceof CoalescefiError) {
      const message = handleDepositError(error);
      console.log('User-facing message:', message);
    }
  }
}
