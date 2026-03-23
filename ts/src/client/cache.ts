import { fetchMarket, fetchProtocolConfig } from '../accounts';
import { findProtocolConfigPda } from '../pdas';

import type { Market, ProtocolConfig } from '../types';
import type { Connection, PublicKey } from '@solana/web3.js';

interface CachedProtocolConfig {
  data: ProtocolConfig;
  pda: PublicKey;
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
    if (this.protocolConfig) {
      return this.protocolConfig;
    }

    const [pda] = findProtocolConfigPda(programId);
    const data = await fetchProtocolConfig(connection, pda);
    if (!data) {
      throw new Error('Protocol config not found — is the protocol initialized?');
    }

    this.protocolConfig = { data, pda };
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
      throw new Error(`Market not found: ${key}`);
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
