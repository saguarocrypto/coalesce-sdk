/**
 * Example: Borrow
 *
 * A whitelisted borrower borrows tokens from a market vault.
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
  createBorrowInstruction,
  fetchMarket,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findMarketAuthorityPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  configFieldToPublicKey,
} from '@coalescefi/sdk';
import type { BorrowAccounts, BorrowArgs } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function borrow(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  // 1. Fetch market data
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  // 2. Verify caller is the market borrower
  if (!market.borrower.equals(borrower.publicKey)) {
    throw new Error('Only the market borrower can borrow');
  }

  // 3. Derive PDAs
  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(borrower.publicKey, blacklistProgram);
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(borrower.publicKey);

  // 4. Get borrower's token account
  const borrowerTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    borrower.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // 5. Build and send
  const accounts: BorrowAccounts = {
    market: marketPda,
    borrower: borrower.publicKey,
    borrowerTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    borrowerWhitelist: borrowerWhitelistPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const args: BorrowArgs = { amount };
  const ix = createBorrowInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [borrower]);

  return { signature };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function borrowViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(vaultPda, blacklistProgram);
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(vaultPda);

  // allowOwnerOffCurve = true for PDA-owned token accounts
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const accounts: BorrowAccounts = {
    market: marketPda,
    borrower: vaultPda,
    borrowerTokenAccount: vaultTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    borrowerWhitelist: borrowerWhitelistPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createBorrowInstruction(accounts, { amount });

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const borrower = Keypair.generate();
  const marketPda = new PublicKey('...');

  // Borrow 500,000 USDC (6 decimals)
  const result = await borrow(connection, borrower, marketPda, 500_000_000_000n);
  console.log('Borrow signature:', result.signature);
}
