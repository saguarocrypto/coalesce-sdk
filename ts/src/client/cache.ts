import { fetchMarket, fetchProtocolConfig } from '../accounts';
import { SdkError } from '../errors';
import { findProtocolConfigPda } from '../pdas';

import type { Market, ProtocolConfig } from '../types';
import type { Connection, PublicKey } from '@solana/web3.js';

interface CachedProtocolConfig {
  data: ProtocolConfig;
  pda: PublicKey;
  fetchedAt: number;
}

interface CachedMarket {
  data: Market;
  fetchedAt: number;
}

export class ProtocolCache {
  private protocolConfig: CachedProtocolConfig | null = null;
  private markets: Map<string, CachedMarket> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 30_000) {
    this.ttlMs = ttlMs;
  }

  async getProtocolConfig(
    connection: Connection,
    programId: PublicKey
  ): Promise<CachedProtocolConfig> {
    if (this.protocolConfig && Date.now() - this.protocolConfig.fetchedAt < this.ttlMs) {
      return this.protocolConfig;
    }

    const [pda] = findProtocolConfigPda(programId);
    const data = await fetchProtocolConfig(connection, pda);
    if (!data) {
      throw new SdkError(
        'Protocol config not found — is the protocol initialized?',
        'configuration'
      );
    }

    this.protocolConfig = { data, pda, fetchedAt: Date.now() };
    return this.protocolConfig;
  }

  async getMarket(connection: Connection, marketPda: PublicKey): Promise<Market> {
    const key = marketPda.toBase58();
    const cached = this.markets.get(key);

    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.data;
    }

    const data = await fetchMarket(connection, marketPda);
    if (!data) {
      throw new SdkError(`Market not found: ${key}`, 'validation');
    }

    this.markets.set(key, { data, fetchedAt: Date.now() });
    return data;
  }

  /** Like getMarket but returns null instead of throwing for missing markets. Populates cache on hit. */
  async tryGetMarket(connection: Connection, marketPda: PublicKey): Promise<Market | null> {
    const key = marketPda.toBase58();
    const cached = this.markets.get(key);

    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.data;
    }

    const data = await fetchMarket(connection, marketPda);
    if (!data) {
      return null;
    }

    this.markets.set(key, { data, fetchedAt: Date.now() });
    return data;
  }

  invalidate(): void {
    this.protocolConfig = null;
    this.markets.clear();
  }

  invalidateMarket(marketPda: PublicKey): void {
    this.markets.delete(marketPda.toBase58());
  }
}
