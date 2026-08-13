import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  type Connection,
  type Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import {
  fetchLenderPosition,
  fetchMarket,
  findNextMarketNonce,
  type FindNextMarketNonceOptions,
} from './accounts';
import { ProtocolCache } from './client/cache';
import {
  resolveLenderAccounts,
  resolveBorrowerAccounts,
  resolveSettlementAccounts,
  resolveAta,
  buildRecipientAtaIxs,
  getSystemProgramId,
  getProgramDataPda,
} from './client/resolve';
import { DEFAULT_PROGRAM_IDS } from './constants';
import { SdkError, withErrorHandling, parseCoalescefiError, CoalescefiErrorCode } from './errors';
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
import { calculateScaledAmount } from './math';
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
    return this.wrap(async () => {
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
    }, 'deposit');
  }

  /**
   * Build a withdraw instruction.
   *
   * @param scaledAmount - u128 scaled-share quantity to burn. **This is NOT a token amount.**
   *   To withdraw a USDC amount, convert with `calculateScaledAmount(amount, market.scaleFactor)`
   *   or use the convenience method `withdrawByUsdc()`.
   *   Pass `0n` to withdraw the lender's full balance; the program reads the current
   *   `scaled_balance` on-chain, which avoids stranding 1 unit from integer-division rounding.
   * @param overrides.minPayout - Minimum acceptable payout in token base units. `0n` disables
   *   slippage protection. In distressed markets (settlement_factor < WAD) the actual payout
   *   may be less than the entitled amount.
   *
   * @remarks First withdrawal after maturity triggers a settlement-factor lock. A 5-minute
   *   grace period (SETTLEMENT_GRACE_PERIOD) prevents front-running.
   */
  async withdraw(
    lender: PublicKey,
    marketPda: PublicKey,
    scaledAmount: bigint,
    overrides?: WithdrawOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
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

      const ataIxs = await buildRecipientAtaIxs(lender, market.mint, resolved.lenderTokenAccount);
      return [...ataIxs, ix];
    }, 'withdraw');
  }

  async withdrawAndClose(
    lender: PublicKey,
    marketPda: PublicKey,
    overrides?: WithdrawOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
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
    }, 'withdrawAndClose');
  }

  /**
   * Build a withdraw instruction targeting a USDC amount.
   *
   * Converts `usdcBaseUnits` to the corresponding scaled-share quantity via the
   * market's current `scale_factor`, then fetches the lender's on-chain
   * `LenderPosition` and clamps the result to that balance. The clamp absorbs
   * the 1-unit overshoot that can come out of the floor-division roundtrip when
   * the caller targets their full balance.
   *
   * For a guaranteed full withdrawal — including reclaiming the final scaled
   * unit that integer rounding can strand — call `withdraw(lender, market, 0n)`
   * or `withdrawAndClose(lender, market)` instead.
   *
   * @throws SdkError('validation') if the lender has no position on this market,
   *   the position is empty, or the market's `scale_factor` is zero.
   */
  async withdrawByUsdc(
    lender: PublicKey,
    marketPda: PublicKey,
    usdcBaseUnits: bigint,
    overrides?: WithdrawOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
      if (usdcBaseUnits <= 0n) {
        throw new SdkError('usdcBaseUnits must be greater than 0', 'validation');
      }
      const market = await this.cache.getMarket(this.connection, marketPda);
      if (market.scaleFactor === 0n) {
        throw new SdkError('Market scale_factor is 0; cannot convert USDC to scaled', 'validation');
      }
      const [lenderPositionPda] = findLenderPositionPda(marketPda, lender, this.programId);
      const position = await fetchLenderPosition(this.connection, lenderPositionPda);
      if (position === null) {
        throw new SdkError(
          `No lender position for ${lender.toBase58()} on this market`,
          'validation'
        );
      }
      if (position.scaledBalance === 0n) {
        throw new SdkError('Lender position is empty', 'validation');
      }
      const requestedScaled = calculateScaledAmount(usdcBaseUnits, market.scaleFactor);
      // Guard: integer division can floor a sub-unit USDC input to 0 scaled
      // shares (e.g. usdcBaseUnits=1 with scale_factor >= WAD). Passing 0 to
      // `withdraw` triggers the full-withdrawal sentinel and drains the
      // entire position — must reject explicitly.
      if (requestedScaled === 0n) {
        throw new SdkError(
          'usdcBaseUnits too small: floor-converts to 0 scaled shares',
          'validation'
        );
      }
      const clamped =
        requestedScaled > position.scaledBalance ? position.scaledBalance : requestedScaled;
      return this.withdraw(lender, marketPda, clamped, overrides);
    }, 'withdrawByUsdc');
  }

  /** Close an empty lender position to reclaim rent. Position must have zero balance and zero haircut_owed. */
  closeLenderPosition(lender: PublicKey, marketPda: PublicKey): TransactionInstruction[] {
    return this.wrapSync(() => {
      const [protocolConfig] = findProtocolConfigPda(this.programId);
      const [lenderPosition] = findLenderPositionPda(marketPda, lender, this.programId);

      const ix = createCloseLenderPositionInstruction(
        {
          market: marketPda,
          lender,
          lenderPosition,
          systemProgram: getSystemProgramId(),
          protocolConfig,
        },
        this.programId
      );

      return [ix];
    }, 'closeLenderPosition');
  }

  async claimHaircut(
    lender: PublicKey,
    marketPda: PublicKey,
    overrides?: ClaimHaircutOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
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

      const ataIxs = await buildRecipientAtaIxs(lender, market.mint, resolved.lenderTokenAccount);
      return [...ataIxs, ix];
    }, 'claimHaircut');
  }

  async claimHaircutAndClose(
    lender: PublicKey,
    marketPda: PublicKey,
    overrides?: ClaimHaircutOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
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
    }, 'claimHaircutAndClose');
  }

  // ─── Borrower Operations ────────────────────────────────────

  /**
   * Find this borrower's next unused market nonce by probing the chain.
   *
   * Bypasses the client's account cache on purpose — a cached result would
   * reintroduce the staleness this is designed to avoid.
   */
  async findNextMarketNonce(
    borrower: PublicKey,
    options?: FindNextMarketNonceOptions
  ): Promise<bigint> {
    return this.wrap(
      () => findNextMarketNonce(this.connection, borrower, this.programId, options),
      'findNextMarketNonce'
    );
  }

  async createMarket(
    borrower: PublicKey,
    mint: PublicKey,
    args: ClientCreateMarketArgs
  ): Promise<CreateMarketResult> {
    return this.wrap(async () => {
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
    }, 'createMarket');
  }

  /**
   * Derive a fresh market nonce, build the create-market instructions, and send
   * them via the caller's `send` function — retrying exactly once if the chain
   * reports the nonce was taken between the probe and confirmation.
   *
   * The probe closes the indexer-lag hole but not the concurrent-submit window:
   * another tab or device can claim the nonce in between. One retry covers that;
   * a second collision is a bug rather than a race, and is allowed to surface.
   *
   * The retry re-probes with a floor of `collided + 1` rather than from 0. The
   * collision is reported by whatever RPC `send` used, which on web is the
   * wallet's — potentially further ahead than `this.connection`. A lagging
   * re-probe would otherwise still see the collided PDA as free, hand back the
   * same nonce, and burn the single retry on an identical doomed transaction.
   *
   * `send` is a callback so each client keeps its own wallet and transaction
   * plumbing while this orchestration stays in one place. `send` should submit
   * ONLY the instructions it is given: bundling instructions for other
   * programs into the same transaction means a foreign program's `Custom(4)`,
   * surfaced as a bare stringified message with no logs, is indistinguishable
   * from a nonce collision and burns the single retry on a failure a fresh
   * nonce cannot fix.
   *
   * `Custom(4)` only means `MarketAlreadyExists` when THIS program raised it.
   * A caller whose `send` bundles other instructions can have the whole
   * transaction rolled back by some other program's fourth error code, and
   * retrying that burns a second wallet signature on a deterministic failure
   * that a fresh nonce cannot fix. Transaction logs name the failing program,
   * so when they are present the code is attributed before retrying (the
   * `programId` option of `parseCoalescefiError`).
   *
   * Attribution is one-directional on purpose: only affirmative evidence of a
   * FOREIGN program suppresses the retry. Errors that reach the SDK as a
   * stringified message (many wallet stacks rethrow one) or as a bare
   * `InstructionError` carry no logs, and the instruction index in them
   * addresses the caller's assembled transaction, which this method never
   * sees — there is nothing to resolve it against. Those stay retryable: the
   * single-instruction create-market send is the case this whole path exists
   * for, and refusing to retry it whenever attribution is merely unavailable
   * would disable it for most callers.
   *
   * Deliberately not routed through `wrap()`: `send` errors must reach the
   * caller unmodified so the collision check above can read the program's
   * custom error code.
   */
  async createMarketWithFreshNonce(
    borrower: PublicKey,
    mint: PublicKey,
    args: Omit<ClientCreateMarketArgs, 'nonce'>,
    send: (instructions: TransactionInstruction[]) => Promise<string>,
    options?: FindNextMarketNonceOptions
  ): Promise<string> {
    const buildAndSend = async (nonce: bigint): Promise<string> => {
      const { instructions } = await this.createMarket(borrower, mint, { ...args, nonce });
      return send(instructions);
    };

    const nonce = await this.findNextMarketNonce(borrower, options);
    try {
      return await buildAndSend(nonce);
    } catch (error) {
      // The programId option applies the one-directional attribution described
      // above: logs that blame a foreign program suppress the parse, while an
      // unattributable error (no logs) still parses. See above.
      const parsed = parseCoalescefiError(error, { programId: this.programId });
      if (parsed?.code !== CoalescefiErrorCode.MarketAlreadyExists) {
        throw error;
      }
      const retryFloor = nonce + 1n;
      const minNonce =
        options?.minNonce !== undefined && options.minNonce > retryFloor
          ? options.minNonce
          : retryFloor;
      return buildAndSend(await this.findNextMarketNonce(borrower, { ...options, minNonce }));
    }
  }

  async borrow(
    borrower: PublicKey,
    marketPda: PublicKey,
    amount: bigint,
    overrides?: BorrowOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
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

      // Self-heal a missing destination ATA: the program rejects a non-existent
      // borrower token account with InvalidAccountOwner. Idempotent — no-op when
      // it already exists; the borrower funds it (EOA wallet or multisig signer).
      const ataIxs = await buildRecipientAtaIxs(
        borrower,
        market.mint,
        resolved.borrowerTokenAccount
      );
      return [...ataIxs, ix];
    }, 'borrow');
  }

  async repay(
    payer: PublicKey,
    marketPda: PublicKey,
    totalAmount: bigint,
    interestAmount: bigint,
    overrides?: RepayOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
      if (totalAmount === 0n) {
        throw new SdkError('totalAmount must be greater than 0', 'validation');
      }
      if (interestAmount > totalAmount) {
        throw new SdkError('interestAmount cannot exceed totalAmount', 'validation');
      }

      const market = await this.cache.getMarket(this.connection, marketPda);
      const [protocolConfig] = findProtocolConfigPda(this.programId);
      const [borrowerWhitelist] = findBorrowerWhitelistPda(market.borrower, this.programId);

      const payerTokenAccount =
        overrides?.payerTokenAccount ?? (await resolveAta(payer, market.mint));

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
    }, 'repay');
  }

  async withdrawExcess(
    borrower: PublicKey,
    marketPda: PublicKey,
    overrides?: WithdrawExcessOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
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

      const ataIxs = await buildRecipientAtaIxs(
        borrower,
        market.mint,
        resolved.borrowerTokenAccount
      );
      return [...ataIxs, ix];
    }, 'withdrawExcess');
  }

  forceClosePosition(
    borrower: PublicKey,
    marketPda: PublicKey,
    lenderPubkey: PublicKey,
    escrowTokenAccount: PublicKey
  ): TransactionInstruction[] {
    return this.wrapSync(() => {
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
    }, 'forceClosePosition');
  }

  forceClaimHaircut(
    borrower: PublicKey,
    marketPda: PublicKey,
    lenderPubkey: PublicKey,
    escrowTokenAccount: PublicKey
  ): TransactionInstruction[] {
    return this.wrapSync(() => {
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
    }, 'forceClaimHaircut');
  }

  // ─── Settlement ─────────────────────────────────────────────

  reSettle(marketPda: PublicKey): TransactionInstruction[] {
    return this.wrapSync(() => {
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
    }, 'reSettle');
  }

  async collectFees(
    feeAuthority: PublicKey,
    marketPda: PublicKey,
    overrides?: CollectFeesOverrides
  ): Promise<TransactionInstruction[]> {
    return this.wrap(async () => {
      const market = await this.cache.getMarket(this.connection, marketPda);
      const settlement = resolveSettlementAccounts(this.programId, marketPda);

      // resolveAta allows off-curve owners, so an off-curve fee authority
      // (e.g. a Squads vault) derives — and self-heals — its canonical ATA.
      const feeTokenAccount =
        overrides?.feeTokenAccount ?? (await resolveAta(feeAuthority, market.mint));

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

      const ataIxs = await buildRecipientAtaIxs(
        feeAuthority,
        market.mint,
        feeTokenAccount,
        overrides?.ataRentPayer
      );
      return [...ataIxs, ix];
    }, 'collectFees');
  }

  // ─── Discovery & Reading State ──────────────────────────────

  getMarketAddress(borrower: PublicKey, nonce: bigint = 0n): PublicKey {
    const [pda] = findMarketPda(borrower, nonce, this.programId);
    return pda;
  }

  async getMarket(marketPda: PublicKey): Promise<Market | null> {
    return this.cache.tryGetMarket(this.connection, marketPda);
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

    const promises = Array.from({ length: maxNonce }, async (_, i) => {
      const nonce = BigInt(i);
      const [marketPda] = findMarketPda(borrower, nonce, this.programId);
      try {
        const market = await fetchMarket(this.connection, marketPda);
        return market ? { marketPda, nonce, market } : null;
      } catch {
        return null; // tolerate transient RPC errors
      }
    });

    const settled = await Promise.all(promises);
    return settled.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  async scanPositions(
    lender: PublicKey,
    borrowers: PublicKey[],
    options?: ScanOptions
  ): Promise<Array<{ marketPda: PublicKey; position: LenderPosition }>> {
    const maxNonce = options?.maxNonce ?? 10;

    const promises = borrowers.flatMap((borrower) =>
      Array.from({ length: maxNonce }, async (_, i) => {
        const [marketPda] = findMarketPda(borrower, BigInt(i), this.programId);
        const [positionPda] = findLenderPositionPda(marketPda, lender, this.programId);
        try {
          const position = await fetchLenderPosition(this.connection, positionPda);
          return position ? { marketPda, position } : null;
        } catch {
          return null; // tolerate transient RPC errors
        }
      })
    );

    const settled = await Promise.all(promises);
    return settled.filter((r): r is NonNullable<typeof r> => r !== null);
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
    return withErrorHandling(
      () => sendAndConfirmTransaction(this.connection, tx, signers),
      'Transaction failed'
    );
  }

  // ─── Internal Helpers ───────────────────────────────────────

  /** Wrap an async operation, converting raw errors to SdkError with type 'validation'. */
  private async wrap<T>(operation: () => Promise<T>, context: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SdkError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SdkError(
        `${context}: ${message}`,
        'validation',
        error instanceof Error ? error : undefined
      );
    }
  }

  /** Wrap a sync operation, converting raw errors to SdkError. */
  private wrapSync<T>(operation: () => T, context: string): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof SdkError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SdkError(
        `${context}: ${message}`,
        'validation',
        error instanceof Error ? error : undefined
      );
    }
  }

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

  private wrapSync<T>(operation: () => T, context: string): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof SdkError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SdkError(
        `admin.${context}: ${message}`,
        'validation',
        error instanceof Error ? error : undefined
      );
    }
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
    return this.wrapSync(() => {
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
    }, 'initializeProtocol');
  }

  setFeeConfig(
    admin: PublicKey,
    feeRateBps: number,
    newFeeAuthority: PublicKey
  ): TransactionInstruction[] {
    return this.wrapSync(() => {
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
    }, 'setFeeConfig');
  }

  whitelistBorrower(
    whitelistManager: PublicKey,
    borrower: PublicKey,
    args: WhitelistBorrowerArgs
  ): TransactionInstruction[] {
    return this.wrapSync(() => {
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
    }, 'whitelistBorrower');
  }

  setPause(admin: PublicKey, paused: boolean): TransactionInstruction[] {
    return this.wrapSync(() => {
      const [protocolConfig] = findProtocolConfigPda(this.client.programId);

      const ix = createSetPauseInstruction(
        { protocolConfig, admin },
        { paused },
        this.client.programId
      );

      return [ix];
    }, 'setPause');
  }

  setBlacklistMode(admin: PublicKey, failClosed: boolean): TransactionInstruction[] {
    return this.wrapSync(() => {
      const [protocolConfig] = findProtocolConfigPda(this.client.programId);

      const ix = createSetBlacklistModeInstruction(
        { protocolConfig, admin },
        { failClosed },
        this.client.programId
      );

      return [ix];
    }, 'setBlacklistMode');
  }

  setAdmin(currentAdmin: PublicKey, newAdmin: PublicKey): TransactionInstruction[] {
    return this.wrapSync(() => {
      const [protocolConfig] = findProtocolConfigPda(this.client.programId);

      const ix = createSetAdminInstruction(
        { protocolConfig, currentAdmin, newAdmin },
        this.client.programId
      );

      return [ix];
    }, 'setAdmin');
  }

  setWhitelistManager(admin: PublicKey, newWhitelistManager: PublicKey): TransactionInstruction[] {
    return this.wrapSync(() => {
      const [protocolConfig] = findProtocolConfigPda(this.client.programId);

      const ix = createSetWhitelistManagerInstruction(
        { protocolConfig, admin, newWhitelistManager },
        this.client.programId
      );

      return [ix];
    }, 'setWhitelistManager');
  }
}
