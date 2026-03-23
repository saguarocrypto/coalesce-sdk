"""
CoalesceFi SDK Instruction Builders.

This module provides all instruction builders for the CoalesceFi protocol.
Each function creates a Solana instruction that can be added to a transaction.
"""

from __future__ import annotations

import struct
from typing import TypedDict

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey

from .constants import (
    MAX_U64,
    MAX_U128,
    MEMO_PROGRAM_ID,
    InstructionDiscriminator,
    get_program_id,
)

# =============================================================================
# Type Definitions for Account Dicts
# =============================================================================


class InitializeProtocolAccountsDict(TypedDict):
    protocol_config: Pubkey
    admin: Pubkey
    fee_authority: Pubkey
    whitelist_manager: Pubkey
    blacklist_program: Pubkey
    system_program: Pubkey
    program_data: Pubkey


class SetFeeConfigAccountsDict(TypedDict):
    protocol_config: Pubkey
    admin: Pubkey
    new_fee_authority: Pubkey


class CreateMarketAccountsDict(TypedDict):
    market: Pubkey
    borrower: Pubkey
    mint: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    protocol_config: Pubkey
    borrower_whitelist: Pubkey
    blacklist_check: Pubkey
    system_program: Pubkey
    token_program: Pubkey


class DepositAccountsDict(TypedDict):
    market: Pubkey
    lender: Pubkey
    lender_token_account: Pubkey
    vault: Pubkey
    lender_position: Pubkey
    blacklist_check: Pubkey
    protocol_config: Pubkey
    mint: Pubkey
    token_program: Pubkey
    system_program: Pubkey


class BorrowAccountsDict(TypedDict):
    market: Pubkey
    borrower: Pubkey
    borrower_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    borrower_whitelist: Pubkey
    blacklist_check: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


class RepayAccountsDict(TypedDict):
    market: Pubkey
    payer: Pubkey
    payer_token_account: Pubkey
    vault: Pubkey
    protocol_config: Pubkey
    mint: Pubkey
    borrower_whitelist: Pubkey
    token_program: Pubkey


class RepayInterestAccountsDict(TypedDict):
    market: Pubkey
    payer: Pubkey
    payer_token_account: Pubkey
    vault: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


class WithdrawAccountsDict(TypedDict):
    market: Pubkey
    lender: Pubkey
    lender_token_account: Pubkey
    vault: Pubkey
    lender_position: Pubkey
    market_authority: Pubkey
    blacklist_check: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey
    haircut_state: Pubkey


class CollectFeesAccountsDict(TypedDict):
    market: Pubkey
    protocol_config: Pubkey
    fee_authority: Pubkey
    fee_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    token_program: Pubkey


class CloseLenderPositionAccountsDict(TypedDict):
    market: Pubkey
    lender: Pubkey
    lender_position: Pubkey
    system_program: Pubkey
    protocol_config: Pubkey


class ReSettleAccountsDict(TypedDict):
    market: Pubkey
    vault: Pubkey
    protocol_config: Pubkey
    haircut_state: Pubkey


class SetBorrowerWhitelistAccountsDict(TypedDict):
    borrower_whitelist: Pubkey
    protocol_config: Pubkey
    whitelist_manager: Pubkey
    borrower: Pubkey
    system_program: Pubkey


class SetPauseAccountsDict(TypedDict):
    protocol_config: Pubkey
    admin: Pubkey


class SetBlacklistModeAccountsDict(TypedDict):
    protocol_config: Pubkey
    admin: Pubkey


class SetAdminAccountsDict(TypedDict):
    protocol_config: Pubkey
    current_admin: Pubkey
    new_admin: Pubkey


class SetWhitelistManagerAccountsDict(TypedDict):
    protocol_config: Pubkey
    admin: Pubkey
    new_whitelist_manager: Pubkey


class WithdrawExcessAccountsDict(TypedDict):
    market: Pubkey
    borrower: Pubkey
    borrower_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    token_program: Pubkey
    protocol_config: Pubkey
    blacklist_check: Pubkey
    borrower_whitelist: Pubkey


class ForceClosePositionAccountsDict(TypedDict):
    market: Pubkey
    borrower: Pubkey
    lender_position: Pubkey
    vault: Pubkey
    escrow_token_account: Pubkey
    market_authority: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey
    haircut_state: Pubkey


class ClaimHaircutAccountsDict(TypedDict):
    market: Pubkey
    lender: Pubkey
    lender_token_account: Pubkey
    vault: Pubkey
    lender_position: Pubkey
    market_authority: Pubkey
    haircut_state: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


class ForceClaimHaircutAccountsDict(TypedDict):
    market: Pubkey
    borrower: Pubkey
    lender_position: Pubkey
    vault: Pubkey
    escrow_token_account: Pubkey
    market_authority: Pubkey
    haircut_state: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


class InitializeProtocolArgsDict(TypedDict):
    fee_rate_bps: int


class SetFeeConfigArgsDict(TypedDict):
    fee_rate_bps: int


class CreateMarketArgsDict(TypedDict):
    market_nonce: int
    annual_interest_bps: int
    maturity_timestamp: int
    max_total_supply: int


class DepositArgsDict(TypedDict):
    amount: int


class BorrowArgsDict(TypedDict):
    amount: int


class RepayArgsDict(TypedDict):
    amount: int


class RepayInterestArgsDict(TypedDict):
    amount: int


class WithdrawArgsDict(TypedDict, total=False):
    scaled_amount: int
    min_payout: int  # Optional, defaults to 0


class SetBorrowerWhitelistArgsDict(TypedDict):
    is_whitelisted: bool
    max_borrow_capacity: int


class SetPauseArgsDict(TypedDict):
    paused: bool


class SetBlacklistModeArgsDict(TypedDict):
    fail_closed: bool


# =============================================================================
# Validation Helpers
# =============================================================================

# Minimum timestamp (2020-01-01 00:00:00 UTC)
_minimum_timestamp = 1577836800


def set_minimum_timestamp(timestamp: int) -> None:
    """Set the minimum allowed timestamp for validation."""
    global _minimum_timestamp
    if timestamp < 0:
        raise ValueError("Minimum timestamp cannot be negative")
    _minimum_timestamp = timestamp


def get_minimum_timestamp() -> int:
    """Get the current minimum timestamp setting."""
    return _minimum_timestamp


def reset_minimum_timestamp() -> None:
    """Reset minimum timestamp to default (2020-01-01)."""
    global _minimum_timestamp
    _minimum_timestamp = 1577836800


def validate_u64(value: int, field_name: str) -> None:
    """Validate that a value fits in u64."""
    if not isinstance(value, int):
        raise TypeError(f"{field_name} must be an integer, got {type(value).__name__}")
    if value < 0:
        raise ValueError(f"{field_name} cannot be negative: {value}")
    if value > MAX_U64:
        raise ValueError(f"{field_name} exceeds maximum u64 value: {value} > {MAX_U64}")


def validate_u128(value: int, field_name: str) -> None:
    """Validate that a value fits in u128."""
    if not isinstance(value, int):
        raise TypeError(f"{field_name} must be an integer, got {type(value).__name__}")
    if value < 0:
        raise ValueError(f"{field_name} cannot be negative: {value}")
    if value > MAX_U128:
        raise ValueError(f"{field_name} exceeds maximum u128 value: {value}")


def validate_basis_points(value: int, field_name: str) -> None:
    """Validate basis points (0-10000)."""
    if not isinstance(value, int):
        raise TypeError(f"{field_name} must be an integer, got {type(value).__name__}")
    if value < 0 or value > 10000:
        raise ValueError(f"{field_name} must be between 0 and 10000: {value}")


def validate_timestamp(value: int, field_name: str) -> None:
    """Validate that a timestamp is reasonable."""
    if not isinstance(value, int):
        raise TypeError(f"{field_name} must be an integer, got {type(value).__name__}")
    if value < 0:
        raise ValueError(f"{field_name} cannot be negative: {value}")
    if value < _minimum_timestamp:
        raise ValueError(f"{field_name} appears to be too early (before 2020-01-01): {value}")


def _write_u128_le(value: int) -> bytes:
    """Write a u128 as little-endian bytes (16 bytes)."""
    low = value & ((1 << 64) - 1)
    high = value >> 64
    return struct.pack("<QQ", low, high)


# =============================================================================
# Memo Instruction Helper
# =============================================================================


def create_memo_instruction(memo: str, signer_pubkeys: list[Pubkey] | None = None) -> Instruction:
    """
    Create a memo instruction for idempotency tracking.

    Args:
        memo: The memo text (max 566 bytes).
        signer_pubkeys: Optional signer pubkeys for the memo.

    Returns:
        A memo instruction.
    """
    keys = []
    if signer_pubkeys:
        keys = [AccountMeta(pubkey=pk, is_signer=True, is_writable=False) for pk in signer_pubkeys]
    return Instruction(
        program_id=MEMO_PROGRAM_ID,
        accounts=keys,
        data=memo.encode("utf-8"),
    )


# =============================================================================
# Instruction Builders
# =============================================================================


def create_initialize_protocol_instruction(
    accounts: InitializeProtocolAccountsDict,
    args: InitializeProtocolArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create InitializeProtocol instruction.
    Discriminator: 0

    On-chain account order:
    [protocol_config, admin, fee_authority, whitelist_manager, blacklist_program,
     system_program, program_data]

    Data layout: [fee_rate_bps(2 bytes)]

    Note: Only the program's upgrade authority can initialize the protocol.

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_basis_points(args["fee_rate_bps"], "fee_rate_bps")

    data = struct.pack("<BH", InstructionDiscriminator.InitializeProtocol, args["fee_rate_bps"])

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["admin"], is_signer=True, is_writable=True),
            AccountMeta(pubkey=accounts["fee_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["whitelist_manager"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["blacklist_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["system_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["program_data"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_set_fee_config_instruction(
    accounts: SetFeeConfigAccountsDict,
    args: SetFeeConfigArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create SetFeeConfig instruction.
    Discriminator: 1

    On-chain account order: [protocol_config, admin, new_fee_authority]
    Data layout: [fee_rate_bps(2 bytes)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_basis_points(args["fee_rate_bps"], "fee_rate_bps")

    data = struct.pack("<BH", InstructionDiscriminator.SetFeeConfig, args["fee_rate_bps"])

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["admin"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["new_fee_authority"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_create_market_instruction(
    accounts: CreateMarketAccountsDict,
    args: CreateMarketArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create CreateMarket instruction.
    Discriminator: 2

    On-chain account order:
    [market, borrower, mint, vault, market_authority, protocol_config,
     borrower_whitelist, blacklist_check, system_program, token_program]

    Data layout: [market_nonce(8), annual_interest_bps(2), maturity_timestamp(8), max_total_supply(8)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_u64(args["market_nonce"], "market_nonce")
    validate_basis_points(args["annual_interest_bps"], "annual_interest_bps")
    validate_timestamp(args["maturity_timestamp"], "maturity_timestamp")
    validate_u64(args["max_total_supply"], "max_total_supply")
    if args["max_total_supply"] == 0:
        raise ValueError("max_total_supply must be greater than 0")

    data = struct.pack(
        "<BQHqQ",
        InstructionDiscriminator.CreateMarket,
        args["market_nonce"],
        args["annual_interest_bps"],
        args["maturity_timestamp"],
        args["max_total_supply"],
    )

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["borrower"], is_signer=True, is_writable=True),
            AccountMeta(pubkey=accounts["mint"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["borrower_whitelist"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["blacklist_check"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["system_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_deposit_instruction(
    accounts: DepositAccountsDict,
    args: DepositArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create Deposit instruction.
    Discriminator: 3

    On-chain account order:
    [market, lender, lender_token, vault, lender_position, blacklist_check,
     protocol_config, mint, token_program, system_program]

    Data layout: [amount(8 bytes)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_u64(args["amount"], "amount")
    if args["amount"] == 0:
        raise ValueError("Deposit amount must be greater than 0")

    data = struct.pack("<BQ", InstructionDiscriminator.Deposit, args["amount"])

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["lender"], is_signer=True, is_writable=True),
            AccountMeta(pubkey=accounts["lender_token_account"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["lender_position"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["blacklist_check"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["mint"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["system_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_borrow_instruction(
    accounts: BorrowAccountsDict,
    args: BorrowArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create Borrow instruction.
    Discriminator: 4

    On-chain account order:
    [market, borrower, borrower_token, vault, market_authority, borrower_whitelist,
     blacklist_check, protocol_config, token_program]

    Data layout: [amount(8 bytes)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_u64(args["amount"], "amount")
    if args["amount"] == 0:
        raise ValueError("Borrow amount must be greater than 0")

    data = struct.pack("<BQ", InstructionDiscriminator.Borrow, args["amount"])

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["borrower"], is_signer=True, is_writable=False),
            AccountMeta(
                pubkey=accounts["borrower_token_account"], is_signer=False, is_writable=True
            ),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["borrower_whitelist"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["blacklist_check"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_repay_instruction(
    accounts: RepayAccountsDict,
    args: RepayArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create Repay instruction.
    Discriminator: 5

    On-chain account order:
    [market, payer, payer_token, vault, protocol_config, mint, borrower_whitelist,
     token_program]

    Data layout: [amount(8 bytes)]

    Note: The borrower_whitelist account is derived from the market's borrower address.
    On repay, the current_borrowed is decremented to allow re-borrowing up to max_borrow_capacity.

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_u64(args["amount"], "amount")
    if args["amount"] == 0:
        raise ValueError("Repay amount must be greater than 0")

    data = struct.pack("<BQ", InstructionDiscriminator.Repay, args["amount"])

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["payer"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["payer_token_account"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["mint"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["borrower_whitelist"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_repay_interest_instruction(
    accounts: RepayInterestAccountsDict,
    args: RepayInterestArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create RepayInterest instruction.
    Discriminator: 6

    Repay accrued interest to the market vault WITHOUT affecting borrower capacity.
    Unlike regular repay, this does NOT decrement current_borrowed.

    On-chain account order:
    [market, payer, payer_token, vault, protocol_config, token_program]

    Data layout: [amount(8 bytes)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_u64(args["amount"], "amount")
    if args["amount"] == 0:
        raise ValueError("Repay interest amount must be greater than 0")

    data = struct.pack("<BQ", InstructionDiscriminator.RepayInterest, args["amount"])

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["payer"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["payer_token_account"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_withdraw_instruction(
    accounts: WithdrawAccountsDict,
    args: WithdrawArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create Withdraw instruction.
    Discriminator: 7

    On-chain account order:
    [market, lender, lender_token, vault, lender_position, market_authority,
     blacklist_check, protocol_config, token_program, haircut_state]

    Data layout: [scaled_amount(16 bytes, u128), min_payout(8 bytes, u64)]

    SECURITY NOTE: The min_payout parameter provides slippage protection.
    In distressed markets (settlement_factor < WAD), the actual payout may be
    less than expected. Set min_payout to protect against receiving less than
    an acceptable amount. Set to 0 to disable slippage protection.

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    scaled_amount = args["scaled_amount"]
    min_payout = args.get("min_payout", 0)

    validate_u128(scaled_amount, "scaled_amount")
    validate_u64(min_payout, "min_payout")

    # Pack: discriminator (1 byte) + u128 (16 bytes) + u64 (8 bytes)
    data = (
        struct.pack("<B", InstructionDiscriminator.Withdraw)
        + _write_u128_le(scaled_amount)
        + struct.pack("<Q", min_payout)
    )

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["lender"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["lender_token_account"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["lender_position"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["blacklist_check"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["haircut_state"], is_signer=False, is_writable=True),
        ],
        data=data,
    )


def create_collect_fees_instruction(
    accounts: CollectFeesAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create CollectFees instruction.
    Discriminator: 8

    On-chain account order:
    [market, protocol_config, fee_authority, fee_destination, vault, market_authority,
     token_program]

    Data layout: [discriminator only]

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.CollectFees)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["fee_authority"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["fee_token_account"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_re_settle_instruction(
    accounts: ReSettleAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create ReSettle instruction.
    Discriminator: 9

    On-chain account order: [market, vault, protocol_config, haircut_state]
    Data layout: [discriminator only] - permissionless, no args

    SECURITY NOTE: ReSettle requires protocol_config to ensure proper
    fee accrual during re-settlement.

    The new settlement factor is computed automatically from the vault balance.
    It must be strictly greater than the current settlement factor.

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.ReSettle)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["haircut_state"], is_signer=False, is_writable=True),
        ],
        data=data,
    )


def create_close_lender_position_instruction(
    accounts: CloseLenderPositionAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create CloseLenderPosition instruction.
    Discriminator: 10

    On-chain account order: [market, lender, lender_position, system_program, protocol_config]
    Data layout: [discriminator only]

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.CloseLenderPosition)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["lender"], is_signer=True, is_writable=True),
            AccountMeta(pubkey=accounts["lender_position"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["system_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_withdraw_excess_instruction(
    accounts: WithdrawExcessAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create WithdrawExcess instruction.
    Discriminator: 11

    Allows the borrower to withdraw excess funds from the vault.
    Only the market's borrower can call this instruction.

    On-chain account order:
    [market, borrower, borrower_token, vault, market_authority, token_program,
     protocol_config, blacklist_check, borrower_whitelist]

    Data layout: [discriminator only]

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.WithdrawExcess)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["borrower"], is_signer=True, is_writable=False),
            AccountMeta(
                pubkey=accounts["borrower_token_account"], is_signer=False, is_writable=True
            ),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["blacklist_check"], is_signer=False, is_writable=False),
            AccountMeta(
                pubkey=accounts["borrower_whitelist"], is_signer=False, is_writable=False
            ),
        ],
        data=data,
    )


def create_set_borrower_whitelist_instruction(
    accounts: SetBorrowerWhitelistAccountsDict,
    args: SetBorrowerWhitelistArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create SetBorrowerWhitelist instruction.
    Discriminator: 12

    On-chain account order:
    [borrower_whitelist, protocol_config, whitelist_manager, borrower, system_program]

    Data layout: [is_whitelisted(1 byte), max_borrow_capacity(8 bytes)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    validate_u64(args["max_borrow_capacity"], "max_borrow_capacity")

    data = struct.pack(
        "<BBQ",
        InstructionDiscriminator.SetBorrowerWhitelist,
        1 if args["is_whitelisted"] else 0,
        args["max_borrow_capacity"],
    )

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["borrower_whitelist"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["whitelist_manager"], is_signer=True, is_writable=True),
            AccountMeta(pubkey=accounts["borrower"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["system_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_set_pause_instruction(
    accounts: SetPauseAccountsDict,
    args: SetPauseArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create SetPause instruction.
    Discriminator: 13

    On-chain account order: [protocol_config, admin]
    Data layout: [paused(1 byte)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<BB", InstructionDiscriminator.SetPause, 1 if args["paused"] else 0)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["admin"], is_signer=True, is_writable=False),
        ],
        data=data,
    )


def create_set_blacklist_mode_instruction(
    accounts: SetBlacklistModeAccountsDict,
    args: SetBlacklistModeArgsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create SetBlacklistMode instruction.
    Discriminator: 14

    On-chain account order: [protocol_config, admin]
    Data layout: [fail_closed(1 byte)]

    Args:
        accounts: The instruction accounts.
        args: The instruction arguments.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack(
        "<BB", InstructionDiscriminator.SetBlacklistMode, 1 if args["fail_closed"] else 0
    )

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["admin"], is_signer=True, is_writable=False),
        ],
        data=data,
    )


def create_set_admin_instruction(
    accounts: SetAdminAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create SetAdmin instruction.
    Discriminator: 15

    Transfers admin role to a new address. Only the current admin can call this.

    On-chain account order: [protocol_config, current_admin, new_admin]
    Data layout: (no data)

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.SetAdmin)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["current_admin"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["new_admin"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_set_whitelist_manager_instruction(
    accounts: SetWhitelistManagerAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create SetWhitelistManager instruction.
    Discriminator: 16

    Changes the whitelist manager to a new address. Only the admin can call this.

    On-chain account order: [protocol_config, admin, new_whitelist_manager]
    Data layout: (no data)

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.SetWhitelistManager)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["admin"], is_signer=True, is_writable=False),
            AccountMeta(
                pubkey=accounts["new_whitelist_manager"], is_signer=False, is_writable=False
            ),
        ],
        data=data,
    )


def create_force_close_position_instruction(
    accounts: ForceClosePositionAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create ForceClosePosition instruction.
    Discriminator: 18

    Allows the borrower to force-close a lender position after maturity,
    transferring the lender's share to an escrow account.

    On-chain account order:
    [market, borrower, lender_position, vault, escrow_token_account,
     market_authority, protocol_config, token_program, haircut_state]

    Data layout: [discriminator only]

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.ForceClosePosition)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["borrower"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["lender_position"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(
                pubkey=accounts["escrow_token_account"], is_signer=False, is_writable=True
            ),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["haircut_state"], is_signer=False, is_writable=True),
        ],
        data=data,
    )


def create_claim_haircut_instruction(
    accounts: ClaimHaircutAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create ClaimHaircut instruction.
    Discriminator: 19

    Allows a lender to claim their haircut recovery from a distressed market.

    On-chain account order:
    [market, lender, lender_position, lender_token_account, vault,
     market_authority, haircut_state, protocol_config, token_program]

    Data layout: [discriminator only]

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.ClaimHaircut)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["lender"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["lender_position"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["lender_token_account"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["haircut_state"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


def create_force_claim_haircut_instruction(
    accounts: ForceClaimHaircutAccountsDict,
    program_id: Pubkey | None = None,
) -> Instruction:
    """
    Create ForceClaimHaircut instruction.
    Discriminator: 20

    Allows the borrower to force-claim a lender's haircut recovery,
    transferring the funds to an escrow account.

    On-chain account order:
    [market, borrower, lender_position, escrow_token_account, vault,
     market_authority, haircut_state, protocol_config, token_program]

    Data layout: [discriminator only]

    Args:
        accounts: The instruction accounts.
        program_id: Optional program ID override.

    Returns:
        The instruction.
    """
    data = struct.pack("<B", InstructionDiscriminator.ForceClaimHaircut)

    resolved_program_id = program_id if program_id is not None else get_program_id()
    return Instruction(
        program_id=resolved_program_id,
        accounts=[
            AccountMeta(pubkey=accounts["market"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["borrower"], is_signer=True, is_writable=False),
            AccountMeta(pubkey=accounts["lender_position"], is_signer=False, is_writable=True),
            AccountMeta(
                pubkey=accounts["escrow_token_account"], is_signer=False, is_writable=True
            ),
            AccountMeta(pubkey=accounts["vault"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["market_authority"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["haircut_state"], is_signer=False, is_writable=True),
            AccountMeta(pubkey=accounts["protocol_config"], is_signer=False, is_writable=False),
            AccountMeta(pubkey=accounts["token_program"], is_signer=False, is_writable=False),
        ],
        data=data,
    )


# ---------------------------------------------------------------------------
# Composite helpers
# ---------------------------------------------------------------------------


class WaterfallRepayAccountsDict(TypedDict):
    """Accounts for a waterfall repay (interest-first, then principal).

    Combines the accounts needed by both RepayInterest and Repay instructions.
    """

    market: Pubkey
    payer: Pubkey
    payer_token_account: Pubkey
    vault: Pubkey
    protocol_config: Pubkey
    mint: Pubkey
    """Token mint — required for the principal Repay instruction."""
    borrower_whitelist: Pubkey
    """Borrower whitelist PDA — required for the principal Repay instruction."""
    token_program: Pubkey


class WaterfallRepayArgsDict(TypedDict):
    """Arguments for a waterfall repay.

    The helper splits ``total_amount`` into interest-first, then principal.
    """

    total_amount: int
    """Total amount to repay in token smallest units (u64)."""
    interest_amount: int
    """Amount allocated to interest (0 to total_amount).
    The remainder (total_amount - interest_amount) goes to principal."""


def create_waterfall_repay_instructions(
    accounts: WaterfallRepayAccountsDict,
    args: WaterfallRepayArgsDict,
    program_id: Pubkey | None = None,
) -> list[Instruction]:
    """Create waterfall repay instructions: interest-first, then principal.

    Builds up to two instructions that should be added to a single transaction:

    1. RepayInterest (if interest_amount > 0) — pays accrued interest
    2. Repay (if total_amount - interest_amount > 0) — repays principal and
       frees borrow capacity

    Interest is paid first so that on-chain state is correct when the principal
    instruction executes.

    Args:
        accounts: The combined accounts for both repay instructions.
        args: Waterfall repay arguments (total_amount, interest_amount).
        program_id: Optional program ID override.

    Returns:
        A list of 0–2 instructions to add to a transaction.
        Empty list if total_amount is 0.

    Raises:
        ValueError: If interest_amount exceeds total_amount or values are
            out of u64 range.
    """
    total_amount = args["total_amount"]
    interest_amount = args["interest_amount"]

    if not isinstance(total_amount, int) or total_amount < 0 or total_amount > MAX_U64:
        raise ValueError(f"total_amount must be a u64 value, got {total_amount}")
    if not isinstance(interest_amount, int) or interest_amount < 0 or interest_amount > MAX_U64:
        raise ValueError(f"interest_amount must be a u64 value, got {interest_amount}")
    if interest_amount > total_amount:
        raise ValueError("interest_amount cannot exceed total_amount")

    if total_amount == 0:
        return []

    instructions: list[Instruction] = []

    # Interest instruction first (so on-chain state is correct when principal executes)
    if interest_amount > 0:
        interest_ix = create_repay_interest_instruction(
            accounts={
                "market": accounts["market"],
                "payer": accounts["payer"],
                "payer_token_account": accounts["payer_token_account"],
                "vault": accounts["vault"],
                "protocol_config": accounts["protocol_config"],
                "token_program": accounts["token_program"],
            },
            args={"amount": interest_amount},
            program_id=program_id,
        )
        instructions.append(interest_ix)

    # Principal instruction for the remainder
    principal_amount = total_amount - interest_amount
    if principal_amount > 0:
        principal_ix = create_repay_instruction(
            accounts={
                "market": accounts["market"],
                "payer": accounts["payer"],
                "payer_token_account": accounts["payer_token_account"],
                "vault": accounts["vault"],
                "protocol_config": accounts["protocol_config"],
                "mint": accounts["mint"],
                "borrower_whitelist": accounts["borrower_whitelist"],
                "token_program": accounts["token_program"],
            },
            args={"amount": principal_amount},
            program_id=program_id,
        )
        instructions.append(principal_ix)

    return instructions


class WithdrawAndCloseAccountsDict(TypedDict):
    """Accounts for withdraw-and-close (withdraw all remaining balance, then close position).

    Combines the accounts needed by both Withdraw and CloseLenderPosition instructions.
    """

    market: Pubkey
    lender: Pubkey
    lender_token_account: Pubkey
    vault: Pubkey
    lender_position: Pubkey
    market_authority: Pubkey
    blacklist_check: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey
    haircut_state: Pubkey
    system_program: Pubkey
    """System program — required for closing the position account."""


class ClaimHaircutAndCloseAccountsDict(TypedDict):
    """Accounts for claim-haircut-and-close (claim recovery tokens, then close position).

    Combines the accounts needed by both ClaimHaircut and CloseLenderPosition instructions.
    """

    market: Pubkey
    lender: Pubkey
    lender_position: Pubkey
    lender_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    haircut_state: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey
    system_program: Pubkey
    """System program — required for closing the position account."""


def create_withdraw_and_close_instructions(
    accounts: WithdrawAndCloseAccountsDict,
    args: WithdrawArgsDict,
    program_id: Pubkey | None = None,
) -> list[Instruction]:
    """Create withdraw-and-close instructions: withdraw remaining balance, then close position.

    Builds two instructions that should be added to a single transaction:

    1. Withdraw — transfers remaining tokens to lender
    2. CloseLenderPosition — closes the empty position and returns rent

    The position must have zero ``haircut_owed`` for close to succeed. If the lender
    has unclaimed haircut recovery, use
    :func:`create_claim_haircut_and_close_instructions` first.

    Args:
        accounts: The combined accounts for both instructions.
        args: Withdraw arguments (scaled_amount, min_amount_out).
        program_id: Optional program ID override.

    Returns:
        A list of 2 instructions to add to a transaction.
    """
    withdraw_ix = create_withdraw_instruction(
        accounts={
            "market": accounts["market"],
            "lender": accounts["lender"],
            "lender_token_account": accounts["lender_token_account"],
            "vault": accounts["vault"],
            "lender_position": accounts["lender_position"],
            "market_authority": accounts["market_authority"],
            "blacklist_check": accounts["blacklist_check"],
            "protocol_config": accounts["protocol_config"],
            "token_program": accounts["token_program"],
            "haircut_state": accounts["haircut_state"],
        },
        args=args,
        program_id=program_id,
    )

    close_ix = create_close_lender_position_instruction(
        accounts={
            "market": accounts["market"],
            "lender": accounts["lender"],
            "lender_position": accounts["lender_position"],
            "system_program": accounts["system_program"],
            "protocol_config": accounts["protocol_config"],
        },
        program_id=program_id,
    )

    return [withdraw_ix, close_ix]


def create_claim_haircut_and_close_instructions(
    accounts: ClaimHaircutAndCloseAccountsDict,
    program_id: Pubkey | None = None,
) -> list[Instruction]:
    """Create claim-haircut-and-close instructions: claim recovery tokens, then close position.

    Builds two instructions that should be added to a single transaction:

    1. ClaimHaircut — claims haircut recovery tokens, sets haircut_owed to 0
    2. CloseLenderPosition — closes the empty position and returns rent

    The position must have zero ``scaled_balance`` before calling this. If the lender
    still has a balance, use :func:`create_withdraw_and_close_instructions` or withdraw
    first.

    Args:
        accounts: The combined accounts for both instructions.
        program_id: Optional program ID override.

    Returns:
        A list of 2 instructions to add to a transaction.
    """
    claim_ix = create_claim_haircut_instruction(
        accounts={
            "market": accounts["market"],
            "lender": accounts["lender"],
            "lender_token_account": accounts["lender_token_account"],
            "vault": accounts["vault"],
            "lender_position": accounts["lender_position"],
            "market_authority": accounts["market_authority"],
            "haircut_state": accounts["haircut_state"],
            "protocol_config": accounts["protocol_config"],
            "token_program": accounts["token_program"],
        },
        program_id=program_id,
    )

    close_ix = create_close_lender_position_instruction(
        accounts={
            "market": accounts["market"],
            "lender": accounts["lender"],
            "lender_position": accounts["lender_position"],
            "system_program": accounts["system_program"],
            "protocol_config": accounts["protocol_config"],
        },
        program_id=program_id,
    )

    return [claim_ix, close_ix]
