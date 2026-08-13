import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import type { Connection, TransactionInstruction } from '@solana/web3.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { CoalesceClient } from '../src/client';
import {
  DISC_PROTOCOL_CONFIG,
  DISC_MARKET,
  PROTOCOL_CONFIG_SIZE,
  MARKET_SIZE,
  LENDER_POSITION_SIZE,
  DISC_LENDER_POSITION,
  InstructionDiscriminator,
  DEFAULT_PROGRAM_IDS,
} from '../src/constants';
import { SdkError } from '../src/errors';
import { findProtocolConfigPda, findMarketPda, findLenderPositionPda } from '../src/pdas';

// ─── Test Helpers ───────────────────────────────────────────

const TEST_PROGRAM_ID = new PublicKey(DEFAULT_PROGRAM_IDS.localnet);

function buildProtocolConfigData(blacklistProgram: PublicKey): Uint8Array {
  const buffer = new Uint8Array(PROTOCOL_CONFIG_SIZE);
  buffer.set(DISC_PROTOCOL_CONFIG, 0);
  buffer[8] = 1; // version
  // admin at offset 9 (32 bytes)
  buffer.set(Keypair.generate().publicKey.toBytes(), 9);
  // feeRateBps at offset 41 (u16 LE) — 500 bps
  buffer[41] = 0xf4;
  buffer[42] = 0x01;
  // feeAuthority at offset 43 (32 bytes)
  buffer.set(Keypair.generate().publicKey.toBytes(), 43);
  // whitelistManager at offset 75 (32 bytes)
  buffer.set(Keypair.generate().publicKey.toBytes(), 75);
  // blacklistProgram at offset 107 (32 bytes)
  buffer.set(blacklistProgram.toBytes(), 107);
  // isInitialized at offset 139
  buffer[139] = 1;
  // bump at offset 140
  buffer[140] = 255;
  return buffer;
}

function buildMarketData(
  borrower: PublicKey,
  mint: PublicKey,
  vault: PublicKey,
  scaleFactorWad?: bigint
): Uint8Array {
  const buffer = new Uint8Array(MARKET_SIZE);
  buffer.set(DISC_MARKET, 0);
  buffer[8] = 1; // version
  buffer.set(borrower.toBytes(), 9); // borrower at offset 9
  buffer.set(mint.toBytes(), 41); // mint at offset 41
  buffer.set(vault.toBytes(), 73); // vault at offset 73
  // scale_factor at offset 148 (u128 LE, 16 bytes) — optional, defaults to 0
  if (scaleFactorWad !== undefined) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setBigUint64(148, scaleFactorWad & 0xffffffffffffffffn, true);
    view.setBigUint64(156, scaleFactorWad >> 64n, true);
  }
  return buffer;
}

function buildLenderPositionData(
  market: PublicKey,
  lender: PublicKey,
  scaledBalance?: bigint
): Uint8Array {
  const buffer = new Uint8Array(LENDER_POSITION_SIZE);
  buffer.set(DISC_LENDER_POSITION, 0);
  buffer[8] = 1; // version
  buffer.set(market.toBytes(), 9); // market at offset 9
  buffer.set(lender.toBytes(), 41); // lender at offset 41
  // scaled_balance at offset 73 (u128 LE, 16 bytes) — optional, defaults to 0
  if (scaledBalance !== undefined) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    view.setBigUint64(73, scaledBalance & 0xffffffffffffffffn, true);
    view.setBigUint64(81, scaledBalance >> 64n, true);
  }
  return buffer;
}

function createMockConnection(accountDataMap: Map<string, Uint8Array>): unknown {
  return {
    getAccountInfo: vi.fn(async (address: PublicKey) => {
      const data = accountDataMap.get(address.toBase58());
      if (!data) return null;
      return { data: Buffer.from(data), executable: false, lamports: 1, owner: TEST_PROGRAM_ID };
    }),
  };
}

/** Locate the Coalesce program instruction with the given discriminator (skips any prepended create-ATA ix). */
function findCoalesceIx(
  ixs: TransactionInstruction[],
  discriminator: number
): TransactionInstruction {
  const ix = ixs.find((i) => i.programId.equals(TEST_PROGRAM_ID) && i.data[0] === discriminator);
  if (!ix) throw new Error(`No Coalesce ix with discriminator ${discriminator}`);
  return ix;
}

/** True when the instruction set begins with an idempotent create-ATA instruction. */
function hasCreateAtaIx(ixs: TransactionInstruction[]): boolean {
  return ixs.some((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
}

// ─── Tests ──────────────────────────────────────────────────

describe('CoalesceClient', () => {
  const borrower = Keypair.generate();
  const lender = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey;
  const blacklistProgram = Keypair.generate().publicKey;

  const [protocolConfigPda] = findProtocolConfigPda(TEST_PROGRAM_ID);
  const [marketPda] = findMarketPda(borrower.publicKey, 0n, TEST_PROGRAM_ID);

  let accountDataMap: Map<string, Uint8Array>;
  let client: CoalesceClient;

  beforeEach(() => {
    accountDataMap = new Map();
    accountDataMap.set(protocolConfigPda.toBase58(), buildProtocolConfigData(blacklistProgram));
    accountDataMap.set(marketPda.toBase58(), buildMarketData(borrower.publicKey, mint, vault));

    const connection = createMockConnection(accountDataMap);
    client = CoalesceClient.localnet(connection as never);
  });

  describe('constructor and named constructors', () => {
    it('should create a mainnet client with correct program ID', () => {
      const c = CoalesceClient.mainnet(createMockConnection(new Map()) as never);
      expect(c.programId.toBase58()).toBe(DEFAULT_PROGRAM_IDS.mainnet);
    });

    it('should create a devnet client with correct program ID', () => {
      const c = CoalesceClient.devnet(createMockConnection(new Map()) as never);
      expect(c.programId.toBase58()).toBe(DEFAULT_PROGRAM_IDS.devnet);
    });

    it('should create a localnet client with correct program ID', () => {
      const c = CoalesceClient.localnet(createMockConnection(new Map()) as never);
      expect(c.programId.toBase58()).toBe(DEFAULT_PROGRAM_IDS.localnet);
    });

    it('should accept custom program ID', () => {
      const customId = Keypair.generate().publicKey;
      const c = new CoalesceClient(createMockConnection(new Map()) as never, {
        programId: customId,
      });
      expect(c.programId.toBase58()).toBe(customId.toBase58());
    });

    it('should not mutate global SDK config', () => {
      // Creating multiple clients with different programIds should be independent
      const id1 = Keypair.generate().publicKey;
      const id2 = Keypair.generate().publicKey;
      const conn = createMockConnection(new Map()) as never;
      const c1 = new CoalesceClient(conn, { programId: id1 });
      const c2 = new CoalesceClient(conn, { programId: id2 });
      expect(c1.programId.toBase58()).not.toBe(c2.programId.toBase58());
    });
  });

  describe('getMarketAddress', () => {
    it('should derive market PDA from borrower and nonce', () => {
      const derived = client.getMarketAddress(borrower.publicKey, 0n);
      expect(derived.toBase58()).toBe(marketPda.toBase58());
    });

    it('should return different PDAs for different nonces', () => {
      const pda0 = client.getMarketAddress(borrower.publicKey, 0n);
      const pda1 = client.getMarketAddress(borrower.publicKey, 1n);
      expect(pda0.toBase58()).not.toBe(pda1.toBase58());
    });
  });

  describe('deposit', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.deposit(lender.publicKey, marketPda, 1_000_000n);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.Deposit);
    });

    it('should use program ID from client instance', async () => {
      const ixs = await client.deposit(lender.publicKey, marketPda, 1_000_000n);
      expect(ixs[0].programId.toBase58()).toBe(TEST_PROGRAM_ID.toBase58());
    });

    it('should use override token account when provided', async () => {
      const customAta = Keypair.generate().publicKey;
      const ixs = await client.deposit(lender.publicKey, marketPda, 1_000_000n, {
        lenderTokenAccount: customAta,
      });
      // The lenderTokenAccount should be in the instruction's account keys
      const accountKeys = ixs[0].keys.map((k) => k.pubkey.toBase58());
      expect(accountKeys).toContain(customAta.toBase58());
    });
  });

  describe('withdraw', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.withdraw(lender.publicKey, marketPda, 500_000n);
      // create-ATA (idempotent) + withdraw
      expect(ixs).toHaveLength(2);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.Withdraw)).toBeDefined();
    });
  });

  describe('withdrawAndClose', () => {
    it('should return 3 instructions: create-ATA + withdraw + close', async () => {
      const ixs = await client.withdrawAndClose(lender.publicKey, marketPda);
      expect(ixs).toHaveLength(3);
      expect(hasCreateAtaIx(ixs)).toBe(true);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.Withdraw)).toBeDefined();
      expect(findCoalesceIx(ixs, InstructionDiscriminator.CloseLenderPosition)).toBeDefined();
    });

    it('should pass scaledAmount=0 for full withdrawal', async () => {
      const ixs = await client.withdrawAndClose(lender.publicKey, marketPda);
      const withdrawIx = findCoalesceIx(ixs, InstructionDiscriminator.Withdraw);
      // Withdraw data: [discriminator(1), scaledAmount(16), minPayout(8)]
      // scaledAmount is u128 LE at bytes 1-16, should be all zeros
      const scaledAmountBytes = withdrawIx.data.subarray(1, 17);
      expect(scaledAmountBytes.every((b) => b === 0)).toBe(true);
    });
  });

  describe('withdrawByUsdc', () => {
    // 1 USDC = 1_000_000 base units. scale_factor of 1.027772 WAD means 1 share ≈ 1.027772 USDC.
    const SCALE_FACTOR = 1_027_772_191_401_129_296n;
    const LENDER_SCALED_BALANCE = 4_999_329n;

    function seedPosition(scaledBalance: bigint, sf: bigint = SCALE_FACTOR): void {
      accountDataMap.set(
        marketPda.toBase58(),
        buildMarketData(borrower.publicKey, mint, vault, sf)
      );
      const [positionPda] = findLenderPositionPda(marketPda, lender.publicKey, TEST_PROGRAM_ID);
      accountDataMap.set(
        positionPda.toBase58(),
        buildLenderPositionData(marketPda, lender.publicKey, scaledBalance)
      );
    }

    it('converts USDC base units to scaled and emits a single Withdraw ix', async () => {
      seedPosition(LENDER_SCALED_BALANCE);
      // floor(1_000_000 * 1e18 / 1_027_772_191_401_129_296) = 972_978 scaled shares.
      const ixs = await client.withdrawByUsdc(lender.publicKey, marketPda, 1_000_000n);
      // create-ATA (idempotent) + withdraw
      expect(ixs).toHaveLength(2);
      const withdrawIx = findCoalesceIx(ixs, InstructionDiscriminator.Withdraw);
      // scaled_amount at bytes 1..17 (u128 LE)
      const view = new DataView(
        withdrawIx.data.buffer,
        withdrawIx.data.byteOffset,
        withdrawIx.data.byteLength
      );
      const scaled = view.getBigUint64(1, true) | (view.getBigUint64(9, true) << 64n);
      expect(scaled).toBe(972_978n);
    });

    it('clamps to the on-chain scaledBalance when conversion overshoots', async () => {
      seedPosition(LENDER_SCALED_BALANCE);
      // ChRiS's mainnet case: 5.14 USDC requested but balance is 4_999_329 shares
      // (worth ~5.138 USDC). Conversion would overshoot; clamp must absorb it.
      const ixs = await client.withdrawByUsdc(lender.publicKey, marketPda, 5_140_000n);
      const withdrawIx = findCoalesceIx(ixs, InstructionDiscriminator.Withdraw);
      const view = new DataView(
        withdrawIx.data.buffer,
        withdrawIx.data.byteOffset,
        withdrawIx.data.byteLength
      );
      const scaled = view.getBigUint64(1, true) | (view.getBigUint64(9, true) << 64n);
      expect(scaled).toBe(LENDER_SCALED_BALANCE);
    });

    it('throws when the lender has no position on the market', async () => {
      // Don't seed a position — only the market.
      accountDataMap.set(
        marketPda.toBase58(),
        buildMarketData(borrower.publicKey, mint, vault, SCALE_FACTOR)
      );
      await expect(client.withdrawByUsdc(lender.publicKey, marketPda, 1_000_000n)).rejects.toThrow(
        /No lender position/
      );
    });

    it('throws when the position exists but is empty', async () => {
      seedPosition(0n);
      await expect(client.withdrawByUsdc(lender.publicKey, marketPda, 1_000_000n)).rejects.toThrow(
        /position is empty/
      );
    });

    it('throws when scale_factor is zero', async () => {
      seedPosition(LENDER_SCALED_BALANCE, 0n);
      await expect(client.withdrawByUsdc(lender.publicKey, marketPda, 1_000_000n)).rejects.toThrow(
        /scale_factor is 0/
      );
    });

    it('throws when usdcBaseUnits is zero or negative', async () => {
      seedPosition(LENDER_SCALED_BALANCE);
      await expect(client.withdrawByUsdc(lender.publicKey, marketPda, 0n)).rejects.toThrow(
        /greater than 0/
      );
    });

    it('rejects sub-unit usdcBaseUnits that floor-convert to 0 scaled (sentinel collision guard)', async () => {
      seedPosition(LENDER_SCALED_BALANCE);
      // 1 USDC base unit with scale_factor > WAD floors to 0 scaled shares.
      // Without the explicit guard, `withdraw(0n)` would trigger the
      // full-withdrawal sentinel and drain the entire position.
      await expect(client.withdrawByUsdc(lender.publicKey, marketPda, 1n)).rejects.toThrow(
        /too small/
      );
    });
  });

  describe('borrow', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.borrow(borrower.publicKey, marketPda, 1_000_000n);
      // create-ATA (idempotent) + borrow
      expect(ixs).toHaveLength(2);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.Borrow)).toBeDefined();
    });

    it('should use override token account when provided', async () => {
      const customAta = Keypair.generate().publicKey;
      const ixs = await client.borrow(borrower.publicKey, marketPda, 1_000_000n, {
        borrowerTokenAccount: customAta,
      });
      const accountKeys = ixs[0].keys.map((k) => k.pubkey.toBase58());
      expect(accountKeys).toContain(customAta.toBase58());
    });
  });

  describe('repay (waterfall)', () => {
    it('should return 2 instructions for interest + principal', async () => {
      const ixs = await client.repay(borrower.publicKey, marketPda, 1_000_000n, 200_000n);
      expect(ixs).toHaveLength(2);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.RepayInterest);
      expect(ixs[1].data[0]).toBe(InstructionDiscriminator.Repay);
    });

    it('should return 1 instruction when interest is 0', async () => {
      const ixs = await client.repay(borrower.publicKey, marketPda, 1_000_000n, 0n);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.Repay);
    });

    it('should return 1 instruction when entire amount is interest', async () => {
      const ixs = await client.repay(borrower.publicKey, marketPda, 200_000n, 200_000n);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.RepayInterest);
    });

    it('should throw SdkError for zero totalAmount', async () => {
      try {
        await client.repay(borrower.publicKey, marketPda, 0n, 0n);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SdkError);
        expect((err as SdkError).type).toBe('validation');
        expect((err as SdkError).message).toContain('totalAmount must be greater than 0');
      }
    });
  });

  describe('claimHaircut', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.claimHaircut(lender.publicKey, marketPda);
      // create-ATA (idempotent) + claimHaircut
      expect(ixs).toHaveLength(2);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.ClaimHaircut)).toBeDefined();
    });
  });

  describe('claimHaircutAndClose', () => {
    it('should return 3 instructions: create-ATA + claim + close', async () => {
      const ixs = await client.claimHaircutAndClose(lender.publicKey, marketPda);
      expect(ixs).toHaveLength(3);
      expect(hasCreateAtaIx(ixs)).toBe(true);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.ClaimHaircut)).toBeDefined();
      expect(findCoalesceIx(ixs, InstructionDiscriminator.CloseLenderPosition)).toBeDefined();
    });
  });

  describe('reSettle', () => {
    it('should return instructions synchronously (no RPC)', () => {
      const ixs = client.reSettle(marketPda);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.ReSettle);
    });

    it('should use client programId', () => {
      const ixs = client.reSettle(marketPda);
      expect(ixs[0].programId.toBase58()).toBe(TEST_PROGRAM_ID.toBase58());
    });
  });

  describe('forceClosePosition', () => {
    it('should return instructions with correct discriminator', () => {
      const escrow = Keypair.generate().publicKey;
      const ixs = client.forceClosePosition(
        borrower.publicKey,
        marketPda,
        lender.publicKey,
        escrow
      );
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.ForceClosePosition);
    });

    it('should include escrow token account in instruction keys', () => {
      const escrow = Keypair.generate().publicKey;
      const ixs = client.forceClosePosition(
        borrower.publicKey,
        marketPda,
        lender.publicKey,
        escrow
      );
      const accountKeys = ixs[0].keys.map((k) => k.pubkey.toBase58());
      expect(accountKeys).toContain(escrow.toBase58());
    });
  });

  describe('forceClaimHaircut', () => {
    it('should return instructions with correct discriminator', () => {
      const escrow = Keypair.generate().publicKey;
      const ixs = client.forceClaimHaircut(borrower.publicKey, marketPda, lender.publicKey, escrow);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.ForceClaimHaircut);
    });
  });

  describe('admin operations', () => {
    it('initializeProtocol should return correct discriminator', () => {
      const ixs = client.admin.initializeProtocol(Keypair.generate().publicKey, {
        feeAuthority: Keypair.generate().publicKey,
        whitelistManager: Keypair.generate().publicKey,
        blacklistProgram: Keypair.generate().publicKey,
        feeRateBps: 500,
      });
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.InitializeProtocol);
    });

    it('setPause should return correct discriminator', () => {
      const ixs = client.admin.setPause(Keypair.generate().publicKey, true);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.SetPause);
    });

    it('setAdmin should return correct discriminator', () => {
      const ixs = client.admin.setAdmin(Keypair.generate().publicKey, Keypair.generate().publicKey);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.SetAdmin);
    });

    it('whitelistBorrower should return correct discriminator', () => {
      const ixs = client.admin.whitelistBorrower(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        { isWhitelisted: true, maxBorrowCapacity: 1_000_000_000n }
      );
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.SetBorrowerWhitelist);
    });
  });

  describe('cache behavior', () => {
    it('should cache market data across calls', async () => {
      const conn = createMockConnection(accountDataMap) as never;
      const c = CoalesceClient.localnet(conn);

      await c.deposit(lender.publicKey, marketPda, 1_000n);
      await c.deposit(lender.publicKey, marketPda, 2_000n);

      // Market should have been fetched only once (second call uses cache)
      // Protocol config fetched once for blacklist resolution
      // The mock getAccountInfo tracks calls
      const mockGetAccountInfo = (conn as { getAccountInfo: ReturnType<typeof vi.fn> })
        .getAccountInfo;
      const marketCalls = mockGetAccountInfo.mock.calls.filter(
        (call: [PublicKey]) => call[0].toBase58() === marketPda.toBase58()
      );
      expect(marketCalls.length).toBe(1);
    });

    it('should refetch after invalidateMarket', async () => {
      const conn = createMockConnection(accountDataMap) as never;
      const c = CoalesceClient.localnet(conn);

      await c.deposit(lender.publicKey, marketPda, 1_000n);
      c.invalidateMarket(marketPda);
      await c.deposit(lender.publicKey, marketPda, 2_000n);

      const mockGetAccountInfo = (conn as { getAccountInfo: ReturnType<typeof vi.fn> })
        .getAccountInfo;
      const marketCalls = mockGetAccountInfo.mock.calls.filter(
        (call: [PublicKey]) => call[0].toBase58() === marketPda.toBase58()
      );
      expect(marketCalls.length).toBe(2);
    });
  });

  describe('sendAndConfirm', () => {
    it('should throw SdkError for empty instructions', async () => {
      await expect(client.sendAndConfirm([], [Keypair.generate()])).rejects.toThrow(SdkError);
    });

    it('should throw SdkError for no signers', async () => {
      const ixs = client.reSettle(marketPda);
      await expect(client.sendAndConfirm(ixs, [])).rejects.toThrow(SdkError);
    });
  });

  describe('scanMarkets', () => {
    it('should find markets that exist on-chain', async () => {
      const results = await client.scanMarkets(borrower.publicKey, { maxNonce: 2 });
      expect(results.length).toBe(1);
      expect(results[0].nonce).toBe(0n);
      expect(results[0].marketPda.toBase58()).toBe(marketPda.toBase58());
    });

    it('should return empty array for unknown borrower', async () => {
      const unknown = Keypair.generate().publicKey;
      const results = await client.scanMarkets(unknown, { maxNonce: 2 });
      expect(results.length).toBe(0);
    });
  });

  describe('closeLenderPosition', () => {
    it('should return instruction with correct discriminator', () => {
      const ixs = client.closeLenderPosition(lender.publicKey, marketPda);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.CloseLenderPosition);
    });

    it('should use client programId', () => {
      const ixs = client.closeLenderPosition(lender.publicKey, marketPda);
      expect(ixs[0].programId.toBase58()).toBe(TEST_PROGRAM_ID.toBase58());
    });
  });

  describe('getMarket', () => {
    it('should return decoded market when it exists', async () => {
      const result = await client.getMarket(marketPda);
      expect(result).not.toBeNull();
    });

    it('should return null for non-existent market', async () => {
      const unknown = Keypair.generate().publicKey;
      const result = await client.getMarket(unknown);
      expect(result).toBeNull();
    });
  });

  describe('getPosition', () => {
    it('should return null for non-existent position', async () => {
      const result = await client.getPosition(marketPda, lender.publicKey);
      expect(result).toBeNull();
    });

    it('should return decoded position when it exists', async () => {
      const [positionPda] = findLenderPositionPda(marketPda, lender.publicKey, TEST_PROGRAM_ID);
      accountDataMap.set(
        positionPda.toBase58(),
        buildLenderPositionData(marketPda, lender.publicKey)
      );
      // Recreate client with updated map
      const conn = createMockConnection(accountDataMap);
      const c = CoalesceClient.localnet(conn as never);

      const result = await c.getPosition(marketPda, lender.publicKey);
      expect(result).not.toBeNull();
    });
  });

  describe('createMarket', () => {
    it('should return instructions with correct discriminator and marketPda', async () => {
      const result = await client.createMarket(borrower.publicKey, mint, {
        nonce: 0n,
        annualInterestBps: 800,
        maturityTimestamp: BigInt(Math.floor(Date.now() / 1000) + 86400),
        maxTotalSupply: 500_000_000_000n,
      });
      expect(result.instructions).toHaveLength(1);
      expect(result.instructions[0].data[0]).toBe(InstructionDiscriminator.CreateMarket);
      expect(result.marketPda.toBase58()).toBe(marketPda.toBase58());
    });
  });

  describe('collectFees', () => {
    it('should return instructions with correct discriminator', async () => {
      const feeAuthority = Keypair.generate();
      const ixs = await client.collectFees(feeAuthority.publicKey, marketPda);
      // create-ATA (idempotent) + collectFees
      expect(ixs).toHaveLength(2);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.CollectFees)).toBeDefined();
    });

    it('should use override feeTokenAccount when provided', async () => {
      const feeAuthority = Keypair.generate();
      const customFeeAta = Keypair.generate().publicKey;
      const ixs = await client.collectFees(feeAuthority.publicKey, marketPda, {
        feeTokenAccount: customFeeAta,
      });
      const accountKeys = ixs[0].keys.map((k) => k.pubkey.toBase58());
      expect(accountKeys).toContain(customFeeAta.toBase58());
    });

    it('funds the self-healing create-ATA from ataRentPayer when provided', async () => {
      // First fee collection to a 0-SOL fee authority (e.g. a fresh Squads
      // vault): the authority cannot pay ATA rent, so an operator funds it.
      // The create-ATA instruction's first account is the funding payer; the
      // fee authority must remain the ATA owner (third account).
      const feeAuthority = Keypair.generate();
      const rentPayer = Keypair.generate().publicKey;
      const ixs = await client.collectFees(feeAuthority.publicKey, marketPda, {
        ataRentPayer: rentPayer,
      });

      const ataIx = ixs.find((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
      expect(ataIx).toBeDefined();
      expect(ataIx!.keys[0].pubkey.toBase58()).toBe(rentPayer.toBase58());
      expect(ataIx!.keys[2].pubkey.toBase58()).toBe(feeAuthority.publicKey.toBase58());
    });

    it('defaults the create-ATA rent payer to the fee authority', async () => {
      const feeAuthority = Keypair.generate();
      const ixs = await client.collectFees(feeAuthority.publicKey, marketPda);

      const ataIx = ixs.find((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
      expect(ataIx).toBeDefined();
      expect(ataIx!.keys[0].pubkey.toBase58()).toBe(feeAuthority.publicKey.toBase58());
    });
  });

  describe('withdrawExcess', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.withdrawExcess(borrower.publicKey, marketPda);
      // create-ATA (idempotent) + withdrawExcess
      expect(ixs).toHaveLength(2);
      expect(findCoalesceIx(ixs, InstructionDiscriminator.WithdrawExcess)).toBeDefined();
    });

    it('should use override borrowerTokenAccount when provided', async () => {
      const customAta = Keypair.generate().publicKey;
      const ixs = await client.withdrawExcess(borrower.publicKey, marketPda, {
        borrowerTokenAccount: customAta,
      });
      const accountKeys = ixs[0].keys.map((k) => k.pubkey.toBase58());
      expect(accountKeys).toContain(customAta.toBase58());
    });
  });

  describe('scanPositions', () => {
    it('should return empty array for unknown borrowers', async () => {
      const unknown = Keypair.generate().publicKey;
      const results = await client.scanPositions(lender.publicKey, [unknown], { maxNonce: 2 });
      expect(results.length).toBe(0);
    });

    it('should find positions that exist on-chain', async () => {
      const [positionPda] = findLenderPositionPda(marketPda, lender.publicKey, TEST_PROGRAM_ID);
      accountDataMap.set(
        positionPda.toBase58(),
        buildLenderPositionData(marketPda, lender.publicKey)
      );
      const conn = createMockConnection(accountDataMap);
      const c = CoalesceClient.localnet(conn as never);

      const results = await c.scanPositions(lender.publicKey, [borrower.publicKey], {
        maxNonce: 2,
      });
      expect(results.length).toBe(1);
      expect(results[0].marketPda.toBase58()).toBe(marketPda.toBase58());
    });
  });

  describe('repay validation', () => {
    it('should throw SdkError with type validation when interestAmount exceeds totalAmount', async () => {
      try {
        await client.repay(borrower.publicKey, marketPda, 100n, 200n);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SdkError);
        expect((err as SdkError).type).toBe('validation');
        expect((err as SdkError).message).toContain('interestAmount cannot exceed totalAmount');
      }
    });
  });

  describe('admin: setFeeConfig', () => {
    it('should return correct discriminator', () => {
      const ixs = client.admin.setFeeConfig(
        Keypair.generate().publicKey,
        500,
        Keypair.generate().publicKey
      );
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.SetFeeConfig);
    });
  });

  describe('admin: setBlacklistMode', () => {
    it('should return correct discriminator', () => {
      const ixs = client.admin.setBlacklistMode(Keypair.generate().publicKey, true);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.SetBlacklistMode);
    });
  });

  describe('admin: setWhitelistManager', () => {
    it('should return correct discriminator', () => {
      const ixs = client.admin.setWhitelistManager(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey
      );
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.SetWhitelistManager);
    });
  });

  // Regression: a borrow on mainnet failed with custom error 0xe
  // (InvalidAccountOwner) because the borrower's destination USDC ATA did not
  // exist. Token-receiving flows now prepend an idempotent create-ATA so the
  // destination is guaranteed to exist before the transfer runs.
  describe('recipient ATA creation (idempotent)', () => {
    it('borrow prepends an idempotent create-ATA for an on-curve borrower', async () => {
      const ixs = await client.borrow(borrower.publicKey, marketPda, 1_000_000n);
      expect(ixs).toHaveLength(2);

      const createIx = ixs[0];
      expect(createIx.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
      // CreateIdempotent instruction discriminator
      expect(createIx.data[0]).toBe(1);

      const ata = await getAssociatedTokenAddress(
        mint,
        borrower.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      const keys = createIx.keys.map((k) => k.pubkey.toBase58());
      expect(keys).toContain(ata.toBase58());
      expect(keys).toContain(borrower.publicKey.toBase58());
      expect(keys).toContain(mint.toBase58());

      // Payer (the borrower) must be a writable signer to fund rent.
      const payerMeta = createIx.keys.find((k) => k.pubkey.equals(borrower.publicKey));
      expect(payerMeta?.isSigner).toBe(true);
      expect(payerMeta?.isWritable).toBe(true);

      // The create-ATA runs BEFORE the borrow transfer.
      expect(ixs[1].programId.equals(TEST_PROGRAM_ID)).toBe(true);
      expect(ixs[1].data[0]).toBe(InstructionDiscriminator.Borrow);
    });

    it('creates the ATA for an off-curve recipient (e.g. a Squads vault PDA), funded by the recipient', async () => {
      const [pdaBorrower] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault')],
        TEST_PROGRAM_ID
      );
      expect(PublicKey.isOnCurve(pdaBorrower.toBytes())).toBe(false);

      const ixs = await client.borrow(pdaBorrower, marketPda, 1_000_000n);
      expect(ixs).toHaveLength(2);
      expect(hasCreateAtaIx(ixs)).toBe(true);

      // The create-ATA owns + pays via the PDA recipient. A raw transaction cannot
      // sign for a PDA, but a multisig (e.g. Squads) supplies the signature through
      // invoke_signed when the wrapped instructions execute.
      const createIx = ixs[0];
      const ata = await getAssociatedTokenAddress(mint, pdaBorrower, true, TOKEN_PROGRAM_ID);
      const keys = createIx.keys.map((k) => k.pubkey.toBase58());
      expect(keys).toContain(ata.toBase58());
      expect(keys).toContain(pdaBorrower.toBase58());
      const payerMeta = createIx.keys.find((k) => k.pubkey.equals(pdaBorrower));
      expect(payerMeta?.isSigner).toBe(true);
      expect(payerMeta?.isWritable).toBe(true);

      expect(ixs[1].programId.equals(TEST_PROGRAM_ID)).toBe(true);
      expect(ixs[1].data[0]).toBe(InstructionDiscriminator.Borrow);
    });

    it('does NOT create an ATA when a custom (non-canonical) token account override is supplied', async () => {
      const customAta = Keypair.generate().publicKey;
      const ixs = await client.borrow(borrower.publicKey, marketPda, 1_000_000n, {
        borrowerTokenAccount: customAta,
      });
      expect(ixs).toHaveLength(1);
      expect(hasCreateAtaIx(ixs)).toBe(false);
    });

    it('creates the ATA when an override equals the recipient canonical ATA', async () => {
      const ata = await getAssociatedTokenAddress(
        mint,
        borrower.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      const ixs = await client.borrow(borrower.publicKey, marketPda, 1_000_000n, {
        borrowerTokenAccount: ata,
      });
      expect(ixs).toHaveLength(2);
      expect(hasCreateAtaIx(ixs)).toBe(true);
    });

    it('prepends create-ATA for withdraw, claimHaircut, withdrawExcess, and collectFees', async () => {
      const withdrawIxs = await client.withdraw(lender.publicKey, marketPda, 500_000n);
      expect(hasCreateAtaIx(withdrawIxs)).toBe(true);

      const claimIxs = await client.claimHaircut(lender.publicKey, marketPda);
      expect(hasCreateAtaIx(claimIxs)).toBe(true);

      const excessIxs = await client.withdrawExcess(borrower.publicKey, marketPda);
      expect(hasCreateAtaIx(excessIxs)).toBe(true);

      const feeAuthority = Keypair.generate();
      const feeIxs = await client.collectFees(feeAuthority.publicKey, marketPda);
      expect(hasCreateAtaIx(feeIxs)).toBe(true);
    });

    it('collectFees with an off-curve fee authority and no override derives + self-heals (no throw)', async () => {
      const [pdaFeeAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('fee-vault')],
        TEST_PROGRAM_ID
      );
      expect(PublicKey.isOnCurve(pdaFeeAuthority.toBytes())).toBe(false);

      // Must NOT throw deriving the default fee ATA for an off-curve owner.
      const ixs = await client.collectFees(pdaFeeAuthority, marketPda);
      expect(ixs).toHaveLength(2);
      expect(hasCreateAtaIx(ixs)).toBe(true);

      const ata = await getAssociatedTokenAddress(mint, pdaFeeAuthority, true, TOKEN_PROGRAM_ID);
      const keys = ixs[0].keys.map((k) => k.pubkey.toBase58());
      expect(keys).toContain(ata.toBase58());
      expect(keys).toContain(pdaFeeAuthority.toBase58());
      expect(ixs[1].data[0]).toBe(InstructionDiscriminator.CollectFees);
    });
  });
});

describe('CoalesceClient.findNextMarketNonce', () => {
  it('probes with the client connection and program id', async () => {
    // programId is deliberately a fresh key, never the SDK default: the probed
    // address is derived from it, so dropping `this.programId` on the way to
    // `findNextMarketNonce` changes the address and fails this test.
    const programId = Keypair.generate().publicKey;
    const borrower = Keypair.generate().publicKey;
    const getMultipleAccountsInfo = vi.fn().mockResolvedValue([null]);
    const connection = { getMultipleAccountsInfo } as unknown as Connection;

    const client = new CoalesceClient(connection, { programId });

    expect(await client.findNextMarketNonce(borrower, { batchSize: 1 })).toBe(0n);
    expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(1);

    const keys = getMultipleAccountsInfo.mock.calls[0]?.[0] as PublicKey[];
    expect(keys.map((k) => k.toBase58())).toEqual([
      findMarketPda(borrower, 0n, programId)[0].toBase58(),
    ]);
  });

  it('preserves the SdkError message from a failed probe', async () => {
    const programId = Keypair.generate().publicKey;
    const borrower = Keypair.generate().publicKey;
    const connection = {
      getMultipleAccountsInfo: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as unknown as Connection;

    const client = new CoalesceClient(connection, { programId });

    await expect(
      client.findNextMarketNonce(borrower, { retryConfig: { maxRetries: 0, baseDelayMs: 1 } })
    ).rejects.toThrow("Couldn't check your existing loans — please try again.");
  });
});

describe('CoalesceClient.createMarketWithFreshNonce', () => {
  const marketArgs = {
    annualInterestBps: 850,
    maturityTimestamp: 1900000000n,
    maxTotalSupply: 10_000_000_000n,
  };

  // Shaped like a real on-chain failure: instruction 2, custom error 4.
  const marketAlreadyExists = Object.assign(new Error('Transaction failed'), {
    InstructionError: [2, { Custom: 4 }],
  });

  function makeClient() {
    const programId = Keypair.generate().publicKey;
    const connection = {
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([null]),
      getAccountInfo: vi.fn().mockResolvedValue(null),
    } as unknown as Connection;
    return new CoalesceClient(connection, { programId });
  }

  it('builds with the probed nonce and returns the signature', async () => {
    const client = makeClient();
    vi.spyOn(client, 'findNextMarketNonce').mockResolvedValue(7n);
    const build = vi
      .spyOn(client, 'createMarket')
      .mockResolvedValue({ instructions: [], marketPda: Keypair.generate().publicKey });
    const send = vi.fn().mockResolvedValue('sig-1');

    const borrower = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    expect(await client.createMarketWithFreshNonce(borrower, mint, marketArgs, send)).toBe('sig-1');
    expect(build).toHaveBeenCalledWith(borrower, mint, expect.objectContaining({ nonce: 7n }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('re-probes and resends exactly once on MarketAlreadyExists', async () => {
    const client = makeClient();
    const probe = vi
      .spyOn(client, 'findNextMarketNonce')
      .mockResolvedValueOnce(4n)
      .mockResolvedValueOnce(5n);
    const build = vi
      .spyOn(client, 'createMarket')
      .mockResolvedValue({ instructions: [], marketPda: Keypair.generate().publicKey });
    const send = vi.fn().mockRejectedValueOnce(marketAlreadyExists).mockResolvedValue('sig-2');

    const result = await client.createMarketWithFreshNonce(
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      marketArgs,
      send
    );

    expect(result).toBe('sig-2');
    expect(probe).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ nonce: 5n })
    );
  });

  it('gives up after a second collision', async () => {
    const client = makeClient();
    vi.spyOn(client, 'findNextMarketNonce').mockResolvedValue(4n);
    vi.spyOn(client, 'createMarket').mockResolvedValue({
      instructions: [],
      marketPda: Keypair.generate().publicKey,
    });
    const send = vi.fn().mockRejectedValue(marketAlreadyExists);

    await expect(
      client.createMarketWithFreshNonce(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        marketArgs,
        send
      )
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  // ─── Retry must move past the collided nonce ────────────────
  //
  // The collision verdict comes from whichever RPC `send` used — on web that is
  // the wallet's, which can be further ahead than `this.connection`. A lagging
  // re-probe would otherwise still see the collided PDA as free, hand back the
  // same nonce, and spend the single retry on an identical doomed transaction.
  // These tests drive the real probe (no `findNextMarketNonce` mock) against an
  // RPC that never sees the colliding market.
  describe('retry nonce floor', () => {
    function makeLaggingClient(programId: PublicKey) {
      // Every market PDA still looks free to this RPC, including the one that
      // just collided.
      const getMultipleAccountsInfo = vi
        .fn()
        .mockImplementation(async (keys: PublicKey[]) => keys.map(() => null));
      const connection = {
        getMultipleAccountsInfo,
        getAccountInfo: vi.fn().mockResolvedValue(null),
      } as unknown as Connection;
      return { client: new CoalesceClient(connection, { programId }), getMultipleAccountsInfo };
    }

    it('does not re-select the collided nonce when the RPC still reports it free', async () => {
      const programId = Keypair.generate().publicKey;
      const borrower = Keypair.generate().publicKey;
      const { client, getMultipleAccountsInfo } = makeLaggingClient(programId);

      const build = vi
        .spyOn(client, 'createMarket')
        .mockResolvedValue({ instructions: [], marketPda: Keypair.generate().publicKey });
      const send = vi
        .fn()
        .mockRejectedValueOnce(marketAlreadyExists)
        .mockResolvedValue('sig-floor');

      const result = await client.createMarketWithFreshNonce(
        borrower,
        Keypair.generate().publicKey,
        marketArgs,
        send,
        { batchSize: 4 }
      );

      expect(result).toBe('sig-floor');
      expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(2);

      // The first probe took nonce 0; the retry must build with a different one.
      expect(build).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 0n })
      );
      expect(build).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 1n })
      );

      // And the second probe must not even ask about the collided PDA.
      const secondProbeKeys = getMultipleAccountsInfo.mock.calls[1]?.[0] as PublicKey[];
      expect(secondProbeKeys.map((k) => k.toBase58())).not.toContain(
        findMarketPda(borrower, 0n, programId)[0].toBase58()
      );
    });

    it('keeps a caller-supplied minNonce when it is already above the collided nonce', async () => {
      const programId = Keypair.generate().publicKey;
      const borrower = Keypair.generate().publicKey;
      const { client } = makeLaggingClient(programId);

      // The probe is stubbed rather than driven: it never returns below its own
      // floor, so the only way to put the caller's floor ABOVE `collided + 1` —
      // the case this test is named for — is to hand back a lower nonce
      // directly. The stub stands in for any override of the probe.
      const probe = vi
        .spyOn(client, 'findNextMarketNonce')
        .mockResolvedValueOnce(5n)
        .mockResolvedValueOnce(20n);
      const build = vi
        .spyOn(client, 'createMarket')
        .mockResolvedValue({ instructions: [], marketPda: Keypair.generate().publicKey });
      const send = vi.fn().mockRejectedValueOnce(marketAlreadyExists).mockResolvedValue('sig-min');

      await client.createMarketWithFreshNonce(
        borrower,
        Keypair.generate().publicKey,
        marketArgs,
        send,
        { minNonce: 20n, batchSize: 4 }
      );

      // The retry floor from the collision would be 6n; the caller's 20n wins.
      expect(probe).toHaveBeenNthCalledWith(
        2,
        borrower,
        expect.objectContaining({ minNonce: 20n })
      );
      expect(build).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 5n })
      );
      expect(build).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 20n })
      );
    });

    it('retries past a collision at the top of the default probe window', async () => {
      // Nonces 0-254 are taken, so the first probe returns 255 — the last nonce
      // of the default 256-wide window. The retry raises the floor to 256; that
      // window has to move with the floor, not end at it.
      const programId = Keypair.generate().publicKey;
      const borrower = Keypair.generate().publicKey;
      const marketAccount = { owner: programId, data: Buffer.alloc(0), lamports: 2_000_000 };

      // The probe asks about nonces in ascending order starting at its floor, so
      // a running offset maps each key in each batch back to its nonce.
      let nextNonce = 0;
      const getMultipleAccountsInfo = vi.fn().mockImplementation(async (keys: PublicKey[]) => {
        const start = nextNonce;
        nextNonce += keys.length;
        return keys.map((_, i) => (start + i < 255 ? marketAccount : null));
      });
      const connection = {
        getMultipleAccountsInfo,
        getAccountInfo: vi.fn().mockResolvedValue(null),
      } as unknown as Connection;
      const client = new CoalesceClient(connection, { programId });

      const build = vi
        .spyOn(client, 'createMarket')
        .mockResolvedValue({ instructions: [], marketPda: Keypair.generate().publicKey });
      const send = vi.fn().mockRejectedValueOnce(marketAlreadyExists).mockResolvedValue('sig-top');

      const result = await client.createMarketWithFreshNonce(
        borrower,
        Keypair.generate().publicKey,
        marketArgs,
        send
      );

      expect(result).toBe('sig-top');
      expect(build).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 255n })
      );
      expect(build).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 256n })
      );
    }, 20_000);
  });

  // ─── Custom(4) must be attributed before it is trusted ──────
  //
  // `Custom(4)` is `MarketAlreadyExists` in THIS program and something else in
  // every other one. A caller whose `send` bundles another instruction can have
  // the transaction rolled back by that instruction's own error 4; retrying
  // spends a second wallet signature on a failure a fresh nonce cannot fix.
  describe('program attribution of the collision code', () => {
    const foreignProgram = Keypair.generate().publicKey;

    function collisionWithLogsFrom(programId: PublicKey) {
      return Object.assign(new Error('Transaction failed'), {
        InstructionError: [1, { Custom: 4 }],
        logs: [
          `Program ${programId.toBase58()} invoke [1]`,
          `Program ${programId.toBase58()} failed: custom program error: 0x4`,
        ],
      });
    }

    it('does not retry a Custom(4) the logs blame on another program', async () => {
      const client = makeClient();
      const probe = vi.spyOn(client, 'findNextMarketNonce').mockResolvedValue(4n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const foreignError = collisionWithLogsFrom(foreignProgram);
      const send = vi.fn().mockRejectedValue(foreignError);

      await expect(
        client.createMarketWithFreshNonce(
          Keypair.generate().publicKey,
          Keypair.generate().publicKey,
          marketArgs,
          send
        )
      ).rejects.toBe(foreignError);

      expect(send).toHaveBeenCalledTimes(1);
      expect(probe).toHaveBeenCalledTimes(1);
    });

    it('still retries when the logs blame this program', async () => {
      const client = makeClient();
      const probe = vi
        .spyOn(client, 'findNextMarketNonce')
        .mockResolvedValueOnce(4n)
        .mockResolvedValueOnce(5n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const send = vi
        .fn()
        .mockRejectedValueOnce(collisionWithLogsFrom(client.programId))
        .mockResolvedValue('sig-attributed');

      expect(
        await client.createMarketWithFreshNonce(
          Keypair.generate().publicKey,
          Keypair.generate().publicKey,
          marketArgs,
          send
        )
      ).toBe('sig-attributed');
      expect(send).toHaveBeenCalledTimes(2);
      expect(probe).toHaveBeenCalledTimes(2);
    });

    it('still retries when this program failed inside a bundle that also logs others', async () => {
      // A bundled transaction where an earlier instruction succeeded: only the
      // failing program is named by a `failed:` line, and it is ours.
      const client = makeClient();
      vi.spyOn(client, 'findNextMarketNonce').mockResolvedValueOnce(4n).mockResolvedValueOnce(5n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const bundled = Object.assign(new Error('Transaction failed'), {
        logs: [
          `Program ${foreignProgram.toBase58()} invoke [1]`,
          `Program ${foreignProgram.toBase58()} success`,
          `Program ${client.programId.toBase58()} invoke [2]`,
          `Program ${client.programId.toBase58()} failed: custom program error: 0x4`,
        ],
      });
      const send = vi.fn().mockRejectedValueOnce(bundled).mockResolvedValue('sig-bundled');

      expect(
        await client.createMarketWithFreshNonce(
          Keypair.generate().publicKey,
          Keypair.generate().publicKey,
          marketArgs,
          send
        )
      ).toBe('sig-bundled');
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('still retries when the error carries no logs to attribute', async () => {
      // The shape every client in this repo actually rethrows. The instruction
      // index in a bare InstructionError addresses the caller's assembled
      // transaction, which the SDK never sees, so there is nothing to resolve
      // it against — and refusing to retry here would kill the single
      // instruction case this whole path exists for.
      const client = makeClient();
      vi.spyOn(client, 'findNextMarketNonce').mockResolvedValueOnce(4n).mockResolvedValueOnce(5n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const send = vi
        .fn()
        .mockRejectedValueOnce(marketAlreadyExists)
        .mockResolvedValue('sig-unattributable');

      expect(
        await client.createMarketWithFreshNonce(
          Keypair.generate().publicKey,
          Keypair.generate().publicKey,
          marketArgs,
          send
        )
      ).toBe('sig-unattributable');
      expect(send).toHaveBeenCalledTimes(2);
      expect('logs' in marketAlreadyExists).toBe(false);
    });
  });

  it('does not retry errors other than MarketAlreadyExists', async () => {
    const client = makeClient();
    vi.spyOn(client, 'findNextMarketNonce').mockResolvedValue(1n);
    vi.spyOn(client, 'createMarket').mockResolvedValue({
      instructions: [],
      marketPda: Keypair.generate().publicKey,
    });
    const send = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('nope'), { InstructionError: [2, { Custom: 8 }] })
      );

    await expect(
      client.createMarketWithFreshNonce(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        marketArgs,
        send
      )
    ).rejects.toThrow('nope');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never builds or sends when the probe fails', async () => {
    const client = makeClient();
    vi.spyOn(client, 'findNextMarketNonce').mockRejectedValue(
      new Error("Couldn't check your existing loans — please try again.")
    );
    const build = vi.spyOn(client, 'createMarket');
    const send = vi.fn();

    await expect(
      client.createMarketWithFreshNonce(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        marketArgs,
        send
      )
    ).rejects.toThrow("Couldn't check your existing loans");
    expect(build).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  // ─── Realistic RPC error shapes ─────────────────────────────
  //
  // The tests above build the collision error as a structured
  // `{ InstructionError: [ix, { Custom }] }` own-property object. Real
  // callers rarely throw that shape — many JSON.stringify the
  // RPC error into a plain Error message before the SDK sees it, so the
  // retry's real-world code path is message-regex extraction
  // (`parseCoalescefiError` Strategy 5 / the named-code fallback in
  // `extractErrorCodeFromLog`), not the InstructionError strategy. These
  // tests drive the retry with the actual stringified shapes so a break in
  // message extraction can't hide behind the structured-shape tests above.
  describe('realistic stringified error shapes', () => {
    // Mirrors `new Error('Transaction failed on-chain: ' + JSON.stringify(err))`.
    const prefixedJsonCollision = new Error(
      'Transaction failed on-chain: {"InstructionError":[0,{"Custom":4}]}'
    );
    // Mirrors `new Error('Transaction failed: ' + JSON.stringify(err))`.
    const plainJsonCollision = new Error(
      'Transaction failed: {"InstructionError":[0,{"Custom":4}]}'
    );
    // Mirrors a decoded simulation error rethrown as friendly text.
    const decodedSimulationCollision = new Error(
      'Transaction would fail: Program error: MarketAlreadyExists — Market with this nonce already exists'
    );

    it('none of these carry a structured InstructionError own-property', () => {
      // Sanity guard on the fixtures themselves: if this ever fails, the
      // fixtures no longer exercise the message-regex path and the tests
      // below would silently start hitting the (already-covered)
      // InstructionError strategy instead.
      expect('InstructionError' in prefixedJsonCollision).toBe(false);
      expect('InstructionError' in plainJsonCollision).toBe(false);
      expect('InstructionError' in decodedSimulationCollision).toBe(false);
    });

    it('retries exactly once and succeeds using the web-style stringified message', async () => {
      const client = makeClient();
      const probe = vi
        .spyOn(client, 'findNextMarketNonce')
        .mockResolvedValueOnce(4n)
        .mockResolvedValueOnce(5n);
      const build = vi
        .spyOn(client, 'createMarket')
        .mockResolvedValue({ instructions: [], marketPda: Keypair.generate().publicKey });
      const send = vi.fn().mockRejectedValueOnce(prefixedJsonCollision).mockResolvedValue('sig-prefixed-json');

      const result = await client.createMarketWithFreshNonce(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        marketArgs,
        send
      );

      expect(result).toBe('sig-prefixed-json');
      expect(probe).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledTimes(2);
      expect(build).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ nonce: 5n })
      );
    });

    it('retries exactly once and succeeds using an unprefixed stringified InstructionError message', async () => {
      const client = makeClient();
      const probe = vi
        .spyOn(client, 'findNextMarketNonce')
        .mockResolvedValueOnce(4n)
        .mockResolvedValueOnce(5n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const send = vi
        .fn()
        .mockRejectedValueOnce(plainJsonCollision)
        .mockResolvedValue('sig-plain-json');

      const result = await client.createMarketWithFreshNonce(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        marketArgs,
        send
      );

      expect(result).toBe('sig-plain-json');
      expect(probe).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('retries exactly once using a decoded "Program error: MarketAlreadyExists" message', async () => {
      const client = makeClient();
      const probe = vi
        .spyOn(client, 'findNextMarketNonce')
        .mockResolvedValueOnce(4n)
        .mockResolvedValueOnce(5n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const send = vi
        .fn()
        .mockRejectedValueOnce(decodedSimulationCollision)
        .mockResolvedValue('sig-decoded-sim');

      const result = await client.createMarketWithFreshNonce(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        marketArgs,
        send
      );

      expect(result).toBe('sig-decoded-sim');
      expect(probe).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('a second collision with the same realistic shape propagates rather than looping', async () => {
      const client = makeClient();
      const probe = vi.spyOn(client, 'findNextMarketNonce').mockResolvedValue(4n);
      vi.spyOn(client, 'createMarket').mockResolvedValue({
        instructions: [],
        marketPda: Keypair.generate().publicKey,
      });
      const send = vi.fn().mockRejectedValue(prefixedJsonCollision);

      await expect(
        client.createMarketWithFreshNonce(
          Keypair.generate().publicKey,
          Keypair.generate().publicKey,
          marketArgs,
          send
        )
      ).rejects.toThrow();
      expect(probe).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledTimes(2);
    });
  });
});
