"""
CoalesceFi SDK Account Decoders.

This module provides functions to decode on-chain account data and fetch
accounts with retry logic.
"""

from __future__ import annotations

import asyncio
import random
import struct
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal, TypeVar

from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

from .constants import (
    BORROWER_WHITELIST_SIZE,
    DISC_BORROWER_WL,
    DISC_LENDER_POSITION,
    DISC_MARKET,
    DISC_PROTOCOL_CONFIG,
    LENDER_POSITION_SIZE,
    MARKET_SIZE,
    PROTOCOL_CONFIG_SIZE,
)
from .types import BorrowerWhitelist, LenderPosition, Market, ProtocolConfig

# =============================================================================
# Retry Configuration
# =============================================================================


@dataclass
class RetryConfig:
    """Configuration for retry behavior on RPC calls."""

    max_retries: int = 3
    base_delay_ms: int = 1000
    max_delay_ms: int = 10000


DEFAULT_RETRY_CONFIG = RetryConfig()


_T = TypeVar("_T")


def _is_retryable_error(error: Exception) -> bool:
    """Check if an error is retryable (network errors, rate limits, server errors)."""
    message = str(error).lower()
    # Network errors
    if any(x in message for x in ["network", "timeout", "econnreset", "connection"]):
        return True
    # Rate limiting
    if any(x in message for x in ["429", "rate limit"]):
        return True
    # Server errors (502, 503, 504)
    return any(x in message for x in ["502", "503", "504"])


async def _with_retry(
    fn: Callable[[], Awaitable[_T]],
    config: RetryConfig | None = None,
) -> _T:
    """Execute an async function with exponential backoff retry logic."""
    cfg = config or DEFAULT_RETRY_CONFIG
    last_error: Exception | None = None

    for attempt in range(cfg.max_retries + 1):
        try:
            return await fn()
        except Exception as error:
            last_error = error

            # Don't retry non-retryable errors
            if not _is_retryable_error(error):
                raise

            # Don't retry if we've exhausted attempts
            if attempt >= cfg.max_retries:
                raise

            # Calculate delay with exponential backoff and jitter
            exponential_delay = cfg.base_delay_ms * (2**attempt)
            jitter = random.random() * 0.1 * exponential_delay
            delay = min(exponential_delay + jitter, cfg.max_delay_ms)

            await asyncio.sleep(delay / 1000)

    raise last_error or Exception("Unknown error during retry")


# =============================================================================
# Buffer Reading Helpers
# =============================================================================


def _read_u8(data: bytes, offset: int) -> int:
    """Read a u8 from bytes at the given offset."""
    return data[offset]


def _read_u16_le(data: bytes, offset: int) -> int:
    """Read a u16 from bytes at the given offset (little-endian)."""
    return struct.unpack_from("<H", data, offset)[0]


def _read_u64_le(data: bytes, offset: int) -> int:
    """Read a u64 from bytes at the given offset (little-endian)."""
    return struct.unpack_from("<Q", data, offset)[0]


def _read_i64_le(data: bytes, offset: int) -> int:
    """Read an i64 from bytes at the given offset (little-endian)."""
    return struct.unpack_from("<q", data, offset)[0]


def _read_u128_le(data: bytes, offset: int) -> int:
    """Read a u128 from bytes at the given offset (little-endian)."""
    low = _read_u64_le(data, offset)
    high = _read_u64_le(data, offset + 8)
    return low + (high << 64)


def _read_pubkey(data: bytes, offset: int) -> Pubkey:
    """Read a PublicKey from bytes at the given offset."""
    return Pubkey.from_bytes(data[offset : offset + 32])


def _check_discriminator(data: bytes, expected: bytes, account_type: str) -> None:
    """Check that the first 8 bytes of data match the expected discriminator."""
    if data[:8] != expected:
        raise ValueError(f"Invalid {account_type} discriminator")


# =============================================================================
# Account Decoders
# =============================================================================


def decode_protocol_config(data: bytes) -> ProtocolConfig:
    """
    Decode a ProtocolConfig account from raw bytes.

    Layout (194 bytes):
    - discriminator: [u8; 8]          (0-7)
    - version: u8                     (8)
    - admin: [u8; 32]                 (9-40)
    - fee_rate_bps: [u8; 2]           (41-42)
    - fee_authority: [u8; 32]         (43-74)
    - whitelist_manager: [u8; 32]     (75-106)
    - blacklist_program: [u8; 32]     (107-138)
    - is_initialized: u8              (139)
    - bump: u8                        (140)
    - paused: u8                      (141)
    - blacklist_mode: u8              (142)
    - _padding: [u8; 51]              (143-193)

    Args:
        data: Raw account data bytes.

    Returns:
        Decoded ProtocolConfig.

    Raises:
        ValueError: If data is invalid.
    """
    if len(data) < PROTOCOL_CONFIG_SIZE:
        raise ValueError(
            f"Invalid ProtocolConfig data length: expected {PROTOCOL_CONFIG_SIZE}, got {len(data)}"
        )

    _check_discriminator(data, DISC_PROTOCOL_CONFIG, "ProtocolConfig")

    return ProtocolConfig(
        version=_read_u8(data, 8),
        admin=data[9:41],
        fee_rate_bps=_read_u16_le(data, 41),
        fee_authority=data[43:75],
        whitelist_manager=data[75:107],
        blacklist_program=data[107:139],
        is_initialized=_read_u8(data, 139) == 1,
        bump=_read_u8(data, 140),
        is_paused=_read_u8(data, 141) == 1,
        is_blacklist_fail_closed=_read_u8(data, 142) == 1,
    )


def decode_market(data: bytes) -> Market:
    """
    Decode a Market account from raw bytes.

    Layout (250 bytes):
    - discriminator: [u8; 8]                (0-7)
    - version: u8                           (8)
    - borrower: [u8; 32]                    (9-40)
    - mint: [u8; 32]                        (41-72)
    - vault: [u8; 32]                       (73-104)
    - market_authority_bump: u8             (105)
    - annual_interest_bps: [u8; 2]          (106-107)
    - maturity_timestamp: [u8; 8]           (108-115)
    - max_total_supply: [u8; 8]             (116-123)
    - market_nonce: [u8; 8]                 (124-131)
    - scaled_total_supply: [u8; 16]         (132-147)
    - scale_factor: [u8; 16]               (148-163)
    - accrued_protocol_fees: [u8; 8]        (164-171)
    - total_deposited: [u8; 8]              (172-179)
    - total_borrowed: [u8; 8]               (180-187)
    - total_repaid: [u8; 8]                 (188-195)
    - total_interest_repaid: [u8; 8]        (196-203)
    - last_accrual_timestamp: [u8; 8]       (204-211)
    - settlement_factor_wad: [u8; 16]       (212-227)
    - bump: u8                              (228)
    - _padding: [u8; 21]                    (229-249)

    Args:
        data: Raw account data bytes.

    Returns:
        Decoded Market.

    Raises:
        ValueError: If data is invalid.
    """
    if len(data) < MARKET_SIZE:
        raise ValueError(f"Invalid Market data length: expected {MARKET_SIZE}, got {len(data)}")

    _check_discriminator(data, DISC_MARKET, "Market")

    return Market(
        version=_read_u8(data, 8),
        borrower=_read_pubkey(data, 9),
        mint=_read_pubkey(data, 41),
        vault=_read_pubkey(data, 73),
        market_authority_bump=_read_u8(data, 105),
        annual_interest_bps=_read_u16_le(data, 106),
        maturity_timestamp=_read_i64_le(data, 108),
        max_total_supply=_read_u64_le(data, 116),
        market_nonce=_read_u64_le(data, 124),
        scaled_total_supply=_read_u128_le(data, 132),
        scale_factor=_read_u128_le(data, 148),
        accrued_protocol_fees=_read_u64_le(data, 164),
        total_deposited=_read_u64_le(data, 172),
        total_borrowed=_read_u64_le(data, 180),
        total_repaid=_read_u64_le(data, 188),
        total_interest_repaid=_read_u64_le(data, 196),
        last_accrual_timestamp=_read_i64_le(data, 204),
        settlement_factor_wad=_read_u128_le(data, 212),
        bump=_read_u8(data, 228),
    )


def decode_lender_position(data: bytes) -> LenderPosition:
    """
    Decode a LenderPosition account from raw bytes.

    Layout (128 bytes):
    - discriminator: [u8; 8]      (0-7)
    - version: u8                 (8)
    - market: [u8; 32]            (9-40)
    - lender: [u8; 32]            (41-72)
    - scaled_balance: [u8; 16]    (73-88)
    - bump: u8                    (89)
    - _padding: [u8; 38]          (90-127)

    Args:
        data: Raw account data bytes.

    Returns:
        Decoded LenderPosition.

    Raises:
        ValueError: If data is invalid.
    """
    if len(data) < LENDER_POSITION_SIZE:
        raise ValueError(
            f"Invalid LenderPosition data length: expected {LENDER_POSITION_SIZE}, got {len(data)}"
        )

    _check_discriminator(data, DISC_LENDER_POSITION, "LenderPosition")

    return LenderPosition(
        version=_read_u8(data, 8),
        market=_read_pubkey(data, 9),
        lender=_read_pubkey(data, 41),
        scaled_balance=_read_u128_le(data, 73),
        bump=_read_u8(data, 89),
    )


def decode_borrower_whitelist(data: bytes) -> BorrowerWhitelist:
    """
    Decode a BorrowerWhitelist account from raw bytes.

    Layout (96 bytes):
    - discriminator: [u8; 8]          (0-7)
    - version: u8                     (8)
    - borrower: [u8; 32]              (9-40)
    - is_whitelisted: u8              (41)
    - max_borrow_capacity: [u8; 8]    (42-49)
    - current_borrowed: [u8; 8]       (50-57)
    - bump: u8                        (58)
    - _padding: [u8; 37]              (59-95)

    Args:
        data: Raw account data bytes.

    Returns:
        Decoded BorrowerWhitelist.

    Raises:
        ValueError: If data is invalid.
    """
    if len(data) < BORROWER_WHITELIST_SIZE:
        raise ValueError(
            f"Invalid BorrowerWhitelist data length: expected {BORROWER_WHITELIST_SIZE}, "
            f"got {len(data)}"
        )

    _check_discriminator(data, DISC_BORROWER_WL, "BorrowerWhitelist")

    return BorrowerWhitelist(
        version=_read_u8(data, 8),
        borrower=_read_pubkey(data, 9),
        is_whitelisted=_read_u8(data, 41) == 1,
        max_borrow_capacity=_read_u64_le(data, 42),
        current_borrowed=_read_u64_le(data, 50),
        bump=_read_u8(data, 58),
    )


# =============================================================================
# Account Fetchers
# =============================================================================


async def fetch_protocol_config(
    connection: AsyncClient,
    address: Pubkey,
    retry_config: RetryConfig | None = None,
) -> ProtocolConfig | None:
    """
    Fetch and decode a ProtocolConfig account.
    Uses exponential backoff retry for resilience against transient RPC failures.

    Args:
        connection: Solana RPC connection.
        address: The account address.
        retry_config: Optional retry configuration.

    Returns:
        Decoded ProtocolConfig or None if account doesn't exist.
    """

    async def _fetch() -> ProtocolConfig | None:
        resp = await connection.get_account_info(address)
        if resp.value is None:
            return None
        return decode_protocol_config(bytes(resp.value.data))

    return await _with_retry(_fetch, retry_config)


async def fetch_market(
    connection: AsyncClient,
    address: Pubkey,
    retry_config: RetryConfig | None = None,
) -> Market | None:
    """
    Fetch and decode a Market account.
    Uses exponential backoff retry for resilience against transient RPC failures.

    Args:
        connection: Solana RPC connection.
        address: The account address.
        retry_config: Optional retry configuration.

    Returns:
        Decoded Market or None if account doesn't exist.
    """

    async def _fetch() -> Market | None:
        resp = await connection.get_account_info(address)
        if resp.value is None:
            return None
        return decode_market(bytes(resp.value.data))

    return await _with_retry(_fetch, retry_config)


async def fetch_lender_position(
    connection: AsyncClient,
    address: Pubkey,
    retry_config: RetryConfig | None = None,
) -> LenderPosition | None:
    """
    Fetch and decode a LenderPosition account.
    Uses exponential backoff retry for resilience against transient RPC failures.

    Args:
        connection: Solana RPC connection.
        address: The account address.
        retry_config: Optional retry configuration.

    Returns:
        Decoded LenderPosition or None if account doesn't exist.
    """

    async def _fetch() -> LenderPosition | None:
        resp = await connection.get_account_info(address)
        if resp.value is None:
            return None
        return decode_lender_position(bytes(resp.value.data))

    return await _with_retry(_fetch, retry_config)


async def fetch_borrower_whitelist(
    connection: AsyncClient,
    address: Pubkey,
    retry_config: RetryConfig | None = None,
) -> BorrowerWhitelist | None:
    """
    Fetch and decode a BorrowerWhitelist account.
    Uses exponential backoff retry for resilience against transient RPC failures.

    Args:
        connection: Solana RPC connection.
        address: The account address.
        retry_config: Optional retry configuration.

    Returns:
        Decoded BorrowerWhitelist or None if account doesn't exist.
    """

    async def _fetch() -> BorrowerWhitelist | None:
        resp = await connection.get_account_info(address)
        if resp.value is None:
            return None
        return decode_borrower_whitelist(bytes(resp.value.data))

    return await _with_retry(_fetch, retry_config)


# =============================================================================
# Account Type Detection
# =============================================================================

AccountType = Literal["ProtocolConfig", "Market", "LenderPosition", "BorrowerWhitelist"]


def get_account_type(data_length: int) -> AccountType | None:
    """
    Determine account type from data length.

    Args:
        data_length: The length of the account data in bytes.

    Returns:
        The account type name, or None if unknown.
    """
    if data_length == PROTOCOL_CONFIG_SIZE:
        return "ProtocolConfig"
    elif data_length == MARKET_SIZE:
        return "Market"
    elif data_length == LENDER_POSITION_SIZE:
        return "LenderPosition"
    elif data_length == BORROWER_WHITELIST_SIZE:
        return "BorrowerWhitelist"
    return None


def decode_account(
    data: bytes,
) -> ProtocolConfig | Market | LenderPosition | BorrowerWhitelist | None:
    """
    Decode any CoalesceFi account from raw data.

    Args:
        data: Raw account data bytes.

    Returns:
        The decoded account, or None if type is unknown.
    """
    account_type = get_account_type(len(data))
    if account_type == "ProtocolConfig":
        return decode_protocol_config(data)
    elif account_type == "Market":
        return decode_market(data)
    elif account_type == "LenderPosition":
        return decode_lender_position(data)
    elif account_type == "BorrowerWhitelist":
        return decode_borrower_whitelist(data)
    return None
