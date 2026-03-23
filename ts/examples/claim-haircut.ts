/**
 * Example: Claim Haircut Recovery
 *
 * In a distressed market (settlement_factor < 1.0), lenders who withdrew
 * before re-settlement may have unclaimed haircut recovery tokens. This
 * example shows three approaches:
 *
 * 1. Claim haircut only (createClaimHaircutInstruction)
 * 2. Claim haircut + close position in one tx (createClaimHaircutAndCloseInstructions)
 * 3. Force-claim on behalf of a lender — borrower only (createForceClaimHaircutInstruction)
 *
 * Includes both regular wallet and Squads multisig examples.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

import {
  configureSdk,
  createClaimHaircutInstruction,
  createClaimHaircutAndCloseInstructions,
  createForceClaimHaircutInstruction,
  fetchMarket,
  fetchLenderPosition,
  findProtocolConfigPda,
  findLenderPositionPda,
  findMarketAuthorityPda,
  findHaircutStatePda,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type {
  ClaimHaircutAccounts,
  ClaimHaircutAndCloseAccounts,
  ForceClaimHaircutAccounts,
} from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Claim Haircut Only (Regular Wallet) ────────────────────

export async function claimHaircut(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);
  const position = await fetchLenderPosition(connection, lenderPositionPda);
  if (!position) throw new Error('Lender position not found');
  if (position.haircutOwed === 0n) {
    throw new Error('No haircut recovery to claim');
  }

  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    lender.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: ClaimHaircutAccounts = {
    market: marketPda,
    lender: lender.publicKey,
    lenderPosition: lenderPositionPda,
    lenderTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    haircutState: haircutStatePda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createClaimHaircutInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [lender]);

  return { signature };
}

// ─── Claim Haircut + Close Position (Single Transaction) ────
// Use when the lender's scaled_balance is already 0 and only haircut_owed remains.

export async function claimHaircutAndClose(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);
  const position = await fetchLenderPosition(connection, lenderPositionPda);
  if (!position) throw new Error('Lender position not found');
  if (position.scaledBalance > 0n) {
    throw new Error('Position still has balance — withdraw first');
  }
  if (position.haircutOwed === 0n) {
    throw new Error('No haircut to claim — use closePosition() directly');
  }

  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    lender.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: ClaimHaircutAndCloseAccounts = {
    market: marketPda,
    lender: lender.publicKey,
    lenderPosition: lenderPositionPda,
    lenderTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    haircutState: haircutStatePda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const instructions = createClaimHaircutAndCloseInstructions(accounts);

  const tx = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(connection, tx, [lender]);

  return { signature };
}

// ─── Force Claim Haircut (Borrower Only) ────────────────────
// The market borrower can force-claim haircut recovery on behalf of a lender,
// sending tokens to an escrow token account.

export async function forceClaimHaircut(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lenderPubkey);
  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const accounts: ForceClaimHaircutAccounts = {
    market: marketPda,
    borrower: borrower.publicKey,
    lenderPosition: lenderPositionPda,
    escrowTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    haircutState: haircutStatePda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createForceClaimHaircutInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [borrower]);

  return { signature };
}

// ─── Claim Haircut + Close via Squads Multisig ──────────────

export async function claimHaircutAndCloseViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, vaultPda);
  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const accounts: ClaimHaircutAndCloseAccounts = {
    market: marketPda,
    lender: vaultPda,
    lenderPosition: lenderPositionPda,
    lenderTokenAccount: vaultTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    haircutState: haircutStatePda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const instructions = createClaimHaircutAndCloseInstructions(accounts);

  return proposeTransaction(connection, proposer, multisigPda, instructions);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const lender = Keypair.generate();
  const marketPda = new PublicKey('...');

  // Claim haircut recovery tokens
  const claimResult = await claimHaircut(connection, lender, marketPda);
  console.log('Haircut claimed:', claimResult.signature);

  // Or claim + close in a single transaction
  const exitResult = await claimHaircutAndClose(connection, lender, marketPda);
  console.log('Claimed and closed:', exitResult.signature);
}
