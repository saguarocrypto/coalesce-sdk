/**
 * Example: Create Market
 *
 * A borrower creates a new lending market with specified terms.
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
  createCreateMarketInstruction,
  fetchProtocolConfig,
  findProtocolConfigPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  findHaircutStatePda,
  deriveMarketPdas,
  configFieldToPublicKey,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';
import type { CreateMarketArgs, CreateMarketAccounts } from '@coalescefi/sdk';

import { getMultisigVaultPda, proposeTransaction } from './_helpers';

// ─── Regular Wallet ─────────────────────────────────────────

export async function createMarket(
  connection: Connection,
  borrower: Keypair,
  mint: PublicKey,
  args: CreateMarketArgs
): Promise<{ signature: string; marketPda: PublicKey }> {
  configureSdk({ network: 'mainnet' });

  // 1. Derive all market PDAs
  const { market, marketAuthority, vault } = deriveMarketPdas(borrower.publicKey, args.marketNonce);

  // 2. Fetch protocol config for blacklist program
  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(borrower.publicKey, blacklistProgram);
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(borrower.publicKey);

  // 3. Build and send instruction
  const [haircutStatePda] = findHaircutStatePda(market.address);
  const accounts: CreateMarketAccounts = {
    market: market.address,
    borrower: borrower.publicKey,
    mint,
    vault: vault.address,
    marketAuthority: marketAuthority.address,
    protocolConfig: protocolConfigPda,
    borrowerWhitelist: borrowerWhitelistPda,
    blacklistCheck: blacklistCheckPda,
    systemProgram: SYSTEM_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    haircutState: haircutStatePda,
  };

  const ix = createCreateMarketInstruction(accounts, args);
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [borrower]);

  return { signature, marketPda: market.address };
}

// ─── Squads Multisig ────────────────────────────────────────

export async function createMarketViaMultisig(
  connection: Connection,
  proposer: Keypair,
  multisigPda: PublicKey,
  mint: PublicKey,
  args: CreateMarketArgs
): Promise<{ transactionIndex: bigint; signature: string; marketPda: PublicKey }> {
  configureSdk({ network: 'mainnet' });

  // 1. The vault PDA acts as the borrower
  const vaultPda = getMultisigVaultPda(multisigPda);

  // 2. Derive PDAs using vault as borrower
  const { market, marketAuthority, vault } = deriveMarketPdas(vaultPda, args.marketNonce);

  const [protocolConfigPda] = findProtocolConfigPda();
  const protocolConfig = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!protocolConfig) throw new Error('Protocol config not found');

  const blacklistProgram = configFieldToPublicKey(protocolConfig.blacklistProgram);
  const [blacklistCheckPda] = findBlacklistCheckPda(vaultPda, blacklistProgram);
  const [borrowerWhitelistPda] = findBorrowerWhitelistPda(vaultPda);

  // 3. Build instruction with vault as borrower/signer
  const [haircutStatePda] = findHaircutStatePda(market.address);
  const accounts: CreateMarketAccounts = {
    market: market.address,
    borrower: vaultPda,
    mint,
    vault: vault.address,
    marketAuthority: marketAuthority.address,
    protocolConfig: protocolConfigPda,
    borrowerWhitelist: borrowerWhitelistPda,
    blacklistCheck: blacklistCheckPda,
    systemProgram: SYSTEM_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    haircutState: haircutStatePda,
  };

  const ix = createCreateMarketInstruction(accounts, args);

  // 4. Propose (creates vault tx + proposal + auto-approves)
  const { transactionIndex, signature } = await proposeTransaction(
    connection,
    proposer,
    multisigPda,
    [ix]
  );

  return { transactionIndex, signature, marketPda: market.address };
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const borrower = Keypair.generate(); // Replace with actual keypair
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

  const args: CreateMarketArgs = {
    marketNonce: 1n,
    annualInterestBps: 1000, // 10% APR
    maturityTimestamp: BigInt(Math.floor(Date.now() / 1000) + 365 * 86400), // 1 year
    maxTotalSupply: 1_000_000_000_000n, // 1M USDC
  };

  // Regular wallet
  const result = await createMarket(connection, borrower, USDC_MINT, args);
  console.log('Market created:', result.marketPda.toBase58());

  // Squads multisig
  // const multisigPda = new PublicKey('...');
  // const msResult = await createMarketViaMultisig(connection, proposer, multisigPda, USDC_MINT, args);
  // console.log('Proposed market creation, tx index:', msResult.transactionIndex);
}
