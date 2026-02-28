/**
 * Compatibility layer for Solana Kit / web3.js 2.0
 *
 * This module provides utilities for interoperability between:
 * - Legacy @solana/web3.js 1.x (PublicKey, Connection, etc.)
 * - New @solana/kit / web3.js 2.0 (Address, Rpc, etc.)
 *
 * The @solana/compat library bridges the two ecosystems.
 */

import {
  address,
  type Address,
  isAddress,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  type ProgramDerivedAddress,
} from '@solana/addresses';
import { PublicKey } from '@solana/web3.js';

/**
 * Convert a legacy PublicKey to a Solana Kit Address.
 *
 * @param pubkey - Legacy PublicKey from @solana/web3.js 1.x
 * @returns Address compatible with @solana/kit
 */
export function publicKeyToAddress(pubkey: PublicKey): Address {
  return address(pubkey.toBase58());
}

/**
 * Convert a Solana Kit Address to a legacy PublicKey.
 *
 * @param addr - Address from @solana/kit
 * @returns PublicKey compatible with @solana/web3.js 1.x
 */
export function addressToPublicKey(addr: Address): PublicKey {
  return new PublicKey(addr);
}

/**
 * Create an Address from a base58 string.
 * Validates the address format.
 *
 * @param base58 - Base58-encoded address string
 * @returns Address if valid
 * @throws Error if the string is not a valid address
 */
export function createAddress(base58: string): Address {
  return address(base58);
}

/**
 * Check if a string is a valid Solana address.
 *
 * @param maybeAddress - String to check
 * @returns true if the string is a valid base58 address
 */
export function isValidAddress(maybeAddress: string): boolean {
  return isAddress(maybeAddress);
}

/**
 * Derive a program-derived address using Solana Kit APIs.
 *
 * @param seeds - Array of seed buffers
 * @param programAddress - Program address to derive from
 * @returns Promise resolving to PDA address and bump
 */
export async function derivePda(
  seeds: Uint8Array[],
  programAddress: Address
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    seeds,
    programAddress,
  });
}

/**
 * Derive a PDA synchronously using legacy APIs for backwards compatibility.
 * Wraps the async derivePda for use in sync contexts.
 *
 * @param seeds - Array of seed buffers
 * @param programId - Program PublicKey
 * @returns [PublicKey, bump] tuple
 */
export function derivePdaSync(
  seeds: (Buffer | Uint8Array)[],
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

/**
 * Encode an address to bytes.
 *
 * @param addr - Address to encode
 * @returns Uint8Array of address bytes (32 bytes)
 */
export function encodeAddress(addr: Address): Uint8Array {
  const encoder = getAddressEncoder();
  // Create a mutable copy since encode() returns ReadonlyUint8Array
  return Uint8Array.from(encoder.encode(addr));
}

/**
 * Decode bytes to an address.
 *
 * @param bytes - 32 bytes representing an address
 * @returns Address
 */
export function decodeAddress(bytes: Uint8Array): Address {
  const decoder = getAddressDecoder();
  return decoder.decode(bytes);
}

// Re-export types for convenience
export type { Address, ProgramDerivedAddress };
export { address, isAddress };
