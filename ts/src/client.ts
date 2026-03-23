import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  type Connection,
  type Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import { fetchLenderPosition, fetchMarket } from './accounts';
import { ProtocolCache } from './client/cache';
import {
  resolveLenderAccounts,
  resolveBorrowerAccounts,
  resolveSettlementAccounts,
  getSystemProgramId,
  getProgramDataPda,
} from './client/resolve';
import { DEFAULT_PROGRAM_IDS } from './constants';
import { SdkError } from './errors';
import {
  createInitializeProtocolInstruction,
  createSetFeeConfigInstruction,
  createSetBorrowerWhitelistInstruction,
  createCreateMarketInstruction,
  createDepositInstruction,
  createBorrowInstruction,
  createWithdrawInstruction,
  createCollectFeesInstruction,
  createReSettleInstruction,
  createCloseLenderPositionInstruction,
  createWithdrawExcessInstruction,
  createForceClosePositionInstruction,
  createClaimHaircutInstruction,
  createForceClaimHaircutInstruction,
  createWaterfallRepayInstructions,
  createSetPauseInstruction,
  createSetBlacklistModeInstruction,
  createSetAdminInstruction,
  createSetWhitelistManagerInstruction,
} from './instructions';
import {
  findMarketPda,
  findLenderPositionPda,
  findHaircutStatePda,
  findBlacklistCheckPda,
  findBorrowerWhitelistPda,
  findProtocolConfigPda,
  deriveMarketPdas,
} from './pdas';
import { configFieldToPublicKey } from './types';

import type {
  ClientOptions,
  ClientCreateMarketArgs,
  CreateMarketResult,
  DepositOverrides,
  WithdrawOverrides,
  ClaimHaircutOverrides,
  BorrowOverrides,
  RepayOverrides,
  WithdrawExcessOverrides,
  CollectFeesOverrides,
  WhitelistBorrowerArgs,
  ScanOptions,
} from './client/types';
import type { Market, LenderPosition } from './types';

export class CoalesceClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  private readonly cache: ProtocolCache;

  /** Admin operations namespace. */
  readonly admin: AdminOperations;

  constructor(connection: Connection, options: ClientOptions) {
    this.connection = connection;
    this.programId = options.programId;
    this.cache = new ProtocolCache(options.cacheTtlMs ?? 30_000);
    this.admin = new AdminOperations(this);
  }

  // ─── Named Constructors ─────────────────────────────────────

  static mainnet(connection: Connection, cacheTtlMs?: number): CoalesceClient {
    const opts: ClientOptions = { programId: new PublicKey(DEFAULT_PROGRAM_IDS.mainnet) };
    if (cacheTtlMs !== undefined) opts.cacheTtlMs = cacheTtlMs;
    return new CoalesceClient(connection, opts);
  }

  static devnet(connection: Connection, cacheTtlMs?: number): CoalesceClient {
    const opts: ClientOptions = { programId: new PublicKey(DEFAULT_PROGRAM_IDS.devnet) };
    if (cacheTtlMs !== undefined) opts.cacheTtlMs = cacheTtlMs;
    return new CoalesceClient(connection, opts);
  }

  static localnet(connection: Connection, cacheTtlMs?: number): CoalesceClient {
    const opts: ClientOptions = { programId: new PublicKey(DEFAULT_PROGRAM_IDS.localnet) };
    if (cacheTtlMs !== undefined) opts.cacheTtlMs = cacheTtlMs;
    return new CoalesceClient(connection, opts);
  }

  // ─── Cache Control ──────────────────────────────────────────

  invalidateCache(): void {
    this.cache.invalidate();
  }

  invalidateMarket(marketPda: PublicKey): void {
    this.cache.invalidateMarket(marketPda);
  }

  // ─── Lender Operations ──────────────────────────────────────

  async deposit(
    lender: PublicKey,
    marketPda: PublicKey,
    amount: bigint,
    overrides?: DepositOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const resolved = await resolveLenderAccounts(
      this.connection,
      this.cache,
      this.programId,
      marketPda,
      lender,
      market.mint,
      overrides?.lenderTokenAccount
        ? { lenderTokenAccount: overrides.lenderTokenAccount }
        : undefined
    );

    const ix = createDepositInstruction(
      {
        market: marketPda,
        lender,
        lenderTokenAccount: resolved.lenderTokenAccount,
        vault: resolved.vault,
        lenderPosition: resolved.lenderPosition,
        blacklistCheck: resolved.blacklistCheck,
        protocolConfig: resolved.protocolConfig,
        mint: market.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: getSystemProgramId(),
      },
      { amount },
      this.programId
    );

    return [ix];
  }

  async withdraw(
    lender: PublicKey,
    marketPda: PublicKey,
    scaledAmount: bigint,
    overrides?: WithdrawOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const resolved = await resolveLenderAccounts(
      this.connection,
      this.cache,
      this.programId,
      marketPda,
      lender,
      market.mint,
      overrides?.lenderTokenAccount
        ? { lenderTokenAccount: overrides.lenderTokenAccount }
        : undefined
    );

    const ix = createWithdrawInstruction(
      {
        market: marketPda,
        lender,
        lenderTokenAccount: resolved.lenderTokenAccount,
        vault: resolved.vault,
        lenderPosition: resolved.lenderPosition,
        marketAuthority: resolved.marketAuthority,
        blacklistCheck: resolved.blacklistCheck,
        protocolConfig: resolved.protocolConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
        haircutState: resolved.haircutState,
      },
      { scaledAmount, minPayout: overrides?.minPayout ?? 0n },
      this.programId
    );

    return [ix];
  }

  async withdrawAndClose(
    lender: PublicKey,
    marketPda: PublicKey,
    overrides?: WithdrawOverrides
  ): Promise<TransactionInstruction[]> {
    const withdrawIxs = await this.withdraw(lender, marketPda, 0n, overrides);

    const [protocolConfig] = findProtocolConfigPda(this.programId);
    const [lenderPosition] = findLenderPositionPda(marketPda, lender, this.programId);

    const closeIx = createCloseLenderPositionInstruction(
      {
        market: marketPda,
        lender,
        lenderPosition,
        systemProgram: getSystemProgramId(),
        protocolConfig,
      },
      this.programId
    );

    return [...withdrawIxs, closeIx];
  }

  async claimHaircut(
    lender: PublicKey,
    marketPda: PublicKey,
    overrides?: ClaimHaircutOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const resolved = await resolveLenderAccounts(
      this.connection,
      this.cache,
      this.programId,
      marketPda,
      lender,
      market.mint,
      overrides?.lenderTokenAccount
        ? { lenderTokenAccount: overrides.lenderTokenAccount }
        : undefined
    );

    const ix = createClaimHaircutInstruction(
      {
        market: marketPda,
        lender,
        lenderPosition: resolved.lenderPosition,
        lenderTokenAccount: resolved.lenderTokenAccount,
        vault: resolved.vault,
        marketAuthority: resolved.marketAuthority,
        haircutState: resolved.haircutState,
        protocolConfig: resolved.protocolConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      this.programId
    );

    return [ix];
  }

  async claimHaircutAndClose(
    lender: PublicKey,
    marketPda: PublicKey,
    overrides?: ClaimHaircutOverrides
  ): Promise<TransactionInstruction[]> {
    const claimIxs = await this.claimHaircut(lender, marketPda, overrides);

    const [protocolConfig] = findProtocolConfigPda(this.programId);
    const [lenderPosition] = findLenderPositionPda(marketPda, lender, this.programId);

    const closeIx = createCloseLenderPositionInstruction(
      {
        market: marketPda,
        lender,
        lenderPosition,
        systemProgram: getSystemProgramId(),
        protocolConfig,
      },
      this.programId
    );

    return [...claimIxs, closeIx];
  }

  // ─── Borrower Operations ────────────────────────────────────

  async createMarket(
    borrower: PublicKey,
    mint: PublicKey,
    args: ClientCreateMarketArgs
  ): Promise<CreateMarketResult> {
    const pdas = deriveMarketPdas(borrower, args.nonce, this.programId);
    const [protocolConfig] = findProtocolConfigPda(this.programId);
    const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower, this.programId);
    const [haircutState] = findHaircutStatePda(pdas.market.address, this.programId);

    const blacklistCheck = await this.resolveBlacklistCheck(borrower);

    const ix = createCreateMarketInstruction(
      {
        market: pdas.market.address,
        borrower,
        mint,
        vault: pdas.vault.address,
        marketAuthority: pdas.marketAuthority.address,
        protocolConfig,
        borrowerWhitelist,
        blacklistCheck,
        systemProgram: getSystemProgramId(),
        tokenProgram: TOKEN_PROGRAM_ID,
        haircutState,
      },
      {
        marketNonce: args.nonce,
        annualInterestBps: args.annualInterestBps,
        maturityTimestamp: args.maturityTimestamp,
        maxTotalSupply: args.maxTotalSupply,
      },
      this.programId
    );

    return { instructions: [ix], marketPda: pdas.market.address };
  }

  async borrow(
    borrower: PublicKey,
    marketPda: PublicKey,
    amount: bigint,
    overrides?: BorrowOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const resolved = await resolveBorrowerAccounts(
      this.connection,
      this.cache,
      this.programId,
      marketPda,
      borrower,
      market.mint,
      overrides?.borrowerTokenAccount
        ? { borrowerTokenAccount: overrides.borrowerTokenAccount }
        : undefined
    );

    const ix = createBorrowInstruction(
      {
        market: marketPda,
        borrower,
        borrowerTokenAccount: resolved.borrowerTokenAccount,
        vault: resolved.vault,
        marketAuthority: resolved.marketAuthority,
        borrowerWhitelist: resolved.borrowerWhitelist,
        blacklistCheck: resolved.blacklistCheck,
        protocolConfig: resolved.protocolConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      { amount },
      this.programId
    );

    return [ix];
  }

  async repay(
    payer: PublicKey,
    marketPda: PublicKey,
    totalAmount: bigint,
    interestAmount: bigint,
    overrides?: RepayOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const [protocolConfig] = findProtocolConfigPda(this.programId);
    const [borrowerWhitelist] = findBorrowerWhitelistPda(market.borrower, this.programId);

    const payerTokenAccount =
      overrides?.payerTokenAccount ??
      (await getAssociatedTokenAddress(market.mint, payer, false, TOKEN_PROGRAM_ID));

    return createWaterfallRepayInstructions(
      {
        market: marketPda,
        payer,
        payerTokenAccount,
        vault: market.vault,
        protocolConfig,
        mint: market.mint,
        borrowerWhitelist,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      { totalAmount, interestAmount },
      this.programId
    );
  }

  async withdrawExcess(
    borrower: PublicKey,
    marketPda: PublicKey,
    overrides?: WithdrawExcessOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const resolved = await resolveBorrowerAccounts(
      this.connection,
      this.cache,
      this.programId,
      marketPda,
      borrower,
      market.mint,
      overrides?.borrowerTokenAccount
        ? { borrowerTokenAccount: overrides.borrowerTokenAccount }
        : undefined
    );

    const ix = createWithdrawExcessInstruction(
      {
        market: marketPda,
        borrower,
        borrowerTokenAccount: resolved.borrowerTokenAccount,
        vault: resolved.vault,
        marketAuthority: resolved.marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        protocolConfig: resolved.protocolConfig,
        blacklistCheck: resolved.blacklistCheck,
        borrowerWhitelist: resolved.borrowerWhitelist,
      },
      this.programId
    );

    return [ix];
  }

  forceClosePosition(
    borrower: PublicKey,
    marketPda: PublicKey,
    lenderPubkey: PublicKey,
    escrowTokenAccount: PublicKey
  ): TransactionInstruction[] {
    const settlement = resolveSettlementAccounts(this.programId, marketPda);
    const [lenderPosition] = findLenderPositionPda(marketPda, lenderPubkey, this.programId);

    const ix = createForceClosePositionInstruction(
      {
        market: marketPda,
        borrower,
        lenderPosition,
        vault: settlement.vault,
        escrowTokenAccount,
        marketAuthority: settlement.marketAuthority,
        protocolConfig: settlement.protocolConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
        haircutState: settlement.haircutState,
      },
      this.programId
    );

    return [ix];
  }

  forceClaimHaircut(
    borrower: PublicKey,
    marketPda: PublicKey,
    lenderPubkey: PublicKey,
    escrowTokenAccount: PublicKey
  ): TransactionInstruction[] {
    const settlement = resolveSettlementAccounts(this.programId, marketPda);
    const [lenderPosition] = findLenderPositionPda(marketPda, lenderPubkey, this.programId);

    const ix = createForceClaimHaircutInstruction(
      {
        market: marketPda,
        borrower,
        lenderPosition,
        escrowTokenAccount,
        vault: settlement.vault,
        marketAuthority: settlement.marketAuthority,
        haircutState: settlement.haircutState,
        protocolConfig: settlement.protocolConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      this.programId
    );

    return [ix];
  }

  // ─── Settlement ─────────────────────────────────────────────

  reSettle(marketPda: PublicKey): TransactionInstruction[] {
    const settlement = resolveSettlementAccounts(this.programId, marketPda);

    const ix = createReSettleInstruction(
      {
        market: marketPda,
        vault: settlement.vault,
        protocolConfig: settlement.protocolConfig,
        haircutState: settlement.haircutState,
      },
      this.programId
    );

    return [ix];
  }

  async collectFees(
    feeAuthority: PublicKey,
    marketPda: PublicKey,
    overrides?: CollectFeesOverrides
  ): Promise<TransactionInstruction[]> {
    const market = await this.cache.getMarket(this.connection, marketPda);
    const settlement = resolveSettlementAccounts(this.programId, marketPda);

    const feeTokenAccount =
      overrides?.feeTokenAccount ??
      (await getAssociatedTokenAddress(market.mint, feeAuthority, false, TOKEN_PROGRAM_ID));

    const ix = createCollectFeesInstruction(
      {
        market: marketPda,
        protocolConfig: settlement.protocolConfig,
        feeAuthority,
        feeTokenAccount,
        vault: settlement.vault,
        marketAuthority: settlement.marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      this.programId
    );

    return [ix];
  }

  // ─── Discovery & Reading State ──────────────────────────────

  getMarketAddress(borrower: PublicKey, nonce: bigint = 0n): PublicKey {
    const [pda] = findMarketPda(borrower, nonce, this.programId);
    return pda;
  }

  async getMarket(marketPda: PublicKey): Promise<Market | null> {
    return fetchMarket(this.connection, marketPda);
  }

  async getPosition(marketPda: PublicKey, lender: PublicKey): Promise<LenderPosition | null> {
    const [positionPda] = findLenderPositionPda(marketPda, lender, this.programId);
    return fetchLenderPosition(this.connection, positionPda);
  }

  async scanMarkets(
    borrower: PublicKey,
    options?: ScanOptions
  ): Promise<Array<{ marketPda: PublicKey; nonce: bigint; market: Market }>> {
    const maxNonce = options?.maxNonce ?? 10;
    const results: Array<{ marketPda: PublicKey; nonce: bigint; market: Market }> = [];

    for (let i = 0; i < maxNonce; i++) {
      const nonce = BigInt(i);
      const [marketPda] = findMarketPda(borrower, nonce, this.programId);
      const market = await fetchMarket(this.connection, marketPda);
      if (market) {
        results.push({ marketPda, nonce, market });
      }
    }

    return results;
  }

  async scanPositions(
    lender: PublicKey,
    borrowers: PublicKey[],
    options?: ScanOptions
  ): Promise<Array<{ marketPda: PublicKey; position: LenderPosition }>> {
    const maxNonce = options?.maxNonce ?? 10;
    const results: Array<{ marketPda: PublicKey; position: LenderPosition }> = [];

    for (const borrower of borrowers) {
      for (let i = 0; i < maxNonce; i++) {
        const [marketPda] = findMarketPda(borrower, BigInt(i), this.programId);
        const [positionPda] = findLenderPositionPda(marketPda, lender, this.programId);
        const position = await fetchLenderPosition(this.connection, positionPda);
        if (position) {
          results.push({ marketPda, position });
        }
      }
    }

    return results;
  }

  // ─── Convenience: sendAndConfirm ────────────────────────────

  async sendAndConfirm(
    instructions: TransactionInstruction[],
    signers: Keypair[]
  ): Promise<string> {
    if (instructions.length === 0) {
      throw new SdkError('No instructions to send', 'validation');
    }
    if (signers.length === 0) {
      throw new SdkError('At least one signer is required', 'validation');
    }

    const tx = new Transaction().add(...instructions);
    return sendAndConfirmTransaction(this.connection, tx, signers);
  }

  // ─── Internal Helpers ───────────────────────────────────────

  private async resolveBlacklistCheck(address: PublicKey): Promise<PublicKey> {
    const { data: config } = await this.cache.getProtocolConfig(this.connection, this.programId);
    const blacklistProgram = configFieldToPublicKey(config.blacklistProgram);
    const [pda] = findBlacklistCheckPda(address, blacklistProgram);
    return pda;
  }
}

// ─── Admin Operations ─────────────────────────────────────────

class AdminOperations {
  private readonly client: CoalesceClient;

  constructor(client: CoalesceClient) {
    this.client = client;
  }

  initializeProtocol(
    admin: PublicKey,
    args: {
      feeAuthority: PublicKey;
      whitelistManager: PublicKey;
      blacklistProgram: PublicKey;
      feeRateBps: number;
    }
  ): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);
    const programData = getProgramDataPda(this.client.programId);

    const ix = createInitializeProtocolInstruction(
      {
        protocolConfig,
        admin,
        feeAuthority: args.feeAuthority,
        whitelistManager: args.whitelistManager,
        blacklistProgram: args.blacklistProgram,
        systemProgram: getSystemProgramId(),
        programData,
      },
      { feeRateBps: args.feeRateBps },
      this.client.programId
    );

    return [ix];
  }

  setFeeConfig(
    admin: PublicKey,
    feeRateBps: number,
    newFeeAuthority: PublicKey
  ): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);

    const ix = createSetFeeConfigInstruction(
      {
        protocolConfig,
        admin,
        newFeeAuthority,
      },
      { feeRateBps },
      this.client.programId
    );

    return [ix];
  }

  whitelistBorrower(
    whitelistManager: PublicKey,
    borrower: PublicKey,
    args: WhitelistBorrowerArgs
  ): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);
    const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower, this.client.programId);

    const ix = createSetBorrowerWhitelistInstruction(
      {
        borrowerWhitelist,
        protocolConfig,
        whitelistManager,
        borrower,
        systemProgram: getSystemProgramId(),
      },
      { isWhitelisted: args.isWhitelisted, maxBorrowCapacity: args.maxBorrowCapacity },
      this.client.programId
    );

    return [ix];
  }

  setPause(admin: PublicKey, paused: boolean): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);

    const ix = createSetPauseInstruction(
      { protocolConfig, admin },
      { paused },
      this.client.programId
    );

    return [ix];
  }

  setBlacklistMode(admin: PublicKey, failClosed: boolean): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);

    const ix = createSetBlacklistModeInstruction(
      { protocolConfig, admin },
      { failClosed },
      this.client.programId
    );

    return [ix];
  }

  setAdmin(currentAdmin: PublicKey, newAdmin: PublicKey): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);

    const ix = createSetAdminInstruction(
      { protocolConfig, currentAdmin, newAdmin },
      this.client.programId
    );

    return [ix];
  }

  setWhitelistManager(admin: PublicKey, newWhitelistManager: PublicKey): TransactionInstruction[] {
    const [protocolConfig] = findProtocolConfigPda(this.client.programId);

    const ix = createSetWhitelistManagerInstruction(
      { protocolConfig, admin, newWhitelistManager },
      this.client.programId
    );

    return [ix];
  }
}
