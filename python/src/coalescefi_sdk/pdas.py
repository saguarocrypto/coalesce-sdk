"""
CoalesceFi SDK PDA Derivation Functions.

This module provides all PDA (Program Derived Address) derivation functions
for the CoalesceFi protocol.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

from solders.pubkey import Pubkey

from .constants import (
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
    SEED_BLACKLIST,
    SEED_BORROWER_WHITELIST,
    SEED_HAIRCUT_STATE,
    SEED_LENDER,
    SEED_MARKET,
    SEED_MARKET_AUTHORITY,
    SEED_PROTOCOL_CONFIG,
    SEED_VAULT,
    get_program_id,
)


def _u64_to_le_bytes(value: int) -> bytes:
    """Convert a u64 to little-endian bytes."""
    return struct.pack("<Q", value)


def find_program_data_pda(program_id: Pubkey | None = None) -> tuple[Pubkey, int]:
    """
    Find the Program Data PDA for a given program.
    This is used to verify the upgrade authority during initialization.

    Seeds: [program_id] with BPF Loader Upgradeable as the program.

    Args:
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address(
        [bytes(resolved_program_id)], BPF_LOADER_UPGRADEABLE_PROGRAM_ID
    )


def find_protocol_config_pda(program_id: Pubkey | None = None) -> tuple[Pubkey, int]:
    """
    Find the ProtocolConfig PDA.

    Seeds: [SEED_PROTOCOL_CONFIG]

    Args:
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address([SEED_PROTOCOL_CONFIG], resolved_program_id)


def find_market_pda(
    borrower: Pubkey, market_nonce: int, program_id: Pubkey | None = None
) -> tuple[Pubkey, int]:
    """
    Find a Market PDA.

    Seeds: [SEED_MARKET, borrower_pubkey, market_nonce (u64 LE)]

    Args:
        borrower: The borrower's public key.
        market_nonce: The market nonce (u64).
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address(
        [SEED_MARKET, bytes(borrower), _u64_to_le_bytes(market_nonce)],
        resolved_program_id,
    )


def find_market_authority_pda(
    market: Pubkey, program_id: Pubkey | None = None
) -> tuple[Pubkey, int]:
    """
    Find a Market Authority PDA.

    Seeds: [SEED_MARKET_AUTHORITY, market_pubkey]

    Args:
        market: The market's public key.
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address([SEED_MARKET_AUTHORITY, bytes(market)], resolved_program_id)


def find_vault_pda(market: Pubkey, program_id: Pubkey | None = None) -> tuple[Pubkey, int]:
    """
    Find a Vault PDA.

    Seeds: [SEED_VAULT, market_pubkey]

    Args:
        market: The market's public key.
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address([SEED_VAULT, bytes(market)], resolved_program_id)


def find_lender_position_pda(
    market: Pubkey, lender: Pubkey, program_id: Pubkey | None = None
) -> tuple[Pubkey, int]:
    """
    Find a LenderPosition PDA.

    Seeds: [SEED_LENDER, market, lender]

    Args:
        market: The market's public key.
        lender: The lender's public key.
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address(
        [SEED_LENDER, bytes(market), bytes(lender)], resolved_program_id
    )


def find_borrower_whitelist_pda(
    borrower: Pubkey, program_id: Pubkey | None = None
) -> tuple[Pubkey, int]:
    """
    Find a BorrowerWhitelist PDA.

    Seeds: [SEED_BORROWER_WHITELIST, borrower]

    Args:
        borrower: The borrower's public key.
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address(
        [SEED_BORROWER_WHITELIST, bytes(borrower)], resolved_program_id
    )


def find_haircut_state_pda(
    market: Pubkey, program_id: Pubkey | None = None
) -> tuple[Pubkey, int]:
    """
    Find a HaircutState PDA.

    Seeds: [SEED_HAIRCUT_STATE, market]

    Args:
        market: The market's public key.
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Pubkey.find_program_address([SEED_HAIRCUT_STATE, bytes(market)], resolved_program_id)


def find_blacklist_check_pda(address: Pubkey, blacklist_program: Pubkey) -> tuple[Pubkey, int]:
    """
    Find a Blacklist check PDA (for external blacklist program).

    Seeds: [SEED_BLACKLIST, address]

    Args:
        address: The address to check.
        blacklist_program: The blacklist program's public key.

    Returns:
        A tuple of (PDA address, bump seed).
    """
    return Pubkey.find_program_address([SEED_BLACKLIST, bytes(address)], blacklist_program)


@dataclass(frozen=True)
class PdaWithBump:
    """A PDA address with its bump seed."""

    address: Pubkey
    bump: int


@dataclass(frozen=True)
class MarketPdas:
    """All PDAs needed for a market."""

    market: PdaWithBump
    market_authority: PdaWithBump
    vault: PdaWithBump


def derive_market_pdas(
    borrower: Pubkey, market_nonce: int, program_id: Pubkey | None = None
) -> MarketPdas:
    """
    Derive all PDAs needed for creating a new market.

    Market PDA depends on borrower + nonce; authority and vault depend on market pubkey.

    Args:
        borrower: The borrower's public key.
        market_nonce: The market nonce (u64).
        program_id: The program ID. If not provided, uses the configured program ID.

    Returns:
        MarketPdas containing market, market_authority, and vault PDAs with bumps.
    """
    resolved_program_id = program_id if program_id is not None else get_program_id()

    market_address, market_bump = find_market_pda(borrower, market_nonce, resolved_program_id)
    market_authority_address, market_authority_bump = find_market_authority_pda(
        market_address, resolved_program_id
    )
    vault_address, vault_bump = find_vault_pda(market_address, resolved_program_id)

    return MarketPdas(
        market=PdaWithBump(address=market_address, bump=market_bump),
        market_authority=PdaWithBump(address=market_authority_address, bump=market_authority_bump),
        vault=PdaWithBump(address=vault_address, bump=vault_bump),
    )
