/**
 * CoalesceFi SDK — Complete Integration Reference
 *
 * Copy-paste this file to integrate the full CoalesceFi lending protocol.
 * Uses CoalesceClient for automatic PDA derivation and account resolution.
 * Every operation is a single method call.
 *
 * Two variants per operation:
 *   - Regular wallet (EOA): signs directly with a Keypair
 *   - Squads multisig: proposes via a Squads v4 vault
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
 *   repay                  — Repay interest + principal (1 tx)
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
 *   scanMarkets            — Scan for markets created by a borrower (helper)
 *   scanPositions          — Scan for lender positions (helper)
 *
 * MULTISIG
 *   All operations work with Squads by getting instructions from the client
 *   and wrapping them in a vault transaction proposal.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

import { CoalesceClient } from '@coalescefi/sdk';

// ═════════════════════════════════════════════════════════════════════════════
// SETUP — create client once, reuse everywhere
// ═════════════════════════════════════════════════════════════════════════════

const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = CoalesceClient.mainnet(connection);

// ═════════════════════════════════════════════════════════════════════════════
// HELPER — send instructions with a Keypair signer
// ═════════════════════════════════════════════════════════════════════════════

async function send(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  return client.sendAndConfirm(ixs, signers);
}

// ═════════════════════════════════════════════════════════════════════════════
// PROTOCOL ADMIN
// ═════════════════════════════════════════════════════════════════════════════

export async function initializeProtocol(
  admin: Keypair,
  feeAuthority: PublicKey,
  whitelistManager: PublicKey,
  blacklistProgram: PublicKey,
  feeRateBps: number
): Promise<string> {
  const ixs = client.admin.initializeProtocol(admin.publicKey, {
    feeAuthority,
    whitelistManager,
    blacklistProgram,
    feeRateBps,
  });
  return send(ixs, [admin]);
}

export async function whitelistBorrower(
  whitelistManager: Keypair,
  borrower: PublicKey,
  isWhitelisted: boolean,
  maxBorrowCapacity: bigint
): Promise<string> {
  const ixs = client.admin.whitelistBorrower(whitelistManager.publicKey, borrower, {
    isWhitelisted,
    maxBorrowCapacity,
  });
  return send(ixs, [whitelistManager]);
}

// ═════════════════════════════════════════════════════════════════════════════
// BORROWER OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

export async function createMarket(
  borrower: Keypair,
  mint: PublicKey,
  nonce: bigint,
  annualInterestBps: number,
  maturityTimestamp: bigint,
  maxTotalSupply: bigint
): Promise<{ signature: string; marketPda: PublicKey }> {
  const { instructions, marketPda } = await client.createMarket(borrower.publicKey, mint, {
    nonce,
    annualInterestBps,
    maturityTimestamp,
    maxTotalSupply,
  });
  const signature = await send(instructions, [borrower]);
  return { signature, marketPda };
}

export async function borrow(
  borrower: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<string> {
  const ixs = await client.borrow(borrower.publicKey, marketPda, amount);
  return send(ixs, [borrower]);
}

export async function repay(
  payer: Keypair,
  marketPda: PublicKey,
  totalAmount: bigint,
  interestAmount: bigint
): Promise<string> {
  const ixs = await client.repay(payer.publicKey, marketPda, totalAmount, interestAmount);
  return send(ixs, [payer]);
}

export async function withdrawExcess(borrower: Keypair, marketPda: PublicKey): Promise<string> {
  const ixs = await client.withdrawExcess(borrower.publicKey, marketPda);
  return send(ixs, [borrower]);
}

export async function forceClosePosition(
  borrower: Keypair,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<string> {
  const ixs = client.forceClosePosition(
    borrower.publicKey,
    marketPda,
    lenderPubkey,
    escrowTokenAccount
  );
  return send(ixs, [borrower]);
}

export async function forceClaimHaircut(
  borrower: Keypair,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<string> {
  const ixs = client.forceClaimHaircut(
    borrower.publicKey,
    marketPda,
    lenderPubkey,
    escrowTokenAccount
  );
  return send(ixs, [borrower]);
}

// ═════════════════════════════════════════════════════════════════════════════
// LENDER OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

export async function deposit(
  lender: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<string> {
  const ixs = await client.deposit(lender.publicKey, marketPda, amount);
  return send(ixs, [lender]);
}

export async function withdraw(
  lender: Keypair,
  marketPda: PublicKey,
  scaledAmount: bigint,
  minPayout: bigint = 0n
): Promise<string> {
  const ixs = await client.withdraw(lender.publicKey, marketPda, scaledAmount, { minPayout });
  return send(ixs, [lender]);
}

export async function withdrawAndClose(
  lender: Keypair,
  marketPda: PublicKey,
  minPayout: bigint = 0n
): Promise<string> {
  const ixs = await client.withdrawAndClose(lender.publicKey, marketPda, { minPayout });
  return send(ixs, [lender]);
}

export async function claimHaircut(lender: Keypair, marketPda: PublicKey): Promise<string> {
  const ixs = await client.claimHaircut(lender.publicKey, marketPda);
  return send(ixs, [lender]);
}

export async function claimHaircutAndClose(lender: Keypair, marketPda: PublicKey): Promise<string> {
  const ixs = await client.claimHaircutAndClose(lender.publicKey, marketPda);
  return send(ixs, [lender]);
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTLEMENT
// ═════════════════════════════════════════════════════════════════════════════

export async function reSettle(caller: Keypair, marketPda: PublicKey): Promise<string> {
  const ixs = client.reSettle(marketPda);
  return send(ixs, [caller]);
}

export async function collectFees(feeAuthority: Keypair, marketPda: PublicKey): Promise<string> {
  const ixs = await client.collectFees(feeAuthority.publicKey, marketPda);
  return send(ixs, [feeAuthority]);
}

// ═════════════════════════════════════════════════════════════════════════════
// MARKET DISCOVERY
// ═════════════════════════════════════════════════════════════════════════════

/** Derive a market PDA from borrower + nonce (synchronous, no RPC). */
export function getMarketAddress(borrower: PublicKey, nonce: bigint = 0n): PublicKey {
  return client.getMarketAddress(borrower, nonce);
}

/**
 * Scan for markets created by a borrower (iterates nonces 0..N).
 * For production discovery, use the CoalesceFi indexer/API.
 */
export async function scanMarkets(borrower: PublicKey) {
  return client.scanMarkets(borrower, { maxNonce: 10 });
}

/**
 * Scan for positions across known borrowers.
 * For production discovery, use the CoalesceFi indexer/API.
 */
export async function scanPositions(lender: PublicKey, borrowers: PublicKey[]) {
  return client.scanPositions(lender, borrowers, { maxNonce: 10 });
}

// ═════════════════════════════════════════════════════════════════════════════
// READING STATE
// ═════════════════════════════════════════════════════════════════════════════

export async function getMarket(marketPda: PublicKey) {
  return client.getMarket(marketPda);
}

export async function getPosition(marketPda: PublicKey, lender: PublicKey) {
  return client.getPosition(marketPda, lender);
}

// ═════════════════════════════════════════════════════════════════════════════
// SQUADS MULTISIG
// ═════════════════════════════════════════════════════════════════════════════

function getVaultPda(multisigPda: PublicKey): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  return vaultPda;
}

export async function proposeTransaction(
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

// ─── Multisig: Lender ───────────────────────────────────────

export async function depositViaMultisig(
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  amount: bigint
) {
  const vaultPda = getVaultPda(multisigPda);
  const ixs = await client.deposit(vaultPda, marketPda, amount);
  return proposeTransaction(proposer, multisigPda, ixs);
}

export async function withdrawAndCloseViaMultisig(
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
) {
  const vaultPda = getVaultPda(multisigPda);
  const ixs = await client.withdrawAndClose(vaultPda, marketPda);
  return proposeTransaction(proposer, multisigPda, ixs);
}

export async function claimHaircutAndCloseViaMultisig(
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
) {
  const vaultPda = getVaultPda(multisigPda);
  const ixs = await client.claimHaircutAndClose(vaultPda, marketPda);
  return proposeTransaction(proposer, multisigPda, ixs);
}

// ─── Multisig: Borrower ─────────────────────────────────────

export async function borrowViaMultisig(
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  amount: bigint
) {
  const vaultPda = getVaultPda(multisigPda);
  const ixs = await client.borrow(vaultPda, marketPda, amount);
  return proposeTransaction(proposer, multisigPda, ixs);
}

export async function repayViaMultisig(
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  totalAmount: bigint,
  interestAmount: bigint
) {
  const vaultPda = getVaultPda(multisigPda);
  const ixs = await client.repay(vaultPda, marketPda, totalAmount, interestAmount);
  return proposeTransaction(proposer, multisigPda, ixs);
}
