import { PublicKey } from '@solana/web3.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getProgramId,
  resolveProgramId,
  configureSdk,
  resetSdkConfig,
  getSdkConfig,
  DEFAULT_PROGRAM_IDS,
  WAD,
  BPS,
  SECONDS_PER_YEAR,
  MAX_ANNUAL_INTEREST_BPS,
  MAX_FEE_RATE_BPS,
  USDC_DECIMALS,
  MIN_MATURITY_DELTA,
  SETTLEMENT_GRACE_PERIOD,
  PROTOCOL_CONFIG_SIZE,
  MARKET_SIZE,
  LENDER_POSITION_SIZE,
  BORROWER_WHITELIST_SIZE,
  InstructionDiscriminator,
  SPL_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  SEED_PROTOCOL_CONFIG,
  SEED_MARKET,
  SEED_MARKET_AUTHORITY,
  SEED_LENDER,
  SEED_VAULT,
  SEED_BORROWER_WHITELIST,
  SEED_BLACKLIST,
  DISC_PROTOCOL_CONFIG,
  DISC_MARKET,
  DISC_LENDER_POSITION,
  DISC_BORROWER_WL,
} from '../src/constants';

describe('Constants', () => {
  afterEach(() => {
    resetSdkConfig();
  });

  describe('Program IDs', () => {
    it('should export valid getProgramId function that returns a PublicKey', () => {
      const programId = getProgramId();
      expect(programId).toBeInstanceOf(PublicKey);
    });

    it('should export DEFAULT_PROGRAM_IDS with string values', () => {
      expect(typeof DEFAULT_PROGRAM_IDS.mainnet).toBe('string');
      expect(typeof DEFAULT_PROGRAM_IDS.devnet).toBe('string');
      expect(typeof DEFAULT_PROGRAM_IDS.localnet).toBe('string');
    });
  });

  describe('SDK Configuration', () => {
    it('should configure SDK with explicit programId', () => {
      const customProgramId = new PublicKey('2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy');
      configureSdk({ programId: customProgramId });

      const config = getSdkConfig();
      expect(config.programId?.equals(customProgramId)).toBe(true);

      const resolved = resolveProgramId();
      expect(resolved.equals(customProgramId)).toBe(true);
    });

    it('should configure SDK with network', () => {
      configureSdk({ network: 'localnet' });

      const config = getSdkConfig();
      expect(config.network).toBe('localnet');
    });

    it('should reset SDK config', () => {
      configureSdk({ network: 'localnet' });
      resetSdkConfig();

      const config = getSdkConfig();
      expect(config.network).toBeUndefined();
      expect(config.programId).toBeUndefined();
    });
  });

  describe('Math Constants', () => {
    it('should have correct WAD value (10^18)', () => {
      expect(WAD).toBe(BigInt('1000000000000000000'));
    });

    it('should have correct BPS value (10000)', () => {
      expect(BPS).toBe(BigInt(10_000));
    });

    it('should have correct SECONDS_PER_YEAR', () => {
      expect(SECONDS_PER_YEAR).toBe(BigInt(31_536_000)); // 365 * 24 * 60 * 60
    });
  });

  describe('Protocol Limits', () => {
    it('should have reasonable MAX_ANNUAL_INTEREST_BPS', () => {
      expect(MAX_ANNUAL_INTEREST_BPS).toBeGreaterThan(0);
      expect(MAX_ANNUAL_INTEREST_BPS).toBeLessThanOrEqual(10000); // Max 100%
    });

    it('should have reasonable MAX_FEE_RATE_BPS', () => {
      expect(MAX_FEE_RATE_BPS).toBeGreaterThan(0);
      expect(MAX_FEE_RATE_BPS).toBeLessThanOrEqual(10000);
    });

    it('should have correct USDC_DECIMALS', () => {
      expect(USDC_DECIMALS).toBe(6);
    });

    it('should have MIN_MATURITY_DELTA', () => {
      expect(MIN_MATURITY_DELTA).toBe(60);
    });

    it('should have SETTLEMENT_GRACE_PERIOD', () => {
      expect(SETTLEMENT_GRACE_PERIOD).toBe(300); // 5 minutes
    });
  });

  describe('Account Sizes', () => {
    it('should have positive account sizes', () => {
      expect(PROTOCOL_CONFIG_SIZE).toBeGreaterThan(0);
      expect(MARKET_SIZE).toBeGreaterThan(0);
      expect(LENDER_POSITION_SIZE).toBeGreaterThan(0);
      expect(BORROWER_WHITELIST_SIZE).toBeGreaterThan(0);
    });
  });

  describe('Instruction Discriminators', () => {
    it('should have all instruction types', () => {
      // ADMIN/SETUP (0-2)
      expect(InstructionDiscriminator.InitializeProtocol).toBe(0);
      expect(InstructionDiscriminator.SetFeeConfig).toBe(1);
      expect(InstructionDiscriminator.CreateMarket).toBe(2);
      // CORE LENDING (3-7)
      expect(InstructionDiscriminator.Deposit).toBe(3);
      expect(InstructionDiscriminator.Borrow).toBe(4);
      expect(InstructionDiscriminator.Repay).toBe(5);
      expect(InstructionDiscriminator.RepayInterest).toBe(6);
      expect(InstructionDiscriminator.Withdraw).toBe(7);
      // SETTLEMENT (8-11)
      expect(InstructionDiscriminator.CollectFees).toBe(8);
      expect(InstructionDiscriminator.ReSettle).toBe(9);
      expect(InstructionDiscriminator.CloseLenderPosition).toBe(10);
      expect(InstructionDiscriminator.WithdrawExcess).toBe(11);
      // ACCESS CONTROL (12-16)
      expect(InstructionDiscriminator.SetBorrowerWhitelist).toBe(12);
      expect(InstructionDiscriminator.SetPause).toBe(13);
      expect(InstructionDiscriminator.SetBlacklistMode).toBe(14);
      expect(InstructionDiscriminator.SetAdmin).toBe(15);
      expect(InstructionDiscriminator.SetWhitelistManager).toBe(16);
    });
  });

  describe('System Program IDs', () => {
    it('should export valid SPL_TOKEN_PROGRAM_ID', () => {
      expect(SPL_TOKEN_PROGRAM_ID).toBeInstanceOf(PublicKey);
      expect(SPL_TOKEN_PROGRAM_ID.toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    });

    it('should export valid SYSTEM_PROGRAM_ID', () => {
      expect(SYSTEM_PROGRAM_ID).toBeInstanceOf(PublicKey);
      expect(SYSTEM_PROGRAM_ID.toBase58()).toBe('11111111111111111111111111111111');
    });
  });

  describe('PDA Seeds', () => {
    it('should have all seed constants as buffers', () => {
      expect(SEED_PROTOCOL_CONFIG).toBeInstanceOf(Buffer);
      expect(SEED_MARKET).toBeInstanceOf(Buffer);
      expect(SEED_MARKET_AUTHORITY).toBeInstanceOf(Buffer);
      expect(SEED_LENDER).toBeInstanceOf(Buffer);
      expect(SEED_VAULT).toBeInstanceOf(Buffer);
      expect(SEED_BORROWER_WHITELIST).toBeInstanceOf(Buffer);
      expect(SEED_BLACKLIST).toBeInstanceOf(Buffer);
    });

    it('should have correct seed values', () => {
      expect(SEED_PROTOCOL_CONFIG.toString()).toBe('protocol_config');
      expect(SEED_MARKET.toString()).toBe('market');
      expect(SEED_LENDER.toString()).toBe('lender');
      expect(SEED_VAULT.toString()).toBe('vault');
      expect(SEED_MARKET_AUTHORITY.toString()).toBe('market_authority');
      expect(SEED_BORROWER_WHITELIST.toString()).toBe('borrower_whitelist');
      expect(SEED_BLACKLIST.toString()).toBe('blacklist');
    });
  });

  describe('Account Discriminators', () => {
    it('should have correct discriminator values', () => {
      expect(DISC_PROTOCOL_CONFIG.toString()).toBe('COALPC__');
      expect(DISC_MARKET.toString()).toBe('COALMKT_');
      expect(DISC_LENDER_POSITION.toString()).toBe('COALLPOS');
      expect(DISC_BORROWER_WL.toString()).toBe('COALBWL_');
    });

    it('should have correct discriminator lengths', () => {
      expect(DISC_PROTOCOL_CONFIG.length).toBe(8);
      expect(DISC_MARKET.length).toBe(8);
      expect(DISC_LENDER_POSITION.length).toBe(8);
      expect(DISC_BORROWER_WL.length).toBe(8);
    });
  });
});
