import { type PublicKey, TransactionInstruction } from '@solana/web3.js';

import { getProgramId, InstructionDiscriminator } from './constants';
import {
  type InitializeProtocolArgs,
  type InitializeProtocolAccounts,
  type SetFeeConfigArgs,
  type SetFeeConfigAccounts,
  type CreateMarketArgs,
  type CreateMarketAccounts,
  type DepositArgs,
  type DepositAccounts,
  type BorrowArgs,
  type BorrowAccounts,
  type RepayArgs,
  type RepayAccounts,
  type RepayInterestArgs,
  type RepayInterestAccounts,
  type WithdrawArgs,
  type WithdrawAccounts,
  type CollectFeesAccounts,
  type CloseLenderPositionAccounts,
  type ReSettleAccounts,
  type SetBorrowerWhitelistArgs,
  type SetBorrowerWhitelistAccounts,
  type SetPauseArgs,
  type SetPauseAccounts,
  type SetBlacklistModeArgs,
  type SetBlacklistModeAccounts,
  type SetAdminAccounts,
  type SetWhitelistManagerAccounts,
  type WithdrawExcessAccounts,
  type ForceClosePositionAccounts,
  type WaterfallRepayAccounts,
  type WaterfallRepayArgs,
  type ClaimHaircutAccounts,
  type ForceClaimHaircutAccounts,
} from './types';

/**
 * Idempotency key for client-side duplicate detection.
 * Use this to prevent duplicate transactions from being submitted.
 *
 * The key is typically a UUID or hash that uniquely identifies the operation.
 * Store the key with its status in your application database.
 */
export interface IdempotencyOptions {
  /**
   * Unique key for this operation.
   * If provided, can be used for client-side deduplication.
   */
  idempotencyKey?: string;
  /**
   * Optional memo to include in transaction for logging/tracking.
   * Will be added as a Memo program instruction if provided.
   */
  memo?: string;
}

/**
 * Generate a unique idempotency key using cryptographically secure randomness.
 * Uses crypto.randomUUID if available, falls back to crypto.getRandomValues.
 *
 * @returns A unique UUID v4 string
 * @throws Error if no secure random source is available
 */
export function generateIdempotencyKey(): string {
  // Priority 1: Use native randomUUID if available (Node.js 14.17+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Priority 2: Use getRandomValues to construct a UUID v4
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant (RFC 4122) bits
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant RFC 4122

    // Convert to hex string with UUID format
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  }

  // Priority 3: Node.js crypto module (for older Node.js versions)
  try {
    // Dynamic require to avoid bundler issues in browser environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as {
      randomUUID?: () => string;
      randomBytes?: (size: number) => Buffer;
    };
    if (nodeCrypto !== null && typeof nodeCrypto.randomUUID === 'function') {
      return nodeCrypto.randomUUID();
    }
    if (nodeCrypto !== null && typeof nodeCrypto.randomBytes === 'function') {
      const bytes = nodeCrypto.randomBytes(16);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      return [
        bytes.toString('hex', 0, 4),
        bytes.toString('hex', 4, 6),
        bytes.toString('hex', 6, 8),
        bytes.toString('hex', 8, 10),
        bytes.toString('hex', 10, 16),
      ].join('-');
    }
  } catch {
    // Node crypto not available
  }

  // No secure random source available - throw instead of using insecure fallback
  throw new Error(
    'No cryptographically secure random source available. ' +
      'Idempotency keys require crypto.randomUUID(), crypto.getRandomValues(), ' +
      "or Node.js crypto module. If you're in a test environment, " +
      'consider using createDeterministicIdempotencyKey() instead.'
  );
}

/**
 * Create a deterministic idempotency key from operation parameters.
 * Useful for ensuring the same operation always gets the same key.
 *
 * @param operation - The operation type (e.g., 'deposit', 'borrow')
 * @param params - Key parameters that uniquely identify the operation
 * @returns A deterministic key based on the inputs
 */
export function createDeterministicIdempotencyKey(
  operation: string,
  params: Record<string, string | number | bigint>
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}:${String(params[key])}`)
    .join('|');
  return `${operation}:${sortedParams}`;
}

/**
 * Memo Program ID for adding memos to transactions.
 * Memos can be used for idempotency tracking and transaction logging.
 */
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/**
 * Create a memo instruction for idempotency tracking.
 * Add this instruction to your transaction to include a searchable memo.
 *
 * @param memo - The memo text (max 566 bytes)
 * @param signerPubkeys - Optional signer pubkeys for the memo
 */
export function createMemoInstruction(
  memo: string,
  signerPubkeys: PublicKey[] = []
): TransactionInstruction {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { PublicKey: PubKey } = require('@solana/web3.js') as {
    PublicKey: typeof PublicKey;
  };
  return new TransactionInstruction({
    programId: new PubKey(MEMO_PROGRAM_ID),
    keys: signerPubkeys.map((pubkey) => ({
      pubkey,
      isSigner: true,
      isWritable: false,
    })),
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Wrapper result for instruction creation with idempotency support.
 */
export interface InstructionResult {
  /** The main instruction */
  instruction: TransactionInstruction;
  /** Optional memo instruction for tracking */
  memoInstruction?: TransactionInstruction;
  /** The idempotency key used (if any) */
  idempotencyKey?: string;
}

/**
 * Wrap an instruction with idempotency support.
 */
function wrapWithIdempotency(
  instruction: TransactionInstruction,
  options?: IdempotencyOptions
): InstructionResult {
  const result: InstructionResult = { instruction };

  if (options?.idempotencyKey !== undefined && options.idempotencyKey !== '') {
    result.idempotencyKey = options.idempotencyKey;
  }

  if (options?.memo !== undefined && options.memo !== '') {
    result.memoInstruction = createMemoInstruction(options.memo);
  }

  return result;
}

/**
 * Helper to write a u16 to a buffer (little-endian).
 */
function writeU16LE(buffer: Buffer, value: number, offset: number): void {
  buffer.writeUInt16LE(value, offset);
}

/**
 * Helper to write a u64 to a buffer (little-endian).
 */
function writeU64LE(buffer: Buffer, value: bigint, offset: number): void {
  buffer.writeBigUInt64LE(value, offset);
}

/**
 * Helper to write an i64 to a buffer (little-endian).
 */
function writeI64LE(buffer: Buffer, value: bigint, offset: number): void {
  buffer.writeBigInt64LE(value, offset);
}

/** Maximum u64 value */
const MAX_U64 = BigInt('18446744073709551615');

/** Maximum u128 value */
const MAX_U128 = BigInt('340282366920938463463374607431768211455');

/** Maximum basis points (100%) */
const MAX_BPS = 10000;

/**
 * Minimum token amount threshold for precision warnings.
 * Amounts below this may experience precision loss in scaled calculations.
 * Default: 1000 base units (e.g., 0.001 USDC for 6 decimals)
 */
const PRECISION_WARNING_THRESHOLD = BigInt(1000);

/**
 * Configurable minimum timestamp for validation.
 * Default: 2020-01-01 00:00:00 UTC (1577836800)
 * Can be overridden via setMinimumTimestamp()
 */
let minimumTimestamp = BigInt(1577836800);

/**
 * Set the minimum allowed timestamp for validation.
 * Timestamps before this value will be rejected.
 *
 * @param timestamp - Unix timestamp in seconds
 */
export function setMinimumTimestamp(timestamp: bigint): void {
  if (timestamp < BigInt(0)) {
    throw new Error('Minimum timestamp cannot be negative');
  }
  minimumTimestamp = timestamp;
}

/**
 * Get the current minimum timestamp setting.
 */
export function getMinimumTimestamp(): bigint {
  return minimumTimestamp;
}

/**
 * Reset minimum timestamp to default (2020-01-01).
 * Useful for testing.
 */
export function resetMinimumTimestamp(): void {
  minimumTimestamp = BigInt(1577836800);
}

/**
 * Validation result with optional warnings.
 */
export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Check if a PublicKey is the zero address (all zeros).
 *
 * @param pubkey - The PublicKey to check
 * @returns true if the pubkey is all zeros
 */
export function isZeroAddress(pubkey: PublicKey): boolean {
  const bytes = pubkey.toBytes();
  for (let i = 0; i < 32; i++) {
    if (bytes[i] !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Validate that a PublicKey is not the zero address.
 *
 * @param pubkey - The PublicKey to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if the pubkey is the zero address
 */
export function validateNonZeroAddress(pubkey: PublicKey, fieldName: string): void {
  if (isZeroAddress(pubkey)) {
    throw new Error(
      `${fieldName} cannot be the zero address (11111111111111111111111111111111). ` +
        'Provide a valid public key.'
    );
  }
}

/**
 * Validate that a bigint value fits in u64.
 * @throws Error if value is negative or exceeds u64 max
 */
export function validateU64(value: bigint, fieldName: string): void {
  if (typeof value !== 'bigint') {
    throw new Error(`${fieldName} must be a bigint, got ${typeof value}`);
  }
  if (value < BigInt(0)) {
    throw new Error(`${fieldName} cannot be negative: ${value}`);
  }
  if (value > MAX_U64) {
    throw new Error(`${fieldName} exceeds maximum u64 value: ${value} > ${MAX_U64}`);
  }
}

/**
 * Validate that a bigint value fits in u128.
 * @throws Error if value is negative or exceeds u128 max
 */
export function validateU128(value: bigint, fieldName: string): void {
  if (typeof value !== 'bigint') {
    throw new Error(`${fieldName} must be a bigint, got ${typeof value}`);
  }
  if (value < BigInt(0)) {
    throw new Error(`${fieldName} cannot be negative: ${value}`);
  }
  if (value > MAX_U128) {
    throw new Error(`${fieldName} exceeds maximum u128 value: ${value}`);
  }
}

/**
 * Validate basis points (0-10000).
 * @throws Error if value is out of range
 */
export function validateBasisPoints(value: number, fieldName: string): void {
  if (typeof value !== 'number') {
    throw new Error(`${fieldName} must be a number, got ${typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer: ${value}`);
  }
  if (value < 0 || value > MAX_BPS) {
    throw new Error(`${fieldName} must be between 0 and ${MAX_BPS}: ${value}`);
  }
}

/**
 * Validate that a timestamp is reasonable (not negative, not before minimum).
 * @throws Error if timestamp is invalid
 */
export function validateTimestamp(value: bigint, fieldName: string): void {
  if (typeof value !== 'bigint') {
    throw new Error(`${fieldName} must be a bigint, got ${typeof value}`);
  }
  if (value < BigInt(0)) {
    throw new Error(`${fieldName} cannot be negative: ${value}`);
  }
  if (value < minimumTimestamp) {
    const minDate = new Date(Number(minimumTimestamp) * 1000).toISOString().split('T')[0];
    throw new Error(
      `${fieldName} appears to be too early (before ${minDate}): ${value}. ` +
        'If this is intentional, use setMinimumTimestamp() to adjust the threshold.'
    );
  }
}

/**
 * Validate a token amount and return warnings for potential precision issues.
 *
 * @param amount - The amount to validate
 * @param fieldName - Name of the field for error/warning messages
 * @returns ValidationResult with warnings about precision loss
 */
export function validateAmountWithWarnings(amount: bigint, fieldName: string): ValidationResult {
  const warnings: string[] = [];

  validateU64(amount, fieldName);

  if (amount > BigInt(0) && amount < PRECISION_WARNING_THRESHOLD) {
    warnings.push(
      `${fieldName} (${amount}) is very small and may experience precision loss ` +
        `when converted to scaled amounts. Consider amounts >= ${PRECISION_WARNING_THRESHOLD}.`
    );
  }

  return { valid: true, warnings };
}

/**
 * Validate all accounts in an instruction for zero addresses.
 *
 * @param accounts - Object containing PublicKey fields
 * @param excludeFields - Optional array of field names to skip validation
 * @throws Error if any required account is a zero address
 */
export function validateAccountsNotZero(
  accounts: Record<string, PublicKey>,
  excludeFields: string[] = []
): void {
  const excludeSet = new Set(excludeFields);
  for (const [fieldName, pubkey] of Object.entries(accounts)) {
    if (!excludeSet.has(fieldName) && isZeroAddress(pubkey)) {
      throw new Error(
        `Account "${fieldName}" cannot be the zero address. ` +
          'All accounts must be valid public keys.'
      );
    }
  }
}

/**
 * Helper to write a u128 to a buffer (little-endian).
 * @throws Error if value exceeds u128 max
 */
function writeU128LE(buffer: Buffer, value: bigint, offset: number): void {
  validateU128(value, 'u128 value');
  const low = value & BigInt('0xFFFFFFFFFFFFFFFF');
  const high = value >> BigInt(64);
  buffer.writeBigUInt64LE(low, offset);
  buffer.writeBigUInt64LE(high, offset + 8);
}

/**
 * Create InitializeProtocol instruction.
 * Discriminator: 0
 *
 * On-chain account order: [protocol_config, admin, fee_authority, whitelist_manager, blacklist_program, system_program, program_data]
 * Data layout: [disc(1 byte), fee_rate_bps(2 bytes)]
 *
 * Note: Only the program's upgrade authority can initialize the protocol.
 * The program_data account is derived from the program ID via BPF Loader Upgradeable.
 */
export function createInitializeProtocolInstruction(
  accounts: InitializeProtocolAccounts,
  args: InitializeProtocolArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateBasisPoints(args.feeRateBps, 'feeRateBps');

  const data = Buffer.alloc(1 + 2);
  let offset = 0;

  data.writeUInt8(InstructionDiscriminator.InitializeProtocol, offset);
  offset += 1;

  writeU16LE(data, args.feeRateBps, offset);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.admin, isSigner: true, isWritable: true },
      { pubkey: accounts.feeAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.whitelistManager, isSigner: false, isWritable: false },
      { pubkey: accounts.blacklistProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.programData, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create SetFeeConfig instruction.
 * Discriminator: 1
 *
 * On-chain account order: [protocol_config, admin, new_fee_authority]
 * Data layout: [fee_rate_bps(2 bytes)]
 */
export function createSetFeeConfigInstruction(
  accounts: SetFeeConfigAccounts,
  args: SetFeeConfigArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateBasisPoints(args.feeRateBps, 'feeRateBps');

  const data = Buffer.alloc(1 + 2);
  let offset = 0;

  data.writeUInt8(InstructionDiscriminator.SetFeeConfig, offset);
  offset += 1;

  writeU16LE(data, args.feeRateBps, offset);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.newFeeAuthority, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create CreateMarket instruction.
 * Discriminator: 2
 *
 * On-chain account order: [market, borrower, mint, vault, market_authority, protocol_config, borrower_whitelist, blacklist_check, system_program, token_program]
 * Data layout: [market_nonce(8), annual_interest_bps(2), maturity_timestamp(8), max_total_supply(8)]
 */
export function createCreateMarketInstruction(
  accounts: CreateMarketAccounts,
  args: CreateMarketArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateU64(args.marketNonce, 'marketNonce');
  validateBasisPoints(args.annualInterestBps, 'annualInterestBps');
  validateTimestamp(args.maturityTimestamp, 'maturityTimestamp');
  validateU64(args.maxTotalSupply, 'maxTotalSupply');
  if (args.maxTotalSupply === BigInt(0)) {
    throw new Error('maxTotalSupply must be greater than 0');
  }

  const data = Buffer.alloc(1 + 8 + 2 + 8 + 8);
  let offset = 0;

  data.writeUInt8(InstructionDiscriminator.CreateMarket, offset);
  offset += 1;

  writeU64LE(data, args.marketNonce, offset);
  offset += 8;

  writeU16LE(data, args.annualInterestBps, offset);
  offset += 2;

  writeI64LE(data, args.maturityTimestamp, offset);
  offset += 8;

  writeU64LE(data, args.maxTotalSupply, offset);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.borrower, isSigner: true, isWritable: true },
      { pubkey: accounts.mint, isSigner: false, isWritable: false },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.borrowerWhitelist, isSigner: false, isWritable: false },
      { pubkey: accounts.blacklistCheck, isSigner: false, isWritable: false },
      { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.haircutState, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Create Deposit instruction.
 * Discriminator: 3
 *
 * On-chain account order: [market, lender, lender_token, vault, lender_position, blacklist_check, protocol_config, mint, token_program, system_program]
 * Data layout: [amount(8 bytes)]
 */
export function createDepositInstruction(
  accounts: DepositAccounts,
  args: DepositArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateU64(args.amount, 'amount');
  if (args.amount === BigInt(0)) {
    throw new Error('Deposit amount must be greater than 0');
  }

  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(InstructionDiscriminator.Deposit, 0);
  writeU64LE(data, args.amount, 1);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.lender, isSigner: true, isWritable: true },
      { pubkey: accounts.lenderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.lenderPosition, isSigner: false, isWritable: true },
      { pubkey: accounts.blacklistCheck, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.mint, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create Borrow instruction.
 * Discriminator: 4
 *
 * On-chain account order: [market, borrower, borrower_token, vault, market_authority, borrower_whitelist, blacklist_check, protocol_config, token_program]
 * Data layout: [amount(8 bytes)]
 */
export function createBorrowInstruction(
  accounts: BorrowAccounts,
  args: BorrowArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateU64(args.amount, 'amount');
  if (args.amount === BigInt(0)) {
    throw new Error('Borrow amount must be greater than 0');
  }

  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(InstructionDiscriminator.Borrow, 0);
  writeU64LE(data, args.amount, 1);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.borrower, isSigner: true, isWritable: false },
      { pubkey: accounts.borrowerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.borrowerWhitelist, isSigner: false, isWritable: true },
      { pubkey: accounts.blacklistCheck, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create Repay instruction.
 * Discriminator: 5
 *
 * On-chain account order: [market, payer, payer_token, vault, protocol_config, mint, borrower_whitelist, token_program]
 * Data layout: [amount(8 bytes)]
 *
 * Note: The borrower_whitelist account is derived from the market's borrower address.
 * On repay, the current_borrowed is decremented to allow re-borrowing up to max_borrow_capacity.
 */
export function createRepayInstruction(
  accounts: RepayAccounts,
  args: RepayArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateU64(args.amount, 'amount');
  if (args.amount === BigInt(0)) {
    throw new Error('Repay amount must be greater than 0');
  }

  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(InstructionDiscriminator.Repay, 0);
  writeU64LE(data, args.amount, 1);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.payer, isSigner: true, isWritable: false },
      { pubkey: accounts.payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.mint, isSigner: false, isWritable: false },
      { pubkey: accounts.borrowerWhitelist, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create Withdraw instruction.
 * Discriminator: 7
 *
 * On-chain account order: [market, lender, lender_token, vault, lender_position, market_authority, blacklist_check, protocol_config, token_program, haircut_state]
 * Data layout: [scaled_amount(16 bytes, u128), min_payout(8 bytes, u64)]
 *
 * SECURITY NOTE: The min_payout parameter provides slippage protection.
 * In distressed markets (settlement_factor < WAD), the actual payout may be
 * less than expected. Set min_payout to protect against receiving less than
 * an acceptable amount. Set to 0 to disable slippage protection.
 *
 * SECURITY NOTE: First withdrawal after maturity triggers settlement factor lock.
 * A 5-minute grace period (SETTLEMENT_GRACE_PERIOD) prevents front-running.
 */
export function createWithdrawInstruction(
  accounts: WithdrawAccounts,
  args: Omit<WithdrawArgs, 'minPayout'> & { minPayout?: bigint },
  programId?: PublicKey
): TransactionInstruction {
  // Default minPayout to 0n if not provided (no slippage protection)
  const minPayout = args.minPayout ?? BigInt(0);

  // Validate inputs
  validateU128(args.scaledAmount, 'scaledAmount');
  validateU64(minPayout, 'minPayout');

  // Updated: now 24 bytes for data (was 16)
  const data = Buffer.alloc(1 + 16 + 8);
  data.writeUInt8(InstructionDiscriminator.Withdraw, 0);
  writeU128LE(data, args.scaledAmount, 1);
  writeU64LE(data, minPayout, 17); // Slippage protection (0 = disabled)

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.lender, isSigner: true, isWritable: false },
      { pubkey: accounts.lenderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.lenderPosition, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.blacklistCheck, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.haircutState, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Create CollectFees instruction.
 * Discriminator: 8
 *
 * On-chain account order: [market, protocol_config, fee_authority, fee_destination, vault, market_authority, token_program]
 * Data layout: [discriminator only]
 */
export function createCollectFeesInstruction(
  accounts: CollectFeesAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.CollectFees, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.feeAuthority, isSigner: true, isWritable: false },
      { pubkey: accounts.feeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create CloseLenderPosition instruction.
 * Discriminator: 10
 *
 * On-chain account order: [market, lender, lender_position, system_program, protocol_config]
 * Data layout: [discriminator only]
 */
export function createCloseLenderPositionInstruction(
  accounts: CloseLenderPositionAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.CloseLenderPosition, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.lender, isSigner: true, isWritable: true },
      { pubkey: accounts.lenderPosition, isSigner: false, isWritable: true },
      { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create ReSettle instruction.
 * Discriminator: 9
 *
 * On-chain account order: [market, vault, protocol_config, haircut_state]
 * Data layout: [discriminator only] — permissionless, no args
 *
 * SECURITY NOTE: ReSettle now requires protocol_config to ensure proper
 * fee accrual during re-settlement. Previously used a zeroed config which
 * could bypass protocol fees.
 *
 * The new settlement factor is computed automatically from the vault balance.
 * It must be strictly greater than the current settlement factor.
 */
export function createReSettleInstruction(
  accounts: ReSettleAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.ReSettle, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.haircutState, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create SetBorrowerWhitelist instruction.
 * Discriminator: 12
 *
 * On-chain account order: [borrower_whitelist, protocol_config, whitelist_manager, borrower, system_program]
 * Data layout: [is_whitelisted(1 byte), max_borrow_capacity(8 bytes)]
 */
export function createSetBorrowerWhitelistInstruction(
  accounts: SetBorrowerWhitelistAccounts,
  args: SetBorrowerWhitelistArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateU64(args.maxBorrowCapacity, 'maxBorrowCapacity');

  const data = Buffer.alloc(1 + 1 + 8);
  data.writeUInt8(InstructionDiscriminator.SetBorrowerWhitelist, 0);
  data.writeUInt8(args.isWhitelisted ? 1 : 0, 1);
  writeU64LE(data, args.maxBorrowCapacity, 2);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.borrowerWhitelist, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.whitelistManager, isSigner: true, isWritable: true },
      { pubkey: accounts.borrower, isSigner: false, isWritable: false },
      { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create SetPause instruction.
 * Discriminator: 13
 *
 * On-chain account order: [protocol_config, admin]
 * Data layout: [paused(1 byte)]
 */
export function createSetPauseInstruction(
  accounts: SetPauseAccounts,
  args: SetPauseArgs,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1 + 1);
  data.writeUInt8(InstructionDiscriminator.SetPause, 0);
  data.writeUInt8(args.paused ? 1 : 0, 1);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/**
 * Create SetBlacklistMode instruction.
 * Discriminator: 14
 *
 * On-chain account order: [protocol_config, admin]
 * Data layout: [fail_closed(1 byte)]
 */
export function createSetBlacklistModeInstruction(
  accounts: SetBlacklistModeAccounts,
  args: SetBlacklistModeArgs,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1 + 1);
  data.writeUInt8(InstructionDiscriminator.SetBlacklistMode, 0);
  data.writeUInt8(args.failClosed ? 1 : 0, 1);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/**
 * Create SetAdmin instruction.
 * Discriminator: 15
 *
 * Transfers admin role to a new address. Only the current admin can call this.
 *
 * On-chain account order: [protocol_config, current_admin, new_admin]
 * Data layout: (no data)
 */
export function createSetAdminInstruction(
  accounts: SetAdminAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.SetAdmin, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.currentAdmin, isSigner: true, isWritable: false },
      { pubkey: accounts.newAdmin, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create SetWhitelistManager instruction.
 * Discriminator: 16
 *
 * Changes the whitelist manager to a new address. Only the admin can call this.
 *
 * On-chain account order: [protocol_config, admin, new_whitelist_manager]
 * Data layout: (no data)
 */
export function createSetWhitelistManagerInstruction(
  accounts: SetWhitelistManagerAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.SetWhitelistManager, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: true },
      { pubkey: accounts.admin, isSigner: true, isWritable: false },
      { pubkey: accounts.newWhitelistManager, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create RepayInterest instruction.
 * Discriminator: 6
 *
 * Repay accrued interest to the market vault WITHOUT affecting borrower capacity.
 * Unlike regular repay, this does NOT decrement current_borrowed.
 * Use this for interest-only payments to prevent the exploit where interest
 * payments incorrectly free up borrowing capacity.
 *
 * On-chain account order: [market, payer, payer_token, vault, protocol_config, token_program]
 * Data layout: [amount(8 bytes)]
 */
export function createRepayInterestInstruction(
  accounts: RepayInterestAccounts,
  args: RepayInterestArgs,
  programId?: PublicKey
): TransactionInstruction {
  // Validate inputs
  validateU64(args.amount, 'amount');
  if (args.amount === BigInt(0)) {
    throw new Error('Repay interest amount must be greater than 0');
  }

  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(InstructionDiscriminator.RepayInterest, 0);
  writeU64LE(data, args.amount, 1);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.payer, isSigner: true, isWritable: false },
      { pubkey: accounts.payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create WithdrawExcess instruction.
 * Discriminator: 11
 *
 * Allows the borrower to withdraw excess funds from the vault.
 * Only the market's borrower can call this instruction.
 *
 * On-chain account order: [market, borrower, borrower_token, vault, market_authority, token_program, protocol_config, blacklist_check, borrower_whitelist]
 * Data layout: [discriminator only]
 */
export function createWithdrawExcessInstruction(
  accounts: WithdrawExcessAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.WithdrawExcess, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: false },
      { pubkey: accounts.borrower, isSigner: true, isWritable: false },
      { pubkey: accounts.borrowerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.blacklistCheck, isSigner: false, isWritable: false },
      { pubkey: accounts.borrowerWhitelist, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create ForceClosePosition instruction.
 * Discriminator: 18
 *
 * Force-close an abandoned lender position after maturity plus the settlement grace period.
 * Only the market's borrower can call this instruction.
 *
 * On-chain account order: [market, borrower, lender_position, vault, escrow_token_account, market_authority, protocol_config, token_program, haircut_state]
 * Data layout: [discriminator only]
 */
export function createForceClosePositionInstruction(
  accounts: ForceClosePositionAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.ForceClosePosition, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.borrower, isSigner: true, isWritable: false },
      { pubkey: accounts.lenderPosition, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.haircutState, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Create ClaimHaircut instruction.
 * Discriminator: 19
 *
 * Lender claims proportional recovery of their haircut when the settlement
 * factor has improved since their distressed withdrawal.
 *
 * On-chain account order: [market, lender, lender_position, lender_token, vault, market_authority, haircut_state, protocol_config, token_program]
 * Data layout: [discriminator only]
 */
export function createClaimHaircutInstruction(
  accounts: ClaimHaircutAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.ClaimHaircut, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.lender, isSigner: true, isWritable: false },
      { pubkey: accounts.lenderPosition, isSigner: false, isWritable: true },
      { pubkey: accounts.lenderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.haircutState, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create ForceClaimHaircut instruction.
 * Discriminator: 20
 *
 * Borrower force-claims a haircut on behalf of an abandoned or blacklisted lender.
 * Mirrors force_close_position: borrower signs, funds go to the lender's escrow
 * token account.
 *
 * On-chain account order: [market, borrower, lender_position, escrow_token, vault, market_authority, haircut_state, protocol_config, token_program]
 * Data layout: [discriminator only]
 */
export function createForceClaimHaircutInstruction(
  accounts: ForceClaimHaircutAccounts,
  programId?: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(InstructionDiscriminator.ForceClaimHaircut, 0);

  const resolvedProgramId = programId ?? getProgramId();
  return new TransactionInstruction({
    programId: resolvedProgramId,
    keys: [
      { pubkey: accounts.market, isSigner: false, isWritable: true },
      { pubkey: accounts.borrower, isSigner: true, isWritable: false },
      { pubkey: accounts.lenderPosition, isSigner: false, isWritable: true },
      { pubkey: accounts.escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.haircutState, isSigner: false, isWritable: true },
      { pubkey: accounts.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create waterfall repay instructions: interest-first, then principal.
 *
 * Builds up to two instructions that should be added to a single transaction:
 * 1. RepayInterest (if interestAmount > 0) — pays accrued interest
 * 2. Repay (if totalAmount - interestAmount > 0) — repays principal and frees borrow capacity
 *
 * Interest is paid first so that on-chain state is correct when the principal
 * instruction executes. This matches the web frontend's useWaterfallRepay flow.
 *
 * @returns Array of 0-2 TransactionInstruction objects to add to a Transaction.
 *          Empty array if totalAmount is 0.
 */
export function createWaterfallRepayInstructions(
  accounts: WaterfallRepayAccounts,
  args: WaterfallRepayArgs,
  programId?: PublicKey
): TransactionInstruction[] {
  validateU64(args.totalAmount, 'totalAmount');
  validateU64(args.interestAmount, 'interestAmount');

  if (args.interestAmount > args.totalAmount) {
    throw new Error('interestAmount cannot exceed totalAmount');
  }

  if (args.totalAmount === 0n) {
    return [];
  }

  const instructions: TransactionInstruction[] = [];

  // Interest instruction first (so on-chain state is correct when principal executes)
  if (args.interestAmount > 0n) {
    const interestIx = createRepayInterestInstruction(
      {
        market: accounts.market,
        payer: accounts.payer,
        payerTokenAccount: accounts.payerTokenAccount,
        vault: accounts.vault,
        protocolConfig: accounts.protocolConfig,
        tokenProgram: accounts.tokenProgram,
      },
      { amount: args.interestAmount },
      programId
    );
    instructions.push(interestIx);
  }

  // Principal instruction for the remainder
  const principalAmount = args.totalAmount - args.interestAmount;
  if (principalAmount > 0n) {
    const principalIx = createRepayInstruction(
      {
        market: accounts.market,
        payer: accounts.payer,
        payerTokenAccount: accounts.payerTokenAccount,
        vault: accounts.vault,
        protocolConfig: accounts.protocolConfig,
        mint: accounts.mint,
        borrowerWhitelist: accounts.borrowerWhitelist,
        tokenProgram: accounts.tokenProgram,
      },
      { amount: principalAmount },
      programId
    );
    instructions.push(principalIx);
  }

  return instructions;
}

/**
 * Idempotency-aware instruction builders.
 *
 * These versions of the instruction builders return an InstructionResult
 * that includes idempotency tracking information.
 */

/**
 * Create a deposit instruction with idempotency support.
 */
export function createDepositInstructionWithIdempotency(
  accounts: DepositAccounts,
  args: DepositArgs,
  options?: IdempotencyOptions,
  programId?: PublicKey
): InstructionResult {
  const instruction = createDepositInstruction(accounts, args, programId);
  return wrapWithIdempotency(instruction, options);
}

/**
 * Create a borrow instruction with idempotency support.
 */
export function createBorrowInstructionWithIdempotency(
  accounts: BorrowAccounts,
  args: BorrowArgs,
  options?: IdempotencyOptions,
  programId?: PublicKey
): InstructionResult {
  const instruction = createBorrowInstruction(accounts, args, programId);
  return wrapWithIdempotency(instruction, options);
}

/**
 * Create a repay instruction with idempotency support.
 */
export function createRepayInstructionWithIdempotency(
  accounts: RepayAccounts,
  args: RepayArgs,
  options?: IdempotencyOptions,
  programId?: PublicKey
): InstructionResult {
  const instruction = createRepayInstruction(accounts, args, programId);
  return wrapWithIdempotency(instruction, options);
}

/**
 * Create a withdraw instruction with idempotency support.
 */
export function createWithdrawInstructionWithIdempotency(
  accounts: WithdrawAccounts,
  args: WithdrawArgs,
  options?: IdempotencyOptions,
  programId?: PublicKey
): InstructionResult {
  const instruction = createWithdrawInstruction(accounts, args, programId);
  return wrapWithIdempotency(instruction, options);
}
