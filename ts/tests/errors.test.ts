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
  findFailedProgramIds,
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

    // Many callers stringify the RPC error into an Error message before it
    // reaches the SDK. createMarketWithFreshNonce only retries a nonce
    // collision when it can read MarketAlreadyExists back out of that
    // message, so these are the exact string shapes the retry depends on.
    describe('client-stringified transaction errors', () => {
      const collision = { InstructionError: [0, { Custom: 4 }] }; // MarketAlreadyExists

      it('parses a prefixed stringified confirmation failure message', () => {
        const parsed = parseCoalescefiError(
          new Error(`Transaction failed on-chain: ${JSON.stringify(collision)}`)
        );
        expect(parsed?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('parses an unprefixed stringified confirmation failure message', () => {
        const parsed = parseCoalescefiError(
          new Error(`Transaction failed: ${JSON.stringify(collision)}`)
        );
        expect(parsed?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('parses a decoded simulation failure message', () => {
        // A caller may throw `Transaction would fail: ${simError}` where
        // simError has already been decoded to a friendly name/message.
        const decoded = parseCoalescefiError(collision);
        expect(decoded).not.toBeNull();
        const parsed = parseCoalescefiError(
          new Error(
            `Transaction would fail: Program error: ${decoded!.codeName} — ${decoded!.message}`
          )
        );
        expect(parsed?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('reads a stringified two-digit code as decimal, not hex', () => {
        const parsed = parseCoalescefiError(
          new Error(
            `Transaction failed: ${JSON.stringify({ InstructionError: [0, { Custom: 25 }] })}`
          )
        );
        expect(parsed?.code).toBe(CoalescefiErrorCode.CapExceeded); // 25, not 0x25
      });

      it('ignores a decoded name that is not a known error code', () => {
        expect(parseCoalescefiError(new Error('Program error: SomethingElse'))).toBeNull();
      });
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

    describe('wallet connector wrappers', () => {
      /**
       * Mirrors `@solana/connector@0.2.4`, a wallet-connector stack apps
       * commonly sign and send through.
       *
       * Faithful to node_modules/@solana/connector/dist/chunk-SJCQ3KZE.mjs:141
       * (`ConnectorError`) and :187 (`TransactionError`): the base constructor
       * calls `super(message)` and assigns the wrapped error to `originalError`.
       * It never populates the standard `cause`, and the message it wraps with
       * is a fixed literal that carries no program error code.
       */
      class ConnectorTransactionError extends Error {
        readonly code: string;
        readonly recoverable: boolean;
        readonly context?: Record<string, unknown>;
        readonly originalError?: Error;
        readonly timestamp: string;

        constructor(
          code: string,
          message: string,
          context?: Record<string, unknown>,
          originalError?: Error
        ) {
          super(message);
          this.name = this.constructor.name;
          this.code = code;
          this.recoverable = ['USER_REJECTED', 'SEND_FAILED', 'SIMULATION_FAILED'].includes(code);
          this.context = context;
          this.originalError = originalError;
          this.timestamp = new Date().toISOString();
        }
      }

      /** Exactly the throw at chunk-KE3IEBN2.mjs:2983. */
      function wrapAsSendFailed(rpcError: Error): ConnectorTransactionError {
        return new ConnectorTransactionError(
          'SEND_FAILED',
          'Failed to send transaction',
          undefined,
          rpcError
        );
      }

      it('recovers the code from a connector SEND_FAILED wrapping a preflight failure', () => {
        // Wallet preflight rejects the occupied nonce with MarketAlreadyExists (4).
        const rpcError = new Error(
          'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x4'
        );
        const wrapped = wrapAsSendFailed(rpcError);

        // The wrapper itself carries no code: message is a fixed literal and
        // `cause` is never set. Only `originalError` holds the real failure.
        expect(wrapped.message).toBe('Failed to send transaction');
        expect(wrapped.cause).toBeUndefined();

        expect(parseCoalescefiError(wrapped)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('recovers the code from a connector wrapper around a logs-bearing RPC error', () => {
        const rpcError = Object.assign(new Error('Simulation failed'), {
          logs: [
            'Program GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR invoke [1]',
            'Program GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR failed: custom program error: 0x4',
          ],
        });

        expect(parseCoalescefiError(wrapAsSendFailed(rpcError))?.code).toBe(
          CoalescefiErrorCode.MarketAlreadyExists
        );
      });

      it('recovers the code through a doubly-wrapped connector error', () => {
        // signAndSendTransactions (chunk-KE3IEBN2.mjs:2998) wraps the error that
        // signAndSendTransaction (:2983) already wrapped.
        const inner = wrapAsSendFailed(new Error('custom program error: 0x4'));
        const outer = new ConnectorTransactionError(
          'SEND_FAILED',
          'Failed to send transaction 1 of 1',
          { index: 0, total: 1 },
          inner
        );

        expect(parseCoalescefiError(outer)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('still returns null when the wrapped error is not a program error', () => {
        expect(
          parseCoalescefiError(wrapAsSendFailed(new Error('Network request failed')))
        ).toBeNull();
      });

      // ─── Traversal guards ─────────────────────────────────────
      //
      // Two separate jobs, deliberately tested separately: the cycle guard stops
      // a wrapper that points back along its own path, and the node budget stops
      // an acyclic graph that is merely enormous. Each test below is built so
      // that removing ITS guard alone breaks it — a cycle test that only proves
      // "the traversal terminated" would pass with the cycle guard deleted,
      // because the budget terminates it either way.
      //
      // The lever is strategy precedence: `err` (strategy 3) is followed before
      // `originalError` (strategy 7). Putting the cycle on `err` and the code on
      // `originalError` means an unguarded cycle burns the whole node budget
      // first, and the code that comes after it is never reached.
      it('finds a code past a self-referential cycle in an earlier-checked property', () => {
        const selfRef = new Error('Failed to send transaction') as Error & {
          err?: unknown;
          originalError?: unknown;
        };
        selfRef.err = selfRef;
        selfRef.originalError = { InstructionError: [0, { Custom: 4 }] };

        expect(parseCoalescefiError(selfRef)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('finds a code past a mutual cycle between two wrappers', () => {
        const a = new Error('Failed to send transaction') as Error & {
          err?: unknown;
          originalError?: unknown;
        };
        const b = new Error('Failed to send transaction') as Error & { err?: unknown };
        a.err = b;
        b.err = a;
        a.originalError = { InstructionError: [0, { Custom: 4 }] };

        expect(parseCoalescefiError(a)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('parses a legitimately deep wrapper chain', () => {
        // 40 nested wrappers with the real failure at the bottom. Nothing about
        // this shape is pathological — a wallet is free to wrap this much — so
        // the traversal must reach the code rather than give up part way.
        let chain: Error & { originalError?: unknown } = new Error('custom program error: 0x4');
        for (let i = 0; i < 40; i++) {
          const outer = new Error('Failed to send transaction') as Error & {
            originalError?: unknown;
          };
          outer.originalError = chain;
          chain = outer;
        }

        expect(parseCoalescefiError(chain)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      // Budget boundary. The traversal may examine 512 error objects; a chain of
      // N wrappers costs exactly N visits, so the code survives at 512 links and
      // is out of reach at 513.
      function chainOfLength(length: number): Error {
        let chain: Error & { originalError?: unknown } = new Error('custom program error: 0x4');
        for (let i = 1; i < length; i++) {
          const outer = new Error('Failed to send transaction') as Error & {
            originalError?: unknown;
          };
          outer.originalError = chain;
          chain = outer;
        }
        return chain;
      }

      it('parses a chain exactly at the node budget', () => {
        expect(parseCoalescefiError(chainOfLength(512))?.code).toBe(
          CoalescefiErrorCode.MarketAlreadyExists
        );
      });

      it('gives up on a chain one node past the budget', () => {
        expect(parseCoalescefiError(chainOfLength(513))).toBeNull();
      });

      it('bails out of an acyclic chain that is absurdly deep', () => {
        // Distinct objects, so the cycle guard never trips — only the node
        // budget stops this. 100_000 links would overflow the stack unguarded.
        expect(parseCoalescefiError(chainOfLength(100_000))).toBeNull();
      });

      it('recovers a code past a wrapper graph whose paths multiply', () => {
        // Eight wrappers, each pointing at the same child through BOTH `err`
        // and `error`: 11 objects in total, no cycle, nothing deeper than 10
        // links — but 2^8 distinct root-to-leaf paths through it.
        //
        // Charging the work budget per VISIT rather than per distinct object
        // makes the traversal re-expand that shared subtree once per path and
        // spend all 512 units on it, so the code sitting one hop off the root
        // is never reached. Charging per object costs 11.
        const leaf = { message: 'nothing parseable here' };
        let shared: object = leaf;
        for (let i = 0; i < 8; i++) {
          shared = { err: shared, error: shared };
        }
        const root = {
          err: shared,
          error: shared,
          originalError: { InstructionError: [0, { Custom: 4 }] },
        };

        expect(parseCoalescefiError(root)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
      });

      it('reuses, rather than re-walks, an object reachable by several paths', () => {
        // Direct observation of the property the test above depends on: a
        // getter that counts reads. Ten sibling wrappers all point at the same
        // child, so a traversal that expands per path reads the child's
        // properties ten times. Expanding per object reads them once.
        let reads = 0;
        const child = {} as { err: unknown };
        Object.defineProperty(child, 'err', {
          enumerable: true,
          get() {
            reads += 1;
            return null;
          },
        });
        let siblings: object = { err: child };
        for (let i = 0; i < 9; i++) {
          siblings = { err: child, error: siblings };
        }
        const root = {
          err: siblings,
          originalError: { InstructionError: [0, { Custom: 4 }] },
        };

        expect(parseCoalescefiError(root)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
        expect(reads).toBe(1);
      });
    });
  });

  describe('findFailedProgramIds', () => {
    const programA = 'GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR';
    const programB = '2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy';

    it('names the program the runtime blamed, through a connector wrapper', () => {
      const error = {
        originalError: {
          logs: [
            `Program ${programB} invoke [1]`,
            `Program ${programB} success`,
            `Program ${programA} invoke [1]`,
            `Program ${programA} failed: custom program error: 0x4`,
          ],
        },
      };

      expect(findFailedProgramIds(error)).toEqual([programA]);
    });

    it('reports nothing when no log line records a failure', () => {
      // `invoke`/`success` lines name programs but attribute no failure, and a
      // stringified error carries no logs at all. Both must come back empty so
      // callers can tell "attributed elsewhere" from "not attributable".
      expect(
        findFailedProgramIds({ logs: [`Program ${programA} invoke [1]`, 'Program log: Deposit'] })
      ).toEqual([]);
      expect(findFailedProgramIds(new Error('Transaction failed: {"Custom":4}'))).toEqual([]);
    });

    it('reaches logs nested under the JSON-RPC data member', () => {
      // A raw RPC send/simulate failure (-32002) carries { err, logs } under
      // `data`. Skipping it strands the only attribution evidence, so the
      // create-market retry would burn a wallet signature it could have saved.
      const rpcError = {
        code: -32002,
        message: 'Transaction simulation failed: Error processing Instruction 0',
        data: {
          err: { InstructionError: [0, { Custom: 4 }] },
          logs: [
            `Program ${programB} invoke [1]`,
            `Program ${programB} failed: custom program error: 0x4`,
          ],
        },
      };

      expect(findFailedProgramIds(rpcError)).toEqual([programB]);
    });
  });

  describe('parseCoalescefiError - JSON-RPC data member', () => {
    it('recovers the structured error nested under data', () => {
      const rpcError = {
        code: -32002,
        message: 'Transaction simulation failed',
        data: { err: { InstructionError: [0, { Custom: 4 }] } },
      };

      expect(parseCoalescefiError(rpcError)?.code).toBe(CoalescefiErrorCode.MarketAlreadyExists);
    });
  });

  describe('parseCoalescefiError - program attribution (programId option)', () => {
    const OWN_PROGRAM = 'GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR';
    const SYSTEM_PROGRAM = '11111111111111111111111111111111';

    // The exact shape a prepended create-ATA instruction produces when the
    // rent payer cannot fund the account: the SYSTEM program's Custom(1)
    // ("insufficient lamports"), which collides with InvalidFeeRate (1).
    const foreignFailure = {
      err: { InstructionError: [0, { Custom: 1 }] },
      logs: [
        `Program ${SYSTEM_PROGRAM} invoke [1]`,
        `Program ${SYSTEM_PROGRAM} failed: custom program error: 0x1`,
      ],
    };

    it('suppresses the parse when logs blame a foreign program', () => {
      expect(parseCoalescefiError(foreignFailure, { programId: OWN_PROGRAM })).toBeNull();
    });

    it('still misparses without attribution — the reason the option exists', () => {
      expect(parseCoalescefiError(foreignFailure)?.code).toBe(CoalescefiErrorCode.InvalidFeeRate);
    });

    it('parses normally when logs blame the own program', () => {
      const ownFailure = {
        err: { InstructionError: [1, { Custom: 4 }] },
        logs: [`Program ${OWN_PROGRAM} failed: custom program error: 0x4`],
      };

      expect(parseCoalescefiError(ownFailure, { programId: OWN_PROGRAM })?.code).toBe(
        CoalescefiErrorCode.MarketAlreadyExists
      );
    });

    it('parses normally when the error carries no logs (one-directional attribution)', () => {
      // Stringified messages and bare InstructionErrors have nothing to
      // attribute against; only affirmative foreign evidence suppresses.
      const unattributable = new Error('Transaction failed: {"InstructionError":[0,{"Custom":4}]}');

      expect(parseCoalescefiError(unattributable, { programId: OWN_PROGRAM })?.code).toBe(
        CoalescefiErrorCode.MarketAlreadyExists
      );
    });

    it('accepts a PublicKey-like programId', () => {
      const pubkeyLike = { toBase58: () => OWN_PROGRAM };

      expect(parseCoalescefiError(foreignFailure, { programId: pubkeyLike })).toBeNull();
    });

    it('suppresses when the foreign-blaming logs live only under the JSON-RPC data member', () => {
      // Composes the two halves of this fix: attribution must reach logs that
      // a raw RPC error nests under `data`, not just top-level `logs`. A
      // refactor that reads `error.logs` directly instead of walking the
      // graph would pass every other test and still miss this shape.
      const rpcWrapped = {
        code: -32002,
        message: 'Transaction simulation failed: Error processing Instruction 0',
        data: foreignFailure,
      };

      expect(parseCoalescefiError(rpcWrapped, { programId: OWN_PROGRAM })).toBeNull();
      expect(parseCoalescefiError(rpcWrapped)?.code).toBe(CoalescefiErrorCode.InvalidFeeRate);
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
