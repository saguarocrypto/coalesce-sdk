/**
 * Example: Read and Decode Accounts
 *
 * Fetch, decode, and subscribe to CoalesceFi on-chain accounts.
 * No multisig-specific patterns — reading is the same for all callers.
 */

import { Connection, PublicKey } from '@solana/web3.js';

import {
  configureSdk,
  fetchProtocolConfig,
  fetchMarket,
  fetchLenderPosition,
  fetchBorrowerWhitelist,
  decodeMarket,
  decodeLenderPosition,
  decodeAccount,
  getAccountType,
  findProtocolConfigPda,
  findMarketPda,
  findLenderPositionPda,
  findBorrowerWhitelistPda,
  configFieldToPublicKey,
  MARKET_SIZE,
  LENDER_POSITION_SIZE,
} from '@coalescefi/sdk';
import type { Market, LenderPosition, ProtocolConfig } from '@coalescefi/sdk';

// ─── Fetch Individual Accounts ──────────────────────────────

export async function readProtocolConfig(connection: Connection): Promise<ProtocolConfig> {
  configureSdk({ network: 'mainnet' });

  const [protocolConfigPda] = findProtocolConfigPda();
  const config = await fetchProtocolConfig(connection, protocolConfigPda);
  if (!config) throw new Error('Protocol config not found');

  // ProtocolConfig fields are Uint8Array — convert to PublicKey
  const admin = configFieldToPublicKey(config.admin);
  const feeAuthority = configFieldToPublicKey(config.feeAuthority);
  const whitelistManager = configFieldToPublicKey(config.whitelistManager);
  const blacklistProgram = configFieldToPublicKey(config.blacklistProgram);

  console.log('Admin:', admin.toBase58());
  console.log('Fee authority:', feeAuthority.toBase58());
  console.log('Whitelist manager:', whitelistManager.toBase58());
  console.log('Blacklist program:', blacklistProgram.toBase58());
  console.log('Fee rate:', config.feeRateBps, 'bps');
  console.log('Paused:', config.isPaused);

  return config;
}

export async function readMarket(connection: Connection, marketPda: PublicKey): Promise<Market> {
  const market = await fetchMarket(connection, marketPda);
  if (!market) throw new Error('Market not found');

  console.log('Borrower:', market.borrower.toBase58());
  console.log('Mint:', market.mint.toBase58());
  console.log('Annual interest:', market.annualInterestBps, 'bps');
  console.log('Maturity:', new Date(Number(market.maturityTimestamp) * 1000).toISOString());
  console.log('Total deposited:', market.totalDeposited);
  console.log('Total borrowed:', market.totalBorrowed);
  console.log('Total repaid:', market.totalRepaid);
  console.log('Scale factor:', market.scaleFactor);

  return market;
}

export async function readLenderPosition(
  connection: Connection,
  marketPda: PublicKey,
  lender: PublicKey
): Promise<LenderPosition> {
  const [positionPda] = findLenderPositionPda(marketPda, lender);
  const position = await fetchLenderPosition(connection, positionPda);
  if (!position) throw new Error('Lender position not found');

  console.log('Market:', position.market.toBase58());
  console.log('Lender:', position.lender.toBase58());
  console.log('Scaled balance:', position.scaledBalance);

  return position;
}

// ─── Fetch with Retry ───────────────────────────────────────
// All fetch functions accept an optional RetryConfig for resilience.

export async function fetchWithRetry(
  connection: Connection,
  marketPda: PublicKey
): Promise<Market> {
  const market = await fetchMarket(connection, marketPda, {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 5000,
  });
  if (!market) throw new Error('Market not found after retries');
  return market;
}

// ─── Batch Fetch Multiple Accounts ──────────────────────────

export async function batchFetchMarkets(
  connection: Connection,
  marketPdas: PublicKey[]
): Promise<Market[]> {
  const accountInfos = await connection.getMultipleAccountsInfo(marketPdas);
  const markets: Market[] = [];

  for (let i = 0; i < accountInfos.length; i++) {
    const info = accountInfos[i];
    if (!info) {
      console.log(`Market ${marketPdas[i].toBase58()} not found`);
      continue;
    }

    // Verify account size matches expected Market size
    if (info.data.length !== MARKET_SIZE) {
      console.log(`Unexpected account size at index ${i}: ${info.data.length}`);
      continue;
    }

    const market = decodeMarket(new Uint8Array(info.data));
    markets.push(market);
  }

  return markets;
}

// ─── Decode Raw Account Data ────────────────────────────────

export function decodeRawAccount(data: Uint8Array): void {
  // Auto-detect account type by size
  const accountType = getAccountType(data.length);
  console.log('Detected account type:', accountType);

  // Generic decode
  const decoded = decodeAccount(data);
  if (decoded) {
    console.log('Decoded account:', decoded);
  }
}

// ─── Subscribe to Account Changes ───────────────────────────

export function subscribeToMarket(
  connection: Connection,
  marketPda: PublicKey,
  onUpdate: (market: Market) => void
): () => void {
  const subscriptionId = connection.onAccountChange(
    marketPda,
    (accountInfo) => {
      const market = decodeMarket(new Uint8Array(accountInfo.data));
      onUpdate(market);
    },
    'confirmed'
  );

  // Return cleanup function
  return () => {
    connection.removeAccountChangeListener(subscriptionId);
  };
}

// ─── Usage ──────────────────────────────────────────────────

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  configureSdk({ network: 'mainnet' });

  // Read protocol config
  await readProtocolConfig(connection);

  // Read a specific market
  const marketPda = new PublicKey('...');
  const market = await readMarket(connection, marketPda);

  // Read a lender position
  const lender = new PublicKey('...');
  await readLenderPosition(connection, marketPda, lender);

  // Subscribe to market updates
  const unsubscribe = subscribeToMarket(connection, marketPda, (updatedMarket) => {
    console.log('Market updated! New scale factor:', updatedMarket.scaleFactor);
  });

  // Later: clean up subscription
  // unsubscribe();
}
