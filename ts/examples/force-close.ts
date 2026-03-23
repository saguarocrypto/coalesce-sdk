/**
 * Example: Force Close Position
 *
 * The market borrower can force-close a lender's position after maturity,
 * sending the lender's payout (including any recovered haircut) to an
 * escrow token account. This allows the borrower to wind down the market
 * even if individual lenders have not withdrawn.
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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

import {
  configureSdk,
  createForceClosePositionInstruction,
  fetchMarket,
  findProtocolConfigPda,
  findLenderPositionPda,
  findMarketAuthorityPda,
  findHaircutStatePda,
} from '@coalescefi/sdk';
import type { ForceClosePositionAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet (Borrower) ──────────────────────────────

export async function forceClosePosition(
  connection: Connection,
  borrower: Keypair,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  // Verify market is past maturity
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < market.maturityTimestamp) {
    throw new Error('Market has not reached maturity — cannot force-close');
  }

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lenderPubkey);
  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const accounts: ForceClosePositionAccounts = {
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

  const ix = createForceClosePositionInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [borrower]);

  return { signature };
}

// ─── Squads Multisig (Borrower) ─────────────────────────────

export async function forceClosePositionViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  lenderPubkey: PublicKey,
  escrowTokenAccount: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lenderPubkey);
  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const accounts: ForceClosePositionAccounts = {
    market: marketPda,
    borrower: vaultPda,
    lenderPosition: lenderPositionPda,
    escrowTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    haircutState: haircutStatePda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createForceClosePositionInstruction(accounts);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const borrower = Keypair.generate();
  const marketPda = new PublicKey('...');
  const lenderPubkey = new PublicKey('...');
  const escrowTokenAccount = new PublicKey('...');

  const result = await forceClosePosition(
    connection,
    borrower,
    marketPda,
    lenderPubkey,
    escrowTokenAccount
  );
  console.log('Position force-closed:', result.signature);
}
