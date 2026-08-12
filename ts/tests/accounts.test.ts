import { Keypair, SystemProgram } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';

import {
  decodeProtocolConfig,
  decodeMarket,
  decodeLenderPosition,
  decodeBorrowerWhitelist,
  getAccountType,
  decodeAccount,
  fetchProtocolConfig,
  fetchMarket,
  fetchLenderPosition,
  fetchBorrowerWhitelist,
  findNextMarketNonce,
} from '../src/accounts';
import {
  PROTOCOL_CONFIG_SIZE,
  MARKET_SIZE,
  LENDER_POSITION_SIZE,
  BORROWER_WHITELIST_SIZE,
  DISC_PROTOCOL_CONFIG,
  DISC_MARKET,
  DISC_LENDER_POSITION,
  DISC_BORROWER_WL,
} from '../src/constants';
import { findMarketPda } from '../src/pdas';

describe('Account Decoders', () => {
  describe('getAccountType', () => {
    it('should identify ProtocolConfig by size', () => {
      expect(getAccountType(PROTOCOL_CONFIG_SIZE)).toBe('ProtocolConfig');
    });

    it('should identify Market by size', () => {
      expect(getAccountType(MARKET_SIZE)).toBe('Market');
    });

    it('should identify LenderPosition by size', () => {
      expect(getAccountType(LENDER_POSITION_SIZE)).toBe('LenderPosition');
    });

    it('should identify BorrowerWhitelist by size', () => {
      expect(getAccountType(BORROWER_WHITELIST_SIZE)).toBe('BorrowerWhitelist');
    });

    it('should return null for unknown sizes', () => {
      expect(getAccountType(100)).toBe(null);
      expect(getAccountType(0)).toBe(null);
      expect(getAccountType(1000)).toBe(null);
    });
  });

  describe('decodeProtocolConfig', () => {
    it('should decode a valid ProtocolConfig', () => {
      // Create a valid ProtocolConfig buffer (8-byte discriminator prefix)
      const buffer = new Uint8Array(PROTOCOL_CONFIG_SIZE);

      // Set discriminator (8 bytes at offset 0)
      buffer.set(DISC_PROTOCOL_CONFIG, 0);

      // Set version (1 byte at offset 8)
      buffer[8] = 1;

      // Set admin pubkey (32 bytes at offset 9)
      const admin = Keypair.generate().publicKey;
      buffer.set(admin.toBytes(), 9);

      // Set feeRateBps (u16 at offset 41) - 500 bps = 5%
      buffer[41] = 0xf4; // 500 in LE
      buffer[42] = 0x01;

      // Set feeAuthority (32 bytes at offset 43)
      const feeAuthority = Keypair.generate().publicKey;
      buffer.set(feeAuthority.toBytes(), 43);

      // Set whitelistManager (32 bytes at offset 75)
      const whitelistManager = Keypair.generate().publicKey;
      buffer.set(whitelistManager.toBytes(), 75);

      // Set blacklistProgram (32 bytes at offset 107)
      const blacklistProgram = Keypair.generate().publicKey;
      buffer.set(blacklistProgram.toBytes(), 107);

      // Set isInitialized (1 byte at offset 139)
      buffer[139] = 1;

      // Set bump (1 byte at offset 140)
      buffer[140] = 255;

      const decoded = decodeProtocolConfig(buffer);

      expect(decoded.version).toBe(1);
      // admin is Uint8Array in ProtocolConfig, compare bytes
      expect(Buffer.from(decoded.admin).equals(Buffer.from(admin.toBytes()))).toBe(true);
      expect(decoded.feeRateBps).toBe(500);
      // feeAuthority, whitelistManager, blacklistProgram are also Uint8Array
      expect(Buffer.from(decoded.feeAuthority).equals(Buffer.from(feeAuthority.toBytes()))).toBe(
        true
      );
      expect(
        Buffer.from(decoded.whitelistManager).equals(Buffer.from(whitelistManager.toBytes()))
      ).toBe(true);
      expect(
        Buffer.from(decoded.blacklistProgram).equals(Buffer.from(blacklistProgram.toBytes()))
      ).toBe(true);
      expect(decoded.isInitialized).toBe(true);
      expect(decoded.bump).toBe(255);
    });

    it('should throw on invalid buffer length', () => {
      const shortBuffer = new Uint8Array(100);
      expect(() => decodeProtocolConfig(shortBuffer)).toThrow();
    });
  });

  describe('decodeMarket', () => {
    it('should decode a valid Market', () => {
      const buffer = new Uint8Array(MARKET_SIZE);

      // Set discriminator (8 bytes at offset 0)
      buffer.set(DISC_MARKET, 0);

      // Set version (1 byte at offset 8)
      buffer[8] = 1;

      // Set borrower (32 bytes at offset 9)
      const borrower = Keypair.generate().publicKey;
      buffer.set(borrower.toBytes(), 9);

      // Set mint (32 bytes at offset 41)
      const mint = Keypair.generate().publicKey;
      buffer.set(mint.toBytes(), 41);

      // Set vault (32 bytes at offset 73)
      const vault = Keypair.generate().publicKey;
      buffer.set(vault.toBytes(), 73);

      // Set marketAuthorityBump (1 byte at offset 105)
      buffer[105] = 254;

      // Set annualInterestBps (2 bytes at offset 106) - 1000 bps = 10%
      buffer[106] = 0xe8;
      buffer[107] = 0x03;

      // Set maturityTimestamp (8 bytes at offset 108)
      const timestamp = BigInt(1735689600); // 2025-01-01
      const view = new DataView(buffer.buffer);
      view.setBigInt64(108, timestamp, true);

      // Set maxTotalSupply (8 bytes at offset 116)
      view.setBigUint64(116, BigInt(1000000000000), true); // 1M USDC

      // Set marketNonce (8 bytes at offset 124)
      view.setBigUint64(124, BigInt(42), true);

      // Set scaledTotalSupply (16 bytes at offset 132) - u128
      view.setBigUint64(132, BigInt('1000000000000000000'), true);
      view.setBigUint64(140, BigInt(0), true);

      // Set scaleFactor (16 bytes at offset 148) - WAD
      view.setBigUint64(148, BigInt('1000000000000000000'), true);
      view.setBigUint64(156, BigInt(0), true);

      // Set accruedProtocolFees (8 bytes at offset 164)
      view.setBigUint64(164, BigInt(5000000), true);

      // Set totalDeposited (8 bytes at offset 172)
      view.setBigUint64(172, BigInt(500000000000), true);

      // Set totalBorrowed (8 bytes at offset 180)
      view.setBigUint64(180, BigInt(300000000000), true);

      // Set totalRepaid (8 bytes at offset 188)
      view.setBigUint64(188, BigInt(100000000000), true);

      // Set totalInterestRepaid (8 bytes at offset 196)
      view.setBigUint64(196, BigInt(50000000000), true);

      // Set lastAccrualTimestamp (8 bytes at offset 204)
      view.setBigInt64(204, BigInt(1735600000), true);

      // Set settlementFactorWad (16 bytes at offset 212) - 0 means not settled
      view.setBigUint64(212, BigInt(0), true);
      view.setBigUint64(220, BigInt(0), true);

      // Set bump (1 byte at offset 228)
      buffer[228] = 253;

      const decoded = decodeMarket(buffer);

      expect(decoded.version).toBe(1);
      expect(decoded.borrower.equals(borrower)).toBe(true);
      expect(decoded.mint.equals(mint)).toBe(true);
      expect(decoded.vault.equals(vault)).toBe(true);
      expect(decoded.marketAuthorityBump).toBe(254);
      expect(decoded.annualInterestBps).toBe(1000);
      expect(decoded.maturityTimestamp).toBe(timestamp);
      expect(decoded.maxTotalSupply).toBe(BigInt(1000000000000));
      expect(decoded.marketNonce).toBe(BigInt(42));
      expect(decoded.scaledTotalSupply).toBe(BigInt('1000000000000000000'));
      expect(decoded.scaleFactor).toBe(BigInt('1000000000000000000'));
      expect(decoded.accruedProtocolFees).toBe(BigInt(5000000));
      expect(decoded.totalDeposited).toBe(BigInt(500000000000));
      expect(decoded.totalBorrowed).toBe(BigInt(300000000000));
      expect(decoded.totalRepaid).toBe(BigInt(100000000000));
      expect(decoded.totalInterestRepaid).toBe(BigInt(50000000000));
      expect(decoded.bump).toBe(253);
    });

    it('should throw on invalid buffer length', () => {
      const shortBuffer = new Uint8Array(200);
      expect(() => decodeMarket(shortBuffer)).toThrow();
    });
  });

  describe('decodeLenderPosition', () => {
    it('should decode a valid LenderPosition', () => {
      const buffer = new Uint8Array(LENDER_POSITION_SIZE);

      // Set discriminator (8 bytes at offset 0)
      buffer.set(DISC_LENDER_POSITION, 0);

      // Set version (1 byte at offset 8)
      buffer[8] = 1;

      // Set market (32 bytes at offset 9)
      const market = Keypair.generate().publicKey;
      buffer.set(market.toBytes(), 9);

      // Set lender (32 bytes at offset 41)
      const lender = Keypair.generate().publicKey;
      buffer.set(lender.toBytes(), 41);

      // Set scaledBalance (16 bytes at offset 73) - u128
      const view = new DataView(buffer.buffer);
      view.setBigUint64(73, BigInt('500000000000000000'), true);
      view.setBigUint64(81, BigInt(0), true);

      // Set bump (1 byte at offset 89)
      buffer[89] = 252;

      const decoded = decodeLenderPosition(buffer);

      expect(decoded.version).toBe(1);
      expect(decoded.market.equals(market)).toBe(true);
      expect(decoded.lender.equals(lender)).toBe(true);
      expect(decoded.scaledBalance).toBe(BigInt('500000000000000000'));
      expect(decoded.bump).toBe(252);
    });

    it('should throw on invalid buffer length', () => {
      const shortBuffer = new Uint8Array(100);
      expect(() => decodeLenderPosition(shortBuffer)).toThrow();
    });
  });

  describe('decodeBorrowerWhitelist', () => {
    it('should decode a valid BorrowerWhitelist', () => {
      const buffer = new Uint8Array(BORROWER_WHITELIST_SIZE);

      // Set discriminator (8 bytes at offset 0)
      buffer.set(DISC_BORROWER_WL, 0);

      // Set version (1 byte at offset 8)
      buffer[8] = 1;

      // Set borrower (32 bytes at offset 9)
      const borrower = Keypair.generate().publicKey;
      buffer.set(borrower.toBytes(), 9);

      // Set isWhitelisted (1 byte at offset 41)
      buffer[41] = 1;

      // Set maxBorrowCapacity (8 bytes at offset 42)
      const view = new DataView(buffer.buffer);
      view.setBigUint64(42, BigInt(10000000000000), true); // 10M USDC

      // Set currentBorrowed (8 bytes at offset 50)
      view.setBigUint64(50, BigInt(5000000000000), true); // 5M USDC

      // Set bump (1 byte at offset 58)
      buffer[58] = 251;

      const decoded = decodeBorrowerWhitelist(buffer);

      expect(decoded.version).toBe(1);
      expect(decoded.borrower.equals(borrower)).toBe(true);
      expect(decoded.isWhitelisted).toBe(true);
      expect(decoded.maxBorrowCapacity).toBe(BigInt(10000000000000));
      expect(decoded.currentBorrowed).toBe(BigInt(5000000000000));
      expect(decoded.bump).toBe(251);
    });

    it('should decode non-whitelisted entry', () => {
      const buffer = new Uint8Array(BORROWER_WHITELIST_SIZE);

      // Set discriminator (8 bytes at offset 0)
      buffer.set(DISC_BORROWER_WL, 0);

      // Set version (1 byte at offset 8)
      buffer[8] = 1;

      const borrower = Keypair.generate().publicKey;
      buffer.set(borrower.toBytes(), 9);
      buffer[41] = 0; // not whitelisted

      const decoded = decodeBorrowerWhitelist(buffer);
      expect(decoded.isWhitelisted).toBe(false);
    });

    it('should throw on invalid buffer length', () => {
      const shortBuffer = new Uint8Array(50);
      expect(() => decodeBorrowerWhitelist(shortBuffer)).toThrow();
    });
  });

  describe('decodeAccount', () => {
    it('should decode ProtocolConfig by size', () => {
      const buffer = new Uint8Array(PROTOCOL_CONFIG_SIZE);
      buffer.set(DISC_PROTOCOL_CONFIG, 0);
      buffer[8] = 1; // version
      buffer[139] = 1; // isInitialized
      buffer[140] = 255; // bump

      const decoded = decodeAccount(buffer);
      expect(decoded).not.toBeNull();
      expect((decoded as { version: number }).version).toBe(1);
    });

    it('should decode Market by size', () => {
      const buffer = new Uint8Array(MARKET_SIZE);
      buffer.set(DISC_MARKET, 0);
      buffer[8] = 1; // version

      const decoded = decodeAccount(buffer);
      expect(decoded).not.toBeNull();
      expect((decoded as { version: number }).version).toBe(1);
    });

    it('should decode LenderPosition by size', () => {
      const buffer = new Uint8Array(LENDER_POSITION_SIZE);
      buffer.set(DISC_LENDER_POSITION, 0);
      buffer[8] = 1; // version

      const decoded = decodeAccount(buffer);
      expect(decoded).not.toBeNull();
      expect((decoded as { version: number }).version).toBe(1);
    });

    it('should decode BorrowerWhitelist by size', () => {
      const buffer = new Uint8Array(BORROWER_WHITELIST_SIZE);
      buffer.set(DISC_BORROWER_WL, 0);
      buffer[8] = 1; // version

      const decoded = decodeAccount(buffer);
      expect(decoded).not.toBeNull();
      expect((decoded as { version: number }).version).toBe(1);
    });

    it('should return null for unknown sizes', () => {
      const buffer = new Uint8Array(100);
      const decoded = decodeAccount(buffer);
      expect(decoded).toBeNull();
    });
  });

  describe('Discriminator validation', () => {
    it('should throw on invalid ProtocolConfig discriminator', () => {
      const buffer = new Uint8Array(PROTOCOL_CONFIG_SIZE);
      buffer.set(Buffer.from('INVALID_'), 0); // Wrong discriminator

      expect(() => decodeProtocolConfig(buffer)).toThrow('Invalid ProtocolConfig discriminator');
    });

    it('should throw on invalid Market discriminator', () => {
      const buffer = new Uint8Array(MARKET_SIZE);
      buffer.set(Buffer.from('INVALID_'), 0);

      expect(() => decodeMarket(buffer)).toThrow('Invalid Market discriminator');
    });

    it('should throw on invalid LenderPosition discriminator', () => {
      const buffer = new Uint8Array(LENDER_POSITION_SIZE);
      buffer.set(Buffer.from('INVALID_'), 0);

      expect(() => decodeLenderPosition(buffer)).toThrow('Invalid LenderPosition discriminator');
    });

    it('should throw on invalid BorrowerWhitelist discriminator', () => {
      const buffer = new Uint8Array(BORROWER_WHITELIST_SIZE);
      buffer.set(Buffer.from('INVALID_'), 0);

      expect(() => decodeBorrowerWhitelist(buffer)).toThrow(
        'Invalid BorrowerWhitelist discriminator'
      );
    });
  });

  describe('Fetch Functions', () => {
    // Create mock connection that returns account info
    function createMockConnection(data: Uint8Array | null) {
      return {
        getAccountInfo: vi.fn().mockResolvedValue(data ? { data } : null),
      } as unknown as import('@solana/web3.js').Connection;
    }

    describe('fetchProtocolConfig', () => {
      it('should return null when account does not exist', async () => {
        const connection = createMockConnection(null);
        const address = Keypair.generate().publicKey;

        const result = await fetchProtocolConfig(connection, address);
        expect(result).toBeNull();
      });

      it('should decode and return ProtocolConfig when account exists', async () => {
        const buffer = new Uint8Array(PROTOCOL_CONFIG_SIZE);
        buffer.set(DISC_PROTOCOL_CONFIG, 0);
        buffer[8] = 1; // version
        buffer[139] = 1; // isInitialized
        buffer[140] = 255; // bump

        const connection = createMockConnection(buffer);
        const address = Keypair.generate().publicKey;

        const result = await fetchProtocolConfig(connection, address);
        expect(result).not.toBeNull();
        expect(result?.version).toBe(1);
        expect(result?.bump).toBe(255);
      });
    });

    describe('fetchMarket', () => {
      it('should return null when account does not exist', async () => {
        const connection = createMockConnection(null);
        const address = Keypair.generate().publicKey;

        const result = await fetchMarket(connection, address);
        expect(result).toBeNull();
      });

      it('should decode and return Market when account exists', async () => {
        const buffer = new Uint8Array(MARKET_SIZE);
        buffer.set(DISC_MARKET, 0);
        buffer[8] = 1; // version
        buffer[228] = 253; // bump

        const connection = createMockConnection(buffer);
        const address = Keypair.generate().publicKey;

        const result = await fetchMarket(connection, address);
        expect(result).not.toBeNull();
        expect(result?.version).toBe(1);
        expect(result?.bump).toBe(253);
      });
    });

    describe('fetchLenderPosition', () => {
      it('should return null when account does not exist', async () => {
        const connection = createMockConnection(null);
        const address = Keypair.generate().publicKey;

        const result = await fetchLenderPosition(connection, address);
        expect(result).toBeNull();
      });

      it('should decode and return LenderPosition when account exists', async () => {
        const buffer = new Uint8Array(LENDER_POSITION_SIZE);
        buffer.set(DISC_LENDER_POSITION, 0);
        buffer[8] = 1; // version
        buffer[89] = 252; // bump

        const connection = createMockConnection(buffer);
        const address = Keypair.generate().publicKey;

        const result = await fetchLenderPosition(connection, address);
        expect(result).not.toBeNull();
        expect(result?.version).toBe(1);
        expect(result?.bump).toBe(252);
      });
    });

    describe('fetchBorrowerWhitelist', () => {
      it('should return null when account does not exist', async () => {
        const connection = createMockConnection(null);
        const address = Keypair.generate().publicKey;

        const result = await fetchBorrowerWhitelist(connection, address);
        expect(result).toBeNull();
      });

      it('should decode and return BorrowerWhitelist when account exists', async () => {
        const buffer = new Uint8Array(BORROWER_WHITELIST_SIZE);
        buffer.set(DISC_BORROWER_WL, 0);
        buffer[8] = 1; // version
        buffer[41] = 1; // isWhitelisted
        buffer[58] = 251; // bump

        const connection = createMockConnection(buffer);
        const address = Keypair.generate().publicKey;

        const result = await fetchBorrowerWhitelist(connection, address);
        expect(result).not.toBeNull();
        expect(result?.version).toBe(1);
        expect(result?.isWhitelisted).toBe(true);
        expect(result?.bump).toBe(251);
      });
    });

    describe('Retry behavior', () => {
      it('should retry on network errors', async () => {
        let callCount = 0;
        const mockConnection = {
          getAccountInfo: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount < 3) {
              throw new Error('network timeout');
            }
            const buffer = new Uint8Array(PROTOCOL_CONFIG_SIZE);
            buffer.set(DISC_PROTOCOL_CONFIG, 0);
            buffer[8] = 1;
            return { data: buffer };
          }),
        } as unknown as import('@solana/web3.js').Connection;

        const address = Keypair.generate().publicKey;
        const result = await fetchProtocolConfig(mockConnection, address, {
          maxRetries: 3,
          baseDelayMs: 10,
        });

        expect(result).not.toBeNull();
        expect(callCount).toBe(3);
      });

      it('should not retry on non-retryable errors', async () => {
        let callCount = 0;
        const mockConnection = {
          getAccountInfo: vi.fn().mockImplementation(async () => {
            callCount++;
            throw new Error('Invalid account data');
          }),
        } as unknown as import('@solana/web3.js').Connection;

        const address = Keypair.generate().publicKey;
        await expect(
          fetchProtocolConfig(mockConnection, address, { maxRetries: 3, baseDelayMs: 10 })
        ).rejects.toThrow('Invalid account data');

        // Should only be called once (no retry)
        expect(callCount).toBe(1);
      });

      it('should throw after max retries exhausted', async () => {
        const mockConnection = {
          getAccountInfo: vi.fn().mockRejectedValue(new Error('rate limit 429')),
        } as unknown as import('@solana/web3.js').Connection;

        const address = Keypair.generate().publicKey;
        await expect(
          fetchProtocolConfig(mockConnection, address, { maxRetries: 2, baseDelayMs: 10 })
        ).rejects.toThrow('rate limit 429');
      });
    });
  });
});

describe('findNextMarketNonce', () => {
  const borrower = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;

  // An initialised market: a PDA owned by the Coalesce program.
  const marketAccount = () => ({ owner: programId, data: Buffer.alloc(0), lamports: 2_000_000 });

  // Returns a mock Connection whose getMultipleAccountsInfo reports the given
  // nonces as occupied. `occupied` is a set of nonce numbers. `probeStart` is
  // the first nonce the probe is expected to ask about (matters when a minNonce
  // floor is in play, since the mock maps keys to nonces positionally).
  function createProbeConnection(occupied: Set<number>, probeStart = 0) {
    let offset = probeStart;
    const getMultipleAccountsInfo = vi
      .fn()
      .mockImplementation(async (keys: unknown[], config?: unknown) => {
        // Track a running offset to handle variable-sized batches (especially
        // the final truncated batch). The Nth key in the current call corresponds
        // to nonce offset + N.
        const start = offset;
        offset += keys.length;
        void config;
        return keys.map((_, i) => (occupied.has(start + i) ? marketAccount() : null));
      });
    return {
      connection: { getMultipleAccountsInfo } as unknown as import('@solana/web3.js').Connection,
      getMultipleAccountsInfo,
    };
  }

  it('returns 0n when the borrower has no markets', async () => {
    const { connection } = createProbeConnection(new Set());
    expect(await findNextMarketNonce(connection, borrower, programId)).toBe(0n);
  });

  it('returns the next nonce above a contiguous run', async () => {
    const { connection } = createProbeConnection(new Set([0, 1, 2, 3, 4]));
    expect(await findNextMarketNonce(connection, borrower, programId)).toBe(5n);
  });

  it('fills a gap left by a sparse nonce scheme', async () => {
    const { connection } = createProbeConnection(new Set([0, 1, 3]));
    expect(await findNextMarketNonce(connection, borrower, programId)).toBe(2n);
  });

  it('probes a second batch when the first is fully occupied', async () => {
    const occupied = new Set(Array.from({ length: 16 }, (_, i) => i));
    const { connection, getMultipleAccountsInfo } = createProbeConnection(occupied);

    expect(await findNextMarketNonce(connection, borrower, programId)).toBe(16n);
    expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(2);
  });

  it('requests zero account bytes so probes stay cheap', async () => {
    const { connection, getMultipleAccountsInfo } = createProbeConnection(new Set());

    await findNextMarketNonce(connection, borrower, programId);

    expect(getMultipleAccountsInfo).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        commitment: 'confirmed',
        dataSlice: { offset: 0, length: 0 },
      })
    );
  });

  it('probes distinct addresses within a batch', async () => {
    const { connection, getMultipleAccountsInfo } = createProbeConnection(new Set());

    await findNextMarketNonce(connection, borrower, programId);

    const keys = getMultipleAccountsInfo.mock.calls[0]?.[0] as { toBase58(): string }[];
    expect(keys).toHaveLength(16);
    expect(new Set(keys.map((k) => k.toBase58())).size).toBe(16);
  });

  it('throws once the probe ceiling is reached', async () => {
    const occupied = new Set(Array.from({ length: 32 }, (_, i) => i));
    const { connection } = createProbeConnection(occupied);

    await expect(
      findNextMarketNonce(connection, borrower, programId, { maxProbe: 32n })
    ).rejects.toThrow(/32/);
  });

  it('surfaces a user-facing message when the RPC call fails', async () => {
    const connection = {
      getMultipleAccountsInfo: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
    } as unknown as import('@solana/web3.js').Connection;

    const { SdkError: SdkErrorClass } = await import('../src/errors');
    expect.assertions(3);

    try {
      await findNextMarketNonce(connection, borrower, programId, {
        retryConfig: { maxRetries: 0, baseDelayMs: 1 },
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SdkErrorClass);
      expect((error as InstanceType<typeof SdkErrorClass>).type).toBe('network');
      expect((error as Error).message).toContain("Couldn't check your existing loans");
    }
  });

  it('probes and returns from a truncated final batch', async () => {
    // Occupy nonces 0-9 so the truncated third batch (10-11) is actually reached
    const occupied = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const { connection, getMultipleAccountsInfo } = createProbeConnection(occupied);

    // batchSize: 5, maxProbe: 12n means:
    // Batch 1: nonces 0-4 (5 addresses) — all occupied
    // Batch 2: nonces 5-9 (5 addresses) — all occupied
    // Batch 3: nonces 10-11 (2 addresses, truncated) — nonce 10 is free
    const result = await findNextMarketNonce(connection, borrower, programId, {
      batchSize: 5,
      maxProbe: 12n,
    });

    expect(result).toBe(10n);

    // Verify the third RPC call received exactly 2 addresses (truncated batch)
    const thirdCall = getMultipleAccountsInfo.mock.calls[2];
    expect(thirdCall?.[0]).toHaveLength(2);

    // Verify exactly 3 RPC calls were made
    expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(3);
  });

  it('enforces the ceiling when maxProbe is not a multiple of batchSize', async () => {
    // Occupy all nonces 0-11, so without the truncation guard it would try to probe
    // nonces 10-14 in the third batch, find 12 free, and incorrectly return 12
    // (which exceeds maxProbe: 12n). The guard ensures it stops at 12n.
    const occupied = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const { connection } = createProbeConnection(occupied);

    // With batchSize: 5, maxProbe: 12n and all nonces occupied, should throw
    // because there are no free nonces in the range [0, 12n).
    await expect(
      findNextMarketNonce(connection, borrower, programId, {
        batchSize: 5,
        maxProbe: 12n,
      })
    ).rejects.toThrow(/12/);
  });

  it('throws if batchSize is 0 and does not hang', async () => {
    const { connection } = createProbeConnection(new Set());

    await expect(
      findNextMarketNonce(connection, borrower, programId, { batchSize: 0 })
    ).rejects.toThrow(/batchSize/i);
  }, 1000);

  it('throws if batchSize is negative and does not hang', async () => {
    const { connection } = createProbeConnection(new Set());

    await expect(
      findNextMarketNonce(connection, borrower, programId, { batchSize: -1 })
    ).rejects.toThrow(/batchSize/i);
  }, 1000);

  // ─── Occupancy is ownership, not existence ──────────────────
  //
  // `create_market` calls `create_account_with_minimum_balance_signed`, which
  // transfers the rent shortfall into an already-funded PDA and then allocates
  // it. A system-owned PDA holding nothing but lamports is therefore still
  // usable. If the probe treated any non-null account as occupied, anyone could
  // send 1 lamport to each of a borrower's first 256 market PDAs and lock them
  // out of creating loans — cheap, and with no transaction of theirs failing.
  describe('occupancy is decided by account owner', () => {
    // A PDA someone dusted: exists, holds lamports, still system-owned.
    const dustedAccount = () => ({
      owner: SystemProgram.programId,
      data: Buffer.alloc(0),
      lamports: 1,
    });

    function connectionReturning(accounts: (object | null)[]) {
      const getMultipleAccountsInfo = vi.fn().mockResolvedValue(accounts);
      return {
        connection: { getMultipleAccountsInfo } as unknown as import('@solana/web3.js').Connection,
        getMultipleAccountsInfo,
      };
    }

    it('treats a dust-prefunded, system-owned PDA as available', async () => {
      const { connection } = connectionReturning([dustedAccount()]);

      expect(await findNextMarketNonce(connection, borrower, programId, { batchSize: 1 })).toBe(0n);
    });

    it('treats a program-owned market PDA as occupied', async () => {
      const { connection } = connectionReturning([marketAccount(), null]);

      expect(await findNextMarketNonce(connection, borrower, programId, { batchSize: 2 })).toBe(1n);
    });

    it('treats a null account as available', async () => {
      const { connection } = connectionReturning([null]);

      expect(await findNextMarketNonce(connection, borrower, programId, { batchSize: 1 })).toBe(0n);
    });

    it('is not grieved by dusting a whole batch of market PDAs', async () => {
      const { connection, getMultipleAccountsInfo } = connectionReturning([
        dustedAccount(),
        dustedAccount(),
        dustedAccount(),
        dustedAccount(),
      ]);

      expect(await findNextMarketNonce(connection, borrower, programId, { batchSize: 4 })).toBe(0n);
      // One round trip: the dust never pushed the probe onward.
      expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    });

    // The owner arrives regardless of dataSlice, so the ownership check costs
    // no extra bandwidth — verified against a live RPC, which returns `owner`
    // even for `dataSlice: { offset: 0, length: 0 }`.
    it('keeps the zero-byte dataSlice bandwidth optimisation', async () => {
      const { connection, getMultipleAccountsInfo } = connectionReturning([marketAccount(), null]);

      await findNextMarketNonce(connection, borrower, programId, { batchSize: 2 });

      expect(getMultipleAccountsInfo).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ dataSlice: { offset: 0, length: 0 } })
      );
    });

    it('treats an account owned by a different program as available', async () => {
      // Sanity check on the comparison itself: occupancy must be keyed to the
      // program id passed in, not to "owned by something".
      const otherProgram = Keypair.generate().publicKey;
      const { connection } = connectionReturning([
        { owner: otherProgram, data: Buffer.alloc(0), lamports: 1 },
      ]);

      expect(await findNextMarketNonce(connection, borrower, programId, { batchSize: 1 })).toBe(0n);
    });
  });

  // ─── minNonce floor ─────────────────────────────────────────
  describe('minNonce', () => {
    it('never returns a nonce below the floor, even when lower slots are free', async () => {
      const { connection } = createProbeConnection(new Set(), 5);

      expect(
        await findNextMarketNonce(connection, borrower, programId, { minNonce: 5n, batchSize: 4 })
      ).toBe(5n);
    });

    it('probes only addresses at or above the floor', async () => {
      const { connection, getMultipleAccountsInfo } = createProbeConnection(new Set(), 3);

      await findNextMarketNonce(connection, borrower, programId, { minNonce: 3n, batchSize: 2 });

      const keys = getMultipleAccountsInfo.mock.calls[0]?.[0] as { toBase58(): string }[];
      expect(keys.map((k) => k.toBase58())).toEqual([
        findMarketPda(borrower, 3n, programId)[0].toBase58(),
        findMarketPda(borrower, 4n, programId)[0].toBase58(),
      ]);
    });

    it('rejects a negative floor', async () => {
      const { connection } = createProbeConnection(new Set());

      await expect(
        findNextMarketNonce(connection, borrower, programId, { minNonce: -1n })
      ).rejects.toThrow(/minNonce/i);
    });
  });

  // ─── maxProbe is a window, not an absolute ceiling ───────────
  //
  // `maxProbe` counts nonces probed, measured from `minNonce`. Treated as an
  // absolute ceiling instead, raising the floor would silently shrink the
  // search — and the create-market retry, whose whole job is to raise the
  // floor past a collision, would probe fewer and fewer candidates the closer
  // the collision sat to the ceiling (and none at all at the ceiling itself).
  describe('maxProbe window', () => {
    it('probes a full window above a caller-supplied floor', async () => {
      // Floor 250 with the default 256-wide window covers [250, 506), so the
      // free slot at 301 is inside it. An absolute ceiling of 256 would have
      // probed only 250-255 and thrown.
      const occupied = new Set(Array.from({ length: 51 }, (_, i) => 250 + i));
      const { connection } = createProbeConnection(occupied, 250);

      expect(await findNextMarketNonce(connection, borrower, programId, { minNonce: 250n })).toBe(
        301n
      );
    });

    it('clamps the window to the end of the u64 nonce space', async () => {
      // Three nonces left below 2^64. The window must stop there rather than
      // deriving a PDA for a nonce that does not fit a u64 seed.
      const getMultipleAccountsInfo = vi
        .fn()
        .mockImplementation(async (keys: unknown[]) => keys.map(() => marketAccount()));
      const connection = {
        getMultipleAccountsInfo,
      } as unknown as import('@solana/web3.js').Connection;

      await expect(
        findNextMarketNonce(connection, borrower, programId, {
          minNonce: 2n ** 64n - 3n,
          batchSize: 8,
        })
      ).rejects.toThrow(/18446744073709551616/);

      expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
      expect(getMultipleAccountsInfo.mock.calls[0]?.[0]).toHaveLength(3);
    });

    it('rejects a maxProbe of zero rather than probing nothing', async () => {
      const { connection } = createProbeConnection(new Set());

      await expect(
        findNextMarketNonce(connection, borrower, programId, { maxProbe: 0n })
      ).rejects.toThrow(/Invalid maxProbe: 0\b/);
    });

    it('names the bound that stopped the search, and how to move it', async () => {
      // The window is a client-side cost limit, not a protocol one — the
      // on-chain nonce is a u64. A caller who exhausts it must be pointed at
      // the knob, otherwise a borrower with a dense run of markets reads the
      // failure as "you can never create another loan".
      const occupied = new Set(Array.from({ length: 8 }, (_, i) => i));
      const { connection } = createProbeConnection(occupied);

      await expect(
        findNextMarketNonce(connection, borrower, programId, { maxProbe: 8n, batchSize: 8 })
      ).rejects.toThrow(/maxProbe=8\b[\s\S]*larger maxProbe or a minNonce above 8\b/);
    });

    it('rejects a negative maxProbe as invalid input, not as an empty window', async () => {
      // A `=== 0n` guard would let -1n through: `probeEnd` lands below the
      // floor, the loop body never runs, and the caller gets a nonsensical
      // "searched [0, -1)" report instead of being told the option is invalid.
      const { connection, getMultipleAccountsInfo } = createProbeConnection(new Set());

      await expect(
        findNextMarketNonce(connection, borrower, programId, { maxProbe: -1n })
      ).rejects.toThrow(/Invalid maxProbe: -1\b/);

      expect(getMultipleAccountsInfo).not.toHaveBeenCalled();
    });
  });
});
