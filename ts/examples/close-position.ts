/**
 * Example: Close Lender Position
 *
 * Close an empty lender position account to reclaim rent.
 * The position must have a zero scaled balance (withdraw all first).
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
  createCloseLenderPositionInstruction,
  fetchLenderPosition,
  findProtocolConfigPda,
  findLenderPositionPda,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type { CloseLenderPositionAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function closePosition(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);
  const [protocolConfigPda] = findProtocolConfigPda();

  // Verify position is empty before closing
  const position = await fetchLenderPosition(connection, lenderPositionPda);
  if (!position) throw new Error('Lender position not found');
  if (position.scaledBalance > 0n) {
    throw new Error('Cannot close position with non-zero balance — withdraw first');
  }

  const accounts: CloseLenderPositionAccounts = {
    market: marketPda,
    lender: lender.publicKey,
    lenderPosition: lenderPositionPda,
    systemProgram: SYSTEM_PROGRAM_ID,
    protocolConfig: protocolConfigPda,
  };

  const ix = createCloseLenderPositionInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [lender]);

  return { signature };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function closePositionViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);
  const [lenderPositionPda] = findLenderPositionPda(marketPda, vaultPda);
  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: CloseLenderPositionAccounts = {
    market: marketPda,
    lender: vaultPda,
    lenderPosition: lenderPositionPda,
    systemProgram: SYSTEM_PROGRAM_ID,
    protocolConfig: protocolConfigPda,
  };

  const ix = createCloseLenderPositionInstruction(accounts);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const lender = Keypair.generate();
  const marketPda = new PublicKey('...');

  const result = await closePosition(connection, lender, marketPda);
  console.log('Position closed, rent reclaimed:', result.signature);
}
