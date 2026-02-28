import { Keypair, PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';

import {
  findProtocolConfigPda,
  findMarketPda,
  findMarketAuthorityPda,
  findVaultPda,
  findLenderPositionPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  findProgramDataPda,
  deriveMarketPdas,
  SEED_PROTOCOL_CONFIG,
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
} from '../src/pdas';

describe('PDA Derivations', () => {
  const testProgramId = new PublicKey('11111111111111111111111111111111');

  describe('findProtocolConfigPda', () => {
    it('should derive a valid PDA', () => {
      const [pda, bump] = findProtocolConfigPda(testProgramId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should be deterministic', () => {
      const [pda1] = findProtocolConfigPda(testProgramId);
      const [pda2] = findProtocolConfigPda(testProgramId);

      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should use correct seeds', () => {
      // Verify seeds match expected value
      expect(SEED_PROTOCOL_CONFIG.toString()).toBe('protocol_config');
    });
  });

  describe('findMarketPda', () => {
    it('should derive a valid PDA with borrower and nonce', () => {
      const borrower = Keypair.generate().publicKey;
      const nonce = BigInt(12345);
      const [pda, bump] = findMarketPda(borrower, nonce, testProgramId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should derive different PDAs for different nonces', () => {
      const borrower = Keypair.generate().publicKey;
      const [pda1] = findMarketPda(borrower, BigInt(1), testProgramId);
      const [pda2] = findMarketPda(borrower, BigInt(2), testProgramId);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it('should derive different PDAs for different borrowers', () => {
      const borrower1 = Keypair.generate().publicKey;
      const borrower2 = Keypair.generate().publicKey;
      const [pda1] = findMarketPda(borrower1, BigInt(1), testProgramId);
      const [pda2] = findMarketPda(borrower2, BigInt(1), testProgramId);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it('should handle large nonces', () => {
      const borrower = Keypair.generate().publicKey;
      const largeNonce = BigInt('18446744073709551615'); // max u64
      const [pda, bump] = findMarketPda(borrower, largeNonce, testProgramId);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });
  });

  describe('findMarketAuthorityPda', () => {
    it('should derive market authority from market pubkey', () => {
      const market = Keypair.generate().publicKey;
      const [authority, bump] = findMarketAuthorityPda(market, testProgramId);

      expect(authority).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it('should derive different authorities for different markets', () => {
      const market1 = Keypair.generate().publicKey;
      const market2 = Keypair.generate().publicKey;
      const [authority1] = findMarketAuthorityPda(market1, testProgramId);
      const [authority2] = findMarketAuthorityPda(market2, testProgramId);

      expect(authority1.equals(authority2)).toBe(false);
    });
  });

  describe('findVaultPda', () => {
    it('should derive vault from market pubkey', () => {
      const market = Keypair.generate().publicKey;
      const [vault, bump] = findVaultPda(market, testProgramId);

      expect(vault).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it('should derive different vaults for different markets', () => {
      const market1 = Keypair.generate().publicKey;
      const market2 = Keypair.generate().publicKey;
      const [vault1] = findVaultPda(market1, testProgramId);
      const [vault2] = findVaultPda(market2, testProgramId);

      expect(vault1.equals(vault2)).toBe(false);
    });
  });

  describe('findLenderPositionPda', () => {
    it('should derive position from market and lender', () => {
      const market = Keypair.generate().publicKey;
      const lender = Keypair.generate().publicKey;

      const [position, bump] = findLenderPositionPda(market, lender, testProgramId);

      expect(position).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it('should be different for different lenders', () => {
      const market = Keypair.generate().publicKey;
      const lender1 = Keypair.generate().publicKey;
      const lender2 = Keypair.generate().publicKey;

      const [position1] = findLenderPositionPda(market, lender1, testProgramId);
      const [position2] = findLenderPositionPda(market, lender2, testProgramId);

      expect(position1.equals(position2)).toBe(false);
    });

    it('should be different for different markets', () => {
      const market1 = Keypair.generate().publicKey;
      const market2 = Keypair.generate().publicKey;
      const lender = Keypair.generate().publicKey;

      const [position1] = findLenderPositionPda(market1, lender, testProgramId);
      const [position2] = findLenderPositionPda(market2, lender, testProgramId);

      expect(position1.equals(position2)).toBe(false);
    });
  });

  describe('findBorrowerWhitelistPda', () => {
    it('should derive whitelist from borrower', () => {
      const borrower = Keypair.generate().publicKey;

      const [whitelist, bump] = findBorrowerWhitelistPda(borrower, testProgramId);

      expect(whitelist).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });
  });

  describe('findBlacklistCheckPda', () => {
    it('should derive blacklist check from address and blacklist program', () => {
      const address = Keypair.generate().publicKey;
      const blacklistProgram = Keypair.generate().publicKey;

      const [checkPda, bump] = findBlacklistCheckPda(address, blacklistProgram);

      expect(checkPda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should derive different PDAs for different addresses', () => {
      const address1 = Keypair.generate().publicKey;
      const address2 = Keypair.generate().publicKey;
      const blacklistProgram = Keypair.generate().publicKey;

      const [checkPda1] = findBlacklistCheckPda(address1, blacklistProgram);
      const [checkPda2] = findBlacklistCheckPda(address2, blacklistProgram);

      expect(checkPda1.equals(checkPda2)).toBe(false);
    });

    it('should derive different PDAs for different blacklist programs', () => {
      const address = Keypair.generate().publicKey;
      const blacklistProgram1 = Keypair.generate().publicKey;
      const blacklistProgram2 = Keypair.generate().publicKey;

      const [checkPda1] = findBlacklistCheckPda(address, blacklistProgram1);
      const [checkPda2] = findBlacklistCheckPda(address, blacklistProgram2);

      expect(checkPda1.equals(checkPda2)).toBe(false);
    });
  });

  describe('findProgramDataPda', () => {
    it('should derive program data from program ID', () => {
      const [programData, bump] = findProgramDataPda(testProgramId);

      expect(programData).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should be deterministic', () => {
      const [programData1] = findProgramDataPda(testProgramId);
      const [programData2] = findProgramDataPda(testProgramId);

      expect(programData1.equals(programData2)).toBe(true);
    });

    it('should use BPF Loader Upgradeable as the program', () => {
      // Verify the expected program is used
      expect(BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toBase58()).toBe(
        'BPFLoaderUpgradeab1e11111111111111111111111'
      );
    });
  });

  describe('deriveMarketPdas', () => {
    it('should derive all market-related PDAs at once', () => {
      const borrower = Keypair.generate().publicKey;
      const nonce = BigInt(42);
      const pdas = deriveMarketPdas(borrower, nonce, testProgramId);

      expect(pdas.market.address).toBeInstanceOf(PublicKey);
      expect(pdas.marketAuthority.address).toBeInstanceOf(PublicKey);
      expect(pdas.vault.address).toBeInstanceOf(PublicKey);

      expect(pdas.market.bump).toBeGreaterThanOrEqual(0);
      expect(pdas.marketAuthority.bump).toBeGreaterThanOrEqual(0);
      expect(pdas.vault.bump).toBeGreaterThanOrEqual(0);
    });

    it('should match individual derivations', () => {
      const borrower = Keypair.generate().publicKey;
      const nonce = BigInt(42);
      const pdas = deriveMarketPdas(borrower, nonce, testProgramId);

      const [market] = findMarketPda(borrower, nonce, testProgramId);
      const [authority] = findMarketAuthorityPda(market, testProgramId);
      const [vault] = findVaultPda(market, testProgramId);

      expect(pdas.market.address.equals(market)).toBe(true);
      expect(pdas.marketAuthority.address.equals(authority)).toBe(true);
      expect(pdas.vault.address.equals(vault)).toBe(true);
    });
  });
});
