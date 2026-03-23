import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

/** Options for constructing a CoalesceClient. */
export interface ClientOptions {
  /** Program ID for this client instance. Required — no global state mutation. */
  programId: PublicKey;
  /** TTL in milliseconds for cached market data. Default: 30_000 (30s). */
  cacheTtlMs?: number;
}

// ─── Per-Method Override Types ───────────────────────────────

export interface DepositOverrides {
  lenderTokenAccount?: PublicKey;
}

export interface WithdrawOverrides {
  lenderTokenAccount?: PublicKey;
  minPayout?: bigint;
}

export interface ClaimHaircutOverrides {
  lenderTokenAccount?: PublicKey;
}

export interface BorrowOverrides {
  borrowerTokenAccount?: PublicKey;
}

export interface RepayOverrides {
  payerTokenAccount?: PublicKey;
}

export interface WithdrawExcessOverrides {
  borrowerTokenAccount?: PublicKey;
}

export interface CollectFeesOverrides {
  feeTokenAccount?: PublicKey;
}

export interface ClientCreateMarketArgs {
  nonce: bigint;
  annualInterestBps: number;
  maturityTimestamp: bigint;
  maxTotalSupply: bigint;
}

export interface CreateMarketResult {
  instructions: TransactionInstruction[];
  marketPda: PublicKey;
}

export interface WhitelistBorrowerArgs {
  isWhitelisted: boolean;
  maxBorrowCapacity: bigint;
}

export interface ScanOptions {
  maxNonce?: number;
}
