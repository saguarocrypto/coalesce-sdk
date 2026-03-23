import { type PublicKey } from '@solana/web3.js';

/**
 * Type aliases for Solana/Rust numeric types.
 *
 * IMPORTANT: JavaScript `number` type safely represents integers up to 2^53 - 1.
 * For u64 and larger values, we use `bigint` to prevent precision loss.
 *
 * Type mapping:
 * - u8, u16, u32, i8, i16, i32: `number` (safe)
 * - u64, i64, u128, i128: `bigint` (required for precision)
 */

/** u8 values (0 to 255) - safe as number */
export type U8 = number;

/** u16 values (0 to 65,535) - safe as number */
export type U16 = number;

/** u64 values (0 to 2^64-1) - MUST use bigint to prevent precision loss */
export type U64 = bigint;

/** i64 values (-2^63 to 2^63-1) - MUST use bigint to prevent precision loss */
export type I64 = bigint;

/** u128 values (0 to 2^128-1) - MUST use bigint to prevent precision loss */
export type U128 = bigint;

/** Basis points (0-10000 representing 0%-100%) */
export type BasisPoints = U16;

/** Unix timestamp in seconds */
export type UnixTimestamp = I64;

/** Token amount in smallest unit (e.g., lamports for SOL, micro-USDC for USDC) */
export type TokenAmount = U64;

/** Scaled balance using WAD precision (1e18) */
export type ScaledAmount = U128;

/**
 * ProtocolConfig account structure (194 bytes).
 * Matches the Rust #[repr(C)] struct exactly.
 */
export interface ProtocolConfig {
  /** Account schema version (1 byte, u8) */
  version: U8;
  /** Protocol admin pubkey (32 bytes) */
  admin: Uint8Array;
  /** Fee as basis points of base interest (2 bytes, u16, 0-10000) */
  feeRateBps: BasisPoints;
  /** Fee collection wallet (32 bytes) */
  feeAuthority: Uint8Array;
  /** Whitelist manager pubkey (32 bytes) */
  whitelistManager: Uint8Array;
  /** External blacklist program (32 bytes) */
  blacklistProgram: Uint8Array;
  /** Guard against double-init (1 byte) */
  isInitialized: boolean;
  /** PDA bump seed (1 byte, u8) */
  bump: U8;
  /** Emergency pause flag (true = paused, false = active) */
  isPaused: boolean;
  /** Blacklist mode (true = fail-closed, false = fail-open) */
  isBlacklistFailClosed: boolean;
}

/**
 * Convert a ProtocolConfig field to PublicKey.
 * Utility helper for consumers that need PublicKey objects.
 */
export function configFieldToPublicKey(field: Uint8Array): PublicKey {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { PublicKey: PubKeyClass } = require('@solana/web3.js') as {
    PublicKey: new (value: Uint8Array) => PublicKey;
  };
  return new PubKeyClass(field);
}

/**
 * Market account structure (250 bytes).
 * Matches the Rust #[repr(C)] struct exactly.
 */
export interface Market {
  /** Account schema version (1 byte, u8) */
  version: U8;
  /** Borrower pubkey (32 bytes) */
  borrower: PublicKey;
  /** USDC mint (32 bytes) */
  mint: PublicKey;
  /** Vault PDA (32 bytes) */
  vault: PublicKey;
  /** Market authority PDA bump (1 byte, u8) */
  marketAuthorityBump: U8;
  /** Fixed annual rate in bps (2 bytes, u16, 0-10000) */
  annualInterestBps: BasisPoints;
  /** Loan maturity timestamp (8 bytes, i64) */
  maturityTimestamp: UnixTimestamp;
  /** Borrow cap normalized (8 bytes, u64) */
  maxTotalSupply: TokenAmount;
  /** PDA derivation nonce (8 bytes, u64) */
  marketNonce: U64;
  /** Sum of lender scaled balances (16 bytes, u128) */
  scaledTotalSupply: ScaledAmount;
  /** WAD precision scale factor (16 bytes, u128) */
  scaleFactor: ScaledAmount;
  /** Uncollected fees (8 bytes, u64) */
  accruedProtocolFees: TokenAmount;
  /** Capacity tracker: increases on deposit, decreases by withdrawal payout (8 bytes, u64) */
  totalDeposited: TokenAmount;
  /** Running total borrowed (8 bytes, u64) */
  totalBorrowed: TokenAmount;
  /** Running total repaid (8 bytes, u64) */
  totalRepaid: TokenAmount;
  /** Running total interest repaid (8 bytes, u64) - tracked separately from principal */
  totalInterestRepaid: TokenAmount;
  /** Last interest accrual timestamp (8 bytes, i64) */
  lastAccrualTimestamp: UnixTimestamp;
  /** Payout ratio at settlement (16 bytes, u128) */
  settlementFactorWad: ScaledAmount;
  /** Market PDA bump (1 byte, u8) */
  bump: U8;
  /** Cumulative haircut gap from distressed withdrawals (8 bytes, u64) */
  haircutAccumulator: TokenAmount;
}

/**
 * LenderPosition account structure (128 bytes).
 * Matches the Rust #[repr(C)] struct exactly.
 */
export interface LenderPosition {
  /** Account schema version (1 byte, u8) */
  version: U8;
  /** Market this position belongs to (32 bytes) */
  market: PublicKey;
  /** Lender wallet address (32 bytes) */
  lender: PublicKey;
  /** Lender's share balance (16 bytes, u128) */
  scaledBalance: ScaledAmount;
  /** PDA bump (1 byte, u8) */
  bump: U8;
  /** Token amount the lender was shorted during distressed withdrawal (8 bytes, u64) */
  haircutOwed: TokenAmount;
  /** Settlement factor at which the lender last withdrew or claimed (16 bytes, u128) */
  withdrawalSf: ScaledAmount;
}

/**
 * HaircutState account structure (88 bytes).
 * Per-market aggregate haircut state for the conservative re_settle solver.
 * Matches the Rust #[repr(C)] struct exactly.
 */
export interface HaircutState {
  /** Account schema version (1 byte, u8) */
  version: U8;
  /** Market this state belongs to (32 bytes) */
  market: PublicKey;
  /** Sum of per-position weight contributions (16 bytes, u128) */
  claimWeightSum: ScaledAmount;
  /** Sum of per-position offset contributions (16 bytes, u128) */
  claimOffsetSum: ScaledAmount;
  /** PDA bump (1 byte, u8) */
  bump: U8;
}

/**
 * BorrowerWhitelist account structure (96 bytes).
 * Matches the Rust #[repr(C)] struct exactly.
 */
export interface BorrowerWhitelist {
  /** Account schema version (1 byte, u8) */
  version: U8;
  /** Borrower wallet (32 bytes) */
  borrower: PublicKey;
  /** 1 = whitelisted, 0 = removed (1 byte) */
  isWhitelisted: boolean;
  /** Maximum USDC that can be outstanding at any time (8 bytes, u64).
   *  This is NOT a lifetime cap - borrower can re-borrow after repaying. */
  maxBorrowCapacity: TokenAmount;
  /** Current outstanding USDC debt (8 bytes, u64).
   *  Incremented on borrow, decremented on repay. */
  currentBorrowed: TokenAmount;
  /** PDA bump (1 byte, u8) */
  bump: U8;
}

/**
 * Instruction argument types.
 */

export interface InitializeProtocolArgs {
  /** Fee rate in basis points (0-10000) */
  feeRateBps: BasisPoints;
}

export interface SetFeeConfigArgs {
  /** Fee rate in basis points (0-10000) */
  feeRateBps: BasisPoints;
}

export interface CreateMarketArgs {
  /** Unique nonce for market PDA derivation (u64) */
  marketNonce: U64;
  /** Annual interest rate in basis points (0-10000) */
  annualInterestBps: BasisPoints;
  /** Unix timestamp when the loan matures (i64) */
  maturityTimestamp: UnixTimestamp;
  /** Maximum total supply in token smallest units (u64) */
  maxTotalSupply: TokenAmount;
}

export interface DepositArgs {
  /** Amount to deposit in token smallest units (u64) */
  amount: TokenAmount;
}

export interface BorrowArgs {
  /** Amount to borrow in token smallest units (u64) */
  amount: TokenAmount;
}

export interface RepayArgs {
  /** Amount to repay in token smallest units (u64) */
  amount: TokenAmount;
}

export interface RepayInterestArgs {
  /** Amount of interest to repay in token smallest units (u64) */
  amount: TokenAmount;
}

export interface WithdrawArgs {
  /** Scaled amount of shares to withdraw (0 = full withdrawal, u128) */
  scaledAmount: ScaledAmount;
  /**
   * Minimum payout amount for slippage protection (u64).
   * Transaction will revert if actual payout is below this value.
   * Defaults to 0n (disabled) if not provided.
   */
  minPayout?: TokenAmount;
}

/**
 * ReSettle no longer takes arguments - the new settlement factor
 * is computed automatically from the vault balance.
 * @deprecated ReSettle is now permissionless and computes the factor on-chain
 */
export interface ReSettleArgs {
  // No arguments needed - settlement factor computed on-chain
}

export interface SetBorrowerWhitelistArgs {
  /** Whether the borrower is whitelisted */
  isWhitelisted: boolean;
  /** Maximum borrow capacity in token smallest units (u64) */
  maxBorrowCapacity: TokenAmount;
}

export interface SetPauseArgs {
  paused: boolean;
}

export interface SetBlacklistModeArgs {
  failClosed: boolean;
}

/**
 * Instruction account types.
 * Account ordering matches on-chain processor expectations exactly.
 */

export interface InitializeProtocolAccounts {
  protocolConfig: PublicKey;
  admin: PublicKey;
  feeAuthority: PublicKey;
  whitelistManager: PublicKey;
  blacklistProgram: PublicKey;
  systemProgram: PublicKey;
  /** Program data account (derived from program ID via BPF Loader Upgradeable) */
  programData: PublicKey;
}

export interface SetFeeConfigAccounts {
  protocolConfig: PublicKey;
  admin: PublicKey;
  newFeeAuthority: PublicKey;
}

export interface CreateMarketAccounts {
  market: PublicKey;
  borrower: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  protocolConfig: PublicKey;
  borrowerWhitelist: PublicKey;
  blacklistCheck: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  haircutState: PublicKey;
}

export interface DepositAccounts {
  market: PublicKey;
  lender: PublicKey;
  lenderTokenAccount: PublicKey;
  vault: PublicKey;
  lenderPosition: PublicKey;
  blacklistCheck: PublicKey;
  protocolConfig: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  systemProgram: PublicKey;
}

export interface BorrowAccounts {
  market: PublicKey;
  borrower: PublicKey;
  borrowerTokenAccount: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  borrowerWhitelist: PublicKey;
  blacklistCheck: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
}

export interface RepayAccounts {
  market: PublicKey;
  payer: PublicKey;
  payerTokenAccount: PublicKey;
  vault: PublicKey;
  protocolConfig: PublicKey;
  mint: PublicKey;
  /** Borrower whitelist PDA - debt is decremented on repay to allow re-borrowing */
  borrowerWhitelist: PublicKey;
  tokenProgram: PublicKey;
}

export interface WithdrawAccounts {
  market: PublicKey;
  lender: PublicKey;
  lenderTokenAccount: PublicKey;
  vault: PublicKey;
  lenderPosition: PublicKey;
  marketAuthority: PublicKey;
  blacklistCheck: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
  /** HaircutState PDA for tracking distressed withdrawal haircuts */
  haircutState: PublicKey;
}

export interface CollectFeesAccounts {
  market: PublicKey;
  protocolConfig: PublicKey;
  feeAuthority: PublicKey;
  feeTokenAccount: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  tokenProgram: PublicKey;
}

export interface CloseLenderPositionAccounts {
  market: PublicKey;
  lender: PublicKey;
  lenderPosition: PublicKey;
  systemProgram: PublicKey;
  protocolConfig: PublicKey;
}

export interface ReSettleAccounts {
  market: PublicKey;
  vault: PublicKey;
  /** Protocol configuration - required for proper fee accrual during re-settlement */
  protocolConfig: PublicKey;
  /** HaircutState PDA for conservative settlement factor computation */
  haircutState: PublicKey;
}

export interface SetBorrowerWhitelistAccounts {
  borrowerWhitelist: PublicKey;
  protocolConfig: PublicKey;
  whitelistManager: PublicKey;
  borrower: PublicKey;
  systemProgram: PublicKey;
}

export interface SetPauseAccounts {
  protocolConfig: PublicKey;
  admin: PublicKey;
}

export interface SetBlacklistModeAccounts {
  protocolConfig: PublicKey;
  admin: PublicKey;
}

export interface SetAdminAccounts {
  protocolConfig: PublicKey;
  currentAdmin: PublicKey;
  newAdmin: PublicKey;
}

export interface SetWhitelistManagerAccounts {
  protocolConfig: PublicKey;
  admin: PublicKey;
  newWhitelistManager: PublicKey;
}

export interface RepayInterestAccounts {
  market: PublicKey;
  payer: PublicKey;
  payerTokenAccount: PublicKey;
  vault: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
}

export interface WithdrawExcessAccounts {
  market: PublicKey;
  borrower: PublicKey;
  borrowerTokenAccount: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  tokenProgram: PublicKey;
  protocolConfig: PublicKey;
  blacklistCheck: PublicKey;
  borrowerWhitelist: PublicKey;
}

export interface WithdrawExcessArgs {} // Empty - no args

export interface ForceClosePositionAccounts {
  market: PublicKey;
  borrower: PublicKey;
  lenderPosition: PublicKey;
  vault: PublicKey;
  escrowTokenAccount: PublicKey;
  marketAuthority: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
  /** HaircutState PDA for tracking distressed withdrawal haircuts */
  haircutState: PublicKey;
}

export interface ForceClosePositionArgs {} // Empty - no args beyond discriminator

export interface ClaimHaircutAccounts {
  market: PublicKey;
  lender: PublicKey;
  lenderPosition: PublicKey;
  lenderTokenAccount: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  haircutState: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
}

export interface ClaimHaircutArgs {} // Empty - no args beyond discriminator

export interface ForceClaimHaircutAccounts {
  market: PublicKey;
  borrower: PublicKey;
  lenderPosition: PublicKey;
  escrowTokenAccount: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  haircutState: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
}

export interface ForceClaimHaircutArgs {} // Empty - no args beyond discriminator

/**
 * Accounts for a waterfall repay (interest-first, then principal).
 * Combines the accounts needed by both RepayInterest and Repay instructions.
 */
export interface WaterfallRepayAccounts {
  market: PublicKey;
  payer: PublicKey;
  payerTokenAccount: PublicKey;
  vault: PublicKey;
  protocolConfig: PublicKey;
  /** Token mint — required for the principal Repay instruction */
  mint: PublicKey;
  /** Borrower whitelist PDA — required for the principal Repay instruction */
  borrowerWhitelist: PublicKey;
  tokenProgram: PublicKey;
}

/**
 * Arguments for a waterfall repay.
 * The helper splits `totalAmount` into interest-first, then principal.
 */
export interface WaterfallRepayArgs {
  /** Total amount to repay in token smallest units (u64) */
  totalAmount: TokenAmount;
  /** Amount allocated to interest (0 to totalAmount, u64).
   *  The remainder (totalAmount - interestAmount) goes to principal. */
  interestAmount: TokenAmount;
}

/**
 * Accounts for withdraw-and-close (withdraw all remaining balance, then close position).
 * Combines the accounts needed by both Withdraw and CloseLenderPosition instructions.
 */
export interface WithdrawAndCloseAccounts {
  market: PublicKey;
  lender: PublicKey;
  lenderTokenAccount: PublicKey;
  vault: PublicKey;
  lenderPosition: PublicKey;
  marketAuthority: PublicKey;
  blacklistCheck: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
  /** HaircutState PDA for tracking distressed withdrawal haircuts */
  haircutState: PublicKey;
  /** System program — required for closing the position account */
  systemProgram: PublicKey;
}

/**
 * Accounts for claim-haircut-and-close (claim recovery tokens, then close position).
 * Combines the accounts needed by both ClaimHaircut and CloseLenderPosition instructions.
 */
export interface ClaimHaircutAndCloseAccounts {
  market: PublicKey;
  lender: PublicKey;
  lenderPosition: PublicKey;
  lenderTokenAccount: PublicKey;
  vault: PublicKey;
  marketAuthority: PublicKey;
  haircutState: PublicKey;
  protocolConfig: PublicKey;
  tokenProgram: PublicKey;
  /** System program — required for closing the position account */
  systemProgram: PublicKey;
}
