/**
 * Example: Re-Settle
 *
 * Improve the settlement factor for a matured market.
 * Anyone can call re-settle — it succeeds only if the new
 * settlement factor would be strictly better than the current one.
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

import {
  configureSdk,
  createReSettleInstruction,
  fetchMarket,
  findProtocolConfigPda,
  WAD,
} from '@coalescefi/sdk';
import type { ReSettleAccounts } from '@coalescefi/sdk';

import { proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function reSettle(
  connection: Connection,
  caller: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  // Verify market is past maturity
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < market.maturityTimestamp) {
    throw new Error('Market has not matured yet');
  }

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: ReSettleAccounts = {
    market: marketPda,
    vault: market.vault,
    protocolConfig: protocolConfigPda,
  };

  const ix = createReSettleInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [caller]);

  return { signature };
}

// ─── Squads Multisig ────────────────────────────────────────
// Any member can propose re-settlement for a matured market.

export async function reSettleViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: ReSettleAccounts = {
    market: marketPda,
    vault: market.vault,
    protocolConfig: protocolConfigPda,
  };

  const ix = createReSettleInstruction(accounts);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const caller = Keypair.generate();
  const marketPda = new PublicKey('...');

  const result = await reSettle(connection, caller, marketPda);
  console.log('Re-settlement signature:', result.signature);

  // Check new settlement factor
  const market = await fetchMarket(connection, marketPda);
  if (market && market.settlementFactorWad === WAD) {
    console.log('Market is fully settled (100% payout)');
  }
}
