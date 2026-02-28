"""
CoalesceFi SDK Constants.

This module contains all constants used by the CoalesceFi protocol including:
- Program IDs for different networks
- PDA seed constants
- Mathematical constants
- Account sizes and discriminators
- Instruction discriminators
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import IntEnum
from typing import Literal

from solders.pubkey import Pubkey

# =============================================================================
# Type Definitions
# =============================================================================

NetworkName = Literal["mainnet", "devnet", "localnet"]


@dataclass
class SdkConfig:
    """SDK configuration options."""

    program_id: Pubkey | None = None
    network: NetworkName | None = None


# =============================================================================
# Default Program IDs
# =============================================================================

DEFAULT_PROGRAM_IDS: dict[NetworkName, str] = {
    "mainnet": "GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR",
    # Note: devnet uses the same program ID as mainnet — there is no separate devnet deployment.
    # This entry exists for forward-compatibility if a devnet-specific deployment is added later.
    "devnet": "GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR",
    "localnet": "2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy",
}

# =============================================================================
# Global Configuration
# =============================================================================

_global_config = SdkConfig()
_cached_program_id: Pubkey | None = None


def configure_sdk(program_id: Pubkey | None = None, network: NetworkName | None = None) -> None:
    """
    Configure the SDK with custom settings.
    Call this once at application startup.

    Args:
        program_id: Explicit program ID to use for all operations.
        network: Network name for program ID resolution ('mainnet', 'devnet', 'localnet').

    Example:
        # Option 1: Explicit program ID
        configure_sdk(program_id=Pubkey.from_string('...'))

        # Option 2: Network-based resolution
        configure_sdk(network='mainnet')
    """
    global _global_config, _cached_program_id
    _global_config = SdkConfig(program_id=program_id, network=network)
    _cached_program_id = None  # Clear cache when config changes


def reset_sdk_config() -> None:
    """
    Reset SDK configuration to defaults.
    Useful for testing.
    """
    global _global_config, _cached_program_id
    _global_config = SdkConfig()
    _cached_program_id = None


def get_sdk_config() -> SdkConfig:
    """Get the current SDK configuration."""
    return SdkConfig(program_id=_global_config.program_id, network=_global_config.network)


def resolve_program_id() -> Pubkey:
    """
    Resolve the program ID based on configuration priority:
    1. Explicit program_id in global config
    2. COALESCEFI_PROGRAM_ID environment variable
    3. Network from global config
    4. COALESCEFI_NETWORK environment variable
    5. Default to localnet (for development)

    Returns:
        The resolved program ID.

    Raises:
        ValueError: If an invalid program ID or network is specified.
    """
    # Priority 1: Explicit program_id in config
    if _global_config.program_id is not None:
        return _global_config.program_id

    # Priority 2: Environment variable for explicit program ID
    env_program_id = os.environ.get("COALESCEFI_PROGRAM_ID")
    if env_program_id:
        try:
            return Pubkey.from_string(env_program_id)
        except Exception as e:
            raise ValueError(
                f'Invalid COALESCEFI_PROGRAM_ID environment variable: "{env_program_id}". '
                "Must be a valid base58-encoded Solana public key."
            ) from e

    # Priority 3: Network from config
    if _global_config.network is not None:
        program_id_str = DEFAULT_PROGRAM_IDS[_global_config.network]
        if program_id_str == "11111111111111111111111111111111":
            raise ValueError(
                f'Program ID for network "{_global_config.network}" is not configured. '
                "Please set COALESCEFI_PROGRAM_ID environment variable or use configure_sdk() "
                "with an explicit program_id."
            )
        return Pubkey.from_string(program_id_str)

    # Priority 4: Environment variable for network
    env_network = os.environ.get("COALESCEFI_NETWORK")
    if env_network:
        if env_network not in DEFAULT_PROGRAM_IDS:
            raise ValueError(
                f'Invalid COALESCEFI_NETWORK environment variable: "{env_network}". '
                f"Must be one of: {', '.join(DEFAULT_PROGRAM_IDS.keys())}"
            )
        program_id_str = DEFAULT_PROGRAM_IDS[env_network]  # type: ignore[index]
        if program_id_str == "11111111111111111111111111111111":
            raise ValueError(
                f'Program ID for network "{env_network}" is not configured. '
                "Please set COALESCEFI_PROGRAM_ID environment variable."
            )
        return Pubkey.from_string(program_id_str)

    # Priority 5: Default to localnet for development
    return Pubkey.from_string(DEFAULT_PROGRAM_IDS["localnet"])


def get_program_id() -> Pubkey:
    """
    Get the program ID, resolving from configuration.
    This is the preferred way to get the program ID.
    """
    global _cached_program_id
    if _cached_program_id is None:
        _cached_program_id = resolve_program_id()
    return _cached_program_id


def clear_program_id_cache() -> None:
    """Clear the cached program ID."""
    global _cached_program_id
    _cached_program_id = None


# =============================================================================
# PDA Seed Constants
# =============================================================================

SEED_PROTOCOL_CONFIG = b"protocol_config"
SEED_MARKET = b"market"
SEED_MARKET_AUTHORITY = b"market_authority"
SEED_LENDER = b"lender"
SEED_VAULT = b"vault"
SEED_BORROWER_WHITELIST = b"borrower_whitelist"
SEED_BLACKLIST = b"blacklist"

# =============================================================================
# Mathematical Constants
# =============================================================================

WAD: int = 10**18  # 1e18 for fixed-point precision
BPS: int = 10_000  # Basis points denominator
SECONDS_PER_YEAR: int = 31_536_000  # 365 days

# =============================================================================
# Protocol Limits
# =============================================================================

MAX_ANNUAL_INTEREST_BPS: int = 10_000  # 100% annual max
MAX_FEE_RATE_BPS: int = 10_000  # 100% fee rate max
USDC_DECIMALS: int = 6
MIN_MATURITY_DELTA: int = 60  # Minimum seconds until maturity
SETTLEMENT_GRACE_PERIOD: int = 300  # 5 minutes - prevents front-running settlement

# =============================================================================
# Account Sizes
# =============================================================================

PROTOCOL_CONFIG_SIZE: int = 194
MARKET_SIZE: int = 250
LENDER_POSITION_SIZE: int = 128
BORROWER_WHITELIST_SIZE: int = 96

# =============================================================================
# Account Discriminators (8 bytes)
# =============================================================================

DISC_PROTOCOL_CONFIG = b"COALPC__"
DISC_MARKET = b"COALMKT_"
DISC_LENDER_POSITION = b"COALLPOS"
DISC_BORROWER_WL = b"COALBWL_"

# =============================================================================
# Instruction Discriminators
# =============================================================================


class InstructionDiscriminator(IntEnum):
    """
    Instruction discriminators for the CoalesceFi protocol.

    These MUST match the Rust program's lib.rs dispatch exactly.

    Categories:
    - ADMIN/SETUP (0-2): Protocol initialization and configuration
    - CORE LENDING (3-7): Deposit, borrow, repay, withdraw operations
    - SETTLEMENT (8-11): Post-maturity operations
    - ACCESS CONTROL (12-16): Whitelist and admin management
    """

    # ADMIN/SETUP (0-2)
    InitializeProtocol = 0
    SetFeeConfig = 1
    CreateMarket = 2

    # CORE LENDING (3-7)
    Deposit = 3
    Borrow = 4
    Repay = 5
    RepayInterest = 6
    Withdraw = 7

    # SETTLEMENT (8-11)
    CollectFees = 8
    ReSettle = 9
    CloseLenderPosition = 10
    WithdrawExcess = 11

    # ACCESS CONTROL (12-16)
    SetBorrowerWhitelist = 12
    SetPause = 13
    SetBlacklistMode = 14
    SetAdmin = 15
    SetWhitelistManager = 16


# =============================================================================
# Known Program Addresses
# =============================================================================

SPL_TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")
BPF_LOADER_UPGRADEABLE_PROGRAM_ID = Pubkey.from_string(
    "BPFLoaderUpgradeab1e11111111111111111111111"
)
MEMO_PROGRAM_ID = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

# =============================================================================
# Numeric Type Bounds
# =============================================================================

MAX_U64: int = (1 << 64) - 1
MAX_U128: int = (1 << 128) - 1
MAX_I64: int = (1 << 63) - 1
MIN_I64: int = -(1 << 63)
