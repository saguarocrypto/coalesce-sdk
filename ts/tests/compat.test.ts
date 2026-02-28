import { Keypair, PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';

import {
  publicKeyToAddress,
  addressToPublicKey,
  createAddress,
  isValidAddress,
  derivePda,
  derivePdaSync,
  encodeAddress,
  decodeAddress,
  address,
  isAddress,
} from '../src/compat';

describe('Compat Module - Solana Kit / web3.js 2.0 Compatibility', () => {
  // Well-known addresses for testing
  const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
  const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

  describe('publicKeyToAddress', () => {
    it('should convert a PublicKey to an Address', () => {
      const pubkey = new PublicKey(SYSTEM_PROGRAM_ID);
      const addr = publicKeyToAddress(pubkey);

      expect(typeof addr).toBe('string');
      expect(addr).toBe(SYSTEM_PROGRAM_ID);
    });

    it('should preserve the address value through conversion', () => {
      const keypair = Keypair.generate();
      const addr = publicKeyToAddress(keypair.publicKey);

      expect(addr).toBe(keypair.publicKey.toBase58());
    });

    it('should work with token program ID', () => {
      const pubkey = new PublicKey(TOKEN_PROGRAM_ID);
      const addr = publicKeyToAddress(pubkey);

      expect(addr).toBe(TOKEN_PROGRAM_ID);
    });
  });

  describe('addressToPublicKey', () => {
    it('should convert an Address to a PublicKey', () => {
      const addr = address(SYSTEM_PROGRAM_ID);
      const pubkey = addressToPublicKey(addr);

      expect(pubkey).toBeInstanceOf(PublicKey);
      expect(pubkey.toBase58()).toBe(SYSTEM_PROGRAM_ID);
    });

    it('should work with token program address', () => {
      const addr = address(TOKEN_PROGRAM_ID);
      const pubkey = addressToPublicKey(addr);

      expect(pubkey.toBase58()).toBe(TOKEN_PROGRAM_ID);
    });

    it('should round-trip correctly', () => {
      const keypair = Keypair.generate();
      const original = keypair.publicKey;
      const addr = publicKeyToAddress(original);
      const recovered = addressToPublicKey(addr);

      expect(recovered.equals(original)).toBe(true);
    });
  });

  describe('createAddress', () => {
    it('should create an Address from a valid base58 string', () => {
      const addr = createAddress(SYSTEM_PROGRAM_ID);

      expect(typeof addr).toBe('string');
      expect(addr).toBe(SYSTEM_PROGRAM_ID);
    });

    it('should create address from generated keypair base58', () => {
      const keypair = Keypair.generate();
      const base58 = keypair.publicKey.toBase58();
      const addr = createAddress(base58);

      expect(addr).toBe(base58);
    });

    it('should throw for invalid base58 string', () => {
      expect(() => createAddress('invalid-address-0OIl')).toThrow();
    });

    it('should throw for empty string', () => {
      expect(() => createAddress('')).toThrow();
    });

    it('should throw for address with invalid characters', () => {
      // Base58 does not include 0, O, I, l
      expect(() => createAddress('0OIl' + 'a'.repeat(40))).toThrow();
    });
  });

  describe('isValidAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidAddress(SYSTEM_PROGRAM_ID)).toBe(true);
      expect(isValidAddress(TOKEN_PROGRAM_ID)).toBe(true);
    });

    it('should return true for generated keypair address', () => {
      const keypair = Keypair.generate();
      expect(isValidAddress(keypair.publicKey.toBase58())).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress('0OIl')).toBe(false);
    });

    it('should return false for addresses with wrong length', () => {
      // Too short
      expect(isValidAddress('abc123')).toBe(false);
      // Too long (more than 44 base58 characters)
      expect(isValidAddress('a'.repeat(50))).toBe(false);
    });

    it('should return false for non-string inputs coerced to string', () => {
      // These should be caught by TypeScript, but runtime will throw
      // The underlying @solana/addresses library throws on null/undefined
      expect(() => isValidAddress(null as unknown as string)).toThrow();
      expect(() => isValidAddress(undefined as unknown as string)).toThrow();
    });
  });

  describe('derivePda', () => {
    it('should derive a valid PDA', async () => {
      const programAddress = address(SYSTEM_PROGRAM_ID);
      const seeds = [Buffer.from('test')];

      const result = await derivePda(seeds, programAddress);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      // First element is the address
      expect(typeof result[0]).toBe('string');
      // Second element is the bump
      expect(typeof result[1]).toBe('number');
      expect(result[1]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThanOrEqual(255);
    });

    it('should be deterministic', async () => {
      const programAddress = address(SYSTEM_PROGRAM_ID);
      const seeds = [Buffer.from('deterministic-test')];

      const result1 = await derivePda(seeds, programAddress);
      const result2 = await derivePda(seeds, programAddress);

      expect(result1[0]).toBe(result2[0]);
      expect(result1[1]).toBe(result2[1]);
    });

    it('should derive different PDAs for different seeds', async () => {
      const programAddress = address(SYSTEM_PROGRAM_ID);
      const seeds1 = [Buffer.from('seed1')];
      const seeds2 = [Buffer.from('seed2')];

      const result1 = await derivePda(seeds1, programAddress);
      const result2 = await derivePda(seeds2, programAddress);

      expect(result1[0]).not.toBe(result2[0]);
    });

    it('should work with multiple seeds', async () => {
      const programAddress = address(SYSTEM_PROGRAM_ID);
      const seeds = [Buffer.from('seed1'), Buffer.from('seed2'), Buffer.from('seed3')];

      const result = await derivePda(seeds, programAddress);

      expect(result[0]).toBeDefined();
      expect(result[1]).toBeGreaterThanOrEqual(0);
    });

    it('should work with Uint8Array seeds', async () => {
      const programAddress = address(SYSTEM_PROGRAM_ID);
      const seeds = [new Uint8Array([1, 2, 3, 4])];

      const result = await derivePda(seeds, programAddress);

      expect(result[0]).toBeDefined();
      expect(result[1]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('derivePdaSync', () => {
    it('should derive a valid PDA synchronously', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const seeds = [Buffer.from('test')];

      const [pda, bump] = derivePdaSync(seeds, programId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should be deterministic', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const seeds = [Buffer.from('deterministic')];

      const [pda1, bump1] = derivePdaSync(seeds, programId);
      const [pda2, bump2] = derivePdaSync(seeds, programId);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it('should derive different PDAs for different seeds', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const [pda1] = derivePdaSync([Buffer.from('seed1')], programId);
      const [pda2] = derivePdaSync([Buffer.from('seed2')], programId);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it('should work with Uint8Array seeds', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const seeds = [new Uint8Array([1, 2, 3, 4])];

      const [pda, bump] = derivePdaSync(seeds, programId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it('should work with multiple seeds', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const seeds = [Buffer.from('seed1'), Buffer.from('seed2')];

      const [pda, bump] = derivePdaSync(seeds, programId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it('should work with pubkey bytes as seed', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const keypair = Keypair.generate();
      const seeds = [keypair.publicKey.toBuffer()];

      const [pda, bump] = derivePdaSync(seeds, programId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });
  });

  describe('encodeAddress', () => {
    it('should encode an address to 32 bytes', () => {
      const addr = address(SYSTEM_PROGRAM_ID);
      const encoded = encodeAddress(addr);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(32);
    });

    it('should encode different addresses to different bytes', () => {
      const addr1 = address(SYSTEM_PROGRAM_ID);
      const addr2 = address(TOKEN_PROGRAM_ID);

      const encoded1 = encodeAddress(addr1);
      const encoded2 = encodeAddress(addr2);

      // They should not be equal
      let areEqual = true;
      for (let i = 0; i < 32; i++) {
        if (encoded1[i] !== encoded2[i]) {
          areEqual = false;
          break;
        }
      }
      expect(areEqual).toBe(false);
    });

    it('should match PublicKey toBytes', () => {
      const keypair = Keypair.generate();
      const addr = publicKeyToAddress(keypair.publicKey);
      const encoded = encodeAddress(addr);

      const pubkeyBytes = keypair.publicKey.toBytes();

      expect(encoded.length).toBe(pubkeyBytes.length);
      for (let i = 0; i < 32; i++) {
        expect(encoded[i]).toBe(pubkeyBytes[i]);
      }
    });
  });

  describe('decodeAddress', () => {
    it('should decode 32 bytes to an address', () => {
      const pubkey = new PublicKey(SYSTEM_PROGRAM_ID);
      const bytes = pubkey.toBytes();
      const addr = decodeAddress(bytes);

      expect(typeof addr).toBe('string');
      expect(addr).toBe(SYSTEM_PROGRAM_ID);
    });

    it('should round-trip with encodeAddress', () => {
      const originalAddr = address(TOKEN_PROGRAM_ID);
      const encoded = encodeAddress(originalAddr);
      const decoded = decodeAddress(encoded);

      expect(decoded).toBe(originalAddr);
    });

    it('should decode generated keypair bytes', () => {
      const keypair = Keypair.generate();
      const bytes = keypair.publicKey.toBytes();
      const addr = decodeAddress(bytes);

      expect(addr).toBe(keypair.publicKey.toBase58());
    });

    it('should work with Uint8Array input', () => {
      const keypair = Keypair.generate();
      const bytes = new Uint8Array(keypair.publicKey.toBytes());
      const addr = decodeAddress(bytes);

      expect(addr).toBe(keypair.publicKey.toBase58());
    });
  });

  describe('address (re-exported)', () => {
    it('should create an address from base58 string', () => {
      const addr = address(SYSTEM_PROGRAM_ID);

      expect(typeof addr).toBe('string');
      expect(addr).toBe(SYSTEM_PROGRAM_ID);
    });

    it('should throw for invalid input', () => {
      expect(() => address('invalid')).toThrow();
    });
  });

  describe('isAddress (re-exported)', () => {
    it('should return true for valid addresses', () => {
      expect(isAddress(SYSTEM_PROGRAM_ID)).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isAddress('invalid')).toBe(false);
    });

    it('should be consistent with isValidAddress', () => {
      const validAddr = TOKEN_PROGRAM_ID;
      const invalidAddr = 'invalid';

      expect(isAddress(validAddr)).toBe(isValidAddress(validAddr));
      expect(isAddress(invalidAddr)).toBe(isValidAddress(invalidAddr));
    });
  });

  describe('Integration: publicKeyToAddress and addressToPublicKey', () => {
    it('should maintain consistency through multiple conversions', () => {
      const keypair = Keypair.generate();
      const original = keypair.publicKey;

      // Convert back and forth multiple times
      let addr = publicKeyToAddress(original);
      let pubkey = addressToPublicKey(addr);
      addr = publicKeyToAddress(pubkey);
      pubkey = addressToPublicKey(addr);

      expect(pubkey.equals(original)).toBe(true);
    });

    it('should work with derivePdaSync output', () => {
      const programId = new PublicKey(SYSTEM_PROGRAM_ID);
      const [pda] = derivePdaSync([Buffer.from('test')], programId);

      const addr = publicKeyToAddress(pda);
      const recovered = addressToPublicKey(addr);

      expect(recovered.equals(pda)).toBe(true);
    });
  });

  describe('Integration: encode/decode with derivePda', () => {
    it('should encode and decode PDA addresses correctly', async () => {
      const programAddress = address(SYSTEM_PROGRAM_ID);
      const [pdaAddress] = await derivePda([Buffer.from('test')], programAddress);

      const encoded = encodeAddress(pdaAddress);
      const decoded = decodeAddress(encoded);

      expect(decoded).toBe(pdaAddress);
    });
  });
});
