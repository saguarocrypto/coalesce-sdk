import { Keypair, PublicKey } from '@solana/web3.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { CoalesceClient } from '../src/client';
import { ProtocolCache } from '../src/client/cache';
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

function buildMarketData(borrower: PublicKey, mint: PublicKey, vault: PublicKey): Uint8Array {
  const buffer = new Uint8Array(MARKET_SIZE);
  buffer.set(DISC_MARKET, 0);
  buffer[8] = 1; // version
  buffer.set(borrower.toBytes(), 9); // borrower at offset 9
  buffer.set(mint.toBytes(), 41); // mint at offset 41
  buffer.set(vault.toBytes(), 73); // vault at offset 73
  return buffer;
}

function buildLenderPositionData(market: PublicKey, lender: PublicKey): Uint8Array {
  const buffer = new Uint8Array(LENDER_POSITION_SIZE);
  buffer.set(DISC_LENDER_POSITION, 0);
  buffer[8] = 1; // version
  buffer.set(market.toBytes(), 9); // market at offset 9
  buffer.set(lender.toBytes(), 41); // lender at offset 41
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
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.Withdraw);
    });
  });

  describe('withdrawAndClose', () => {
    it('should return 2 instructions: withdraw + close', async () => {
      const ixs = await client.withdrawAndClose(lender.publicKey, marketPda);
      expect(ixs).toHaveLength(2);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.Withdraw);
      expect(ixs[1].data[0]).toBe(InstructionDiscriminator.CloseLenderPosition);
    });

    it('should pass scaledAmount=0 for full withdrawal', async () => {
      const ixs = await client.withdrawAndClose(lender.publicKey, marketPda);
      // Withdraw data: [discriminator(1), scaledAmount(16), minPayout(8)]
      // scaledAmount is u128 LE at bytes 1-16, should be all zeros
      const scaledAmountBytes = ixs[0].data.subarray(1, 17);
      expect(scaledAmountBytes.every((b) => b === 0)).toBe(true);
    });
  });

  describe('borrow', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.borrow(borrower.publicKey, marketPda, 1_000_000n);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.Borrow);
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

    it('should return empty array for zero amount', async () => {
      const ixs = await client.repay(borrower.publicKey, marketPda, 0n, 0n);
      expect(ixs).toHaveLength(0);
    });
  });

  describe('claimHaircut', () => {
    it('should return instructions with correct discriminator', async () => {
      const ixs = await client.claimHaircut(lender.publicKey, marketPda);
      expect(ixs).toHaveLength(1);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.ClaimHaircut);
    });
  });

  describe('claimHaircutAndClose', () => {
    it('should return 2 instructions: claim + close', async () => {
      const ixs = await client.claimHaircutAndClose(lender.publicKey, marketPda);
      expect(ixs).toHaveLength(2);
      expect(ixs[0].data[0]).toBe(InstructionDiscriminator.ClaimHaircut);
      expect(ixs[1].data[0]).toBe(InstructionDiscriminator.CloseLenderPosition);
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
});
