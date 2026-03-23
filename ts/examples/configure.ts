/**
 * Example: SDK Configuration
 *
 * Configure the SDK before calling any instruction builders or PDA helpers.
 * Must be called once at application startup.
 */

import { PublicKey } from '@solana/web3.js';

import { configureSdk, getProgramId } from '@coalescefi/sdk';

// ─── Option 1: Explicit program ID ──────────────────────────

configureSdk({
  programId: new PublicKey('GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR'),
});

// ─── Option 2: Network-based resolution ─────────────────────

configureSdk({ network: 'mainnet' });

// ─── Option 3: Environment variables (automatic) ────────────
// Set COALESCEFI_PROGRAM_ID or COALESCEFI_NETWORK in your environment.
// The SDK reads these automatically when no explicit config is provided.

// ─── Verify resolved program ID ─────────────────────────────

const programId = getProgramId();
console.log('Using program ID:', programId.toBase58());
