import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import {
  findProtocolConfigPda,
  findLenderPositionPda,
  findMarketAuthorityPda,
  findHaircutStatePda,
  findBlacklistCheckPda,
  findBorrowerWhitelistPda,
  findVaultPda,
  findProgramDataPda,
} from '../pdas';
import { configFieldToPublicKey } from '../types';

import type { ProtocolCache } from './cache';
import type { Connection, TransactionInstruction } from '@solana/web3.js';

/** System program ID constant. */
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

// ─── Resolved Account Sets ──────────────────────────────────

export interface ResolvedLenderAccounts {
  protocolConfig: PublicKey;
  lenderPosition: PublicKey;
  marketAuthority: PublicKey;
  haircutState: PublicKey;
  blacklistCheck: PublicKey;
  lenderTokenAccount: PublicKey;
  vault: PublicKey;
  tokenProgram: PublicKey;
}

export interface ResolvedBorrowerAccounts {
  protocolConfig: PublicKey;
  marketAuthority: PublicKey;
  borrowerWhitelist: PublicKey;
  blacklistCheck: PublicKey;
  borrowerTokenAccount: PublicKey;
  vault: PublicKey;
  tokenProgram: PublicKey;
}

export interface ResolvedSettlementAccounts {
  protocolConfig: PublicKey;
  marketAuthority: PublicKey;
  haircutState: PublicKey;
  vault: PublicKey;
  tokenProgram: PublicKey;
}

// ─── Blacklist Resolution ───────────────────────────────────

async function resolveBlacklistCheck(
  connection: Connection,
  cache: ProtocolCache,
  programId: PublicKey,
  address: PublicKey
): Promise<PublicKey> {
  const { data: config } = await cache.getProtocolConfig(connection, programId);
  const blacklistProgram = configFieldToPublicKey(config.blacklistProgram);
  const [pda] = findBlacklistCheckPda(address, blacklistProgram);
  return pda;
}

// ─── ATA Resolution ─────────────────────────────────────────

async function resolveAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  // Allow off-curve owners (PDAs like Squads vaults) to derive ATAs correctly
  return getAssociatedTokenAddress(mint, owner, true, TOKEN_PROGRAM_ID);
}

/**
 * Build the instruction(s) that guarantee a token-transfer recipient's
 * associated token account (ATA) exists before the transfer runs.
 *
 * The Coalesce program transfers SPL tokens to user-owned token accounts in
 * `borrow`, `withdraw`, `claimHaircut`, `withdrawExcess`, and `collectFees`. If
 * the destination ATA does not exist the program rejects the transfer with
 * `InvalidAccountOwner` — a zero-lamport, System-owned address is not owned by
 * the token program. Prepending an *idempotent* create-ATA makes these flows
 * self-healing: it creates the canonical ATA when it is missing and is a no-op
 * (no rent charged, no error) when it already exists.
 *
 * The recipient is both the ATA owner and the rent payer. Every one of these
 * flows requires the recipient to sign the instruction (the program enforces
 * `is_signer` on the borrower / lender / fee authority), so the recipient is
 * always a valid payer regardless of whether it is on- or off-curve:
 *  - an EOA wallet signs and funds the transaction directly;
 *  - a PDA recipient (e.g. a Squads vault) signs and funds via the multisig's
 *    `invoke_signed` when the wrapped instructions execute.
 * `allowOwnerOffCurve` is therefore enabled so PDA recipients self-heal too.
 *
 * Returns `[]` only when `tokenAccount` is a caller-supplied override that is
 * not the recipient's canonical ATA — creating the canonical ATA would be
 * pointless because the transfer targets a different account.
 */
export async function buildRecipientAtaIxs(
  recipient: PublicKey,
  mint: PublicKey,
  tokenAccount: PublicKey
): Promise<TransactionInstruction[]> {
  const canonicalAta = await getAssociatedTokenAddress(mint, recipient, true, TOKEN_PROGRAM_ID);
  if (!tokenAccount.equals(canonicalAta)) {
    return [];
  }
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      recipient, // payer — signs via wallet (EOA) or multisig invoke_signed (PDA)
      canonicalAta,
      recipient, // owner
      mint,
      TOKEN_PROGRAM_ID
    ),
  ];
}

// ─── Lender Account Resolution ──────────────────────────────

export async function resolveLenderAccounts(
  connection: Connection,
  cache: ProtocolCache,
  programId: PublicKey,
  marketPda: PublicKey,
  lender: PublicKey,
  mint: PublicKey,
  overrides?: { lenderTokenAccount?: PublicKey }
): Promise<ResolvedLenderAccounts> {
  const [protocolConfig] = findProtocolConfigPda(programId);
  const [lenderPosition] = findLenderPositionPda(marketPda, lender, programId);
  const [marketAuthority] = findMarketAuthorityPda(marketPda, programId);
  const [haircutState] = findHaircutStatePda(marketPda, programId);
  const blacklistCheck = await resolveBlacklistCheck(connection, cache, programId, lender);

  const lenderTokenAccount = overrides?.lenderTokenAccount ?? (await resolveAta(lender, mint));

  return {
    protocolConfig,
    lenderPosition,
    marketAuthority,
    haircutState,
    blacklistCheck,
    lenderTokenAccount,
    vault: getVault(marketPda, programId),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

// ─── Borrower Account Resolution ────────────────────────────

export async function resolveBorrowerAccounts(
  connection: Connection,
  cache: ProtocolCache,
  programId: PublicKey,
  marketPda: PublicKey,
  borrower: PublicKey,
  mint: PublicKey,
  overrides?: { borrowerTokenAccount?: PublicKey }
): Promise<ResolvedBorrowerAccounts> {
  const [protocolConfig] = findProtocolConfigPda(programId);
  const [marketAuthority] = findMarketAuthorityPda(marketPda, programId);
  const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower, programId);
  const blacklistCheck = await resolveBlacklistCheck(connection, cache, programId, borrower);

  const borrowerTokenAccount =
    overrides?.borrowerTokenAccount ?? (await resolveAta(borrower, mint));

  return {
    protocolConfig,
    marketAuthority,
    borrowerWhitelist,
    blacklistCheck,
    borrowerTokenAccount,
    vault: getVault(marketPda, programId),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

// ─── Settlement Account Resolution ──────────────────────────

export function resolveSettlementAccounts(
  programId: PublicKey,
  marketPda: PublicKey
): ResolvedSettlementAccounts {
  const [protocolConfig] = findProtocolConfigPda(programId);
  const [marketAuthority] = findMarketAuthorityPda(marketPda, programId);
  const [haircutState] = findHaircutStatePda(marketPda, programId);
  const [vault] = findVaultPda(marketPda, programId);

  return {
    protocolConfig,
    marketAuthority,
    haircutState,
    vault,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function getVault(marketPda: PublicKey, programId: PublicKey): PublicKey {
  const [vault] = findVaultPda(marketPda, programId);
  return vault;
}

export function getSystemProgramId(): PublicKey {
  return SYSTEM_PROGRAM_ID;
}

export function getProgramDataPda(programId: PublicKey): PublicKey {
  const [pda] = findProgramDataPda(programId);
  return pda;
}
