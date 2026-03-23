import { describe, it, expect } from 'vitest';

import {
  CoalescefiErrorCode,
  CoalescefiError,
  ERROR_MESSAGES,
  parseCoalescefiError,
  parseCoalescefiErrorWithDebug,
  isUserRecoverableError,
  getErrorRecoveryAction,
  getErrorSeverity,
  getErrorCategory,
  getErrorDetails,
  ErrorSeverity,
  ErrorCategory,
  isCoalescefiError,
  isSdkError,
  SdkError,
  isRetryableError,
  formatErrorForLogging,
} from '../src/errors';

describe('Error Handling', () => {
  describe('CoalescefiErrorCode', () => {
    it('should have 44 error codes', () => {
      // Count enum values (excluding reverse mappings)
      const codes = Object.values(CoalescefiErrorCode).filter((v) => typeof v === 'number');
      expect(codes.length).toBe(44);
    });

    it('should have codes 0-42', () => {
      expect(CoalescefiErrorCode.AlreadyInitialized).toBe(0);
      expect(CoalescefiErrorCode.PayoutBelowMinimum).toBe(42);
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have a message for every error code', () => {
      for (let code = 0; code <= 42; code++) {
        expect(ERROR_MESSAGES[code as CoalescefiErrorCode]).toBeDefined();
        expect(typeof ERROR_MESSAGES[code as CoalescefiErrorCode]).toBe('string');
      }
    });
  });

  describe('CoalescefiError', () => {
    it('should create an error with code and default message', () => {
      const error = new CoalescefiError(CoalescefiErrorCode.ZeroAmount);

      expect(error.code).toBe(CoalescefiErrorCode.ZeroAmount);
      expect(error.message).toBe(ERROR_MESSAGES[CoalescefiErrorCode.ZeroAmount]);
      expect(error.name).toBe('CoalescefiError');
      expect(error.programError).toBe(true);
    });

    it('should allow custom message', () => {
      const customMessage = 'Custom error message';
      const error = new CoalescefiError(CoalescefiErrorCode.Unauthorized, customMessage);

      expect(error.message).toBe(customMessage);
      expect(error.code).toBe(CoalescefiErrorCode.Unauthorized);
    });

    it('should provide code name', () => {
      const error = new CoalescefiError(CoalescefiErrorCode.MarketMatured);
      expect(error.codeName).toBe('MarketMatured');
    });
  });

  describe('parseCoalescefiError', () => {
    it('should return existing CoalescefiError', () => {
      const original = new CoalescefiError(CoalescefiErrorCode.InvalidPDA);
      const parsed = parseCoalescefiError(original);

      expect(parsed).toBe(original);
    });

    it('should parse error from logs', () => {
      const mockError = {
        logs: [
          'Program log: Instruction: Deposit',
          'Program log: Error: custom program error: 0x11', // 17 = ZeroAmount
          'Program failed',
        ],
      };

      const parsed = parseCoalescefiError(mockError);

      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.ZeroAmount);
    });

    it('should parse error from InstructionError format', () => {
      const mockError = {
        InstructionError: [0, { Custom: 25 }], // CapExceeded
      };

      const parsed = parseCoalescefiError(mockError);

      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.CapExceeded);
    });

    it('should return null for non-program errors', () => {
      const nonProgramError = new Error('Network error');
      const parsed = parseCoalescefiError(nonProgramError);

      expect(parsed).toBeNull();
    });

    it('should return null for unknown error codes', () => {
      const unknownError = {
        InstructionError: [0, { Custom: 9999 }],
      };

      const parsed = parseCoalescefiError(unknownError);
      expect(parsed).toBeNull();
    });
  });

  describe('isUserRecoverableError', () => {
    it('should identify recoverable errors', () => {
      const recoverableErrors = [
        CoalescefiErrorCode.ZeroAmount,
        CoalescefiErrorCode.InsufficientBalance,
        CoalescefiErrorCode.BorrowAmountTooHigh,
        CoalescefiErrorCode.InsufficientScaledBalance,
        CoalescefiErrorCode.CapExceeded,
        CoalescefiErrorCode.GlobalCapacityExceeded,
        CoalescefiErrorCode.ZeroScaledAmount,
      ];

      for (const code of recoverableErrors) {
        expect(isUserRecoverableError(code)).toBe(true);
      }
    });

    it('should identify non-recoverable errors', () => {
      const nonRecoverableErrors = [
        CoalescefiErrorCode.AlreadyInitialized,
        CoalescefiErrorCode.Unauthorized,
        CoalescefiErrorCode.InvalidPDA,
        CoalescefiErrorCode.MathOverflow,
      ];

      for (const code of nonRecoverableErrors) {
        expect(isUserRecoverableError(code)).toBe(false);
      }
    });
  });

  describe('getErrorRecoveryAction', () => {
    it('should return recovery action for recoverable errors', () => {
      expect(getErrorRecoveryAction(CoalescefiErrorCode.ZeroAmount)).toBe(
        'Enter an amount greater than 0'
      );
      expect(getErrorRecoveryAction(CoalescefiErrorCode.InsufficientBalance)).toContain(
        'Add more tokens to your wallet'
      );
    });

    it('should return null for unknown error codes', () => {
      expect(getErrorRecoveryAction(9999 as CoalescefiErrorCode)).toBeNull();
    });

    it('should return recovery action for authorization errors', () => {
      expect(getErrorRecoveryAction(CoalescefiErrorCode.Unauthorized)).not.toBeNull();
      expect(getErrorRecoveryAction(CoalescefiErrorCode.NotWhitelisted)).not.toBeNull();
      expect(getErrorRecoveryAction(CoalescefiErrorCode.Blacklisted)).not.toBeNull();
    });

    it('should return recovery action for protocol state errors', () => {
      expect(getErrorRecoveryAction(CoalescefiErrorCode.ProtocolPaused)).not.toBeNull();
      expect(getErrorRecoveryAction(CoalescefiErrorCode.AlreadyInitialized)).not.toBeNull();
    });

    it('should return recovery action for system errors', () => {
      expect(getErrorRecoveryAction(CoalescefiErrorCode.MathOverflow)).not.toBeNull();
      expect(getErrorRecoveryAction(CoalescefiErrorCode.InvalidPDA)).not.toBeNull();
    });
  });

  describe('parseCoalescefiError - Advanced Patterns', () => {
    it('should parse hex error codes from logs', () => {
      const mockError = {
        logs: ['Program log: custom program error: 0x11'], // ZeroAmount (17 in hex)
      };
      const parsed = parseCoalescefiError(mockError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.ZeroAmount);
    });

    it('should parse Custom() format with decimal', () => {
      const mockError = {
        InstructionError: [0, { Custom: 25 }], // CapExceeded (decimal)
      };
      const parsed = parseCoalescefiError(mockError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.CapExceeded);
    });

    it('should parse Custom(0x) format', () => {
      const mockError = {
        logs: ['Program log: Custom(0x19)'], // CapExceeded (25 in hex)
      };
      const parsed = parseCoalescefiError(mockError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.CapExceeded);
    });

    it('should handle nested err field', () => {
      const mockError = {
        err: {
          InstructionError: [0, { Custom: 21 }], // InsufficientBalance
        },
      };
      const parsed = parseCoalescefiError(mockError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.InsufficientBalance);
    });

    it('should handle nested error field', () => {
      const mockError = {
        error: {
          logs: ['custom program error: 0x1a'], // BorrowAmountTooHigh (26)
        },
      };
      const parsed = parseCoalescefiError(mockError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.BorrowAmountTooHigh);
    });

    it('should parse from message field', () => {
      const mockError = {
        message: 'Transaction failed: custom program error: 0x1c', // MarketMatured (28)
      };
      const parsed = parseCoalescefiError(mockError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.MarketMatured);
    });

    it('should handle string input', () => {
      const errorString = 'custom program error: 0x8'; // ProtocolPaused (8)
      const parsed = parseCoalescefiError(errorString);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.ProtocolPaused);
    });

    it('should return null for null input', () => {
      expect(parseCoalescefiError(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(parseCoalescefiError(undefined)).toBeNull();
    });

    it('should return null for empty object', () => {
      expect(parseCoalescefiError({})).toBeNull();
    });

    it('should return null for malformed logs', () => {
      const mockError = {
        logs: [null, undefined, 123, { bad: 'data' }],
      };
      expect(parseCoalescefiError(mockError)).toBeNull();
    });

    it('should handle Error with cause chain', () => {
      const innerError = {
        logs: ['custom program error: 0x1d'], // NotMatured (29)
      };
      const outerError = new Error('Transaction failed');
      (outerError as Error & { cause: unknown }).cause = innerError;

      const parsed = parseCoalescefiError(outerError);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe(CoalescefiErrorCode.NotMatured);
    });
  });

  describe('parseCoalescefiErrorWithDebug', () => {
    it('should return debug info for successful parsing', () => {
      const mockError = {
        logs: ['custom program error: 0x11'],
      };
      const result = parseCoalescefiErrorWithDebug(mockError);
      expect(result.error).not.toBeNull();
      expect(result.validInput).toBe(true);
      expect(result.debugInfo).toContain('object');
    });

    it('should indicate invalid input for null', () => {
      const result = parseCoalescefiErrorWithDebug(null);
      expect(result.error).toBeNull();
      expect(result.validInput).toBe(false);
      expect(result.debugInfo).toContain('null');
    });

    it('should show keys in debug info', () => {
      const mockError = { logs: [], message: 'test', someKey: 'value' };
      const result = parseCoalescefiErrorWithDebug(mockError);
      expect(result.debugInfo).toContain('logs');
      expect(result.debugInfo).toContain('message');
    });
  });

  describe('getErrorSeverity', () => {
    it('should return Critical for system errors', () => {
      expect(getErrorSeverity(CoalescefiErrorCode.MathOverflow)).toBe(ErrorSeverity.Critical);
      expect(getErrorSeverity(CoalescefiErrorCode.InvalidPDA)).toBe(ErrorSeverity.Critical);
      expect(getErrorSeverity(CoalescefiErrorCode.InvalidAccountOwner)).toBe(
        ErrorSeverity.Critical
      );
    });

    it('should return Warning for user input errors', () => {
      expect(getErrorSeverity(CoalescefiErrorCode.ZeroAmount)).toBe(ErrorSeverity.Warning);
      expect(getErrorSeverity(CoalescefiErrorCode.InsufficientBalance)).toBe(ErrorSeverity.Warning);
    });

    it('should return Error for other errors', () => {
      expect(getErrorSeverity(CoalescefiErrorCode.Unauthorized)).toBe(ErrorSeverity.Error);
      expect(getErrorSeverity(CoalescefiErrorCode.Blacklisted)).toBe(ErrorSeverity.Error);
    });
  });

  describe('getErrorCategory', () => {
    it('should categorize initialization errors', () => {
      expect(getErrorCategory(CoalescefiErrorCode.AlreadyInitialized)).toBe(
        ErrorCategory.Initialization
      );
      expect(getErrorCategory(CoalescefiErrorCode.InvalidFeeRate)).toBe(
        ErrorCategory.Initialization
      );
    });

    it('should categorize market state errors', () => {
      expect(getErrorCategory(CoalescefiErrorCode.MarketMatured)).toBe(ErrorCategory.MarketState);
      expect(getErrorCategory(CoalescefiErrorCode.NotMatured)).toBe(ErrorCategory.MarketState);
    });

    it('should categorize balance errors', () => {
      expect(getErrorCategory(CoalescefiErrorCode.InsufficientBalance)).toBe(ErrorCategory.Balance);
      expect(getErrorCategory(CoalescefiErrorCode.CapExceeded)).toBe(ErrorCategory.Balance);
    });

    it('should categorize authorization errors', () => {
      expect(getErrorCategory(CoalescefiErrorCode.Unauthorized)).toBe(ErrorCategory.Authorization);
      expect(getErrorCategory(CoalescefiErrorCode.Blacklisted)).toBe(ErrorCategory.Authorization);
    });
  });

  describe('getErrorDetails', () => {
    it('should return complete error details', () => {
      const details = getErrorDetails(CoalescefiErrorCode.ZeroAmount);
      expect(details.code).toBe(CoalescefiErrorCode.ZeroAmount);
      expect(details.name).toBe('ZeroAmount');
      expect(details.message).toBe(ERROR_MESSAGES[CoalescefiErrorCode.ZeroAmount]);
      expect(details.severity).toBe(ErrorSeverity.Warning);
      expect(details.category).toBe(ErrorCategory.InputValidation);
      expect(details.isRecoverable).toBe(true);
      expect(details.recoveryAction).not.toBeNull();
    });

    it('should indicate non-recoverable errors', () => {
      const details = getErrorDetails(CoalescefiErrorCode.InvalidPDA);
      expect(details.isRecoverable).toBe(false);
    });
  });

  describe('SdkError', () => {
    it('should create error with type', () => {
      const error = new SdkError('Network failed', 'network');
      expect(error.message).toBe('Network failed');
      expect(error.type).toBe('network');
      expect(error.name).toBe('SdkError');
    });

    it('should include cause', () => {
      const cause = new Error('Original error');
      const error = new SdkError('Wrapped error', 'unknown', cause);
      expect(error.cause).toBe(cause);
    });

    it('should default to unknown type', () => {
      const error = new SdkError('Something went wrong');
      expect(error.type).toBe('unknown');
    });
  });

  describe('Type Guards', () => {
    describe('isCoalescefiError', () => {
      it('should return true for CoalescefiError', () => {
        const error = new CoalescefiError(CoalescefiErrorCode.ZeroAmount);
        expect(isCoalescefiError(error)).toBe(true);
      });

      it('should return false for regular Error', () => {
        const error = new Error('test');
        expect(isCoalescefiError(error)).toBe(false);
      });

      it('should return false for SdkError', () => {
        const error = new SdkError('test');
        expect(isCoalescefiError(error)).toBe(false);
      });
    });

    describe('isSdkError', () => {
      it('should return true for SdkError', () => {
        const error = new SdkError('test');
        expect(isSdkError(error)).toBe(true);
      });

      it('should return false for CoalescefiError', () => {
        const error = new CoalescefiError(CoalescefiErrorCode.ZeroAmount);
        expect(isSdkError(error)).toBe(false);
      });

      it('should return false for regular Error', () => {
        const error = new Error('test');
        expect(isSdkError(error)).toBe(false);
      });
    });
  });

  describe('isRetryableError', () => {
    it('should return true for ProtocolPaused', () => {
      const error = new CoalescefiError(CoalescefiErrorCode.ProtocolPaused);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for SettlementGracePeriod', () => {
      const error = new CoalescefiError(CoalescefiErrorCode.SettlementGracePeriod);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for most program errors', () => {
      const error = new CoalescefiError(CoalescefiErrorCode.ZeroAmount);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for network SdkError', () => {
      const error = new SdkError('Connection failed', 'network');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for validation SdkError', () => {
      const error = new SdkError('Invalid input', 'validation');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should detect network errors by message', () => {
      expect(isRetryableError(new Error('Connection timeout'))).toBe(true);
      expect(isRetryableError(new Error('Network unreachable'))).toBe(true);
      expect(isRetryableError(new Error('blockhash not found'))).toBe(true);
      expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    });
  });

  describe('formatErrorForLogging', () => {
    it('should format CoalescefiError', () => {
      const error = new CoalescefiError(CoalescefiErrorCode.ZeroAmount);
      const formatted = formatErrorForLogging(error);
      expect(formatted.type).toBe('program_error');
      expect(formatted.code).toBe(CoalescefiErrorCode.ZeroAmount);
      expect(formatted.name).toBe('ZeroAmount');
    });

    it('should format SdkError', () => {
      const error = new SdkError('Test error', 'network');
      const formatted = formatErrorForLogging(error);
      expect(formatted.type).toBe('sdk_error');
      expect(formatted.errorType).toBe('network');
      expect(formatted.message).toBe('Test error');
    });

    it('should format regular Error', () => {
      const error = new Error('Something went wrong');
      const formatted = formatErrorForLogging(error);
      expect(formatted.type).toBe('error');
      expect(formatted.name).toBe('Error');
      expect(formatted.message).toBe('Something went wrong');
    });

    it('should format unknown values', () => {
      const formatted = formatErrorForLogging('string error');
      expect(formatted.type).toBe('unknown');
      expect(formatted.value).toBe('string error');
    });
  });
});
