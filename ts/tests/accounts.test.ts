import { Keypair } from '@solana/web3.js';
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
