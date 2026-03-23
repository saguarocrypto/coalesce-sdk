/**
 * Shared helpers for Squads multisig operations.
 *
 * These utilities wrap the @sqds/multisig SDK to provide a consistent
 * propose → approve → execute flow used across all multisig examples.
 *
 * Squads v4 compatibility: the vault PDA acts as the protocol signer
 * (borrower, lender, admin, etc.). The on-chain program only checks
 * is_signer() — it does not require a specific EOA.
 */

import * as multisig from '@sqds/multisig';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

/** Get the default vault PDA (index 0) for a Squads multisig. */
export function getMultisigVaultPda(multisigPda: PublicKey): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  return vaultPda;
}

/** Fetch the next transaction index from the multisig account. */
export async function getNextTransactionIndex(
  connection: Connection,
  multisigPda: PublicKey
): Promise<bigint> {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  return BigInt(Number(ms.transactionIndex)) + 1n;
}

/**
 * Propose a vault transaction.
 *
 * Creates a vault transaction containing the given instructions,
 * creates a proposal, and auto-approves as the proposer (1 of N).
 */
export async function proposeTransaction(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  instructions: TransactionInstruction[]
): Promise<{ transactionIndex: bigint; signature: string }> {
  const vaultPda = getMultisigVaultPda(multisigPda);
  const transactionIndex = await getNextTransactionIndex(connection, multisigPda);
  const { blockhash } = await connection.getLatestBlockhash();

  // Inner message: what the vault will execute on-chain
  const innerMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  // Outer transaction: create vault tx + proposal + auto-approve
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

/** Approve a pending proposal as a multisig member. */
export async function approveProposal(
  connection: Connection,
  member: Keypair,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();

  const ix = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: member.publicKey,
  });

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: member.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message()
  );
  tx.sign([member]);

  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature);
  return signature;
}

/** Execute an approved proposal. */
export async function executeProposal(
  connection: Connection,
  executor: Keypair,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();

  const ix = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex,
    member: executor.publicKey,
  });

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: executor.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix.instruction],
    }).compileToV0Message([...ix.lookupTableAccounts])
  );
  tx.sign([executor]);

  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature);
  return signature;
}
