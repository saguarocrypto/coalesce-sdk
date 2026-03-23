"""
CoalesceFi Python SDK.

A complete Python SDK for the CoalesceFi lending protocol on Solana.
"""

from __future__ import annotations

# Version
__version__ = "0.1.0"

# =============================================================================
# Constants
# =============================================================================
# =============================================================================
# Accounts
# =============================================================================
from .accounts import (
    # Type Detection
    AccountType,
    # Retry Config
    RetryConfig,
    decode_account,
    decode_borrower_whitelist,
    decode_haircut_state,
    decode_lender_position,
    decode_market,
    # Decoders
    decode_protocol_config,
    fetch_borrower_whitelist,
    fetch_haircut_state,
    fetch_lender_position,
    fetch_market,
    # Fetchers
    fetch_protocol_config,
    get_account_type,
)
from .constants import (
    BORROWER_WHITELIST_SIZE,
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
    BPS,
    DEFAULT_PROGRAM_IDS,
    DISC_BORROWER_WL,
    DISC_HAIRCUT_STATE,
    DISC_LENDER_POSITION,
    DISC_MARKET,
    # Account Discriminators
    DISC_PROTOCOL_CONFIG,
    HAIRCUT_STATE_SIZE,
    LENDER_POSITION_SIZE,
    MARKET_SIZE,
    # Protocol Limits
    MAX_ANNUAL_INTEREST_BPS,
    MAX_FEE_RATE_BPS,
    MAX_I64,
    # Numeric Type Bounds
    MAX_U64,
    MAX_U128,
    MEMO_PROGRAM_ID,
    MIN_I64,
    MIN_MATURITY_DELTA,
    # Account Sizes
    PROTOCOL_CONFIG_SIZE,
    SECONDS_PER_YEAR,
    SEED_BLACKLIST,
    SEED_BORROWER_WHITELIST,
    SEED_HAIRCUT_STATE,
    SEED_LENDER,
    SEED_MARKET,
    SEED_MARKET_AUTHORITY,
    # PDA Seeds
    SEED_PROTOCOL_CONFIG,
    SEED_VAULT,
    SETTLEMENT_GRACE_PERIOD,
    # Known Program Addresses
    SPL_TOKEN_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
    USDC_DECIMALS,
    # Mathematical Constants
    WAD,
    # Instruction Discriminators
    InstructionDiscriminator,
    # Configuration
    NetworkName,
    SdkConfig,
    clear_program_id_cache,
    configure_sdk,
    get_program_id,
    get_sdk_config,
    reset_sdk_config,
    resolve_program_id,
)

# =============================================================================
# Math
# =============================================================================
from .math import (
    DAYS_PER_YEAR,
    SECONDS_PER_DAY,
    InterestAccrualResult,
    MathOverflowError,
    UtilizationRateResult,
    calculate_apr,
    calculate_available_vault_balance,
    calculate_normalized_amount,
    calculate_position_value,
    calculate_scaled_amount,
    calculate_settlement_payout,
    calculate_total_supply,
    calculate_utilization_rate,
    calculate_utilization_rate_decimal,
    estimate_interest_accrual,
    estimate_value_at_maturity,
    growth_factor_wad,
    mul_wad,
    pow_wad,
    safe_divide,
    would_overflow_u64,
    would_overflow_u128,
)

# =============================================================================
# Errors
# =============================================================================
from .errors import (
    ERROR_MESSAGES,
    ERROR_RECOVERY_ACTIONS,
    # Error Classes
    CoalescefiError,
    # Error Codes
    CoalescefiErrorCode,
    ErrorCategory,
    ErrorDetails,
    ErrorSeverity,
    SdkError,
    get_error_category,
    get_error_details,
    get_error_recovery_action,
    get_error_severity,
    is_retryable_error,
    # Error Utilities
    is_user_recoverable_error,
    # Error Parsing
    parse_coalescefi_error,
)

# =============================================================================
# Idempotency
# =============================================================================
from .idempotency import (
    IdempotencyError,
    IdempotencyManager,
    IdempotencyManagerOptions,
    MemoryStorage,
    PendingOperation,
    generate_idempotency_key,
    generate_unique_idempotency_key,
)

# =============================================================================
# Instructions
# =============================================================================
from .instructions import (
    create_borrow_instruction,
    create_claim_haircut_instruction,
    create_close_lender_position_instruction,
    create_collect_fees_instruction,
    create_create_market_instruction,
    create_deposit_instruction,
    create_force_claim_haircut_instruction,
    # Instruction Builders
    create_initialize_protocol_instruction,
    # Memo
    create_memo_instruction,
    create_re_settle_instruction,
    create_repay_instruction,
    create_repay_interest_instruction,
    create_waterfall_repay_instructions,
    WaterfallRepayAccountsDict,
    WaterfallRepayArgsDict,
    create_set_admin_instruction,
    create_set_blacklist_mode_instruction,
    create_set_borrower_whitelist_instruction,
    create_set_fee_config_instruction,
    create_set_pause_instruction,
    create_set_whitelist_manager_instruction,
    create_force_close_position_instruction,
    create_withdraw_excess_instruction,
    create_withdraw_instruction,
    get_minimum_timestamp,
    reset_minimum_timestamp,
    set_minimum_timestamp,
    validate_basis_points,
    validate_timestamp,
    # Validation
    validate_u64,
    validate_u128,
)

# =============================================================================
# PDAs
# =============================================================================
from .pdas import (
    MarketPdas,
    PdaWithBump,
    derive_market_pdas,
    find_blacklist_check_pda,
    find_borrower_whitelist_pda,
    find_haircut_state_pda,
    find_lender_position_pda,
    find_market_authority_pda,
    find_market_pda,
    find_program_data_pda,
    find_protocol_config_pda,
    find_vault_pda,
)

# =============================================================================
# Types
# =============================================================================
from .types import (
    BorrowAccounts,
    BorrowArgs,
    BorrowerWhitelist,
    ClaimHaircutAccounts,
    CloseLenderPositionAccounts,
    CollectFeesAccounts,
    CreateMarketAccounts,
    CreateMarketArgs,
    DepositAccounts,
    DepositArgs,
    # Idempotency Types
    IdempotencyOptions,
    # Instruction Accounts
    InitializeProtocolAccounts,
    # Instruction Args
    InitializeProtocolArgs,
    InstructionResult,
    LenderPosition,
    Market,
    # Account Types
    ProtocolConfig,
    RepayAccounts,
    RepayArgs,
    RepayInterestAccounts,
    RepayInterestArgs,
    ReSettleAccounts,
    SetAdminAccounts,
    SetBlacklistModeAccounts,
    SetBlacklistModeArgs,
    SetBorrowerWhitelistAccounts,
    SetBorrowerWhitelistArgs,
    SetFeeConfigAccounts,
    SetFeeConfigArgs,
    SetPauseAccounts,
    SetPauseArgs,
    SetWhitelistManagerAccounts,
    WithdrawAccounts,
    WithdrawArgs,
    WithdrawExcessAccounts,
    ForceClaimHaircutAccounts,
    ForceClosePositionAccounts,
    HaircutState,
)

# =============================================================================
# Public API
# =============================================================================
__all__ = [
    # Version
    "__version__",
    # Configuration
    "NetworkName",
    "SdkConfig",
    "configure_sdk",
    "reset_sdk_config",
    "get_sdk_config",
    "get_program_id",
    "resolve_program_id",
    "clear_program_id_cache",
    "DEFAULT_PROGRAM_IDS",
    # PDA Seeds
    "SEED_PROTOCOL_CONFIG",
    "SEED_MARKET",
    "SEED_MARKET_AUTHORITY",
    "SEED_LENDER",
    "SEED_VAULT",
    "SEED_BORROWER_WHITELIST",
    "SEED_HAIRCUT_STATE",
    "SEED_BLACKLIST",
    # Mathematical Constants
    "WAD",
    "BPS",
    "SECONDS_PER_YEAR",
    "SECONDS_PER_DAY",
    "DAYS_PER_YEAR",
    # Math Functions
    "mul_wad",
    "pow_wad",
    "growth_factor_wad",
    "calculate_scaled_amount",
    "calculate_normalized_amount",
    "calculate_settlement_payout",
    "estimate_interest_accrual",
    "calculate_position_value",
    "calculate_apr",
    "estimate_value_at_maturity",
    "calculate_total_supply",
    "calculate_available_vault_balance",
    "calculate_utilization_rate",
    "calculate_utilization_rate_decimal",
    "safe_divide",
    "would_overflow_u64",
    "would_overflow_u128",
    "MathOverflowError",
    "InterestAccrualResult",
    "UtilizationRateResult",
    # Protocol Limits
    "MAX_ANNUAL_INTEREST_BPS",
    "MAX_FEE_RATE_BPS",
    "USDC_DECIMALS",
    "MIN_MATURITY_DELTA",
    "SETTLEMENT_GRACE_PERIOD",
    # Account Sizes
    "PROTOCOL_CONFIG_SIZE",
    "MARKET_SIZE",
    "LENDER_POSITION_SIZE",
    "BORROWER_WHITELIST_SIZE",
    "HAIRCUT_STATE_SIZE",
    # Account Discriminators
    "DISC_PROTOCOL_CONFIG",
    "DISC_MARKET",
    "DISC_LENDER_POSITION",
    "DISC_BORROWER_WL",
    "DISC_HAIRCUT_STATE",
    # Instruction Discriminators
    "InstructionDiscriminator",
    # Known Program Addresses
    "SPL_TOKEN_PROGRAM_ID",
    "SYSTEM_PROGRAM_ID",
    "BPF_LOADER_UPGRADEABLE_PROGRAM_ID",
    "MEMO_PROGRAM_ID",
    # Numeric Type Bounds
    "MAX_U64",
    "MAX_U128",
    "MAX_I64",
    "MIN_I64",
    # Account Types
    "ProtocolConfig",
    "Market",
    "LenderPosition",
    "BorrowerWhitelist",
    "HaircutState",
    # Instruction Args
    "InitializeProtocolArgs",
    "SetFeeConfigArgs",
    "CreateMarketArgs",
    "DepositArgs",
    "BorrowArgs",
    "RepayArgs",
    "RepayInterestArgs",
    "WithdrawArgs",
    "SetBorrowerWhitelistArgs",
    "SetPauseArgs",
    "SetBlacklistModeArgs",
    # Instruction Accounts
    "InitializeProtocolAccounts",
    "SetFeeConfigAccounts",
    "CreateMarketAccounts",
    "DepositAccounts",
    "BorrowAccounts",
    "RepayAccounts",
    "RepayInterestAccounts",
    "WithdrawAccounts",
    "CollectFeesAccounts",
    "CloseLenderPositionAccounts",
    "ReSettleAccounts",
    "SetBorrowerWhitelistAccounts",
    "SetPauseAccounts",
    "SetBlacklistModeAccounts",
    "SetAdminAccounts",
    "SetWhitelistManagerAccounts",
    "WithdrawExcessAccounts",
    "ForceClosePositionAccounts",
    "ClaimHaircutAccounts",
    "ForceClaimHaircutAccounts",
    # Idempotency Types
    "IdempotencyOptions",
    "InstructionResult",
    # PDAs
    "find_program_data_pda",
    "find_protocol_config_pda",
    "find_market_pda",
    "find_market_authority_pda",
    "find_vault_pda",
    "find_lender_position_pda",
    "find_borrower_whitelist_pda",
    "find_haircut_state_pda",
    "find_blacklist_check_pda",
    "derive_market_pdas",
    "PdaWithBump",
    "MarketPdas",
    # Retry Config
    "RetryConfig",
    # Decoders
    "decode_protocol_config",
    "decode_market",
    "decode_lender_position",
    "decode_borrower_whitelist",
    "decode_haircut_state",
    "decode_account",
    # Fetchers
    "fetch_protocol_config",
    "fetch_market",
    "fetch_lender_position",
    "fetch_borrower_whitelist",
    "fetch_haircut_state",
    # Type Detection
    "AccountType",
    "get_account_type",
    # Validation
    "validate_u64",
    "validate_u128",
    "validate_basis_points",
    "validate_timestamp",
    "set_minimum_timestamp",
    "get_minimum_timestamp",
    "reset_minimum_timestamp",
    # Memo
    "create_memo_instruction",
    # Instruction Builders
    "create_initialize_protocol_instruction",
    "create_set_fee_config_instruction",
    "create_create_market_instruction",
    "create_deposit_instruction",
    "create_borrow_instruction",
    "create_repay_instruction",
    "create_repay_interest_instruction",
    "create_withdraw_instruction",
    "create_collect_fees_instruction",
    "create_re_settle_instruction",
    "create_close_lender_position_instruction",
    "create_withdraw_excess_instruction",
    "create_force_close_position_instruction",
    "create_claim_haircut_instruction",
    "create_force_claim_haircut_instruction",
    "create_set_borrower_whitelist_instruction",
    "create_set_pause_instruction",
    "create_set_blacklist_mode_instruction",
    "create_set_admin_instruction",
    "create_set_whitelist_manager_instruction",
    # Composite Helpers
    "create_waterfall_repay_instructions",
    "WaterfallRepayAccountsDict",
    "WaterfallRepayArgsDict",
    # Error Codes
    "CoalescefiErrorCode",
    "ERROR_MESSAGES",
    "ERROR_RECOVERY_ACTIONS",
    # Error Classes
    "CoalescefiError",
    "SdkError",
    # Error Parsing
    "parse_coalescefi_error",
    # Error Utilities
    "is_user_recoverable_error",
    "get_error_recovery_action",
    "ErrorSeverity",
    "get_error_severity",
    "ErrorCategory",
    "get_error_category",
    "ErrorDetails",
    "get_error_details",
    "is_retryable_error",
    # Idempotency
    "IdempotencyError",
    "IdempotencyManager",
    "IdempotencyManagerOptions",
    "MemoryStorage",
    "PendingOperation",
    "generate_idempotency_key",
    "generate_unique_idempotency_key",
]
