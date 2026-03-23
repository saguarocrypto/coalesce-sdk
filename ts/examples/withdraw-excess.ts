/**
 * Example: Withdraw Excess
 *
 * The borrower withdraws excess tokens from the market vault.
 * Excess = vault balance beyond what's needed for lender obligations.
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
  createWithdrawExcessInstruction,
  fetchMarket,
  findProtocolConfigPda,
  findMarketAuthorityPda,
} from '@coalescefi/sdk';
import type { WithdrawExcessAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function withdrawExcess(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  if (!market.borrower.equals(borrower.publicKey)) {
    throw new Error('Only the market borrower can withdraw excess');
  }

  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);

  const borrowerTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    borrower.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: WithdrawExcessAccounts = {
    market: marketPda,
    borrower: borrower.publicKey,
    borrowerTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    protocolConfig: protocolConfigPda,
  };

  const ix = createWithdrawExcessInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [borrower]);

  return { signature };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function withdrawExcessViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);

  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const accounts: WithdrawExcessAccounts = {
    market: marketPda,
    borrower: vaultPda,
    borrowerTokenAccount: vaultTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    protocolConfig: protocolConfigPda,
  };

  const ix = createWithdrawExcessInstruction(accounts);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const borrower = Keypair.generate();
  const marketPda = new PublicKey('...');

  const result = await withdrawExcess(connection, borrower, marketPda);
  console.log('Excess withdrawn:', result.signature);
}
