/**
 * Example: Withdraw
 *
 * A lender withdraws tokens by redeeming scaled shares (sTokens).
 * Pre-maturity withdrawals redeem at current scale factor.
 * Post-maturity withdrawals redeem at the locked settlement factor.
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
  createWithdrawInstruction,
  fetchMarket,
  fetchLenderPosition,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findLenderPositionPda,
  findMarketAuthorityPda,
  findBlacklistCheckPda,
  configFieldToPublicKey,
  calculateNormalizedAmount,
  calculateSettlementPayout,
  WAD,
} from '@coalescefi/sdk';
import type { WithdrawAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function withdraw(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey,
  scaledAmount: bigint,
  minPayout?: bigint
): Promise<{ signature: string; estimatedPayout: bigint }> {
  configureSdk({ network: 'mainnet' });

  // 1. Fetch market and position
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);
  const position = await fetchLenderPosition(connection, lenderPositionPda);
  if (!position) throw new Error('Lender position not found');

  // 2. Estimate payout
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isPostMaturity = now >= market.maturityTimestamp;
  const estimatedPayout =
    isPostMaturity && market.settlementFactorWad > 0n
      ? calculateSettlementPayout(scaledAmount, market.scaleFactor, market.settlementFactorWad)
      : calculateNormalizedAmount(scaledAmount, market.scaleFactor);

  // 3. Derive PDAs
  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(lender.publicKey, blacklistProgram);
  const [marketAuthorityPda] = findMarketAuthorityPda(marketPda);

  const lenderTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    lender.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // 4. Build and send
  const accounts: WithdrawAccounts = {
    market: marketPda,
    lender: lender.publicKey,
    lenderTokenAccount,
    vault: market.vault,
    lenderPosition: lenderPositionPda,
    marketAuthority: marketAuthorityPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createWithdrawInstruction(accounts, { scaledAmount, minPayout });
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [lender]);

  return { signature, estimatedPayout };
}

// ─── Withdraw Full Position ─────────────────────────────────

export async function withdrawAll(
  connection: Connection,
  lender: Keypair,
  marketPda: PublicKey
): Promise<{ signature: string; estimatedPayout: bigint }> {
  const [lenderPositionPda] = findLenderPositionPda(marketPda, lender.publicKey);
  const position = await fetchLenderPosition(connection, lenderPositionPda);
  if (!position) throw new Error('Lender position not found');

  return withdraw(connection, lender, marketPda, position.scaledBalance);
}

// ─── Squads Multisig ────────────────────────────────────────

export async function withdrawViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  marketPda: PublicKey,
  scaledAmount: bigint,
  minPayout?: bigint
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

  const vaultTokenAccount = await getAssociatedTokenAddress(
    market.mint,
    vaultPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const accounts: WithdrawAccounts = {
    market: marketPda,
    lender: vaultPda,
    lenderTokenAccount: vaultTokenAccount,
    vault: market.vault,
    lenderPosition: lenderPositionPda,
    marketAuthority: marketAuthorityPda,
    blacklistCheck: blacklistCheckPda,
    protocolConfig: protocolConfigPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const ix = createWithdrawInstruction(accounts, { scaledAmount, minPayout });

  return proposeTransaction(connection, proposer, multisigPda, [ix]);
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const lender = Keypair.generate();
  const marketPda = new PublicKey('...');

  // Withdraw specific amount of scaled shares
  const result = await withdraw(connection, lender, marketPda, 500_000_000_000n);
  console.log('Withdrew, estimated payout:', result.estimatedPayout);

  // Or withdraw entire position
  const fullResult = await withdrawAll(connection, lender, marketPda);
  console.log('Full withdrawal:', fullResult.estimatedPayout);
}
