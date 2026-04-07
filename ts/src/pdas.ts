import { PublicKey } from '@solana/web3.js';

import {
  getProgramId,
  SEED_PROTOCOL_CONFIG,
  SEED_MARKET,
  SEED_MARKET_AUTHORITY,
  SEED_LENDER,
  SEED_VAULT,
  SEED_BORROWER_WHITELIST,
  SEED_BLACKLIST,
  SEED_HAIRCUT_STATE,
} from './constants';

/** BPF Loader Upgradeable program ID */
export const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111'
);

/**
 * Helper to convert a u64 to little-endian bytes.
 */
function u64ToLEBytes(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  // Use DataView so this works in browser bundlers whose Buffer polyfill
  // may not implement writeBigUInt64LE.
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setBigUint64(0, value, true);
  return buffer;
}

/**
 * Find the Program Data PDA for a given program.
 * This is used to verify the upgrade authority during initialization.
 * Seeds: [program_id] with BPF Loader Upgradeable as the program.
 */
export function findProgramDataPda(programId?: PublicKey): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync(
    [resolvedProgramId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
  );
}

/**
 * Find the ProtocolConfig PDA.
 * Seeds: [SEED_PROTOCOL_CONFIG]
 */
export function findProtocolConfigPda(programId?: PublicKey): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync([SEED_PROTOCOL_CONFIG], resolvedProgramId);
}

/**
 * Find a Market PDA.
 * Seeds: [SEED_MARKET, borrower_pubkey, market_nonce (u64 LE)]
 */
export function findMarketPda(
  borrower: PublicKey,
  marketNonce: bigint,
  programId?: PublicKey
): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync(
    [SEED_MARKET, borrower.toBuffer(), u64ToLEBytes(marketNonce)],
    resolvedProgramId
  );
}

/**
 * Find a Market Authority PDA.
 * Seeds: [SEED_MARKET_AUTHORITY, market_pubkey]
 */
export function findMarketAuthorityPda(
  market: PublicKey,
  programId?: PublicKey
): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync(
    [SEED_MARKET_AUTHORITY, market.toBuffer()],
    resolvedProgramId
  );
}

/**
 * Find a Vault PDA.
 * Seeds: [SEED_VAULT, market_pubkey]
 */
export function findVaultPda(market: PublicKey, programId?: PublicKey): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync([SEED_VAULT, market.toBuffer()], resolvedProgramId);
}

/**
 * Find a LenderPosition PDA.
 * Seeds: [SEED_LENDER, market, lender]
 */
export function findLenderPositionPda(
  market: PublicKey,
  lender: PublicKey,
  programId?: PublicKey
): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync(
    [SEED_LENDER, market.toBuffer(), lender.toBuffer()],
    resolvedProgramId
  );
}

/**
 * Find a BorrowerWhitelist PDA.
 * Seeds: [SEED_BORROWER_WHITELIST, borrower]
 */
export function findBorrowerWhitelistPda(
  borrower: PublicKey,
  programId?: PublicKey
): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync(
    [SEED_BORROWER_WHITELIST, borrower.toBuffer()],
    resolvedProgramId
  );
}

/**
 * Find the HaircutState PDA for a market.
 * Seeds: [SEED_HAIRCUT_STATE, market_pubkey]
 */
export function findHaircutStatePda(market: PublicKey, programId?: PublicKey): [PublicKey, number] {
  const resolvedProgramId = programId ?? getProgramId();
  return PublicKey.findProgramAddressSync(
    [SEED_HAIRCUT_STATE, market.toBuffer()],
    resolvedProgramId
  );
}

/**
 * Find a Blacklist check PDA (for external blacklist program).
 * Seeds: [SEED_BLACKLIST, address]
 */
export function findBlacklistCheckPda(
  address: PublicKey,
  blacklistProgram: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_BLACKLIST, address.toBuffer()], blacklistProgram);
}

/**
 * Derive all PDAs needed for creating a new market.
 * Market PDA depends on borrower + nonce; authority and vault depend on market pubkey.
 */
export function deriveMarketPdas(
  borrower: PublicKey,
  marketNonce: bigint,
  programId?: PublicKey
): {
  market: { address: PublicKey; bump: number };
  marketAuthority: { address: PublicKey; bump: number };
  vault: { address: PublicKey; bump: number };
} {
  const resolvedProgramId = programId ?? getProgramId();
  const [marketAddress, marketBump] = findMarketPda(borrower, marketNonce, resolvedProgramId);
  const [marketAuthorityAddress, marketAuthorityBump] = findMarketAuthorityPda(
    marketAddress,
    resolvedProgramId
  );
  const [vaultAddress, vaultBump] = findVaultPda(marketAddress, resolvedProgramId);

  return {
    market: { address: marketAddress, bump: marketBump },
    marketAuthority: { address: marketAuthorityAddress, bump: marketAuthorityBump },
    vault: { address: vaultAddress, bump: vaultBump },
  };
}

/**
 * Re-export seed constants for consumers who need raw seeds.
 */
export {
  SEED_PROTOCOL_CONFIG,
  SEED_MARKET,
  SEED_MARKET_AUTHORITY,
  SEED_LENDER,
  SEED_VAULT,
  SEED_BORROWER_WHITELIST,
  SEED_BLACKLIST,
  SEED_HAIRCUT_STATE,
} from './constants';
