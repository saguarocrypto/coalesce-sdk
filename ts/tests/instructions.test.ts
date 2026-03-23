import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { afterEach, describe, expect, it } from 'vitest';

import { InstructionDiscriminator, SPL_TOKEN_PROGRAM_ID } from '../src/constants';
import {
  createBorrowInstruction,
  createCloseLenderPositionInstruction,
  createCollectFeesInstruction,
  createCreateMarketInstruction,
  createDepositInstruction,
  createInitializeProtocolInstruction,
  createRepayInstruction,
  createRepayInterestInstruction,
  createReSettleInstruction,
  createSetBorrowerWhitelistInstruction,
  createSetFeeConfigInstruction,
  createSetPauseInstruction,
  createSetBlacklistModeInstruction,
  createSetAdminInstruction,
  createSetWhitelistManagerInstruction,
  createWithdrawInstruction,
  createMemoInstruction,
  createDepositInstructionWithIdempotency,
  createBorrowInstructionWithIdempotency,
  createRepayInstructionWithIdempotency,
  createWithdrawInstructionWithIdempotency,
  createWaterfallRepayInstructions,
  createWithdrawExcessInstruction,
  createForceClosePositionInstruction,
  generateIdempotencyKey,
  createDeterministicIdempotencyKey,
  validateU64,
  validateU128,
  validateBasisPoints,
  validateTimestamp,
  setMinimumTimestamp,
  getMinimumTimestamp,
  resetMinimumTimestamp,
  isZeroAddress,
  validateNonZeroAddress,
  validateAmountWithWarnings,
  validateAccountsNotZero,
  MEMO_PROGRAM_ID,
} from '../src/instructions';

describe('Instruction Builders', () => {
  const testProgramId = Keypair.generate().publicKey;

  describe('createInitializeProtocolInstruction', () => {
    it('should create instruction with correct discriminator and 7 accounts', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
        feeAuthority: Keypair.generate().publicKey,
        whitelistManager: Keypair.generate().publicKey,
        blacklistProgram: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
        programData: Keypair.generate().publicKey,
      };

      const args = {
        feeRateBps: 500,
      };

      const ix = createInitializeProtocolInstruction(accounts, args, testProgramId);

      expect(ix.programId.equals(testProgramId)).toBe(true);
      expect(ix.data[0]).toBe(InstructionDiscriminator.InitializeProtocol);
      expect(ix.keys.length).toBe(7);
      // protocolConfig is first (writable), admin is second (signer+writable)
      expect(ix.keys[0]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[0]?.isWritable).toBe(true);
      expect(ix.keys[1]?.pubkey.equals(accounts.admin)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[1]?.isWritable).toBe(true);
    });

    it('should encode fee rate correctly (3 bytes total)', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
        feeAuthority: Keypair.generate().publicKey,
        whitelistManager: Keypair.generate().publicKey,
        blacklistProgram: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
        programData: Keypair.generate().publicKey,
      };

      const args = {
        feeRateBps: 1000, // 10%
      };

      const ix = createInitializeProtocolInstruction(accounts, args, testProgramId);

      // Data should be 3 bytes: disc(1) + fee_rate_bps(2)
      expect(ix.data.length).toBe(3);
      const feeRate = (ix.data[1] ?? 0) | ((ix.data[2] ?? 0) << 8);
      expect(feeRate).toBe(1000);
    });
  });

  describe('createSetFeeConfigInstruction', () => {
    it('should create instruction with correct discriminator and 3 accounts', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
        newFeeAuthority: Keypair.generate().publicKey,
      };

      const args = { feeRateBps: 200 };

      const ix = createSetFeeConfigInstruction(accounts, args, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.SetFeeConfig);
      expect(ix.keys.length).toBe(3);
      expect(ix.data.length).toBe(3);
      expect(ix.keys[0]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
    });
  });

  describe('createCreateMarketInstruction', () => {
    it('should create instruction with 11 accounts in correct order', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        haircutState: Keypair.generate().publicKey,
      };

      const args = {
        marketNonce: BigInt(1),
        annualInterestBps: 500,
        maturityTimestamp: BigInt(1735689600),
        maxTotalSupply: BigInt(1000000000000),
      };

      const ix = createCreateMarketInstruction(accounts, args, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.CreateMarket);
      expect(ix.keys.length).toBe(11);
      // Verify order: market(0), borrower(1), mint(2), vault(3), ...
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[1]?.pubkey.equals(accounts.borrower)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[7]?.pubkey.equals(accounts.blacklistCheck)).toBe(true);
      expect(ix.keys[10]?.pubkey.equals(accounts.haircutState)).toBe(true);
    });
  });

  describe('createDepositInstruction', () => {
    it('should create instruction with correct discriminator and 10 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };

      const args = {
        amount: BigInt(1000000), // 1 USDC
      };

      const ix = createDepositInstruction(accounts, args, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.Deposit);
      expect(ix.keys.length).toBe(10);
      // market first, lender second
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[1]?.pubkey.equals(accounts.lender)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[5]?.pubkey.equals(accounts.blacklistCheck)).toBe(true);
      expect(ix.keys[7]?.pubkey.equals(accounts.mint)).toBe(true);
    });

    it('should encode amount correctly', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };

      const amount = BigInt(123456789012345);
      const ix = createDepositInstruction(accounts, { amount }, testProgramId);

      // Amount is at offset 1 (after discriminator), 8 bytes LE
      const view = new DataView(ix.data.buffer, ix.data.byteOffset);
      const decodedAmount = view.getBigUint64(1, true);
      expect(decodedAmount).toBe(amount);
    });

    it('should mark lender as signer and writable', () => {
      const lender = Keypair.generate().publicKey;
      const accounts = {
        market: Keypair.generate().publicKey,
        lender,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };

      const ix = createDepositInstruction(accounts, { amount: BigInt(1000000) }, testProgramId);

      const lenderKey = ix.keys.find((k) => k.pubkey.equals(lender));
      expect(lenderKey?.isSigner).toBe(true);
      expect(lenderKey?.isWritable).toBe(true);
    });
  });

  describe('createBorrowInstruction', () => {
    it('should create instruction with correct discriminator and 9 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        borrowerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      const ix = createBorrowInstruction(accounts, { amount: BigInt(5000000) }, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.Borrow);
      expect(ix.keys.length).toBe(9);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[6]?.pubkey.equals(accounts.blacklistCheck)).toBe(true);
    });
  });

  describe('createRepayInstruction', () => {
    it('should create instruction with correct discriminator and 8 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        payer: Keypair.generate().publicKey,
        payerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      const ix = createRepayInstruction(accounts, { amount: BigInt(1000000) }, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.Repay);
      expect(ix.keys.length).toBe(8);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[4]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[5]?.pubkey.equals(accounts.mint)).toBe(true);
      expect(ix.keys[6]?.pubkey.equals(accounts.borrowerWhitelist)).toBe(true);
    });
  });

  describe('createWithdrawInstruction', () => {
    it('should create instruction with correct discriminator and 10 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        haircutState: Keypair.generate().publicKey,
      };

      const ix = createWithdrawInstruction(
        accounts,
        { scaledAmount: BigInt('1000000000000000000') },
        testProgramId
      );

      expect(ix.data[0]).toBe(InstructionDiscriminator.Withdraw);
      expect(ix.keys.length).toBe(10);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[6]?.pubkey.equals(accounts.blacklistCheck)).toBe(true);
    });

    it('should encode u128 scaled amount correctly', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        haircutState: Keypair.generate().publicKey,
      };

      const scaledAmount = BigInt('123456789012345678901234567890');
      const ix = createWithdrawInstruction(accounts, { scaledAmount }, testProgramId);

      // Scaled amount is at offset 1, 16 bytes (u128 LE)
      const view = new DataView(ix.data.buffer, ix.data.byteOffset);
      const low = view.getBigUint64(1, true);
      const high = view.getBigUint64(9, true);
      const decodedAmount = low + (high << BigInt(64));

      expect(decodedAmount).toBe(scaledAmount);
    });
  });

  describe('createCollectFeesInstruction', () => {
    it('should create instruction with correct discriminator and 7 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        feeAuthority: Keypair.generate().publicKey,
        feeTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      const ix = createCollectFeesInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.CollectFees);
      expect(ix.keys.length).toBe(7);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[2]?.isSigner).toBe(true); // fee_authority is signer
    });
  });

  describe('createCloseLenderPositionInstruction', () => {
    it('should create instruction with correct discriminator and 5 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
        protocolConfig: Keypair.generate().publicKey,
      };

      const ix = createCloseLenderPositionInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.CloseLenderPosition);
      expect(ix.keys.length).toBe(5);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[3]?.pubkey.equals(SystemProgram.programId)).toBe(true);
      expect(ix.keys[4]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[4]?.isWritable).toBe(false);
    });
  });

  describe('createReSettleInstruction', () => {
    it('should create instruction with correct discriminator and 4 accounts, no args', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        haircutState: Keypair.generate().publicKey,
      };

      const ix = createReSettleInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.ReSettle);
      expect(ix.data.length).toBe(1); // discriminator only
      expect(ix.keys.length).toBe(4);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[1]?.pubkey.equals(accounts.vault)).toBe(true);
      expect(ix.keys[2]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[3]?.pubkey.equals(accounts.haircutState)).toBe(true);
    });
  });

  describe('createSetBorrowerWhitelistInstruction', () => {
    it('should create instruction with correct discriminator and 5 accounts', () => {
      const accounts = {
        borrowerWhitelist: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        whitelistManager: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
      };

      const args = {
        isWhitelisted: true,
        maxBorrowCapacity: BigInt(1000000000),
      };

      const ix = createSetBorrowerWhitelistInstruction(accounts, args, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.SetBorrowerWhitelist);
      expect(ix.keys.length).toBe(5);
      expect(ix.keys[0]?.pubkey.equals(accounts.borrowerWhitelist)).toBe(true);
      expect(ix.keys[2]?.isSigner).toBe(true); // whitelistManager
    });
  });

  describe('createSetPauseInstruction', () => {
    it('should create instruction with correct discriminator and 2 accounts', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
      };

      const ix = createSetPauseInstruction(accounts, { paused: true }, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.SetPause);
      expect(ix.keys.length).toBe(2);
      expect(ix.keys[0]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[0]?.isWritable).toBe(true);
      expect(ix.keys[1]?.pubkey.equals(accounts.admin)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
    });

    it('should encode paused flag correctly', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
      };

      const pausedIx = createSetPauseInstruction(accounts, { paused: true }, testProgramId);
      expect(pausedIx.data[1]).toBe(1);

      const unpausedIx = createSetPauseInstruction(accounts, { paused: false }, testProgramId);
      expect(unpausedIx.data[1]).toBe(0);
    });
  });

  describe('createSetBlacklistModeInstruction', () => {
    it('should create instruction with correct discriminator and 2 accounts', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
      };

      const ix = createSetBlacklistModeInstruction(accounts, { failClosed: true }, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.SetBlacklistMode);
      expect(ix.keys.length).toBe(2);
      expect(ix.keys[1]?.isSigner).toBe(true);
    });

    it('should encode failClosed flag correctly', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
      };

      const closedIx = createSetBlacklistModeInstruction(
        accounts,
        { failClosed: true },
        testProgramId
      );
      expect(closedIx.data[1]).toBe(1);

      const openIx = createSetBlacklistModeInstruction(
        accounts,
        { failClosed: false },
        testProgramId
      );
      expect(openIx.data[1]).toBe(0);
    });
  });

  describe('createSetAdminInstruction', () => {
    it('should create instruction with correct discriminator and 3 accounts', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        currentAdmin: Keypair.generate().publicKey,
        newAdmin: Keypair.generate().publicKey,
      };

      const ix = createSetAdminInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.SetAdmin);
      expect(ix.data.length).toBe(1); // discriminator only
      expect(ix.keys.length).toBe(3);
      expect(ix.keys[0]?.isWritable).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[2]?.isWritable).toBe(false);
    });
  });

  describe('createSetWhitelistManagerInstruction', () => {
    it('should create instruction with correct discriminator and 3 accounts', () => {
      const accounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
        newWhitelistManager: Keypair.generate().publicKey,
      };

      const ix = createSetWhitelistManagerInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.SetWhitelistManager);
      expect(ix.data.length).toBe(1); // discriminator only
      expect(ix.keys.length).toBe(3);
      expect(ix.keys[0]?.isWritable).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
    });
  });

  describe('createRepayInterestInstruction', () => {
    it('should create instruction with correct discriminator and 6 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        payer: Keypair.generate().publicKey,
        payerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      const ix = createRepayInterestInstruction(
        accounts,
        { amount: BigInt(1000000) },
        testProgramId
      );

      expect(ix.data[0]).toBe(InstructionDiscriminator.RepayInterest);
      expect(ix.keys.length).toBe(6);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
    });

    it('should reject zero amount', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        payer: Keypair.generate().publicKey,
        payerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      expect(() =>
        createRepayInterestInstruction(accounts, { amount: BigInt(0) }, testProgramId)
      ).toThrow('must be greater than 0');
    });
  });

  describe('createWithdrawExcessInstruction', () => {
    it('should create instruction with correct discriminator and 9 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        borrowerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        protocolConfig: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
      };

      const ix = createWithdrawExcessInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.WithdrawExcess);
      expect(ix.data.length).toBe(1); // discriminator only
      expect(ix.keys.length).toBe(9);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[0]?.isWritable).toBe(false);
      expect(ix.keys[1]?.pubkey.equals(accounts.borrower)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[2]?.pubkey.equals(accounts.borrowerTokenAccount)).toBe(true);
      expect(ix.keys[2]?.isWritable).toBe(true);
      expect(ix.keys[3]?.pubkey.equals(accounts.vault)).toBe(true);
      expect(ix.keys[3]?.isWritable).toBe(true);
      expect(ix.keys[4]?.pubkey.equals(accounts.marketAuthority)).toBe(true);
      expect(ix.keys[5]?.pubkey.equals(accounts.tokenProgram)).toBe(true);
      expect(ix.keys[6]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[6]?.isWritable).toBe(false);
      expect(ix.keys[7]?.pubkey.equals(accounts.blacklistCheck)).toBe(true);
      expect(ix.keys[7]?.isWritable).toBe(false);
    });
  });

  describe('createForceClosePositionInstruction', () => {
    it('should create instruction with correct discriminator and 9 accounts', () => {
      const accounts = {
        market: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        escrowTokenAccount: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        haircutState: Keypair.generate().publicKey,
      };

      const ix = createForceClosePositionInstruction(accounts, testProgramId);

      expect(ix.data[0]).toBe(InstructionDiscriminator.ForceClosePosition);
      expect(ix.data.length).toBe(1); // discriminator only
      expect(ix.keys.length).toBe(9);
      expect(ix.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(ix.keys[0]?.isWritable).toBe(true);
      expect(ix.keys[1]?.pubkey.equals(accounts.borrower)).toBe(true);
      expect(ix.keys[1]?.isSigner).toBe(true);
      expect(ix.keys[2]?.pubkey.equals(accounts.lenderPosition)).toBe(true);
      expect(ix.keys[2]?.isWritable).toBe(true);
      expect(ix.keys[3]?.pubkey.equals(accounts.vault)).toBe(true);
      expect(ix.keys[3]?.isWritable).toBe(true);
      expect(ix.keys[4]?.pubkey.equals(accounts.escrowTokenAccount)).toBe(true);
      expect(ix.keys[4]?.isWritable).toBe(true);
      expect(ix.keys[5]?.pubkey.equals(accounts.marketAuthority)).toBe(true);
      expect(ix.keys[5]?.isWritable).toBe(false);
      expect(ix.keys[6]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(ix.keys[6]?.isWritable).toBe(false);
      expect(ix.keys[7]?.pubkey.equals(accounts.tokenProgram)).toBe(true);
      expect(ix.keys[7]?.isWritable).toBe(false);
    });
  });

  describe('createMemoInstruction', () => {
    it('should create memo instruction with correct program ID', () => {
      const memo = 'test memo';
      const ix = createMemoInstruction(memo);

      expect(ix.programId.toBase58()).toBe(MEMO_PROGRAM_ID);
      expect(ix.data.toString()).toBe(memo);
      expect(ix.keys.length).toBe(0);
    });

    it('should create memo instruction with signers', () => {
      const memo = 'signed memo';
      const signer1 = Keypair.generate().publicKey;
      const signer2 = Keypair.generate().publicKey;
      const ix = createMemoInstruction(memo, [signer1, signer2]);

      expect(ix.keys.length).toBe(2);
      expect(ix.keys[0]?.pubkey.equals(signer1)).toBe(true);
      expect(ix.keys[0]?.isSigner).toBe(true);
      expect(ix.keys[0]?.isWritable).toBe(false);
      expect(ix.keys[1]?.pubkey.equals(signer2)).toBe(true);
    });
  });

  // Input Validation Tests
  describe('Input Validation', () => {
    describe('createDepositInstruction validation', () => {
      const validAccounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };

      it('should reject negative amount', () => {
        expect(() =>
          createDepositInstruction(validAccounts, { amount: BigInt(-1) }, testProgramId)
        ).toThrow('cannot be negative');
      });

      it('should reject amount exceeding u64 max', () => {
        const MAX_U64 = BigInt('18446744073709551615');
        expect(() =>
          createDepositInstruction(validAccounts, { amount: MAX_U64 + BigInt(1) }, testProgramId)
        ).toThrow('exceeds maximum u64');
      });

      it('should reject zero amount', () => {
        // Zero deposit is rejected at SDK level for safety
        expect(() =>
          createDepositInstruction(validAccounts, { amount: BigInt(0) }, testProgramId)
        ).toThrow('must be greater than 0');
      });

      it('should accept maximum u64 amount', () => {
        const MAX_U64 = BigInt('18446744073709551615');
        expect(() =>
          createDepositInstruction(validAccounts, { amount: MAX_U64 }, testProgramId)
        ).not.toThrow();
      });
    });

    describe('createBorrowInstruction validation', () => {
      const validAccounts = {
        market: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        borrowerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      it('should reject negative amount', () => {
        expect(() =>
          createBorrowInstruction(validAccounts, { amount: BigInt(-100) }, testProgramId)
        ).toThrow('cannot be negative');
      });

      it('should reject amount exceeding u64 max', () => {
        const MAX_U64 = BigInt('18446744073709551615');
        expect(() =>
          createBorrowInstruction(validAccounts, { amount: MAX_U64 + BigInt(1) }, testProgramId)
        ).toThrow('exceeds maximum u64');
      });
    });

    describe('createRepayInstruction validation', () => {
      const validAccounts = {
        market: Keypair.generate().publicKey,
        payer: Keypair.generate().publicKey,
        payerTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      it('should reject negative amount', () => {
        expect(() =>
          createRepayInstruction(validAccounts, { amount: BigInt(-1) }, testProgramId)
        ).toThrow('cannot be negative');
      });
    });

    describe('createWithdrawInstruction validation', () => {
      const validAccounts = {
        market: Keypair.generate().publicKey,
        lender: Keypair.generate().publicKey,
        lenderTokenAccount: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        lenderPosition: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
      };

      it('should reject negative scaled amount', () => {
        expect(() =>
          createWithdrawInstruction(validAccounts, { scaledAmount: BigInt(-1) }, testProgramId)
        ).toThrow('cannot be negative');
      });

      it('should reject scaled amount exceeding u128 max', () => {
        const MAX_U128 = BigInt('340282366920938463463374607431768211455');
        expect(() =>
          createWithdrawInstruction(
            validAccounts,
            { scaledAmount: MAX_U128 + BigInt(1) },
            testProgramId
          )
        ).toThrow('exceeds maximum u128');
      });

      it('should accept large but valid u128 scaled amount', () => {
        // Test with a large but valid value (not max to avoid edge case issues)
        const largeValidAmount = BigInt('100000000000000000000000000000');
        expect(() =>
          createWithdrawInstruction(
            validAccounts,
            { scaledAmount: largeValidAmount },
            testProgramId
          )
        ).not.toThrow();
      });
    });

    describe('createInitializeProtocolInstruction validation', () => {
      const validAccounts = {
        protocolConfig: Keypair.generate().publicKey,
        admin: Keypair.generate().publicKey,
        feeAuthority: Keypair.generate().publicKey,
        whitelistManager: Keypair.generate().publicKey,
        blacklistProgram: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
        programData: Keypair.generate().publicKey,
      };

      it('should reject negative fee rate', () => {
        expect(() =>
          createInitializeProtocolInstruction(validAccounts, { feeRateBps: -1 }, testProgramId)
        ).toThrow();
      });

      it('should reject fee rate exceeding 10000 bps (100%)', () => {
        expect(() =>
          createInitializeProtocolInstruction(validAccounts, { feeRateBps: 10001 }, testProgramId)
        ).toThrow();
      });

      it('should accept zero fee rate', () => {
        expect(() =>
          createInitializeProtocolInstruction(validAccounts, { feeRateBps: 0 }, testProgramId)
        ).not.toThrow();
      });

      it('should accept maximum valid fee rate (10000 bps)', () => {
        expect(() =>
          createInitializeProtocolInstruction(validAccounts, { feeRateBps: 10000 }, testProgramId)
        ).not.toThrow();
      });
    });

    describe('createCreateMarketInstruction validation', () => {
      const validAccounts = {
        market: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        mint: Keypair.generate().publicKey,
        vault: Keypair.generate().publicKey,
        marketAuthority: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        borrowerWhitelist: Keypair.generate().publicKey,
        blacklistCheck: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        haircutState: Keypair.generate().publicKey,
      };

      it('should reject negative interest rate', () => {
        const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 86400);
        expect(() =>
          createCreateMarketInstruction(
            validAccounts,
            {
              marketNonce: BigInt(1),
              annualInterestBps: -100,
              maturityTimestamp: futureTimestamp,
              maxTotalSupply: BigInt(1000000000),
            },
            testProgramId
          )
        ).toThrow();
      });

      it('should reject interest rate exceeding 10000 bps', () => {
        const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 86400);
        expect(() =>
          createCreateMarketInstruction(
            validAccounts,
            {
              marketNonce: BigInt(1),
              annualInterestBps: 10001,
              maturityTimestamp: futureTimestamp,
              maxTotalSupply: BigInt(1000000000),
            },
            testProgramId
          )
        ).toThrow();
      });

      it('should reject negative max total supply', () => {
        const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 86400);
        expect(() =>
          createCreateMarketInstruction(
            validAccounts,
            {
              marketNonce: BigInt(1),
              annualInterestBps: 500,
              maturityTimestamp: futureTimestamp,
              maxTotalSupply: BigInt(-1),
            },
            testProgramId
          )
        ).toThrow('cannot be negative');
      });

      it('should reject maturity timestamp too early (before 2020)', () => {
        expect(() =>
          createCreateMarketInstruction(
            validAccounts,
            {
              marketNonce: BigInt(1),
              annualInterestBps: 500,
              maturityTimestamp: BigInt(1000000000), // 2001
              maxTotalSupply: BigInt(1000000000),
            },
            testProgramId
          )
        ).toThrow('too early');
      });
    });

    describe('createSetBorrowerWhitelistInstruction validation', () => {
      const validAccounts = {
        borrowerWhitelist: Keypair.generate().publicKey,
        protocolConfig: Keypair.generate().publicKey,
        whitelistManager: Keypair.generate().publicKey,
        borrower: Keypair.generate().publicKey,
        systemProgram: SystemProgram.programId,
      };

      it('should reject negative max borrow capacity', () => {
        expect(() =>
          createSetBorrowerWhitelistInstruction(
            validAccounts,
            { isWhitelisted: true, maxBorrowCapacity: BigInt(-1) },
            testProgramId
          )
        ).toThrow('cannot be negative');
      });

      it('should accept zero max borrow capacity (effectively disabled)', () => {
        expect(() =>
          createSetBorrowerWhitelistInstruction(
            validAccounts,
            { isWhitelisted: true, maxBorrowCapacity: BigInt(0) },
            testProgramId
          )
        ).not.toThrow();
      });
    });
  });
});

describe('Validation Functions', () => {
  describe('validateU64', () => {
    const MAX_U64 = BigInt('18446744073709551615');

    it('should accept zero', () => {
      expect(() => validateU64(BigInt(0), 'test')).not.toThrow();
    });

    it('should accept positive values within range', () => {
      expect(() => validateU64(BigInt(1), 'test')).not.toThrow();
      expect(() => validateU64(BigInt(1000000), 'test')).not.toThrow();
      expect(() => validateU64(BigInt('9223372036854775807'), 'test')).not.toThrow();
    });

    it('should accept maximum u64 value', () => {
      expect(() => validateU64(MAX_U64, 'test')).not.toThrow();
    });

    it('should reject negative values', () => {
      expect(() => validateU64(BigInt(-1), 'test')).toThrow('cannot be negative');
      expect(() => validateU64(BigInt(-1000), 'test')).toThrow('cannot be negative');
    });

    it('should reject values exceeding u64 max', () => {
      expect(() => validateU64(MAX_U64 + BigInt(1), 'test')).toThrow('exceeds maximum u64');
    });

    it('should include field name in error message', () => {
      expect(() => validateU64(BigInt(-1), 'myField')).toThrow('myField');
    });
  });

  describe('validateU128', () => {
    const MAX_U128 = BigInt('340282366920938463463374607431768211455');

    it('should accept zero', () => {
      expect(() => validateU128(BigInt(0), 'test')).not.toThrow();
    });

    it('should accept positive values within range', () => {
      expect(() => validateU128(BigInt(1), 'test')).not.toThrow();
      expect(() => validateU128(BigInt('100000000000000000000000000000'), 'test')).not.toThrow();
    });

    it('should accept maximum u128 value', () => {
      expect(() => validateU128(MAX_U128, 'test')).not.toThrow();
    });

    it('should reject negative values', () => {
      expect(() => validateU128(BigInt(-1), 'test')).toThrow('cannot be negative');
    });

    it('should reject values exceeding u128 max', () => {
      expect(() => validateU128(MAX_U128 + BigInt(1), 'test')).toThrow('exceeds maximum u128');
    });
  });

  describe('validateBasisPoints', () => {
    it('should accept zero', () => {
      expect(() => validateBasisPoints(0, 'test')).not.toThrow();
    });

    it('should accept valid basis points (1-9999)', () => {
      expect(() => validateBasisPoints(1, 'test')).not.toThrow();
      expect(() => validateBasisPoints(500, 'test')).not.toThrow();
      expect(() => validateBasisPoints(9999, 'test')).not.toThrow();
    });

    it('should accept maximum (10000 bps = 100%)', () => {
      expect(() => validateBasisPoints(10000, 'test')).not.toThrow();
    });

    it('should reject negative values', () => {
      expect(() => validateBasisPoints(-1, 'test')).toThrow('must be between 0 and 10000');
      expect(() => validateBasisPoints(-100, 'test')).toThrow('must be between 0 and 10000');
    });

    it('should reject values over 10000', () => {
      expect(() => validateBasisPoints(10001, 'test')).toThrow('must be between 0 and 10000');
      expect(() => validateBasisPoints(20000, 'test')).toThrow('must be between 0 and 10000');
    });

    it('should reject non-integer values', () => {
      expect(() => validateBasisPoints(100.5, 'test')).toThrow('must be an integer');
      expect(() => validateBasisPoints(0.1, 'test')).toThrow('must be an integer');
    });

    it('should reject non-finite values', () => {
      expect(() => validateBasisPoints(Infinity, 'test')).toThrow('must be a finite number');
      expect(() => validateBasisPoints(NaN, 'test')).toThrow('must be a finite number');
    });
  });

  describe('validateTimestamp', () => {
    afterEach(() => {
      resetMinimumTimestamp();
    });

    it('should accept timestamps after minimum (2020)', () => {
      const year2021 = BigInt(1609459200); // 2021-01-01
      expect(() => validateTimestamp(year2021, 'test')).not.toThrow();
    });

    it('should accept current timestamp', () => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      expect(() => validateTimestamp(now, 'test')).not.toThrow();
    });

    it('should accept far future timestamps', () => {
      const year2100 = BigInt(4102444800);
      expect(() => validateTimestamp(year2100, 'test')).not.toThrow();
    });

    it('should reject negative timestamps', () => {
      expect(() => validateTimestamp(BigInt(-1), 'test')).toThrow('cannot be negative');
    });

    it('should reject timestamps before minimum', () => {
      const year2019 = BigInt(1546300800); // 2019-01-01
      expect(() => validateTimestamp(year2019, 'test')).toThrow('too early');
    });

    it('should allow configuring minimum timestamp', () => {
      const oldMin = getMinimumTimestamp();
      expect(oldMin).toBe(BigInt(1577836800)); // Default 2020-01-01

      // Set new minimum to 2015
      const year2015 = BigInt(1420070400);
      setMinimumTimestamp(year2015);
      expect(getMinimumTimestamp()).toBe(year2015);

      // Now 2019 should be valid
      const year2019 = BigInt(1546300800);
      expect(() => validateTimestamp(year2019, 'test')).not.toThrow();

      // Reset
      resetMinimumTimestamp();
      expect(getMinimumTimestamp()).toBe(BigInt(1577836800));
    });
  });

  describe('isZeroAddress', () => {
    it('should return true for zero address', () => {
      const zeroAddress = new PublicKey('11111111111111111111111111111111');
      expect(isZeroAddress(zeroAddress)).toBe(true);
    });

    it('should return false for non-zero addresses', () => {
      const randomKey = Keypair.generate().publicKey;
      expect(isZeroAddress(randomKey)).toBe(false);
    });

    it('should return true for system program (which is the zero address)', () => {
      expect(isZeroAddress(SystemProgram.programId)).toBe(true);
    });
  });

  describe('validateNonZeroAddress', () => {
    it('should accept non-zero addresses', () => {
      const randomKey = Keypair.generate().publicKey;
      expect(() => validateNonZeroAddress(randomKey, 'test')).not.toThrow();
    });

    it('should reject zero address', () => {
      const zeroAddress = new PublicKey('11111111111111111111111111111111');
      expect(() => validateNonZeroAddress(zeroAddress, 'test')).toThrow(
        'cannot be the zero address'
      );
    });

    it('should include field name in error message', () => {
      const zeroAddress = new PublicKey('11111111111111111111111111111111');
      expect(() => validateNonZeroAddress(zeroAddress, 'myAccount')).toThrow('myAccount');
    });
  });

  describe('validateAmountWithWarnings', () => {
    it('should return valid with no warnings for normal amounts', () => {
      const result = validateAmountWithWarnings(BigInt(1000000), 'amount');
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return valid with warning for small amounts', () => {
      const result = validateAmountWithWarnings(BigInt(100), 'amount');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('precision loss');
    });

    it('should throw for negative amounts', () => {
      expect(() => validateAmountWithWarnings(BigInt(-1), 'amount')).toThrow('cannot be negative');
    });

    it('should not warn for zero (zero is caught by other validation)', () => {
      const result = validateAmountWithWarnings(BigInt(0), 'amount');
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateAccountsNotZero', () => {
    const zeroAddress = new PublicKey('11111111111111111111111111111111');

    it('should accept accounts with no zero addresses', () => {
      const accounts = {
        account1: Keypair.generate().publicKey,
        account2: Keypair.generate().publicKey,
      };
      expect(() => validateAccountsNotZero(accounts)).not.toThrow();
    });

    it('should reject accounts with zero address', () => {
      const accounts = {
        account1: Keypair.generate().publicKey,
        badAccount: zeroAddress,
      };
      expect(() => validateAccountsNotZero(accounts)).toThrow('badAccount');
    });

    it('should allow excluding specific fields', () => {
      const accounts = {
        account1: Keypair.generate().publicKey,
        systemProgram: zeroAddress, // This is okay - system program IS the zero address
      };
      expect(() => validateAccountsNotZero(accounts, ['systemProgram'])).not.toThrow();
    });
  });
});

describe('Idempotency Key Generation', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate a valid UUID v4 format', () => {
      const key = generateIdempotencyKey();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(key).toMatch(uuidRegex);
    });

    it('should generate unique keys', () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateIdempotencyKey());
      }
      expect(keys.size).toBe(100);
    });

    it('should generate 36-character strings', () => {
      const key = generateIdempotencyKey();
      expect(key.length).toBe(36);
    });
  });

  describe('createDeterministicIdempotencyKey', () => {
    it('should create deterministic keys for same input', () => {
      const params = { market: 'abc123', amount: '1000000' };
      const key1 = createDeterministicIdempotencyKey('deposit', params);
      const key2 = createDeterministicIdempotencyKey('deposit', params);
      expect(key1).toBe(key2);
    });

    it('should create different keys for different operations', () => {
      const params = { market: 'abc123', amount: '1000000' };
      const depositKey = createDeterministicIdempotencyKey('deposit', params);
      const withdrawKey = createDeterministicIdempotencyKey('withdraw', params);
      expect(depositKey).not.toBe(withdrawKey);
    });

    it('should create different keys for different parameters', () => {
      const key1 = createDeterministicIdempotencyKey('deposit', { market: 'abc', amount: '100' });
      const key2 = createDeterministicIdempotencyKey('deposit', { market: 'abc', amount: '200' });
      expect(key1).not.toBe(key2);
    });

    it('should handle bigint values', () => {
      const key = createDeterministicIdempotencyKey('deposit', {
        market: 'abc',
        amount: BigInt(1000000),
      });
      expect(key).toContain('deposit');
      expect(key).toContain('1000000');
    });

    it('should sort parameters for consistency', () => {
      const key1 = createDeterministicIdempotencyKey('op', { a: '1', b: '2', c: '3' });
      const key2 = createDeterministicIdempotencyKey('op', { c: '3', a: '1', b: '2' });
      expect(key1).toBe(key2);
    });
  });
});

describe('Idempotency Wrapper Functions', () => {
  const testProgramId = Keypair.generate().publicKey;

  describe('createDepositInstructionWithIdempotency', () => {
    const validAccounts = {
      market: Keypair.generate().publicKey,
      lender: Keypair.generate().publicKey,
      lenderTokenAccount: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      lenderPosition: Keypair.generate().publicKey,
      blacklistCheck: Keypair.generate().publicKey,
      protocolConfig: Keypair.generate().publicKey,
      mint: Keypair.generate().publicKey,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };

    it('should return instruction result without options', () => {
      const result = createDepositInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(1000000) },
        undefined,
        testProgramId
      );

      expect(result.instruction).toBeDefined();
      expect(result.memoInstruction).toBeUndefined();
      expect(result.idempotencyKey).toBeUndefined();
    });

    it('should include idempotency key when provided', () => {
      const result = createDepositInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(1000000) },
        { idempotencyKey: 'test-key-123' },
        testProgramId
      );

      expect(result.idempotencyKey).toBe('test-key-123');
    });

    it('should include memo instruction when memo provided', () => {
      const result = createDepositInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(1000000) },
        { memo: 'deposit memo' },
        testProgramId
      );

      expect(result.memoInstruction).toBeDefined();
      expect(result.memoInstruction?.data.toString()).toBe('deposit memo');
    });

    it('should include both idempotency key and memo', () => {
      const result = createDepositInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(1000000) },
        { idempotencyKey: 'key-456', memo: 'test memo' },
        testProgramId
      );

      expect(result.idempotencyKey).toBe('key-456');
      expect(result.memoInstruction).toBeDefined();
    });
  });

  describe('createBorrowInstructionWithIdempotency', () => {
    const validAccounts = {
      market: Keypair.generate().publicKey,
      borrower: Keypair.generate().publicKey,
      borrowerTokenAccount: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      marketAuthority: Keypair.generate().publicKey,
      borrowerWhitelist: Keypair.generate().publicKey,
      blacklistCheck: Keypair.generate().publicKey,
      protocolConfig: Keypair.generate().publicKey,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
    };

    it('should return instruction result', () => {
      const result = createBorrowInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(5000000) },
        undefined,
        testProgramId
      );

      expect(result.instruction).toBeDefined();
      expect(result.instruction.data[0]).toBe(InstructionDiscriminator.Borrow);
    });

    it('should include idempotency options', () => {
      const result = createBorrowInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(5000000) },
        { idempotencyKey: 'borrow-key', memo: 'borrow memo' },
        testProgramId
      );

      expect(result.idempotencyKey).toBe('borrow-key');
      expect(result.memoInstruction).toBeDefined();
    });
  });

  describe('createRepayInstructionWithIdempotency', () => {
    const validAccounts = {
      market: Keypair.generate().publicKey,
      payer: Keypair.generate().publicKey,
      payerTokenAccount: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      protocolConfig: Keypair.generate().publicKey,
      mint: Keypair.generate().publicKey,
      borrowerWhitelist: Keypair.generate().publicKey,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
    };

    it('should return instruction result', () => {
      const result = createRepayInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(1000000) },
        undefined,
        testProgramId
      );

      expect(result.instruction).toBeDefined();
      expect(result.instruction.data[0]).toBe(InstructionDiscriminator.Repay);
    });

    it('should include idempotency options', () => {
      const result = createRepayInstructionWithIdempotency(
        validAccounts,
        { amount: BigInt(1000000) },
        { idempotencyKey: 'repay-key' },
        testProgramId
      );

      expect(result.idempotencyKey).toBe('repay-key');
    });
  });

  describe('createWithdrawInstructionWithIdempotency', () => {
    const validAccounts = {
      market: Keypair.generate().publicKey,
      lender: Keypair.generate().publicKey,
      lenderTokenAccount: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      lenderPosition: Keypair.generate().publicKey,
      marketAuthority: Keypair.generate().publicKey,
      blacklistCheck: Keypair.generate().publicKey,
      protocolConfig: Keypair.generate().publicKey,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
    };

    it('should return instruction result', () => {
      const result = createWithdrawInstructionWithIdempotency(
        validAccounts,
        { scaledAmount: BigInt('1000000000000000000'), minPayout: BigInt(0) },
        undefined,
        testProgramId
      );

      expect(result.instruction).toBeDefined();
      expect(result.instruction.data[0]).toBe(InstructionDiscriminator.Withdraw);
    });

    it('should include memo instruction', () => {
      const result = createWithdrawInstructionWithIdempotency(
        validAccounts,
        { scaledAmount: BigInt('1000000000000000000'), minPayout: BigInt(100000) },
        { memo: 'withdraw with slippage protection' },
        testProgramId
      );

      expect(result.memoInstruction).toBeDefined();
      expect(result.memoInstruction?.data.toString()).toContain('withdraw');
    });
  });

  describe('createWaterfallRepayInstructions', () => {
    const accounts = {
      market: Keypair.generate().publicKey,
      payer: Keypair.generate().publicKey,
      payerTokenAccount: Keypair.generate().publicKey,
      vault: Keypair.generate().publicKey,
      protocolConfig: Keypair.generate().publicKey,
      mint: Keypair.generate().publicKey,
      borrowerWhitelist: Keypair.generate().publicKey,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
    };

    it('should return interest + principal instructions in correct order', () => {
      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount: BigInt(1_000_000), interestAmount: BigInt(50_000) },
        testProgramId
      );

      expect(ixs.length).toBe(2);
      // First instruction: RepayInterest (discriminator 6)
      expect(ixs[0]?.data[0]).toBe(InstructionDiscriminator.RepayInterest);
      expect(ixs[0]?.keys.length).toBe(6);
      // Second instruction: Repay (discriminator 5)
      expect(ixs[1]?.data[0]).toBe(InstructionDiscriminator.Repay);
      expect(ixs[1]?.keys.length).toBe(8);
    });

    it('should encode correct amounts for interest and principal', () => {
      const totalAmount = BigInt(1_000_000);
      const interestAmount = BigInt(50_000);
      const principalAmount = totalAmount - interestAmount; // 950_000

      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount, interestAmount },
        testProgramId
      );

      // Interest instruction: amount is in bytes 1-8 (little-endian u64)
      const interestData = ixs[0]!.data;
      const interestEncoded = interestData.readBigUInt64LE(1);
      expect(interestEncoded).toBe(interestAmount);

      // Principal instruction: amount is in bytes 1-8 (little-endian u64)
      const principalData = ixs[1]!.data;
      const principalEncoded = principalData.readBigUInt64LE(1);
      expect(principalEncoded).toBe(principalAmount);
    });

    it('should return only RepayInterest when interestAmount equals totalAmount', () => {
      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount: BigInt(500_000), interestAmount: BigInt(500_000) },
        testProgramId
      );

      expect(ixs.length).toBe(1);
      expect(ixs[0]?.data[0]).toBe(InstructionDiscriminator.RepayInterest);
    });

    it('should return only Repay when interestAmount is zero', () => {
      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount: BigInt(500_000), interestAmount: BigInt(0) },
        testProgramId
      );

      expect(ixs.length).toBe(1);
      expect(ixs[0]?.data[0]).toBe(InstructionDiscriminator.Repay);
    });

    it('should return empty array when totalAmount is zero', () => {
      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount: BigInt(0), interestAmount: BigInt(0) },
        testProgramId
      );

      expect(ixs.length).toBe(0);
    });

    it('should throw when interestAmount exceeds totalAmount', () => {
      expect(() =>
        createWaterfallRepayInstructions(
          accounts,
          { totalAmount: BigInt(100_000), interestAmount: BigInt(200_000) },
          testProgramId
        )
      ).toThrow('interestAmount cannot exceed totalAmount');
    });

    it('should pass correct accounts to each instruction', () => {
      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount: BigInt(1_000_000), interestAmount: BigInt(50_000) },
        testProgramId
      );

      // RepayInterest: [market, payer, payerTokenAccount, vault, protocolConfig, tokenProgram]
      const interestIx = ixs[0]!;
      expect(interestIx.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(interestIx.keys[1]?.pubkey.equals(accounts.payer)).toBe(true);
      expect(interestIx.keys[2]?.pubkey.equals(accounts.payerTokenAccount)).toBe(true);
      expect(interestIx.keys[3]?.pubkey.equals(accounts.vault)).toBe(true);
      expect(interestIx.keys[4]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(interestIx.keys[5]?.pubkey.equals(accounts.tokenProgram)).toBe(true);

      // Repay: [market, payer, payerTokenAccount, vault, protocolConfig, mint, borrowerWhitelist, tokenProgram]
      const principalIx = ixs[1]!;
      expect(principalIx.keys[0]?.pubkey.equals(accounts.market)).toBe(true);
      expect(principalIx.keys[1]?.pubkey.equals(accounts.payer)).toBe(true);
      expect(principalIx.keys[2]?.pubkey.equals(accounts.payerTokenAccount)).toBe(true);
      expect(principalIx.keys[3]?.pubkey.equals(accounts.vault)).toBe(true);
      expect(principalIx.keys[4]?.pubkey.equals(accounts.protocolConfig)).toBe(true);
      expect(principalIx.keys[5]?.pubkey.equals(accounts.mint)).toBe(true);
      expect(principalIx.keys[6]?.pubkey.equals(accounts.borrowerWhitelist)).toBe(true);
      expect(principalIx.keys[7]?.pubkey.equals(accounts.tokenProgram)).toBe(true);
    });

    it('should use provided programId for both instructions', () => {
      const customProgramId = Keypair.generate().publicKey;
      const ixs = createWaterfallRepayInstructions(
        accounts,
        { totalAmount: BigInt(1_000_000), interestAmount: BigInt(50_000) },
        customProgramId
      );

      expect(ixs[0]?.programId.equals(customProgramId)).toBe(true);
      expect(ixs[1]?.programId.equals(customProgramId)).toBe(true);
    });

    it('should reject negative totalAmount', () => {
      expect(() =>
        createWaterfallRepayInstructions(
          accounts,
          { totalAmount: BigInt(-1), interestAmount: BigInt(0) },
          testProgramId
        )
      ).toThrow();
    });

    it('should reject negative interestAmount', () => {
      expect(() =>
        createWaterfallRepayInstructions(
          accounts,
          { totalAmount: BigInt(1_000_000), interestAmount: BigInt(-1) },
          testProgramId
        )
      ).toThrow();
    });

    it('should use default programId when none is provided', () => {
      const ixs = createWaterfallRepayInstructions(accounts, {
        totalAmount: BigInt(1_000_000),
        interestAmount: BigInt(50_000),
      });

      // Both instructions should have the same default programId
      expect(ixs[0]?.programId.equals(ixs[1]!.programId)).toBe(true);
      // And it should differ from our test-specific key
      expect(ixs[0]?.programId.equals(testProgramId)).toBe(false);
    });
  });
});
