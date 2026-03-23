/**
 * Example: Admin Operations
 *
 * Protocol admin operations: initialize, set fee config, pause/unpause,
 * set blacklist mode, transfer admin, and transfer whitelist manager.
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
  createInitializeProtocolInstruction,
  createSetFeeConfigInstruction,
  createSetPauseInstruction,
  createSetBlacklistModeInstruction,
  createSetAdminInstruction,
  createSetWhitelistManagerInstruction,
  findProtocolConfigPda,
  findProgramDataPda,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type {
  InitializeProtocolAccounts,
  InitializeProtocolArgs,
  SetFeeConfigAccounts,
  SetFeeConfigArgs,
  SetPauseAccounts,
  SetPauseArgs,
  SetBlacklistModeAccounts,
  SetBlacklistModeArgs,
  SetAdminAccounts,
  SetWhitelistManagerAccounts,
} from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Initialize Protocol (one-time setup) ───────────────────

export async function initializeProtocol(
  connection: Connection,
  admin: Keypair,
  feeAuthority: PublicKey,
  whitelistManager: PublicKey,
  blacklistProgram: PublicKey,
  feeRateBps: number
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();
  const [programDataPda] = findProgramDataPda();

  const accounts: InitializeProtocolAccounts = {
    protocolConfig: protocolConfigPda,
    admin: admin.publicKey,
    feeAuthority,
    whitelistManager,
    blacklistProgram,
    systemProgram: SYSTEM_PROGRAM_ID,
    programData: programDataPda,
  };

  const args: InitializeProtocolArgs = { feeRateBps };
  const ix = createInitializeProtocolInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [admin]);

  return { signature };
}

// ─── Set Fee Config ─────────────────────────────────────────

export async function setFeeConfig(
  connection: Connection,
  admin: Keypair,
  newFeeRateBps: number,
  newFeeAuthority: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetFeeConfigAccounts = {
    protocolConfig: protocolConfigPda,
    admin: admin.publicKey,
    newFeeAuthority,
  };

  const args: SetFeeConfigArgs = { feeRateBps: newFeeRateBps };
  const ix = createSetFeeConfigInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [admin]);

  return { signature };
}

// ─── Pause / Unpause Protocol ───────────────────────────────

export async function setPause(
  connection: Connection,
  admin: Keypair,
  paused: boolean
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetPauseAccounts = {
    protocolConfig: protocolConfigPda,
    admin: admin.publicKey,
  };

  const args: SetPauseArgs = { paused };
  const ix = createSetPauseInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [admin]);

  return { signature };
}

// ─── Set Blacklist Mode ─────────────────────────────────────

export async function setBlacklistMode(
  connection: Connection,
  admin: Keypair,
  failClosed: boolean
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetBlacklistModeAccounts = {
    protocolConfig: protocolConfigPda,
    admin: admin.publicKey,
  };

  const args: SetBlacklistModeArgs = { failClosed };
  const ix = createSetBlacklistModeInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [admin]);

  return { signature };
}

// ─── Transfer Admin ─────────────────────────────────────────

export async function transferAdmin(
  connection: Connection,
  currentAdmin: Keypair,
  newAdmin: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetAdminAccounts = {
    protocolConfig: protocolConfigPda,
    currentAdmin: currentAdmin.publicKey,
    newAdmin,
  };

  const ix = createSetAdminInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [currentAdmin]);

  return { signature };
}

// ─── Transfer Whitelist Manager ─────────────────────────────

export async function transferWhitelistManager(
  connection: Connection,
  admin: Keypair,
  newWhitelistManager: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetWhitelistManagerAccounts = {
    protocolConfig: protocolConfigPda,
    admin: admin.publicKey,
    newWhitelistManager,
  };

  const ix = createSetWhitelistManagerInstruction(accounts);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [admin]);

  return { signature };
}

// ─── Admin Operations via Squads Multisig ───────────────────
// When the protocol admin is a Squads vault, all admin operations
// go through the propose → approve → execute flow.

export async function setPauseViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  paused: boolean
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);
  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetPauseAccounts = {
    protocolConfig: protocolConfigPda,
    admin: vaultPda,
  };

  const ix = createSetPauseInstruction(accounts, { paused });

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

export async function transferAdminViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  newAdmin: PublicKey
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);
  const [protocolConfigPda] = findProtocolConfigPda();

  const accounts: SetAdminAccounts = {
    protocolConfig: protocolConfigPda,
    currentAdmin: vaultPda,
    newAdmin,
  };

  const ix = createSetAdminInstruction(accounts);

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const admin = Keypair.generate();

  // Pause protocol (emergency)
  await setPause(connection, admin, true);
  console.log('Protocol paused');

  // Unpause
  await setPause(connection, admin, false);
  console.log('Protocol unpaused');

  // Update fee rate to 2% (200 bps)
  await setFeeConfig(connection, admin, 200, admin.publicKey);

  // Transfer admin to multisig
  const multisigPda = new PublicKey('...');
  const vaultPda = getMultisigVaultPda(multisigPda);
  await transferAdmin(connection, admin, vaultPda);
  console.log('Admin transferred to multisig vault');
}
