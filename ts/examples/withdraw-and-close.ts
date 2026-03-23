/**
 * Example: Withdraw and Close Position (Single Transaction)
 *
 * Withdraws all remaining tokens from a lender position and closes the
 * position account to reclaim rent — in a single atomic transaction.
 *
 * Uses createWithdrawAndCloseInstructions which builds two instructions
 * (Withdraw + CloseLenderPosition) that execute atomically.
 *
 * Prerequisites:
 * - Position must have zero haircut_owed (claim haircut first if in a distressed market)
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
  createWithdrawAndCloseInstructions,
  fetchMarket,
  fetchLenderPosition,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findLenderPositionPda,
  findMarketAuthorityPda,
  findBlacklistCheckPda,
  findHaircutStatePda,
  configFieldToPublicKey,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type { WithdrawAndCloseAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function withdrawAndClose(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  // 1. Fetch market and position
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);
  const position = await fetchLenderPosition(connection, lenderPositionPda);
  if (!position) throw new Error('Lender position not found');

  if (position.scaledBalance === 0n) {
    throw new Error('Position already empty — use closePosition() directly');
  }

  // 2. Derive PDAs
  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(lender.publicKey, blacklistProgram);
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    lender.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // 3. Build combined withdraw + close instructions
  const accounts: WithdrawAndCloseAccounts = {
    market: marketPda,
    lender: lender.publicKey,
    lenderTokenAccount,
    vault: market.vault,
    lenderPosition: lenderPositionPda,
    marketAuthority: marketAuthorityPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    haircutState: haircutStatePda,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  // scaledAmount = 0 means "withdraw all remaining balance"
  const instructions = createWithdrawAndCloseInstructions(
    accounts,
    { scaledAmount: 0n, minPayout: 0n },
  );

  // 4. Send as single atomic transaction
  const tx = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(connection, tx, [lender]);

  return { signature };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function withdrawAndCloseViaMultisig(
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
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(vaultPda, blacklistProgram);
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);
  const [lenderPositionPda] = findLenderPositionPda(marketPda, vaultPda);
  const [haircutStatePda] = findHaircutStatePda(marketPda);

  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const accounts: WithdrawAndCloseAccounts = {
    market: marketPda,
    lender: vaultPda,
    lenderTokenAccount: vaultTokenAccount,
    vault: market.vault,
    lenderPosition: lenderPositionPda,
    marketAuthority: marketAuthorityPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    haircutState: haircutStatePda,
    systemProgram: SYSTEM_PROGRAM_ID,
  };

  const instructions = createWithdrawAndCloseInstructions(
    accounts,
    { scaledAmount: 0n, minPayout: 0n },
  );

  return proposeTransaction(connection, proposer, multisigPda, instructions);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const lender = Keypair.generate();
  const marketPda = new PublicKey('...');

  // Withdraw all and close in one transaction
  const result = await withdrawAndClose(connection, lender, marketPda);
  console.log('Position withdrawn and closed:', result.signature);
}
