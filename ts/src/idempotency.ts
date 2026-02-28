/**
 * Idempotency utilities for preventing duplicate transactions.
 *
 * When a transaction times out but actually succeeds on-chain, clients may
 * retry with a new blockhash, causing double execution (double deposits,
 * double borrows, etc.). This module provides client-side tracking to
 * prevent such duplicates.
 *
 * ## Usage
 *
 * ```typescript
 * import { IdempotencyManager, generateIdempotencyKey } from '@coalescefi/sdk';
 *
 * const idempotency = new IdempotencyManager();
 *
 * // Generate a unique key for this operation
 * const key = generateIdempotencyKey('deposit', {
 *   market: marketPubkey.toBase58(),
 *   amount: depositAmount.toString(),
 * });
 *
 * // Execute with idempotency protection
 * const result = await idempotency.executeOnce(
 *   connection,
 *   key,
 *   async () => {
 *     const tx = new Transaction().add(depositInstruction);
 *     const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);
 *     return { signature, result: { success: true } };
 *   }
 * );
 * ```
 */

import type { Connection, TransactionSignature } from '@solana/web3.js';

/**
 * Error thrown when an operation is already pending or completed.
 */
export class IdempotencyError extends Error {
  constructor(
    message: string,
    public readonly signature: TransactionSignature,
    public readonly status: 'pending' | 'completed'
  ) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

/**
 * Represents a pending operation stored in the idempotency manager.
 */
export interface PendingOperation {
  /** Unique idempotency key */
  key: string;
  /** Transaction signature */
  signature: TransactionSignature;
  /** When the operation was initiated */
  createdAt: number;
  /** When the blockhash expires (transactions invalid after this) */
  expiresAt: number;
  /** Optional metadata for debugging */
  metadata?: Record<string, string>;
}

/**
 * Storage interface for idempotency data.
 * Allows custom implementations for different environments.
 */
export interface IdempotencyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * In-memory storage implementation for Node.js or testing.
 */
export class MemoryStorage implements IdempotencyStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  /** Clear all stored operations (useful for testing) */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Configuration options for IdempotencyManager.
 */
export interface IdempotencyManagerOptions {
  /**
   * Storage backend for persisting pending operations.
   * Defaults to localStorage in browser, MemoryStorage in Node.js.
   */
  storage?: IdempotencyStorage;

  /**
   * Prefix for storage keys (default: 'coalescefi:pending:').
   */
  prefix?: string;

  /**
   * How long to consider a transaction pending before allowing retry (ms).
   * Solana blockhashes are valid for ~60-90 seconds.
   * Default: 90000 (90 seconds)
   */
  pendingTimeout?: number;

  /**
   * How long to keep completed operations in storage (ms).
   * Default: 3600000 (1 hour)
   */
  completedRetention?: number;
}

/**
 * Result of executing an idempotent operation.
 */
export interface IdempotentResult<T> {
  /** Transaction signature */
  signature: TransactionSignature;
  /** Operation result */
  result: T;
}

/**
 * Manager for preventing duplicate transaction submissions.
 *
 * Tracks pending and completed transactions to prevent accidental
 * double-execution due to network timeouts or retry logic.
 */
export class IdempotencyManager {
  private storage: IdempotencyStorage;
  private prefix: string;
  private pendingTimeout: number;
  private completedRetention: number;

  constructor(options: IdempotencyManagerOptions = {}) {
    this.storage = options.storage ?? this.getDefaultStorage();
    this.prefix = options.prefix ?? 'coalescefi:pending:';
    this.pendingTimeout = options.pendingTimeout ?? 90_000;
    this.completedRetention = options.completedRetention ?? 3_600_000;
  }

  /**
   * Execute an operation with idempotency protection.
   *
   * If a previous operation with the same key is pending or completed,
   * throws IdempotencyError instead of executing.
   *
   * @param connection - Solana connection for checking transaction status
   * @param key - Unique idempotency key for this operation
   * @param operation - Async function that executes the operation and returns signature + result
   * @param metadata - Optional metadata to store with the pending operation
   * @returns The operation result
   * @throws IdempotencyError if operation is already pending or completed
   */
  async executeOnce<T>(
    connection: Connection,
    key: string,
    operation: () => Promise<IdempotentResult<T>>,
    metadata?: Record<string, string>
  ): Promise<T> {
    // Check for existing pending operation
    const existing = this.getPending(key);

    if (existing !== null) {
      // Verify status on-chain
      const status = await connection.getSignatureStatus(existing.signature);
      const confirmationStatus = status.value?.confirmationStatus;

      if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
        // Transaction succeeded - mark as completed and reject retry
        this.markCompleted(key, existing.signature);
        throw new IdempotencyError(
          `Operation already completed with signature: ${existing.signature}`,
          existing.signature,
          'completed'
        );
      }

      if (status.value?.err !== undefined && status.value?.err !== null) {
        // Transaction failed on-chain - safe to retry
        this.clearPending(key);
      } else if (Date.now() < existing.expiresAt) {
        // Still within blockhash validity window - don't retry yet
        throw new IdempotencyError(
          `Operation still pending with signature: ${existing.signature}`,
          existing.signature,
          'pending'
        );
      } else {
        // Blockhash expired, transaction never landed - safe to retry
        this.clearPending(key);
      }
    }

    // Check if this operation was recently completed
    const completed = this.getCompleted(key);
    if (completed !== null) {
      throw new IdempotencyError(
        `Operation already completed with signature: ${completed}`,
        completed,
        'completed'
      );
    }

    // Execute the operation
    const { signature, result } = await operation();

    // Store as pending
    const pendingOp: PendingOperation = {
      key,
      signature,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.pendingTimeout,
    };
    if (metadata !== undefined) {
      pendingOp.metadata = metadata;
    }
    this.setPending(key, pendingOp);

    return result;
  }

  /**
   * Check if an operation with the given key is pending.
   */
  isPending(key: string): boolean {
    const pending = this.getPending(key);
    return pending !== null && Date.now() < pending.expiresAt;
  }

  /**
   * Check if an operation with the given key was recently completed.
   */
  isCompleted(key: string): boolean {
    return this.getCompleted(key) !== null;
  }

  /**
   * Get the signature for a pending or completed operation.
   */
  getSignature(key: string): TransactionSignature | null {
    const pending = this.getPending(key);
    if (pending !== null) {
      return pending.signature;
    }
    return this.getCompleted(key);
  }

  /**
   * Manually mark an operation as completed.
   * Use this if you confirmed the transaction outside of executeOnce.
   */
  markCompleted(key: string, signature: TransactionSignature): void {
    this.clearPending(key);
    this.storage.setItem(
      this.prefix + 'completed:' + key,
      JSON.stringify({
        signature,
        completedAt: Date.now(),
        expiresAt: Date.now() + this.completedRetention,
      })
    );
  }

  /**
   * Manually clear a pending operation.
   * Use this if you know the transaction failed or should be retried.
   */
  clearPending(key: string): void {
    this.storage.removeItem(this.prefix + key);
  }

  /**
   * Clear all stored operations.
   * Useful for testing or resetting state.
   */
  clearAll(): void {
    // This only works fully with MemoryStorage
    // For localStorage, would need to iterate keys
    if (this.storage instanceof MemoryStorage) {
      this.storage.clear();
    }
  }

  /**
   * Cleanup expired entries from storage.
   * Call periodically to prevent storage bloat.
   */
  cleanup(): void {
    // This is a no-op for localStorage since we check expiry on read
    // MemoryStorage could implement periodic cleanup if needed
  }

  private getPending(key: string): PendingOperation | null {
    const data = this.storage.getItem(this.prefix + key);
    if (data === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as PendingOperation;
      // Check if expired
      if (Date.now() > parsed.expiresAt) {
        this.storage.removeItem(this.prefix + key);
        return null;
      }
      return parsed;
    } catch {
      // Invalid data - remove it
      this.storage.removeItem(this.prefix + key);
      return null;
    }
  }

  private setPending(key: string, op: PendingOperation): void {
    this.storage.setItem(this.prefix + key, JSON.stringify(op));
  }

  private getCompleted(key: string): TransactionSignature | null {
    const data = this.storage.getItem(this.prefix + 'completed:' + key);
    if (data === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as {
        signature: TransactionSignature;
        completedAt: number;
        expiresAt: number;
      };

      // Check if retention period expired
      if (Date.now() > parsed.expiresAt) {
        this.storage.removeItem(this.prefix + 'completed:' + key);
        return null;
      }

      return parsed.signature;
    } catch {
      this.storage.removeItem(this.prefix + 'completed:' + key);
      return null;
    }
  }

  private getDefaultStorage(): IdempotencyStorage {
    // Use localStorage in browser, MemoryStorage in Node.js
    try {
      // Check for browser environment
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const storage = (window as unknown as Record<string, unknown>).localStorage;
        if (storage !== undefined) {
          return storage as IdempotencyStorage;
        }
      }
    } catch {
      // Not in browser environment
    }
    return new MemoryStorage();
  }
}

/**
 * Generate a deterministic idempotency key for an operation.
 *
 * The key should uniquely identify the operation intent, so that
 * retrying the same logical operation uses the same key.
 *
 * @param operationType - Type of operation (e.g., 'deposit', 'borrow', 'repay')
 * @param params - Operation parameters that define uniqueness
 * @returns A deterministic idempotency key
 *
 * @example
 * ```typescript
 * const key = generateIdempotencyKey('deposit', {
 *   market: marketPubkey.toBase58(),
 *   lender: lenderPubkey.toBase58(),
 *   amount: '1000000',
 *   // Include timestamp bucket for time-based uniqueness
 *   timestamp: Math.floor(Date.now() / 60000).toString(), // 1-minute buckets
 * });
 * ```
 */
export function generateIdempotencyKey(
  operationType: string,
  params: Record<string, string>
): string {
  // Sort keys for deterministic ordering
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');

  return `${operationType}:${paramString}`;
}

/**
 * Generate a unique idempotency key with a random component.
 *
 * Use this when you want each operation to be unique, preventing
 * any form of deduplication. Useful for operations that should
 * never be deduplicated even with identical parameters.
 *
 * @param operationType - Type of operation
 * @param params - Operation parameters
 * @returns A unique idempotency key with random suffix
 */
export function generateUniqueIdempotencyKey(
  operationType: string,
  params: Record<string, string>
): string {
  const baseKey = generateIdempotencyKey(operationType, params);
  const random = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);

  return `${baseKey}:${timestamp}:${random}`;
}

/**
 * Higher-order function to wrap transaction execution with idempotency.
 *
 * @param manager - IdempotencyManager instance
 * @param connection - Solana connection
 * @param keyGenerator - Function to generate idempotency key from args
 * @param executor - Function that executes the transaction
 * @returns Wrapped function with idempotency protection
 *
 * @example
 * ```typescript
 * const deposit = withIdempotency(
 *   manager,
 *   connection,
 *   (args) => generateIdempotencyKey('deposit', {
 *     market: args.market.toBase58(),
 *     amount: args.amount.toString(),
 *   }),
 *   async (args) => {
 *     const ix = createDepositInstruction(args);
 *     const tx = new Transaction().add(ix);
 *     const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
 *     return { signature: sig, result: { success: true } };
 *   }
 * );
 *
 * // Use the wrapped function
 * await deposit({ market, amount: 1_000_000n });
 * ```
 */
export function withIdempotency<TArgs, TResult>(
  manager: IdempotencyManager,
  connection: Connection,
  keyGenerator: (args: TArgs) => string,
  executor: (args: TArgs) => Promise<IdempotentResult<TResult>>
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs): Promise<TResult> => {
    const key = keyGenerator(args);
    return manager.executeOnce(connection, key, () => executor(args));
  };
}
