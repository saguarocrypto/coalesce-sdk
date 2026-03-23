/**
 * Example: Collect Fees
 *
 * The fee authority collects accrued protocol fees from a market vault.
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
  createCollectFeesInstruction,
  fetchMarket,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findMarketAuthorityPda,
  configFieldToPublicKey,
} from '@coalescefi/sdk';
import type { CollectFeesAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function collectFees(
  connection: Connection,
  feeAuthority: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string; feesCollected: bigint }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  if (market.accruedProtocolFees === 0n) {
    throw new Error('No fees to collect');
  }

  const [protocolConfigPda] = findProtocolConfigPda();
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);

  const feeTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    feeAuthority.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: CollectFeesAccounts = {
    market: marketPda,
    protocolConfig: protocolConfigPda,
    feeAuthority: feeAuthority.publicKey,
    feeTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createCollectFeesInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [feeAuthority]);

  return { signature, feesCollected: market.accruedProtocolFees };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function collectFeesViaMultisig(
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

  const accounts: CollectFeesAccounts = {
    market: marketPda,
    protocolConfig: protocolConfigPda,
    feeAuthority: vaultPda,
    feeTokenAccount: vaultTokenAccount,
    vault: market.vault,
    marketAuthority: marketAuthorityPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createCollectFeesInstruction(accounts);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const feeAuthority = Keypair.generate();
  const marketPda = new PublicKey('...');

  const result = await collectFees(connection, feeAuthority, marketPda);
  console.log('Collected fees:', result.feesCollected, 'sig:', result.signature);
}
