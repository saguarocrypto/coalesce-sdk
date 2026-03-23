/**
 * Example: Repay
 *
 * Repay borrowed tokens. Shows three approaches:
 * 1. Repay principal only (createRepayInstruction)
 * 2. Repay interest only (createRepayInterestInstruction)
 * 3. Waterfall repay — interest first, then principal (createWaterfallRepayInstructions)
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
  createRepayInstruction,
  createRepayInterestInstruction,
  createWaterfallRepayInstructions,
  fetchMarket,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findBorrowerWhitelistPda,
  configFieldToPublicKey,
} from '@coalescefi/sdk';
import type {
  RepayAccounts,
  RepayArgs,
  RepayInterestAccounts,
  RepayInterestArgs,
  WaterfallRepayAccounts,
  WaterfallRepayArgs,
} from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Repay Principal (Regular Wallet) ───────────────────────

export async function repayPrincipal(
  connection: Connection,
  payer: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();
  // NOTE: borrowerWhitelist must be the MARKET BORROWER's whitelist, not the payer's
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(market.borrower);

  const payerTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: RepayAccounts = {
    market: marketPda,
    payer: payer.publicKey,
    payerTokenAccount,
    vault: market.vault,
    protocolConfig: protocolConfigPda,
    mint: market.mint,
    borrowerWhitelist: borrowerWhitelistPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const args: RepayArgs = { amount };
  const ix = createRepayInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);

  return { signature };
}

// ─── Repay Interest Only (Regular Wallet) ───────────────────

export async function repayInterest(
  connection: Connection,
  payer: Keypair,
  marketPda: PublicKey,
  amount: bigint
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();

  const payerTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: RepayInterestAccounts = {
    market: marketPda,
    payer: payer.publicKey,
    payerTokenAccount,
    vault: market.vault,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const args: RepayInterestArgs = { amount };
  const ix = createRepayInterestInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);

  return { signature };
}

// ─── Waterfall Repay (Regular Wallet) ───────────────────────
// Interest-first, then principal. Builds 0-2 instructions atomically.

export async function waterfallRepay(
  connection: Connection,
  payer: Keypair,
  marketPda: PublicKey,
  totalAmount: bigint,
  interestAmount: bigint
): Promise<{ signature: string }> {
  configureSdk({ network: 'mainnet' });

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(market.borrower);

  const payerTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const accounts: WaterfallRepayAccounts = {
    market: marketPda,
    payer: payer.publicKey,
    payerTokenAccount,
    vault: market.vault,
    protocolConfig: protocolConfigPda,
    mint: market.mint,
    borrowerWhitelist: borrowerWhitelistPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const args: WaterfallRepayArgs = { totalAmount, interestAmount };
  const instructions = createWaterfallRepayInstructions(accounts, args);

  const tx = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);

  return { signature };
}

// ─── Waterfall Repay via Squads Multisig ────────────────────

export async function waterfallRepayViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  totalAmount: bigint,
  interestAmount: bigint
): Promise<{ transactionIndex: bigint; signature: string }> {
  configureSdk({ network: 'mainnet' });

  const vaultPda = getMultisigVaultPda(multisigPda);

  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [protocolConfigPda] = findProtocolConfigPda();
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(market.borrower);

  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true, // allowOwnerOffCurve for PDA
    TOKEN_PROGRAM_ID
  );

  const accounts: WaterfallRepayAccounts = {
    market: marketPda,
    payer: vaultPda,
    payerTokenAccount: vaultTokenAccount,
    vault: market.vault,
    protocolConfig: protocolConfigPda,
    mint: market.mint,
    borrowerWhitelist: borrowerWhitelistPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const instructions = createWaterfallRepayInstructions(accounts, {
    totalAmount,
    interestAmount,
  });

  return proposeTransaction(connection, proposer, multisigPda, instructions);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const payer = Keypair.generate();
  const marketPda = new PublicKey('...');

  // Waterfall repay: 255,312.50 USDC total, 5,312.50 USDC interest
  const result = await waterfallRepay(
    connection,
    payer,
    marketPda,
    255_312_500_000n, // total (6 decimals)
    5_312_500_000n // interest portion
  );
  console.log('Repay signature:', result.signature);
}
