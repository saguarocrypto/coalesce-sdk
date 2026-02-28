/**
 * CoalesceFi program error codes.
 * Must match the Rust LendingError enum exactly.
 *
 * Errors are organized by category:
 * - INITIALIZATION ERRORS (0-4)
 * - AUTHORIZATION ERRORS (5-9)
 * - ACCOUNT VALIDATION ERRORS (10-16)
 * - INPUT VALIDATION ERRORS (17-20)
 * - BALANCE/CAPACITY ERRORS (21-27)
 * - MARKET STATE ERRORS (28-35)
 * - FEE/WITHDRAWAL ERRORS (36-40)
 * - OPERATIONAL ERRORS (41-42)
 */
export enum CoalescefiErrorCode {
  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION ERRORS (0-4)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-001: ProtocolConfig already exists */
  AlreadyInitialized = 0,
  /** ERR-002: Fee rate exceeds 10,000 bps */
  InvalidFeeRate = 1,
  /** ERR-003: max_total_supply is 0 */
  InvalidCapacity = 2,
  /** ERR-004: Maturity not in future */
  InvalidMaturity = 3,
  /** ERR-005: Market PDA already initialized */
  MarketAlreadyExists = 4,

  // ═══════════════════════════════════════════════════════════════
  // AUTHORIZATION ERRORS (5-9)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-006: Signer lacks authority */
  Unauthorized = 5,
  /** ERR-007: Borrower not whitelisted */
  NotWhitelisted = 6,
  /** ERR-008: Address on blacklist */
  Blacklisted = 7,
  /** ERR-009: Protocol is paused */
  ProtocolPaused = 8,
  /** ERR-010: Cannot blacklist with debt */
  BorrowerHasActiveDebt = 9,

  // ═══════════════════════════════════════════════════════════════
  // ACCOUNT VALIDATION ERRORS (10-16)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-011: Zero pubkey */
  InvalidAddress = 10,
  /** ERR-012: Wrong mint or decimals */
  InvalidMint = 11,
  /** ERR-013: Vault mismatch */
  InvalidVault = 12,
  /** ERR-014: PDA derivation mismatch */
  InvalidPDA = 13,
  /** ERR-015: Wrong program owner */
  InvalidAccountOwner = 14,
  /** ERR-016: Wrong token program */
  InvalidTokenProgram = 15,
  /** ERR-017: Token account owner mismatch */
  InvalidTokenAccountOwner = 16,

  // ═══════════════════════════════════════════════════════════════
  // INPUT VALIDATION ERRORS (17-20)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-018: Amount is 0 */
  ZeroAmount = 17,
  /** ERR-019: Scaled amount rounds to 0 */
  ZeroScaledAmount = 18,
  /** ERR-020: Scale factor is 0 */
  InvalidScaleFactor = 19,
  /** ERR-021: Timestamp < last_accrual */
  InvalidTimestamp = 20,

  // ═══════════════════════════════════════════════════════════════
  // BALANCE/CAPACITY ERRORS (21-27)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-022: Insufficient token balance */
  InsufficientBalance = 21,
  /** ERR-023: Insufficient scaled balance */
  InsufficientScaledBalance = 22,
  /** ERR-024: No scaled balance */
  NoBalance = 23,
  /** ERR-025: Vault empty, nothing to withdraw */
  ZeroPayout = 24,
  /** ERR-026: Deposit exceeds max_total_supply */
  CapExceeded = 25,
  /** ERR-027: Borrow exceeds vault funds */
  BorrowAmountTooHigh = 26,
  /** ERR-028: Exceeds borrower capacity */
  GlobalCapacityExceeded = 27,

  // ═══════════════════════════════════════════════════════════════
  // MARKET STATE ERRORS (28-35)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-029: Operation blocked after maturity */
  MarketMatured = 28,
  /** ERR-030: Withdrawal before maturity */
  NotMatured = 29,
  /** ERR-031: Market not settled yet */
  NotSettled = 30,
  /** ERR-032: New factor not > current */
  SettlementNotImproved = 31,
  /** ERR-033: Grace period not elapsed */
  SettlementGracePeriod = 32,
  /** ERR-034: settlement_factor == 0 */
  SettlementNotComplete = 33,
  /** ERR-035: Cannot close, balance > 0 */
  PositionNotEmpty = 34,
  /** ERR-036: Repayment > borrowed */
  RepaymentExceedsDebt = 35,

  // ═══════════════════════════════════════════════════════════════
  // FEE/WITHDRAWAL ERRORS (36-40)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-037: No accrued protocol fees */
  NoFeesToCollect = 36,
  /** ERR-038: Blocked during distress */
  FeeCollectionDuringDistress = 37,
  /** ERR-039: Lenders have pending */
  LendersPendingWithdrawals = 38,
  /** ERR-040: Protocol fees not collected */
  FeesNotCollected = 39,
  /** ERR-041: No excess in vault */
  NoExcessToWithdraw = 40,

  // ═══════════════════════════════════════════════════════════════
  // OPERATIONAL ERRORS (41-42)
  // ═══════════════════════════════════════════════════════════════
  /** ERR-042: Arithmetic overflow */
  MathOverflow = 41,
  /** ERR-043: Slippage protection triggered */
  PayoutBelowMinimum = 42,
}

/**
 * Human-readable error messages.
 */
export const ERROR_MESSAGES: Record<CoalescefiErrorCode, string> = {
  // Initialization errors
  [CoalescefiErrorCode.AlreadyInitialized]: 'Protocol configuration already exists',
  [CoalescefiErrorCode.InvalidFeeRate]: 'Fee rate exceeds maximum of 10,000 basis points (100%)',
  [CoalescefiErrorCode.InvalidCapacity]:
    'Invalid capacity: max total supply must be greater than 0',
  [CoalescefiErrorCode.InvalidMaturity]: 'Invalid maturity: must be in the future',
  [CoalescefiErrorCode.MarketAlreadyExists]: 'Market with this nonce already exists',

  // Authorization errors
  [CoalescefiErrorCode.Unauthorized]: 'Unauthorized: signer does not have required authority',
  [CoalescefiErrorCode.NotWhitelisted]: 'Borrower is not whitelisted for this market',
  [CoalescefiErrorCode.Blacklisted]: 'Address is on the global blacklist',
  [CoalescefiErrorCode.ProtocolPaused]: 'Protocol is paused: no operations allowed',
  [CoalescefiErrorCode.BorrowerHasActiveDebt]:
    'Cannot blacklist borrower: borrower has outstanding debt',

  // Account validation errors
  [CoalescefiErrorCode.InvalidAddress]: 'Invalid address: cannot use zero pubkey',
  [CoalescefiErrorCode.InvalidMint]: 'Invalid mint: wrong token mint or unsupported decimals',
  [CoalescefiErrorCode.InvalidVault]: 'Invalid vault: account mismatch or wrong owner',
  [CoalescefiErrorCode.InvalidPDA]: 'Account is not the expected PDA',
  [CoalescefiErrorCode.InvalidAccountOwner]: 'Account is not owned by the program',
  [CoalescefiErrorCode.InvalidTokenProgram]: 'Invalid token program',
  [CoalescefiErrorCode.InvalidTokenAccountOwner]:
    'Token account owner does not match expected authority',

  // Input validation errors
  [CoalescefiErrorCode.ZeroAmount]: 'Amount must be greater than 0',
  [CoalescefiErrorCode.ZeroScaledAmount]: 'Deposit amount too small: rounds to zero shares',
  [CoalescefiErrorCode.InvalidScaleFactor]: 'Scale factor is zero (invalid market state)',
  [CoalescefiErrorCode.InvalidTimestamp]:
    'Timestamp is invalid: effective time cannot be before last accrual time',

  // Balance/capacity errors
  [CoalescefiErrorCode.InsufficientBalance]: 'Insufficient token balance',
  [CoalescefiErrorCode.InsufficientScaledBalance]: 'Withdrawal exceeds position balance',
  [CoalescefiErrorCode.NoBalance]: 'No position balance to withdraw',
  [CoalescefiErrorCode.ZeroPayout]: 'Vault is empty: no funds to withdraw',
  [CoalescefiErrorCode.CapExceeded]: 'Deposit would exceed market capacity',
  [CoalescefiErrorCode.BorrowAmountTooHigh]: 'Borrow amount exceeds available vault funds',
  [CoalescefiErrorCode.GlobalCapacityExceeded]: 'Borrow exceeds global whitelist capacity',

  // Market state errors
  [CoalescefiErrorCode.MarketMatured]: 'Market has matured: operation not allowed',
  [CoalescefiErrorCode.NotMatured]: 'Market has not matured: withdrawal not allowed',
  [CoalescefiErrorCode.NotSettled]: 'Market is not yet settled',
  [CoalescefiErrorCode.SettlementNotImproved]: 'New settlement factor must be greater than current',
  [CoalescefiErrorCode.SettlementGracePeriod]:
    'Settlement grace period has not elapsed yet (wait 5 minutes after maturity)',
  [CoalescefiErrorCode.SettlementNotComplete]:
    'Settlement has not occurred (settlement_factor == 0)',
  [CoalescefiErrorCode.PositionNotEmpty]: 'Position still has balance: cannot close',
  [CoalescefiErrorCode.RepaymentExceedsDebt]:
    'Repayment amount exceeds the current borrowed amount',

  // Fee/withdrawal errors
  [CoalescefiErrorCode.NoFeesToCollect]: 'No accrued fees to collect',
  [CoalescefiErrorCode.FeeCollectionDuringDistress]:
    'Fee collection blocked during market distress (settlement < 100%)',
  [CoalescefiErrorCode.LendersPendingWithdrawals]:
    'Fee collection blocked while lenders have pending withdrawals',
  [CoalescefiErrorCode.FeesNotCollected]: 'Protocol fees have not been collected yet',
  [CoalescefiErrorCode.NoExcessToWithdraw]: 'No excess funds in vault to withdraw',

  // Operational errors
  [CoalescefiErrorCode.MathOverflow]: 'Mathematical overflow or underflow',
  [CoalescefiErrorCode.PayoutBelowMinimum]:
    'Payout is below the minimum specified (slippage protection triggered)',
};

/**
 * CoalesceFi error class for structured error handling.
 */
export class CoalescefiError extends Error {
  public readonly code: CoalescefiErrorCode;
  public readonly programError: boolean = true;

  constructor(code: CoalescefiErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.code = code;
    this.name = 'CoalescefiError';
  }

  /**
   * Get the error code name.
   */
  get codeName(): string {
    return CoalescefiErrorCode[this.code];
  }
}

/**
 * Error code extraction patterns for different Solana runtime versions.
 * Ordered by priority - first match wins.
 */
const ERROR_PATTERNS = [
  // Standard Solana pattern: "custom program error: 0x{hex}"
  /custom program error:\s*0x([0-9a-fA-F]+)/i,
  // Alternative hex format: "Custom(0x{hex})"
  /Custom\s*\(\s*0x([0-9a-fA-F]+)\s*\)/i,
  // Decimal format: "custom program error: {decimal}"
  /custom program error:\s*(\d+)(?!\s*x)/i,
  // Decimal in Custom(): "Custom({decimal})"
  /Custom\s*\(\s*(\d+)\s*\)/,
  // Anchor-style: "Error Code: {code}"
  /Error Code:\s*(\d+)/i,
  // Program error format: "Program failed with error: {code}"
  /Program failed with error:\s*(\d+)/i,
  // Simple error number in logs
  /\berror\s+(\d+)\b/i,
];

/**
 * Try to extract an error code from a log line using multiple patterns.
 *
 * @param log - The log line to parse
 * @returns The parsed error code, or null if not found
 */
function extractErrorCodeFromLog(log: string): number | null {
  if (typeof log !== 'string' || log.length === 0) {
    return null;
  }

  for (const pattern of ERROR_PATTERNS) {
    const match = log.match(pattern);
    if (match?.[1] !== undefined && match[1] !== '') {
      // Check if it's a hex pattern (0x prefix or hex-only pattern)
      const isHexPattern = pattern.source.includes('0x') || /^[0-9a-fA-F]+$/.test(match[1]);
      const base = isHexPattern && /^[0-9a-fA-F]+$/.test(match[1]) ? 16 : 10;

      const code = parseInt(match[1], base);
      if (!isNaN(code) && code >= 0 && code <= 0xffffffff) {
        return code;
      }
    }
  }

  return null;
}

/**
 * Parse a program error from transaction error.
 * Handles multiple Solana runtime versions and error formats gracefully.
 * Returns null if the error is not a CoalesceFi program error.
 *
 * Supported formats:
 * - SendTransactionError with logs
 * - InstructionError with Custom code
 * - TransactionError format
 * - Nested error objects
 *
 * @param error - The error to parse (can be any type)
 * @returns CoalescefiError if parsing succeeds, null otherwise
 */
export function parseCoalescefiError(error: unknown): CoalescefiError | null {
  // Already a CoalescefiError
  if (error instanceof CoalescefiError) {
    return error;
  }

  // Handle null/undefined gracefully
  if (error === null || error === undefined) {
    return null;
  }

  // Handle non-object types
  if (typeof error !== 'object') {
    // Try to parse string errors
    if (typeof error === 'string') {
      const code = extractErrorCodeFromLog(error);
      if (code !== null && code in CoalescefiErrorCode) {
        return new CoalescefiError(code as CoalescefiErrorCode);
      }
    }
    return null;
  }

  const errorObj = error as Record<string, unknown>;

  // Strategy 1: Parse from logs array
  if ('logs' in errorObj) {
    const logs = errorObj.logs;
    if (Array.isArray(logs)) {
      for (const log of logs) {
        if (typeof log === 'string') {
          const code = extractErrorCodeFromLog(log);
          if (code !== null && code in CoalescefiErrorCode) {
            return new CoalescefiError(code as CoalescefiErrorCode);
          }
        }
      }
    }
  }

  // Strategy 2: InstructionError format (standard Solana RPC response)
  if ('InstructionError' in errorObj) {
    const instructionError = errorObj.InstructionError;
    if (Array.isArray(instructionError) && instructionError.length >= 2) {
      const customError: unknown = instructionError[1];

      // Handle { Custom: number } format
      if (typeof customError === 'object' && customError !== null && 'Custom' in customError) {
        const code = (customError as { Custom: unknown }).Custom;
        if (typeof code === 'number' && code in CoalescefiErrorCode) {
          return new CoalescefiError(code as CoalescefiErrorCode);
        }
      }

      // Handle string custom error (some RPC versions)
      if (typeof customError === 'string') {
        const code = extractErrorCodeFromLog(customError);
        if (code !== null && code in CoalescefiErrorCode) {
          return new CoalescefiError(code as CoalescefiErrorCode);
        }
      }
    }
  }

  // Strategy 3: Nested error in 'err' field (TransactionError format)
  if ('err' in errorObj && errorObj.err !== null) {
    const nestedResult = parseCoalescefiError(errorObj.err);
    if (nestedResult) {
      return nestedResult;
    }
  }

  // Strategy 4: Nested error in 'error' field
  if ('error' in errorObj && errorObj.error !== null) {
    const nestedResult = parseCoalescefiError(errorObj.error);
    if (nestedResult) {
      return nestedResult;
    }
  }

  // Strategy 5: Check message field for error patterns
  if ('message' in errorObj && typeof errorObj.message === 'string') {
    const code = extractErrorCodeFromLog(errorObj.message);
    if (code !== null && code in CoalescefiErrorCode) {
      return new CoalescefiError(code as CoalescefiErrorCode);
    }
  }

  // Strategy 6: Check cause chain (Error objects)
  if (error instanceof Error && error.cause !== undefined) {
    const causeResult = parseCoalescefiError(error.cause);
    if (causeResult) {
      return causeResult;
    }
  }

  return null;
}

/**
 * Try to parse an error, returning a detailed result.
 * Useful for debugging error parsing issues.
 */
export interface ParseErrorResult {
  /** The parsed error, if successful */
  error: CoalescefiError | null;
  /** Whether parsing was attempted on valid input */
  validInput: boolean;
  /** Debug information about parsing attempts */
  debugInfo?: string;
}

/**
 * Parse an error with debug information.
 * Useful for diagnosing error parsing issues.
 *
 * @param error - The error to parse
 * @returns Detailed parsing result
 */
export function parseCoalescefiErrorWithDebug(error: unknown): ParseErrorResult {
  if (error === null || error === undefined) {
    return { error: null, validInput: false, debugInfo: 'Input was null or undefined' };
  }

  const parsed = parseCoalescefiError(error);

  let debugInfo = `Input type: ${typeof error}`;
  if (typeof error === 'object') {
    const keys = Object.keys(error);
    debugInfo += `, Keys: [${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}]`;
  }

  return {
    error: parsed,
    validInput: true,
    debugInfo,
  };
}

/**
 * Check if an error code represents a user-recoverable error.
 * These errors typically require user action to resolve.
 */
export function isUserRecoverableError(code: CoalescefiErrorCode): boolean {
  const userRecoverableErrors = new Set([
    CoalescefiErrorCode.ZeroAmount,
    CoalescefiErrorCode.InsufficientBalance,
    CoalescefiErrorCode.BorrowAmountTooHigh,
    CoalescefiErrorCode.InsufficientScaledBalance,
    CoalescefiErrorCode.CapExceeded,
    CoalescefiErrorCode.GlobalCapacityExceeded,
    CoalescefiErrorCode.ZeroScaledAmount,
  ]);
  return userRecoverableErrors.has(code);
}

/**
 * Get a user-friendly recovery action for an error.
 * Provides actionable guidance for resolving common errors.
 */
export function getErrorRecoveryAction(code: CoalescefiErrorCode): string | null {
  const recoveryActions: Partial<Record<CoalescefiErrorCode, string>> = {
    // Validation errors (user can fix)
    [CoalescefiErrorCode.ZeroAmount]: 'Enter an amount greater than 0',
    [CoalescefiErrorCode.ZeroScaledAmount]:
      'Increase deposit amount - the current amount rounds to zero shares',
    [CoalescefiErrorCode.InvalidFeeRate]:
      'Fee rate must be between 0 and 10,000 basis points (0-100%)',
    [CoalescefiErrorCode.InvalidMaturity]:
      'Set a maturity date in the future (at least 60 seconds from now)',
    [CoalescefiErrorCode.InvalidCapacity]: 'Set a max total supply greater than 0',
    [CoalescefiErrorCode.InvalidAddress]: 'Provide a valid Solana address (not the zero address)',
    [CoalescefiErrorCode.InvalidMint]: 'Use a supported token mint (USDC with 6 decimals)',

    // Balance/capacity errors (user can adjust amounts)
    [CoalescefiErrorCode.InsufficientBalance]:
      'Add more tokens to your wallet or reduce the amount',
    [CoalescefiErrorCode.BorrowAmountTooHigh]:
      'Reduce borrow amount to available vault balance, or wait for more deposits',
    [CoalescefiErrorCode.InsufficientScaledBalance]:
      'Reduce withdrawal amount to your available position balance',
    [CoalescefiErrorCode.CapExceeded]:
      'Reduce deposit amount - market has reached its capacity limit',
    [CoalescefiErrorCode.GlobalCapacityExceeded]:
      'Reduce borrow amount - you have reached your global borrowing capacity',
    [CoalescefiErrorCode.NoBalance]: 'You have no position in this market to withdraw',
    [CoalescefiErrorCode.ZeroPayout]:
      'Vault is empty - borrower must repay before withdrawals are possible',
    [CoalescefiErrorCode.PayoutBelowMinimum]:
      'Increase min_payout tolerance or wait for better settlement conditions',

    // Market lifecycle errors (timing-related)
    [CoalescefiErrorCode.NotMatured]: 'Wait until the market maturity date to withdraw funds',
    [CoalescefiErrorCode.MarketMatured]:
      'Market has matured - deposits and borrows are no longer allowed',
    [CoalescefiErrorCode.SettlementGracePeriod]:
      'Wait 5 minutes after maturity for the settlement grace period to elapse',
    [CoalescefiErrorCode.NotSettled]:
      'Market must be settled first - call withdraw to trigger settlement',
    [CoalescefiErrorCode.SettlementNotImproved]:
      'New settlement must be better than current - ensure more funds were added to vault',
    [CoalescefiErrorCode.SettlementNotComplete]:
      'Settlement has not occurred yet - wait for first withdrawal after maturity',

    // Authorization errors (need different permissions)
    [CoalescefiErrorCode.Unauthorized]:
      'This operation requires admin or whitelist manager authority',
    [CoalescefiErrorCode.NotWhitelisted]:
      'Contact the whitelist manager to request borrowing access',
    [CoalescefiErrorCode.Blacklisted]:
      'Your address is on the blacklist - contact support if you believe this is an error',

    // Protocol state errors (wait or contact admin)
    [CoalescefiErrorCode.ProtocolPaused]:
      'Protocol is paused - wait for admin to resume operations',
    [CoalescefiErrorCode.AlreadyInitialized]: 'Protocol is already initialized - no action needed',
    [CoalescefiErrorCode.MarketAlreadyExists]: 'Use a different nonce to create a new market',

    // Fee collection errors
    [CoalescefiErrorCode.NoFeesToCollect]: 'No fees have accrued yet - wait for interest to accrue',
    [CoalescefiErrorCode.FeeCollectionDuringDistress]:
      'Fee collection blocked - market is in distress with settlement factor below 100%',
    [CoalescefiErrorCode.LendersPendingWithdrawals]:
      'Fee collection blocked - wait for all lenders to withdraw first',
    [CoalescefiErrorCode.FeesNotCollected]:
      'Protocol fees must be collected before withdrawing excess',
    [CoalescefiErrorCode.NoExcessToWithdraw]:
      'No excess funds available - all funds allocated to lenders/fees',

    // Position management
    [CoalescefiErrorCode.PositionNotEmpty]: 'Withdraw all funds before closing your position',

    // Token/account configuration errors
    [CoalescefiErrorCode.InvalidTokenAccountOwner]:
      'Token account owner does not match expected signer - use the correct token account',
    [CoalescefiErrorCode.InvalidVault]:
      'Vault account mismatch - ensure you are using the correct market vault',
    [CoalescefiErrorCode.InvalidTokenProgram]:
      'Use the SPL Token Program (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)',

    // System errors (these typically need developer investigation)
    [CoalescefiErrorCode.MathOverflow]:
      'Mathematical overflow occurred - try with smaller amounts or contact support',
    [CoalescefiErrorCode.InvalidPDA]:
      'Account derivation mismatch - ensure PDAs are derived correctly',
    [CoalescefiErrorCode.InvalidAccountOwner]:
      'Account not owned by the CoalesceFi program - verify account addresses',
    [CoalescefiErrorCode.InvalidScaleFactor]: 'Market is in an invalid state - contact support',

    // Timestamp and debt errors
    [CoalescefiErrorCode.InvalidTimestamp]:
      'Invalid timestamp detected - this may indicate clock skew, please retry',
    [CoalescefiErrorCode.RepaymentExceedsDebt]:
      'Reduce repayment amount to match or be less than the outstanding debt',
    [CoalescefiErrorCode.BorrowerHasActiveDebt]:
      'Borrower must repay all outstanding debt before being blacklisted',
  };
  return recoveryActions[code] ?? null;
}

/**
 * Error severity levels for categorizing errors.
 */
export enum ErrorSeverity {
  /** User input or recoverable errors */
  Warning = 'warning',
  /** Transaction failures that may be retried */
  Error = 'error',
  /** Critical protocol or system errors */
  Critical = 'critical',
}

/**
 * Get the severity level of an error.
 */
export function getErrorSeverity(code: CoalescefiErrorCode): ErrorSeverity {
  const criticalErrors = new Set([
    CoalescefiErrorCode.MathOverflow,
    CoalescefiErrorCode.InvalidPDA,
    CoalescefiErrorCode.InvalidAccountOwner,
    CoalescefiErrorCode.InvalidTokenProgram,
    CoalescefiErrorCode.InvalidScaleFactor,
  ]);

  const warningErrors = new Set([
    CoalescefiErrorCode.ZeroAmount,
    CoalescefiErrorCode.InsufficientBalance,
    CoalescefiErrorCode.ZeroScaledAmount,
    CoalescefiErrorCode.NotMatured,
    CoalescefiErrorCode.SettlementGracePeriod,
  ]);

  if (criticalErrors.has(code)) {
    return ErrorSeverity.Critical;
  }
  if (warningErrors.has(code)) {
    return ErrorSeverity.Warning;
  }
  return ErrorSeverity.Error;
}

/**
 * Error categories for grouping related errors.
 */
export enum ErrorCategory {
  /** Protocol initialization and configuration errors */
  Initialization = 'initialization',
  /** Authorization and permission errors */
  Authorization = 'authorization',
  /** Account validation errors */
  AccountValidation = 'account_validation',
  /** Input validation errors */
  InputValidation = 'input_validation',
  /** User balance and capacity errors */
  Balance = 'balance',
  /** Market state errors */
  MarketState = 'market_state',
  /** Fee and withdrawal errors */
  FeeWithdrawal = 'fee_withdrawal',
  /** Operational errors */
  Operational = 'operational',
}

/**
 * Get the category of an error.
 */
export function getErrorCategory(code: CoalescefiErrorCode): ErrorCategory {
  // Convert enum to number for range comparisons
  const numericCode = Number(code);

  // Initialization errors (0-4)
  if (numericCode >= 0 && numericCode <= 4) {
    return ErrorCategory.Initialization;
  }
  // Authorization errors (5-9)
  if (numericCode >= 5 && numericCode <= 9) {
    return ErrorCategory.Authorization;
  }
  // Account validation errors (10-16)
  if (numericCode >= 10 && numericCode <= 16) {
    return ErrorCategory.AccountValidation;
  }
  // Input validation errors (17-20)
  if (numericCode >= 17 && numericCode <= 20) {
    return ErrorCategory.InputValidation;
  }
  // Balance/capacity errors (21-27)
  if (numericCode >= 21 && numericCode <= 27) {
    return ErrorCategory.Balance;
  }
  // Market state errors (28-35)
  if (numericCode >= 28 && numericCode <= 35) {
    return ErrorCategory.MarketState;
  }
  // Fee/withdrawal errors (36-40)
  if (numericCode >= 36 && numericCode <= 40) {
    return ErrorCategory.FeeWithdrawal;
  }
  // Operational errors (41-42)
  return ErrorCategory.Operational;
}

/**
 * Detailed error information for logging and debugging.
 */
export interface ErrorDetails {
  /** Error code number */
  code: number;
  /** Error code name */
  name: string;
  /** Human-readable message */
  message: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Error category */
  category: ErrorCategory;
  /** Whether user can recover from this error */
  isRecoverable: boolean;
  /** Suggested recovery action if recoverable */
  recoveryAction: string | null | undefined;
}

/**
 * Get detailed information about an error.
 */
export function getErrorDetails(code: CoalescefiErrorCode): ErrorDetails {
  return {
    code,
    name: CoalescefiErrorCode[code],
    message: ERROR_MESSAGES[code],
    severity: getErrorSeverity(code),
    category: getErrorCategory(code),
    isRecoverable: isUserRecoverableError(code),
    recoveryAction: getErrorRecoveryAction(code),
  };
}

/**
 * SDK-level error for non-program errors.
 */
export class SdkError extends Error {
  public readonly type: 'configuration' | 'network' | 'validation' | 'unknown';
  public override readonly cause: Error | undefined;

  constructor(
    message: string,
    type: 'configuration' | 'network' | 'validation' | 'unknown' = 'unknown',
    cause?: Error
  ) {
    super(message, { cause });
    this.name = 'SdkError';
    this.type = type;
    this.cause = cause;
  }
}

/**
 * Wrap an async operation with standardized error handling.
 * Converts program errors to CoalescefiError and wraps other errors.
 *
 * @param operation - The async operation to execute
 * @param context - Optional context for error messages
 * @returns The result of the operation
 * @throws CoalescefiError for program errors, SdkError for other errors
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Try to parse as program error
    const programError = parseCoalescefiError(error);
    if (programError) {
      throw programError;
    }

    // Wrap as SDK error
    const message =
      context !== undefined && context !== ''
        ? `${context}: ${error instanceof Error ? error.message : String(error)}`
        : error instanceof Error
          ? error.message
          : String(error);

    throw new SdkError(message, 'unknown', error instanceof Error ? error : undefined);
  }
}

/**
 * Type guard to check if an error is a CoalescefiError.
 */
export function isCoalescefiError(error: unknown): error is CoalescefiError {
  return error instanceof CoalescefiError;
}

/**
 * Type guard to check if an error is an SdkError.
 */
export function isSdkError(error: unknown): error is SdkError {
  return error instanceof SdkError;
}

/**
 * Check if an error is retryable (typically network or transient errors).
 */
export function isRetryableError(error: unknown): boolean {
  // Program errors are generally not retryable (except for some specific cases)
  if (error instanceof CoalescefiError) {
    const retryableCodes = new Set([
      CoalescefiErrorCode.ProtocolPaused, // May be unpaused
      CoalescefiErrorCode.SettlementGracePeriod, // Will elapse
    ]);
    return retryableCodes.has(error.code);
  }

  // Network errors are often retryable
  if (error instanceof SdkError) {
    return error.type === 'network';
  }

  // Check for common network error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('blockhash not found') ||
      message.includes('rate limit')
    );
  }

  return false;
}

/**
 * Format an error for logging.
 */
export function formatErrorForLogging(error: unknown): Record<string, unknown> {
  if (error instanceof CoalescefiError) {
    const details = getErrorDetails(error.code);
    return {
      type: 'program_error',
      code: details.code,
      name: details.name,
      message: details.message,
      severity: details.severity,
      category: details.category,
      isRecoverable: details.isRecoverable,
    };
  }

  if (error instanceof SdkError) {
    return {
      type: 'sdk_error',
      errorType: error.type,
      message: error.message,
      cause: error.cause?.message,
    };
  }

  if (error instanceof Error) {
    return {
      type: 'error',
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    type: 'unknown',
    value: String(error),
  };
}
