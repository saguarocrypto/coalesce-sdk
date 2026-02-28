/**
 * @coalescefi/sdk
 *
 * TypeScript SDK for interacting with the CoalesceFi lending protocol on Solana.
 *
 * This SDK provides:
 * - Instruction builders for all 17 program instructions
 * - Account decoders for all 4 account types
 * - PDA derivation helpers (7 PDA types)
 * - Error mapping utilities (43 error codes)
 * - Transaction building helpers
 * - Configurable program ID resolution
 * - Idempotency support for critical operations
 * - Compatibility layer for Solana Kit / web3.js 2.0
 *
 * ## Configuration
 *
 * Configure the SDK at application startup:
 *
 * ```typescript
 * import { configureSdk } from '@coalescefi/sdk';
 *
 * // Option 1: Explicit program ID
 * configureSdk({ programId: new PublicKey('...') });
 *
 * // Option 2: Network-based resolution
 * configureSdk({ network: 'mainnet' });
 *
 * // Option 3: Environment variables (automatic)
 * // Set COALESCEFI_PROGRAM_ID or COALESCEFI_NETWORK
 * ```
 *
 * ## Solana Kit Compatibility
 *
 * For projects using @solana/kit (web3.js 2.0), use the compat module:
 *
 * ```typescript
 * import { publicKeyToAddress, addressToPublicKey } from '@coalescefi/sdk';
 *
 * // Convert legacy PublicKey to new Address
 * const addr = publicKeyToAddress(legacyPubkey);
 *
 * // Convert new Address to legacy PublicKey
 * const pubkey = addressToPublicKey(newAddress);
 * ```
 */

// Re-export types
export * from './types';

// Export pdas but exclude seed constants (they come from constants.ts)
export {
  findProgramDataPda,
  findProtocolConfigPda,
  findMarketPda,
  findMarketAuthorityPda,
  findVaultPda,
  findLenderPositionPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  deriveMarketPdas,
  BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
} from './pdas';

export * from './instructions';
export * from './accounts';
export * from './errors';
export * from './constants';

// Export Solana Kit compatibility utilities
export {
  publicKeyToAddress,
  addressToPublicKey,
  createAddress,
  isValidAddress,
  derivePda,
  derivePdaSync,
  encodeAddress,
  decodeAddress,
  address,
  isAddress,
} from './compat';

export type { Address, ProgramDerivedAddress } from './compat';

// Export idempotency utilities
// Note: generateIdempotencyKey is exported from instructions.ts (random UUID generator)
// For deterministic key generation based on params, import generateIdempotencyKey directly from './idempotency'
export {
  IdempotencyManager,
  IdempotencyError,
  MemoryStorage,
  generateUniqueIdempotencyKey,
  withIdempotency,
} from './idempotency';

export type {
  PendingOperation,
  IdempotencyStorage,
  IdempotencyManagerOptions,
  IdempotentResult,
} from './idempotency';
