/**
 * Example: Borrower Whitelist Management
 *
 * The whitelist manager adds or removes borrowers and sets borrow capacity.
 * Includes both regular wallet and Squads multisig examples.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import {
  configureSdk,
  createSetBorrowerWhitelistInstruction,
  fetchBorrowerWhitelist,
  findProtocolConfigPda,
  findBorrowerWhitelistPda,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type { SetBorrowerWhitelistAccounts, SetBorrowerWhitelistArgs } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Add Borrower to Whitelist (Regular Wallet) ─────────────

export async function addBorrower(
  connection: Connection,
  whitelistManager: Keypair,
  borrower: PublicKey,
  maxBorrowCapacity: bigint
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(borrower);

  const accounts: SetBorrowerWhitelistAccounts = {
    borrowerWhitelist: borrowerWhitelistPda,
    protocolConfig: protocolConfigPda,
    whitelistManager: whitelistManager.publicKey,
    borrower,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const args: SetBorrowerWhitelistArgs = {
    isWhitelisted: true,
    maxBorrowCapacity,
  };

  const ix = createSetBorrowerWhitelistInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [whitelistManager]);

  return { signature };
}

// ─── Remove Borrower from Whitelist (Regular Wallet) ────────

export async function removeBorrower(
  connection: Connection,
  whitelistManager: Keypair,
  borrower: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(borrower);

  const accounts: SetBorrowerWhitelistAccounts = {
    borrowerWhitelist: borrowerWhitelistPda,
    protocolConfig: protocolConfigPda,
    whitelistManager: whitelistManager.publicKey,
    borrower,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const args: SetBorrowerWhitelistArgs = {
    isWhitelisted: false,
    maxBorrowCapacity: 0n,
  };

  const ix = createSetBorrowerWhitelistInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [whitelistManager]);

  return { signature };
}

// ─── Add Borrower via Squads Multisig ───────────────────────

export async function addBorrowerViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  borrower: PublicKey,
  maxBorrowCapacity: bigint
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);
  const [protocolConfigPda] = findProtocolConfigPda();
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(borrower);

  const accounts: SetBorrowerWhitelistAccounts = {
    borrowerWhitelist: borrowerWhitelistPda,
    protocolConfig: protocolConfigPda,
    whitelistManager: vaultPda,
    borrower,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const args: SetBorrowerWhitelistArgs = {
    isWhitelisted: true,
    maxBorrowCapacity,
  };

  const ix = createSetBorrowerWhitelistInstruction(accounts, args);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Check Whitelist Status ─────────────────────────────────

export async function checkWhitelistStatus(
  connection: Connection,
  borrower: PublicKey
): Promise<void> {
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(borrower);
  const whitelist = await fetchBorrowerWhitelist(connection, borrowerWhitelistPda);

  if (!whitelist) {
    console.log('Borrower has no whitelist entry');
    return;
  }

  console.log('Whitelisted:', whitelist.isWhitelisted);
  console.log('Max borrow capacity:', whitelist.maxBorrowCapacity);
  console.log('Current borrowed:', whitelist.currentBorrowed);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const whitelistManager = Keypair.generate();
  const borrowerPubkey = new PublicKey('...');

  // Add borrower with 500K USDC capacity
  await addBorrower(connection, whitelistManager, borrowerPubkey, 500_000_000_000n);

  // Check status
  await checkWhitelistStatus(connection, borrowerPubkey);

  // Remove borrower
  await removeBorrower(connection, whitelistManager, borrowerPubkey);
}
