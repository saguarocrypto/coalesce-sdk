/**
 * CoalesceFi SDK — Complete Integration Reference
 *
 * Copy-paste this file to integrate the full CoalesceFi lending protocol.
 * Every function is self-contained: pass a Connection + signer + market address
 * and it handles all PDA derivation, account fetching, and instruction building.
 *
 * Two variants per operation:
 *   - Regular wallet (EOA): signs directly with a Keypair
 *   - Squads multisig: proposes via a Squads v4 vault
 *
 * Combined builders minimize transactions — a lender can fully exit in 1 tx.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Table of Contents
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SETUP
 *   initializeProtocol     — One-time protocol initialization (admin)
 *   whitelistBorrower      — Whitelist a borrower (whitelist manager)
 *   createMarket           — Create a lending market (borrower)
 *
 * LENDER OPERATIONS
 *   deposit                — Deposit tokens, auto-creates position
 *   withdraw               — Withdraw tokens (partial or full)
 *   withdrawAndClose       — Withdraw all + close position (1 tx)
 *   claimHaircut           — Claim haircut recovery (distressed markets)
 *   claimHaircutAndClose   — Claim haircut + close position (1 tx)
 *
 * BORROWER OPERATIONS
 *   borrow                 — Borrow from vault
 *   waterfallRepay         — Repay interest + principal (1 tx)
 *   withdrawExcess         — Withdraw excess vault funds
 *   forceClosePosition     — Force-close a lender's position (post-maturity)
 *   forceClaimHaircut      — Force-claim haircut for a lender (post-maturity)
 *
 * SETTLEMENT
 *   reSettle               — Improve settlement factor (permissionless)
 *   collectFees            — Collect protocol fees (fee authority)
 *
 * MARKET DISCOVERY
 *   getMarketAddress       — Derive a market PDA from borrower + nonce
 *   findBorrowerMarkets    — Find all markets created by a borrower
 *   findLenderMarkets      — Find all markets a lender has positions in
 *
 * READING STATE
 *   getMarket              — Fetch and decode a market
 *   getLenderPosition       — Fetch and decode a lender position
 *   getProtocolConfig      — Fetch protocol configuration
 *
 * MULTISIG HELPERS
 *   proposeTransaction     — Propose a Squads v4 vault transaction
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as multisig from '@sqds/multisig';

import {
  configureSdk,
  // Instruction builders
  createInitializeProtocolInstruction,
  createSetBorrowerWhitelistInstruction,
  createCreateMarketInstruction,
  createDepositInstruction,
  createBorrowInstruction,
  createWithdrawInstruction,
  createReSettleInstruction,
  createCollectFeesInstruction,
  createWithdrawExcessInstruction,
  createForceClosePositionInstruction,
  createClaimHaircutInstruction,
  createForceClaimHaircutInstruction,
  // Combined builders (single-transaction flows)
  createWaterfallRepayInstructions,
  createWithdrawAndCloseInstructions,
  createClaimHaircutAndCloseInstructions,
  // PDA derivation
  findProtocolConfigPda,
  findProgramDataPda,
  findLenderPositionPda,
  findMarketAuthorityPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  findMarketPda,
  findHaircutStatePda,
  deriveMarketPdas,
  // Account fetching
  fetchMarket,
  fetchLenderPosition,
  fetchProtocolConfig,
  // Utilities
  configFieldToPublicKey,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — call once at app startup
// ═════════════════════════════════════════════════════════════════════════════

export function setup(network: 'mainnet' | 'devnet' | 'localnet' = 'mainnet') {
  configureSdk({ network });
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function getBlacklistCheckPda(
  connection: Connection,
  address: PublicKey
): Promise<PublicKey> {
  const [protocolConfigPda] = findProtocolConfigPda();
  const config = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!config) throw new Error('Protocol config not found');
  const blacklistProgram = configFieldToPublicKey(config.blacklistProgram);
  const [pda] = findBlacklistCheckPda(address, blacklistProgram);
  return pda;
}

function send(
  connection: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[]
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(connection, tx, signers);
}

// ═════════════════════════════════════════════════════════════════════════════
// SETUP
// ═════════════════════════════════════════════════════════════════════════════

/** One-time protocol initialization. Only the program upgrade authority can call this. */
export async function initializeProtocol(
  connection: Connection,
  admin: Keypair,
  feeAuthority: PublicKey,
  whitelistManager: PublicKey,
  blacklistProgram: PublicKey,
  feeRateBps: number
): Promise<string> {
  const [protocolConfig] = findProtocolConfigPda();
  const [programData] = findProgramDataPda();

  const ix = createInitializeProtocolInstruction(
    {
      protocolConfig,
      admin: admin.publicKey,
      feeAuthority,
      whitelistManager,
      blacklistProgram,
      systemProgram: SystemProgram.programId,
      programData,
    },
    { feeRateBps }
  );

  return send(connection, [ix], [admin]);
}

/** Whitelist (or de-whitelist) a borrower. */
export async function whitelistBorrower(
  connection: Connection,
  whitelistManager: Keypair,
  borrower: PublicKey,
  isWhitelisted: boolean,
  maxBorrowCapacity: bigint
): Promise<string> {
  const [protocolConfig] = findProtocolConfigPda();
  const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower);

  const ix = createSetBorrowerWhitelistInstruction(
    {
      borrowerWhitelist,
      protocolConfig,
      whitelistManager: whitelistManager.publicKey,
      borrower,
      systemProgram: SystemProgram.programId,
    },
    { isWhitelisted, maxBorrowCapacity }
  );

  return send(connection, [ix], [whitelistManager]);
}

/** Create a new lending market. Borrower must be whitelisted. */
export async function createMarket(
  connection: Connection,
  borrower: Keypair,
  mint: PublicKey,
  marketNonce: bigint,
  annualInterestBps: number,
  maturityTimestamp: bigint,
  maxTotalSupply: bigint
): Promise<{ signature: string; marketPda: PublicKey }> {
  const [protocolConfig] = findProtocolConfigPda();
  const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower.publicKey);
  const blacklistCheck = await getBlacklistCheckPda(connection, borrower.publicKey);
  const pdas = deriveMarketPdas(borrower.publicKey, marketNonce);

  const ix = createCreateMarketInstruction(
    {
      market: pdas.market.address,
      borrower: borrower.publicKey,
      mint,
      vault: pdas.vault.address,
      marketAuthority: pdas.marketAuthority.address,
      protocolConfig,
      borrowerWhitelist,
      blacklistCheck,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    { marketNonce, annualInterestBps, maturityTimestamp, maxTotalSupply }
  );

  const signature = await send(connection, [ix], [borrower]);
  return { signature, marketPda: pdas.market.address };
}

// ═════════════════════════════════════════════════════════════════════════════
// LENDER OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

/** Deposit tokens into a market. Auto-creates the lender position on first deposit. */
export async function deposit(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lender.publicKey);
  const blacklistCheck = await getBlacklistCheckPda(connection, lender.publicKey);
  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint, lender.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ix = createDepositInstruction(
    {
      market: marketPda,
      lender: lender.publicKey,
      lenderTokenAccount,
      vault: market.vault,
      lenderPosition,
      blacklistCheck,
      protocolConfig,
      mint: market.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    { amount }
  );

  return send(connection, [ix], [lender]);
}

/** Withdraw tokens. Pass scaledAmount=0n to withdraw all. */
export async function withdraw(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey,
  scaledAmount: bigint,
  minPayout: bigint = 0n
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lender.publicKey);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);
  const blacklistCheck = await getBlacklistCheckPda(connection, lender.publicKey);
  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint, lender.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ix = createWithdrawInstruction(
    {
      market: marketPda,
      lender: lender.publicKey,
      lenderTokenAccount,
      vault: market.vault,
      lenderPosition,
      marketAuthority,
      blacklistCheck,
      protocolConfig,
      tokenProgram: TOKEN_PROGRAM_ID,
      haircutState,
    },
    { scaledAmount, minPayout }
  );

  return send(connection, [ix], [lender]);
}

/** Withdraw all remaining balance + close position in a single transaction. */
export async function withdrawAndClose(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey,
  minPayout: bigint = 0n
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lender.publicKey);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);
  const blacklistCheck = await getBlacklistCheckPda(connection, lender.publicKey);
  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint, lender.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ixs = createWithdrawAndCloseInstructions(
    {
      market: marketPda,
      lender: lender.publicKey,
      lenderTokenAccount,
      vault: market.vault,
      lenderPosition,
      marketAuthority,
      blacklistCheck,
      protocolConfig,
      tokenProgram: TOKEN_PROGRAM_ID,
      haircutState,
      systemProgram: SYSTEM_PROGRAM_ID,
    },
    { scaledAmount: 0n, minPayout }
  );

  return send(connection, ixs, [lender]);
}

/** Claim haircut recovery tokens from a distressed market. */
export async function claimHaircut(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lender.publicKey);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);
  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint, lender.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ix = createClaimHaircutInstruction({
    market: marketPda,
    lender: lender.publicKey,
    lenderPosition,
    lenderTokenAccount,
    vault: market.vault,
    marketAuthority,
    haircutState,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  return send(connection, [ix], [lender]);
}

/** Claim haircut recovery + close position in a single transaction. */
export async function claimHaircutAndClose(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lender.publicKey);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);
  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint, lender.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ixs = createClaimHaircutAndCloseInstructions({
    market: marketPda,
    lender: lender.publicKey,
    lenderPosition,
    lenderTokenAccount,
    vault: market.vault,
    marketAuthority,
    haircutState,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SYSTEM_PROGRAM_ID,
  });

  return send(connection, ixs, [lender]);
}

// ═════════════════════════════════════════════════════════════════════════════
// BORROWER OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

/** Borrow tokens from the market vault. */
export async function borrow(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower.publicKey);
  const blacklistCheck = await getBlacklistCheckPda(connection, borrower.publicKey);
  const borrowerTokenAccount = await getAssociatedTokenAddress(
    market.mint, borrower.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ix = createBorrowInstruction(
    {
      market: marketPda,
      borrower: borrower.publicKey,
      borrowerTokenAccount,
      vault: market.vault,
      marketAuthority,
      borrowerWhitelist,
      blacklistCheck,
      protocolConfig,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    { amount }
  );

  return send(connection, [ix], [borrower]);
}

/** Repay interest + principal in a single transaction (waterfall). */
export async function waterfallRepay(
  connection: Connection,
  payer: Keypair,
  marketPda: PublicKey,
  totalAmount: bigint,
  interestAmount: bigint
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [borrowerWhitelist] = findBorrowerWhitelistPda(market.borrower);
  const payerTokenAccount = await getAssociatedTokenAddress(
    market.mint, payer.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ixs = createWaterfallRepayInstructions(
    {
      market: marketPda,
      payer: payer.publicKey,
      payerTokenAccount,
      vault: market.vault,
      protocolConfig,
      mint: market.mint,
      borrowerWhitelist,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    { totalAmount, interestAmount }
  );

  return send(connection, ixs, [payer]);
}

/** Withdraw excess vault funds (borrower only, post-maturity). */
export async function withdrawExcess(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const borrowerTokenAccount = await getAssociatedTokenAddress(
    market.mint, borrower.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ix = createWithdrawExcessInstruction({
    market: marketPda,
    borrower: borrower.publicKey,
    borrowerTokenAccount,
    vault: market.vault,
    marketAuthority,
    tokenProgram: TOKEN_PROGRAM_ID,
    protocolConfig,
  });

  return send(connection, [ix], [borrower]);
}

/** Force-close a lender's position (borrower only, post-maturity). */
export async function forceClosePosition(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lenderPubkey);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);

  const ix = createForceClosePositionInstruction({
    market: marketPda,
    borrower: borrower.publicKey,
    lenderPosition,
    escrowTokenAccount,
    vault: market.vault,
    marketAuthority,
    haircutState,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  return send(connection, [ix], [borrower]);
}

/** Force-claim haircut recovery on behalf of a lender (borrower only). */
export async function forceClaimHaircut(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, lenderPubkey);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);

  const ix = createForceClaimHaircutInstruction({
    market: marketPda,
    borrower: borrower.publicKey,
    lenderPosition,
    escrowTokenAccount,
    vault: market.vault,
    marketAuthority,
    haircutState,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  return send(connection, [ix], [borrower]);
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTLEMENT
// ═════════════════════════════════════════════════════════════════════════════

/** Trigger or improve settlement (permissionless, anyone can call). */
export async function reSettle(
  connection: Connection,
  caller: Keypair,
  marketPda: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [haircutState] = findHaircutStatePda(marketPda);

  const ix = createReSettleInstruction({
    market: marketPda,
    vault: market.vault,
    protocolConfig,
    haircutState,
  });

  return send(connection, [ix], [caller]);
}

/** Collect accrued protocol fees (fee authority only). */
export async function collectFees(
  connection: Connection,
  feeAuthority: Keypair,
  marketPda: PublicKey
): Promise<string> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const feeTokenAccount = await getAssociatedTokenAddress(
    market.mint, feeAuthority.publicKey, false, TOKEN_PROGRAM_ID
  );

  const ix = createCollectFeesInstruction({
    market: marketPda,
    protocolConfig,
    feeAuthority: feeAuthority.publicKey,
    feeTokenAccount,
    vault: market.vault,
    marketAuthority,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  return send(connection, [ix], [feeAuthority]);
}

// ═════════════════════════════════════════════════════════════════════════════
// MARKET DISCOVERY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Derive a market PDA from a borrower address and nonce.
 *
 * Use this when you already know the borrower and market nonce (e.g., from
 * your own database or the CoalesceFi indexer).
 *
 * The first market a borrower creates uses nonce 0, the second uses nonce 1, etc.
 */
export function getMarketAddress(
  borrower: PublicKey,
  marketNonce: bigint = 0n
): PublicKey {
  const [marketPda] = findMarketPda(borrower, marketNonce);
  return marketPda;
}

/**
 * Find all markets created by a borrower.
 *
 * Iterates nonces 0..maxNonce, checks which market PDAs exist on-chain,
 * and returns them with decoded market data.
 *
 * @param maxNonce - Maximum nonce to check (default 10). Increase if the
 *                   borrower may have created more markets.
 */
export async function findBorrowerMarkets(
  connection: Connection,
  borrower: PublicKey,
  maxNonce: number = 10
): Promise<Array<{ marketPda: PublicKey; nonce: bigint; market: NonNullable<Awaited<ReturnType<typeof fetchMarket>>> }>> {
  const results = [];

  for (let i = 0; i < maxNonce; i++) {
    const nonce = BigInt(i);
    const [marketPda] = findMarketPda(borrower, nonce);
    const market = await fetchMarket(connection, marketPda);
    if (market) {
      results.push({ marketPda, nonce, market });
    }
  }

  return results;
}

/**
 * Find all markets a lender has positions in.
 *
 * Checks whether lender position PDAs exist for each of the borrower's markets.
 * Requires knowing the borrower address — use your indexer or API to get the
 * list of active borrowers if needed.
 */
export async function findLenderMarkets(
  connection: Connection,
  lender: PublicKey,
  borrowers: PublicKey[],
  maxNoncePerBorrower: number = 10
): Promise<Array<{ marketPda: PublicKey; position: NonNullable<Awaited<ReturnType<typeof fetchLenderPosition>>> }>> {
  const results = [];

  for (const borrower of borrowers) {
    for (let i = 0; i < maxNoncePerBorrower; i++) {
      const [marketPda] = findMarketPda(borrower, BigInt(i));
      const [lenderPositionPda] = findLenderPositionPda(marketPda, lender);
      const position = await fetchLenderPosition(connection, lenderPositionPda);
      if (position) {
        results.push({ marketPda, position });
      }
    }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// READING STATE
// ═════════════════════════════════════════════════════════════════════════════

export { fetchMarket as getMarket } from '@coalescefi/sdk';
export { fetchLenderPosition as getLenderPosition } from '@coalescefi/sdk';
export { fetchProtocolConfig as getProtocolConfig } from '@coalescefi/sdk';

// ═════════════════════════════════════════════════════════════════════════════
// SQUADS MULTISIG — every EOA function above has a multisig equivalent below
// ═════════════════════════════════════════════════════════════════════════════

function getVaultPda(multisigPda: PublicKey): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  return vaultPda;
}

/** Propose a Squads v4 vault transaction (create + proposal + auto-approve). */
export async function proposeTransaction(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  instructions: TransactionInstruction[]
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getVaultPda(multisigPda);
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(Number(ms.transactionIndex)) + 1n;
  const { blockhash } = await connection.getLatestBlockhash();

  const innerMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: proposer.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: innerMessage,
  });

  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: proposer.publicKey,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: proposer.publicKey,
  });

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: proposer.publicKey,
      recentBlockhash: blockhash,
      instructions: [createVaultTxIx, createProposalIx, approveIx],
    }).compileToV0Message()
  );
  tx.sign([proposer]);

  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature);

  return { transactionIndex, signature };
}

// ─── Multisig: Lender Operations ────────────────────────────

export async function depositViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getVaultPda(multisigPda);
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, vaultPda);
  const blacklistCheck = await getBlacklistCheckPda(connection, vaultPda);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint, vaultPda, true, TOKEN_PROGRAM_ID
  );

  const ix = createDepositInstruction(
    {
      market: marketPda,
      lender: vaultPda,
      lenderTokenAccount: vaultTokenAccount,
      vault: market.vault,
      lenderPosition,
      blacklistCheck,
      protocolConfig,
      mint: market.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    { amount }
  );

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

export async function withdrawAndCloseViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  minPayout: bigint = 0n
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getVaultPda(multisigPda);
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, vaultPda);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);
  const blacklistCheck = await getBlacklistCheckPda(connection, vaultPda);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint, vaultPda, true, TOKEN_PROGRAM_ID
  );

  const ixs = createWithdrawAndCloseInstructions(
    {
      market: marketPda,
      lender: vaultPda,
      lenderTokenAccount: vaultTokenAccount,
      vault: market.vault,
      lenderPosition,
      marketAuthority,
      blacklistCheck,
      protocolConfig,
      tokenProgram: TOKEN_PROGRAM_ID,
      haircutState,
      systemProgram: SYSTEM_PROGRAM_ID,
    },
    { scaledAmount: 0n, minPayout }
  );

  return proposeTransaction(connection, proposer, multisigPda, ixs);
}

export async function claimHaircutAndCloseViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getVaultPda(multisigPda);
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [lenderPosition] = findLenderPositionPda(marketPda, vaultPda);
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [haircutState] = findHaircutStatePda(marketPda);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint, vaultPda, true, TOKEN_PROGRAM_ID
  );

  const ixs = createClaimHaircutAndCloseInstructions({
    market: marketPda,
    lender: vaultPda,
    lenderPosition,
    lenderTokenAccount: vaultTokenAccount,
    vault: market.vault,
    marketAuthority,
    haircutState,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SYSTEM_PROGRAM_ID,
  });

  return proposeTransaction(connection, proposer, multisigPda, ixs);
}

// ─── Multisig: Borrower Operations ─────────────────────────

export async function borrowViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getVaultPda(multisigPda);
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [marketAuthority] = findMarketAuthorityPda(marketPda);
  const [borrowerWhitelist] = findBorrowerWhitelistPda(vaultPda);
  const blacklistCheck = await getBlacklistCheckPda(connection, vaultPda);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint, vaultPda, true, TOKEN_PROGRAM_ID
  );

  const ix = createBorrowInstruction(
    {
      market: marketPda,
      borrower: vaultPda,
      borrowerTokenAccount: vaultTokenAccount,
      vault: market.vault,
      marketAuthority,
      borrowerWhitelist,
      blacklistCheck,
      protocolConfig,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    { amount }
  );

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

export async function waterfallRepayViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  totalAmount: bigint,
  interestAmount: bigint
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getVaultPda(multisigPda);
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfig] = findProtocolConfigPda();
  const [borrowerWhitelist] = findBorrowerWhitelistPda(market.borrower);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint, vaultPda, true, TOKEN_PROGRAM_ID
  );

  const ixs = createWaterfallRepayInstructions(
    {
      market: marketPda,
      payer: vaultPda,
      payerTokenAccount: vaultTokenAccount,
      vault: market.vault,
      protocolConfig,
      mint: market.mint,
      borrowerWhitelist,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    { totalAmount, interestAmount }
  );

  return proposeTransaction(connection, proposer, multisigPda, ixs);
}
