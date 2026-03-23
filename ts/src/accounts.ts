import { type Connection, PublicKey } from '@solana/web3.js';

import {
  PROTOCOL_CONFIG_SIZE,
  MARKET_SIZE,
  LENDER_POSITION_SIZE,
  BORROWER_WHITELIST_SIZE,
  HAIRCUT_STATE_SIZE,
  DISC_PROTOCOL_CONFIG,
  DISC_MARKET,
  DISC_LENDER_POSITION,
  DISC_BORROWER_WL,
  DISC_HAIRCUT_STATE,
} from './constants';
import {
  type ProtocolConfig,
  type Market,
  type LenderPosition,
  type BorrowerWhitelist,
  type HaircutState,
} from './types';

/**
 * Configuration for retry behavior on RPC calls.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, rate limits, server errors).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset')
    ) {
      return true;
    }
    // Rate limiting
    if (message.includes('429') || message.includes('rate limit')) {
      return true;
    }
    // Server errors (502, 503, 504)
    if (message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }
  }
  return false;
}

/**
 * Execute an async function with exponential backoff retry logic.
 */
async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_CONFIG, ...config };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Unknown error during retry');
}

/**
 * Read a u16 from a buffer at the given offset (little-endian).
 */
function readU16LE(buffer: Uint8Array, offset: number): number {
  const b0 = buffer[offset] ?? 0;
  const b1 = buffer[offset + 1] ?? 0;
  return b0 | (b1 << 8);
}

/**
 * Read a u64 from a buffer at the given offset (little-endian).
 */
function readU64LE(buffer: Uint8Array, offset: number): bigint {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getBigUint64(offset, true);
}

/**
 * Read an i64 from a buffer at the given offset (little-endian).
 */
function readI64LE(buffer: Uint8Array, offset: number): bigint {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getBigInt64(offset, true);
}

/**
 * Read a u128 from a buffer at the given offset (little-endian).
 * JavaScript BigInt can handle u128 values.
 */
function readU128LE(buffer: Uint8Array, offset: number): bigint {
  const low = readU64LE(buffer, offset);
  const high = readU64LE(buffer, offset + 8);
  return low + (high << BigInt(64));
}

/**
 * Read a PublicKey from a buffer at the given offset.
 */
function readPublicKey(buffer: Uint8Array, offset: number): PublicKey {
  return new PublicKey(buffer.slice(offset, offset + 32));
}

/**
 * Check that the first 8 bytes of data match the expected discriminator.
 */
function checkDiscriminator(data: Uint8Array, expected: Buffer, accountType: string): void {
  if (Buffer.compare(Buffer.from(data.slice(0, 8)), expected) !== 0) {
    throw new Error(`Invalid ${accountType} discriminator`);
  }
}

/**
 * Decode a ProtocolConfig account from raw bytes.
 *
 * Layout (194 bytes):
 * - discriminator: [u8; 8]          (0-7)
 * - version: u8                     (8)
 * - admin: [u8; 32]                 (9-40)
 * - fee_rate_bps: [u8; 2]           (41-42)
 * - fee_authority: [u8; 32]         (43-74)
 * - whitelist_manager: [u8; 32]     (75-106)
 * - blacklist_program: [u8; 32]     (107-138)
 * - is_initialized: u8              (139)
 * - bump: u8                        (140)
 * - paused: u8                      (141)
 * - blacklist_mode: u8              (142)
 * - _padding: [u8; 51]              (143-193)
 */
export function decodeProtocolConfig(data: Uint8Array): ProtocolConfig {
  if (data.length < PROTOCOL_CONFIG_SIZE) {
    throw new Error(
      `Invalid ProtocolConfig data length: expected ${PROTOCOL_CONFIG_SIZE}, got ${data.length}`
    );
  }

  checkDiscriminator(data, DISC_PROTOCOL_CONFIG, 'ProtocolConfig');

  return {
    version: data[8] ?? 0,
    admin: data.slice(9, 41),
    feeRateBps: readU16LE(data, 41),
    feeAuthority: data.slice(43, 75),
    whitelistManager: data.slice(75, 107),
    blacklistProgram: data.slice(107, 139),
    isInitialized: (data[139] ?? 0) === 1,
    bump: data[140] ?? 0,
    isPaused: (data[141] ?? 0) === 1,
    isBlacklistFailClosed: (data[142] ?? 0) === 1,
  };
}

/**
 * Decode a Market account from raw bytes.
 *
 * Layout (250 bytes):
 * - discriminator: [u8; 8]                (0-7)
 * - version: u8                           (8)
 * - borrower: [u8; 32]                    (9-40)
 * - mint: [u8; 32]                        (41-72)
 * - vault: [u8; 32]                       (73-104)
 * - market_authority_bump: u8             (105)
 * - annual_interest_bps: [u8; 2]          (106-107)
 * - maturity_timestamp: [u8; 8]           (108-115)
 * - max_total_supply: [u8; 8]             (116-123)
 * - market_nonce: [u8; 8]                 (124-131)
 * - scaled_total_supply: [u8; 16]         (132-147)
 * - scale_factor: [u8; 16]               (148-163)
 * - accrued_protocol_fees: [u8; 8]        (164-171)
 * - total_deposited: [u8; 8]              (172-179)
 * - total_borrowed: [u8; 8]               (180-187)
 * - total_repaid: [u8; 8]                 (188-195)
 * - total_interest_repaid: [u8; 8]        (196-203)
 * - last_accrual_timestamp: [u8; 8]       (204-211)
 * - settlement_factor_wad: [u8; 16]       (212-227)
 * - bump: u8                              (228)
 * - haircut_accumulator: [u8; 8]          (229-236)
 * - _padding: [u8; 13]                    (237-249)
 */
export function decodeMarket(data: Uint8Array): Market {
  if (data.length < MARKET_SIZE) {
    throw new Error(`Invalid Market data length: expected ${MARKET_SIZE}, got ${data.length}`);
  }

  checkDiscriminator(data, DISC_MARKET, 'Market');

  return {
    version: data[8] ?? 0,
    borrower: readPublicKey(data, 9),
    mint: readPublicKey(data, 41),
    vault: readPublicKey(data, 73),
    marketAuthorityBump: data[105] ?? 0,
    annualInterestBps: readU16LE(data, 106),
    maturityTimestamp: readI64LE(data, 108),
    maxTotalSupply: readU64LE(data, 116),
    marketNonce: readU64LE(data, 124),
    scaledTotalSupply: readU128LE(data, 132),
    scaleFactor: readU128LE(data, 148),
    accruedProtocolFees: readU64LE(data, 164),
    totalDeposited: readU64LE(data, 172),
    totalBorrowed: readU64LE(data, 180),
    totalRepaid: readU64LE(data, 188),
    totalInterestRepaid: readU64LE(data, 196),
    lastAccrualTimestamp: readI64LE(data, 204),
    settlementFactorWad: readU128LE(data, 212),
    bump: data[228] ?? 0,
    haircutAccumulator: readU64LE(data, 229),
  };
}

/**
 * Decode a LenderPosition account from raw bytes.
 *
 * Layout (128 bytes):
 * - discriminator: [u8; 8]      (0-7)
 * - version: u8                 (8)
 * - market: [u8; 32]            (9-40)
 * - lender: [u8; 32]            (41-72)
 * - scaled_balance: [u8; 16]    (73-88)
 * - bump: u8                    (89)
 * - haircut_owed: [u8; 8]       (90-97)
 * - withdrawal_sf: [u8; 16]     (98-113)
 * - _padding: [u8; 14]          (114-127)
 */
export function decodeLenderPosition(data: Uint8Array): LenderPosition {
  if (data.length < LENDER_POSITION_SIZE) {
    throw new Error(
      `Invalid LenderPosition data length: expected ${LENDER_POSITION_SIZE}, got ${data.length}`
    );
  }

  checkDiscriminator(data, DISC_LENDER_POSITION, 'LenderPosition');

  return {
    version: data[8] ?? 0,
    market: readPublicKey(data, 9),
    lender: readPublicKey(data, 41),
    scaledBalance: readU128LE(data, 73),
    bump: data[89] ?? 0,
    haircutOwed: readU64LE(data, 90),
    withdrawalSf: readU128LE(data, 98),
  };
}

/**
 * Decode a BorrowerWhitelist account from raw bytes.
 *
 * Layout (96 bytes):
 * - discriminator: [u8; 8]          (0-7)
 * - version: u8                     (8)
 * - borrower: [u8; 32]              (9-40)
 * - is_whitelisted: u8              (41)
 * - max_borrow_capacity: [u8; 8]    (42-49)
 * - current_borrowed: [u8; 8]       (50-57)
 * - bump: u8                        (58)
 * - _padding: [u8; 37]              (59-95)
 */
export function decodeBorrowerWhitelist(data: Uint8Array): BorrowerWhitelist {
  if (data.length < BORROWER_WHITELIST_SIZE) {
    throw new Error(
      `Invalid BorrowerWhitelist data length: expected ${BORROWER_WHITELIST_SIZE}, got ${data.length}`
    );
  }

  checkDiscriminator(data, DISC_BORROWER_WL, 'BorrowerWhitelist');

  return {
    version: data[8] ?? 0,
    borrower: readPublicKey(data, 9),
    isWhitelisted: (data[41] ?? 0) === 1,
    maxBorrowCapacity: readU64LE(data, 42),
    currentBorrowed: readU64LE(data, 50),
    bump: data[58] ?? 0,
  };
}

/**
 * Decode a HaircutState account from raw bytes.
 *
 * Layout (88 bytes):
 * - discriminator: [u8; 8]          (0-7)
 * - version: u8                     (8)
 * - market: [u8; 32]                (9-40)
 * - claim_weight_sum: [u8; 16]      (41-56)
 * - claim_offset_sum: [u8; 16]      (57-72)
 * - bump: u8                        (73)
 * - _padding: [u8; 14]              (74-87)
 */
export function decodeHaircutState(data: Uint8Array): HaircutState {
  if (data.length < HAIRCUT_STATE_SIZE) {
    throw new Error(
      `Invalid HaircutState data length: expected ${HAIRCUT_STATE_SIZE}, got ${data.length}`
    );
  }

  checkDiscriminator(data, DISC_HAIRCUT_STATE, 'HaircutState');

  return {
    version: data[8] ?? 0,
    market: readPublicKey(data, 9),
    claimWeightSum: readU128LE(data, 41),
    claimOffsetSum: readU128LE(data, 57),
    bump: data[73] ?? 0,
  };
}

/**
 * Fetch and decode a HaircutState account.
 * Uses exponential backoff retry for resilience against transient RPC failures.
 */
export async function fetchHaircutState(
  connection: Connection,
  address: PublicKey,
  retryConfig?: RetryConfig
): Promise<HaircutState | null> {
  return withRetry(async () => {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null;
    }
    return decodeHaircutState(accountInfo.data);
  }, retryConfig);
}

/**
 * Fetch and decode a ProtocolConfig account.
 * Uses exponential backoff retry for resilience against transient RPC failures.
 */
export async function fetchProtocolConfig(
  connection: Connection,
  address: PublicKey,
  retryConfig?: RetryConfig
): Promise<ProtocolConfig | null> {
  return withRetry(async () => {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null;
    }
    return decodeProtocolConfig(accountInfo.data);
  }, retryConfig);
}

/**
 * Fetch and decode a Market account.
 * Uses exponential backoff retry for resilience against transient RPC failures.
 */
export async function fetchMarket(
  connection: Connection,
  address: PublicKey,
  retryConfig?: RetryConfig
): Promise<Market | null> {
  return withRetry(async () => {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null;
    }
    return decodeMarket(accountInfo.data);
  }, retryConfig);
}

/**
 * Fetch and decode a LenderPosition account.
 * Uses exponential backoff retry for resilience against transient RPC failures.
 */
export async function fetchLenderPosition(
  connection: Connection,
  address: PublicKey,
  retryConfig?: RetryConfig
): Promise<LenderPosition | null> {
  return withRetry(async () => {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null;
    }
    return decodeLenderPosition(accountInfo.data);
  }, retryConfig);
}

/**
 * Fetch and decode a BorrowerWhitelist account.
 * Uses exponential backoff retry for resilience against transient RPC failures.
 */
export async function fetchBorrowerWhitelist(
  connection: Connection,
  address: PublicKey,
  retryConfig?: RetryConfig
): Promise<BorrowerWhitelist | null> {
  return withRetry(async () => {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null;
    }
    return decodeBorrowerWhitelist(accountInfo.data);
  }, retryConfig);
}

/**
 * Determine account type from data length.
 */
export type AccountType =
  | 'ProtocolConfig'
  | 'Market'
  | 'LenderPosition'
  | 'BorrowerWhitelist'
  | 'HaircutState';

export function getAccountType(dataLength: number): AccountType | null {
  switch (dataLength) {
    case PROTOCOL_CONFIG_SIZE:
      return 'ProtocolConfig';
    case MARKET_SIZE:
      return 'Market';
    case LENDER_POSITION_SIZE:
      return 'LenderPosition';
    case BORROWER_WHITELIST_SIZE:
      return 'BorrowerWhitelist';
    case HAIRCUT_STATE_SIZE:
      return 'HaircutState';
    default:
      return null;
  }
}

/**
 * Decode any CoalesceFi account from raw data.
 */
export function decodeAccount(
  data: Uint8Array
): ProtocolConfig | Market | LenderPosition | BorrowerWhitelist | HaircutState | null {
  const accountType = getAccountType(data.length);
  switch (accountType) {
    case 'ProtocolConfig':
      return decodeProtocolConfig(data);
    case 'Market':
      return decodeMarket(data);
    case 'LenderPosition':
      return decodeLenderPosition(data);
    case 'BorrowerWhitelist':
      return decodeBorrowerWhitelist(data);
    case 'HaircutState':
      return decodeHaircutState(data);
    default:
      return null;
  }
}
