"""
CoalesceFi SDK Types.

This module contains all account structures and instruction argument types
used by the CoalesceFi protocol.
"""

from __future__ import annotations

from dataclasses import dataclass

from solders.pubkey import Pubkey

# =============================================================================
# Account Structures (Immutable Dataclasses)
# =============================================================================


@dataclass(frozen=True)
class ProtocolConfig:
    """
    ProtocolConfig account structure (194 bytes).
    Matches the Rust #[repr(C)] struct exactly.
    """

    version: int  # u8: Account schema version
    admin: bytes  # 32 bytes: Protocol admin pubkey
    fee_rate_bps: int  # u16: Fee as basis points of base interest (0-10000)
    fee_authority: bytes  # 32 bytes: Fee collection wallet
    whitelist_manager: bytes  # 32 bytes: Whitelist manager pubkey
    blacklist_program: bytes  # 32 bytes: External blacklist program
    is_initialized: bool  # Guard against double-init
    bump: int  # u8: PDA bump seed
    is_paused: bool  # Emergency pause flag (true = paused, false = active)
    is_blacklist_fail_closed: bool  # Blacklist mode (true = fail-closed, false = fail-open)

    @property
    def admin_pubkey(self) -> Pubkey:
        """Convert admin bytes to Pubkey."""
        return Pubkey.from_bytes(self.admin)

    @property
    def fee_authority_pubkey(self) -> Pubkey:
        """Convert fee_authority bytes to Pubkey."""
        return Pubkey.from_bytes(self.fee_authority)

    @property
    def whitelist_manager_pubkey(self) -> Pubkey:
        """Convert whitelist_manager bytes to Pubkey."""
        return Pubkey.from_bytes(self.whitelist_manager)

    @property
    def blacklist_program_pubkey(self) -> Pubkey:
        """Convert blacklist_program bytes to Pubkey."""
        return Pubkey.from_bytes(self.blacklist_program)


@dataclass(frozen=True)
class Market:
    """
    Market account structure (250 bytes).
    Matches the Rust #[repr(C)] struct exactly.
    """

    version: int  # u8: Account schema version
    borrower: Pubkey  # 32 bytes: Borrower pubkey
    mint: Pubkey  # 32 bytes: USDC mint
    vault: Pubkey  # 32 bytes: Vault PDA
    market_authority_bump: int  # u8: Market authority PDA bump
    annual_interest_bps: int  # u16: Fixed annual rate in bps (0-10000)
    maturity_timestamp: int  # i64: Loan maturity timestamp
    max_total_supply: int  # u64: Borrow cap normalized
    market_nonce: int  # u64: PDA derivation nonce
    scaled_total_supply: int  # u128: Sum of lender scaled balances
    scale_factor: int  # u128: WAD precision scale factor
    accrued_protocol_fees: int  # u64: Uncollected fees
    total_deposited: int  # u64: Running total deposits
    total_borrowed: int  # u64: Running total borrowed
    total_repaid: int  # u64: Running total repaid
    total_interest_repaid: int  # u64: Running total interest repaid
    last_accrual_timestamp: int  # i64: Last interest accrual timestamp
    settlement_factor_wad: int  # u128: Payout ratio at settlement
    bump: int  # u8: Market PDA bump


@dataclass(frozen=True)
class LenderPosition:
    """
    LenderPosition account structure (128 bytes).
    Matches the Rust #[repr(C)] struct exactly.
    """

    version: int  # u8: Account schema version
    market: Pubkey  # 32 bytes: Market this position belongs to
    lender: Pubkey  # 32 bytes: Lender wallet address
    scaled_balance: int  # u128: Lender's share balance
    bump: int  # u8: PDA bump


@dataclass(frozen=True)
class BorrowerWhitelist:
    """
    BorrowerWhitelist account structure (96 bytes).
    Matches the Rust #[repr(C)] struct exactly.
    """

    version: int  # u8: Account schema version
    borrower: Pubkey  # 32 bytes: Borrower wallet
    is_whitelisted: bool  # 1 = whitelisted, 0 = removed
    max_borrow_capacity: int  # u64: Maximum USDC that can be outstanding
    current_borrowed: int  # u64: Current outstanding USDC debt
    bump: int  # u8: PDA bump


# =============================================================================
# Instruction Argument Types
# =============================================================================


@dataclass(frozen=True)
class InitializeProtocolArgs:
    """Arguments for InitializeProtocol instruction."""

    fee_rate_bps: int  # u16: Fee rate in basis points (0-10000)


@dataclass(frozen=True)
class SetFeeConfigArgs:
    """Arguments for SetFeeConfig instruction."""

    fee_rate_bps: int  # u16: Fee rate in basis points (0-10000)


@dataclass(frozen=True)
class CreateMarketArgs:
    """Arguments for CreateMarket instruction."""

    market_nonce: int  # u64: Unique nonce for market PDA derivation
    annual_interest_bps: int  # u16: Annual interest rate in basis points (0-10000)
    maturity_timestamp: int  # i64: Unix timestamp when the loan matures
    max_total_supply: int  # u64: Maximum total supply in token smallest units


@dataclass(frozen=True)
class DepositArgs:
    """Arguments for Deposit instruction."""

    amount: int  # u64: Amount to deposit in token smallest units


@dataclass(frozen=True)
class BorrowArgs:
    """Arguments for Borrow instruction."""

    amount: int  # u64: Amount to borrow in token smallest units


@dataclass(frozen=True)
class RepayArgs:
    """Arguments for Repay instruction."""

    amount: int  # u64: Amount to repay in token smallest units


@dataclass(frozen=True)
class RepayInterestArgs:
    """Arguments for RepayInterest instruction."""

    amount: int  # u64: Amount of interest to repay in token smallest units


@dataclass(frozen=True)
class WithdrawArgs:
    """Arguments for Withdraw instruction."""

    scaled_amount: int  # u128: Scaled amount of shares to withdraw (0 = full withdrawal)
    min_payout: int = 0  # u64: Minimum payout amount for slippage protection


@dataclass(frozen=True)
class SetBorrowerWhitelistArgs:
    """Arguments for SetBorrowerWhitelist instruction."""

    is_whitelisted: bool  # Whether the borrower is whitelisted
    max_borrow_capacity: int  # u64: Maximum borrow capacity in token smallest units


@dataclass(frozen=True)
class SetPauseArgs:
    """Arguments for SetPause instruction."""

    paused: bool


@dataclass(frozen=True)
class SetBlacklistModeArgs:
    """Arguments for SetBlacklistMode instruction."""

    fail_closed: bool


# =============================================================================
# Instruction Account Types
# =============================================================================


@dataclass(frozen=True)
class InitializeProtocolAccounts:
    """Accounts for InitializeProtocol instruction."""

    protocol_config: Pubkey
    admin: Pubkey
    fee_authority: Pubkey
    whitelist_manager: Pubkey
    blacklist_program: Pubkey
    system_program: Pubkey
    program_data: Pubkey  # Derived from program ID via BPF Loader Upgradeable


@dataclass(frozen=True)
class SetFeeConfigAccounts:
    """Accounts for SetFeeConfig instruction."""

    protocol_config: Pubkey
    admin: Pubkey
    new_fee_authority: Pubkey


@dataclass(frozen=True)
class CreateMarketAccounts:
    """Accounts for CreateMarket instruction."""

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


@dataclass(frozen=True)
class DepositAccounts:
    """Accounts for Deposit instruction."""

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


@dataclass(frozen=True)
class BorrowAccounts:
    """Accounts for Borrow instruction."""

    market: Pubkey
    borrower: Pubkey
    borrower_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    borrower_whitelist: Pubkey
    blacklist_check: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


@dataclass(frozen=True)
class RepayAccounts:
    """Accounts for Repay instruction."""

    market: Pubkey
    payer: Pubkey
    payer_token_account: Pubkey
    vault: Pubkey
    protocol_config: Pubkey
    mint: Pubkey
    borrower_whitelist: Pubkey
    token_program: Pubkey


@dataclass(frozen=True)
class RepayInterestAccounts:
    """Accounts for RepayInterest instruction."""

    market: Pubkey
    payer: Pubkey
    payer_token_account: Pubkey
    vault: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


@dataclass(frozen=True)
class WithdrawAccounts:
    """Accounts for Withdraw instruction."""

    market: Pubkey
    lender: Pubkey
    lender_token_account: Pubkey
    vault: Pubkey
    lender_position: Pubkey
    market_authority: Pubkey
    blacklist_check: Pubkey
    protocol_config: Pubkey
    token_program: Pubkey


@dataclass(frozen=True)
class CollectFeesAccounts:
    """Accounts for CollectFees instruction."""

    market: Pubkey
    protocol_config: Pubkey
    fee_authority: Pubkey
    fee_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    token_program: Pubkey


@dataclass(frozen=True)
class CloseLenderPositionAccounts:
    """Accounts for CloseLenderPosition instruction."""

    market: Pubkey
    lender: Pubkey
    lender_position: Pubkey
    system_program: Pubkey
    protocol_config: Pubkey


@dataclass(frozen=True)
class ReSettleAccounts:
    """Accounts for ReSettle instruction."""

    market: Pubkey
    vault: Pubkey
    protocol_config: Pubkey


@dataclass(frozen=True)
class SetBorrowerWhitelistAccounts:
    """Accounts for SetBorrowerWhitelist instruction."""

    borrower_whitelist: Pubkey
    protocol_config: Pubkey
    whitelist_manager: Pubkey
    borrower: Pubkey
    system_program: Pubkey


@dataclass(frozen=True)
class SetPauseAccounts:
    """Accounts for SetPause instruction."""

    protocol_config: Pubkey
    admin: Pubkey


@dataclass(frozen=True)
class SetBlacklistModeAccounts:
    """Accounts for SetBlacklistMode instruction."""

    protocol_config: Pubkey
    admin: Pubkey


@dataclass(frozen=True)
class SetAdminAccounts:
    """Accounts for SetAdmin instruction."""

    protocol_config: Pubkey
    current_admin: Pubkey
    new_admin: Pubkey


@dataclass(frozen=True)
class SetWhitelistManagerAccounts:
    """Accounts for SetWhitelistManager instruction."""

    protocol_config: Pubkey
    admin: Pubkey
    new_whitelist_manager: Pubkey


@dataclass(frozen=True)
class WithdrawExcessAccounts:
    """Accounts for WithdrawExcess instruction."""

    market: Pubkey
    borrower: Pubkey
    borrower_token_account: Pubkey
    vault: Pubkey
    market_authority: Pubkey
    token_program: Pubkey
    protocol_config: Pubkey


# =============================================================================
# Idempotency Types
# =============================================================================


@dataclass
class IdempotencyOptions:
    """Options for idempotency support."""

    idempotency_key: str | None = None
    memo: str | None = None


