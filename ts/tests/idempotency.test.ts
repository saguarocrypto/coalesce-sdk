import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IdempotencyManager,
  IdempotencyError,
  MemoryStorage,
  generateIdempotencyKey,
  generateUniqueIdempotencyKey,
  withIdempotency,
} from '../src/idempotency';

// Mock Connection type
interface MockConnection {
  getSignatureStatus: ReturnType<typeof vi.fn>;
}

describe('IdempotencyManager', () => {
  let manager: IdempotencyManager;
  let storage: MemoryStorage;
  let mockConnection: MockConnection;

  beforeEach(() => {
    storage = new MemoryStorage();
    manager = new IdempotencyManager({ storage });
    mockConnection = {
      getSignatureStatus: vi.fn(),
    };
  });

  describe('executeOnce', () => {
    it('should execute operation on first call', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: { success: true },
      });

      const result = await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      expect(result).toEqual({ success: true });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw IdempotencyError for pending operation', async () => {
      // First call
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: { success: true },
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      // Mock pending status (no confirmation yet)
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: null,
      });

      // Second call should throw
      await expect(
        manager.executeOnce(
          mockConnection as unknown as import('@solana/web3.js').Connection,
          'test-key',
          operation
        )
      ).rejects.toThrow(IdempotencyError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw IdempotencyError for completed operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: { success: true },
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      // Mock confirmed status
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: { confirmationStatus: 'confirmed' },
      });

      // Second call should throw with 'completed' status
      const error = await manager
        .executeOnce(
          mockConnection as unknown as import('@solana/web3.js').Connection,
          'test-key',
          operation
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(IdempotencyError);
      expect(error.status).toBe('completed');
      expect(error.signature).toBe('sig123');
    });

    it('should allow retry after transaction failure', async () => {
      const operation = vi
        .fn()
        .mockResolvedValueOnce({
          signature: 'sig123',
          result: { success: true },
        })
        .mockResolvedValueOnce({
          signature: 'sig456',
          result: { success: true, retry: true },
        });

      // First call
      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      // Mock failed status
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: { err: { InstructionError: [0, 'Custom'] } },
      });

      // Second call should succeed (retry allowed after failure)
      const result = await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      expect(result).toEqual({ success: true, retry: true });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should allow retry after blockhash expiry', async () => {
      // Create manager with short timeout for testing
      const shortTimeoutManager = new IdempotencyManager({
        storage,
        pendingTimeout: 100, // 100ms
      });

      const operation = vi
        .fn()
        .mockResolvedValueOnce({
          signature: 'sig123',
          result: { first: true },
        })
        .mockResolvedValueOnce({
          signature: 'sig456',
          result: { second: true },
        });

      // First call
      await shortTimeoutManager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Mock null status (transaction never landed)
      mockConnection.getSignatureStatus.mockResolvedValue({
        value: null,
      });

      // Second call should succeed (expired, never landed)
      const result = await shortTimeoutManager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      expect(result).toEqual({ second: true });
    });

    it('should store metadata with pending operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: { success: true },
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation,
        { market: 'abc', amount: '1000' }
      );

      // Verify metadata is stored (check internal storage)
      const stored = storage.getItem('coalescefi:pending:test-key');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.metadata).toEqual({ market: 'abc', amount: '1000' });
    });
  });

  describe('isPending', () => {
    it('should return true for pending operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: {},
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      expect(manager.isPending('test-key')).toBe(true);
    });

    it('should return false for unknown key', () => {
      expect(manager.isPending('unknown-key')).toBe(false);
    });
  });

  describe('isCompleted', () => {
    it('should return true for completed operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: {},
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      // Mark as completed
      manager.markCompleted('test-key', 'sig123');

      expect(manager.isCompleted('test-key')).toBe(true);
    });

    it('should return false for unknown key', () => {
      expect(manager.isCompleted('unknown-key')).toBe(false);
    });
  });

  describe('getSignature', () => {
    it('should return signature for pending operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: {},
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      expect(manager.getSignature('test-key')).toBe('sig123');
    });

    it('should return signature for completed operation', () => {
      manager.markCompleted('test-key', 'sig456');
      expect(manager.getSignature('test-key')).toBe('sig456');
    });

    it('should return null for unknown key', () => {
      expect(manager.getSignature('unknown-key')).toBeNull();
    });
  });

  describe('clearPending', () => {
    it('should clear pending operation', async () => {
      const operation = vi.fn().mockResolvedValue({
        signature: 'sig123',
        result: {},
      });

      await manager.executeOnce(
        mockConnection as unknown as import('@solana/web3.js').Connection,
        'test-key',
        operation
      );

      expect(manager.isPending('test-key')).toBe(true);

      manager.clearPending('test-key');

      expect(manager.isPending('test-key')).toBe(false);
    });
  });
});

describe('generateIdempotencyKey', () => {
  it('should generate deterministic key', () => {
    const key1 = generateIdempotencyKey('deposit', {
      market: 'abc123',
      amount: '1000000',
    });

    const key2 = generateIdempotencyKey('deposit', {
      amount: '1000000',
      market: 'abc123', // Different order
    });

    expect(key1).toBe(key2);
  });

  it('should include operation type in key', () => {
    const depositKey = generateIdempotencyKey('deposit', { market: 'abc' });
    const borrowKey = generateIdempotencyKey('borrow', { market: 'abc' });

    expect(depositKey).not.toBe(borrowKey);
    expect(depositKey).toContain('deposit:');
    expect(borrowKey).toContain('borrow:');
  });

  it('should differentiate by parameters', () => {
    const key1 = generateIdempotencyKey('deposit', {
      market: 'abc',
      amount: '1000',
    });

    const key2 = generateIdempotencyKey('deposit', {
      market: 'abc',
      amount: '2000',
    });

    expect(key1).not.toBe(key2);
  });

  it('should handle empty params', () => {
    const key = generateIdempotencyKey('test', {});
    expect(key).toBe('test:');
  });
});

describe('generateUniqueIdempotencyKey', () => {
  it('should generate unique keys for same params', () => {
    const key1 = generateUniqueIdempotencyKey('deposit', { market: 'abc' });
    const key2 = generateUniqueIdempotencyKey('deposit', { market: 'abc' });

    expect(key1).not.toBe(key2);
  });

  it('should include base key in unique key', () => {
    const key = generateUniqueIdempotencyKey('deposit', { market: 'abc' });
    expect(key).toContain('deposit:');
    expect(key).toContain('market=abc');
  });
});

describe('withIdempotency', () => {
  let storage: MemoryStorage;
  let manager: IdempotencyManager;
  let mockConnection: MockConnection;

  beforeEach(() => {
    storage = new MemoryStorage();
    manager = new IdempotencyManager({ storage });
    mockConnection = {
      getSignatureStatus: vi.fn(),
    };
  });

  it('should wrap function with idempotency protection', async () => {
    interface DepositArgs {
      market: string;
      amount: bigint;
    }

    const executor = vi.fn().mockResolvedValue({
      signature: 'sig123',
      result: { deposited: true },
    });

    const deposit = withIdempotency<DepositArgs, { deposited: boolean }>(
      manager,
      mockConnection as unknown as import('@solana/web3.js').Connection,
      (args) =>
        generateIdempotencyKey('deposit', {
          market: args.market,
          amount: args.amount.toString(),
        }),
      executor
    );

    const result = await deposit({ market: 'abc', amount: 1000000n });

    expect(result).toEqual({ deposited: true });
    expect(executor).toHaveBeenCalledTimes(1);

    // Second call with same params should fail
    mockConnection.getSignatureStatus.mockResolvedValue({ value: null });

    await expect(deposit({ market: 'abc', amount: 1000000n })).rejects.toThrow(IdempotencyError);
  });

  it('should allow different params', async () => {
    const executor = vi.fn().mockResolvedValue({
      signature: 'sig123',
      result: { deposited: true },
    });

    const deposit = withIdempotency(
      manager,
      mockConnection as unknown as import('@solana/web3.js').Connection,
      (args: { amount: string }) => generateIdempotencyKey('deposit', { amount: args.amount }),
      executor
    );

    await deposit({ amount: '1000' });
    await deposit({ amount: '2000' }); // Different amount = different key

    expect(executor).toHaveBeenCalledTimes(2);
  });
});

describe('MemoryStorage', () => {
  it('should store and retrieve items', () => {
    const storage = new MemoryStorage();

    storage.setItem('key1', 'value1');
    expect(storage.getItem('key1')).toBe('value1');
  });

  it('should return null for missing items', () => {
    const storage = new MemoryStorage();
    expect(storage.getItem('missing')).toBeNull();
  });

  it('should remove items', () => {
    const storage = new MemoryStorage();

    storage.setItem('key1', 'value1');
    storage.removeItem('key1');

    expect(storage.getItem('key1')).toBeNull();
  });

  it('should clear all items', () => {
    const storage = new MemoryStorage();

    storage.setItem('key1', 'value1');
    storage.setItem('key2', 'value2');
    storage.clear();

    expect(storage.getItem('key1')).toBeNull();
    expect(storage.getItem('key2')).toBeNull();
  });
});

describe('IdempotencyError', () => {
  it('should have correct properties', () => {
    const error = new IdempotencyError('Test error', 'sig123', 'pending');

    expect(error.name).toBe('IdempotencyError');
    expect(error.message).toBe('Test error');
    expect(error.signature).toBe('sig123');
    expect(error.status).toBe('pending');
  });

  it('should be instanceof Error', () => {
    const error = new IdempotencyError('Test', 'sig', 'completed');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(IdempotencyError);
  });
});
