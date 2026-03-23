/**
 * Example: Deposit
 *
 * A lender deposits tokens into a market and receives scaled shares (sTokens).
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
  createDepositInstruction,
  fetchMarket,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findLenderPositionPda,
  findBlacklistCheckPda,
  configFieldToPublicKey,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type { DepositAccounts, DepositArgs } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function deposit(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  // 1. Fetch market to get the mint
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  // 2. Derive PDAs
  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(lender.publicKey, blacklistProgram);
  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);

  // 3. Get lender's token account
  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    lender.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // 4. Build and send
  const accounts: DepositAccounts = {
    market: marketPda,
    lender: lender.publicKey,
    lenderTokenAccount,
    vault: market.vault,
    lenderPosition: lenderPositionPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    mint: market.mint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const args: DepositArgs = { amount };
  const ix = createDepositInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [lender]);

  return { signature };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function depositViaMultisig(
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
  const [lenderPositionPda] = findLenderPositionPda(marketPda, vaultPda);

  // allowOwnerOffCurve = true because vault is a PDA
  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const accounts: DepositAccounts = {
    market: marketPda,
    lender: vaultPda,
    lenderTokenAccount: vaultTokenAccount,
    vault: market.vault,
    lenderPosition: lenderPositionPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    mint: market.mint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const ix = createDepositInstruction(accounts, { amount });

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const lender = Keypair.generate();
  const marketPda = new PublicKey('...'); // Replace with actual market PDA

  // Deposit 1,000 USDC (6 decimals)
  const result = await deposit(connection, lender, marketPda, 1_000_000_000n);
  console.log('Deposit signature:', result.signature);
}
