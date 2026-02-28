//! Dumps all SDK constants as JSON to stdout for golden vector validation.
//!
//! This integration test is invoked by the golden-vectors package to validate
//! that the Rust SDK constants match the canonical golden vectors.
//!
//! Run: cargo test --test dump_constants -- --nocapture

use coalescefi_sdk::constants::*;
use coalescefi_sdk::errors::CoalescefiError;

#[test]
fn dump_constants_json() {
    // Build JSON manually to avoid serde dependency
    let json = format!(
        r#"{{
  "math": {{
    "WAD": "{wad}",
    "BPS": "{bps}",
    "SECONDS_PER_YEAR": "{seconds_per_year}",
    "USDC_DECIMALS": {usdc_decimals}
  }},
  "protocolLimits": {{
    "MAX_ANNUAL_INTEREST_BPS": {max_annual_interest_bps},
    "MAX_FEE_RATE_BPS": {max_fee_rate_bps},
    "MIN_MATURITY_DELTA": {min_maturity_delta},
    "SETTLEMENT_GRACE_PERIOD": {settlement_grace_period}
  }},
  "accountSizes": {{
    "PROTOCOL_CONFIG": {protocol_config_size},
    "MARKET": {market_size},
    "LENDER_POSITION": {lender_position_size},
    "BORROWER_WHITELIST": {borrower_whitelist_size}
  }},
  "discriminators": {{
    "PROTOCOL_CONFIG": "{disc_protocol_config}",
    "MARKET": "{disc_market}",
    "LENDER_POSITION": "{disc_lender_position}",
    "BORROWER_WHITELIST": "{disc_borrower_wl}"
  }},
  "pdaSeeds": {{
    "PROTOCOL_CONFIG": "{seed_protocol_config}",
    "MARKET": "{seed_market}",
    "MARKET_AUTHORITY": "{seed_market_authority}",
    "LENDER": "{seed_lender}",
    "VAULT": "{seed_vault}",
    "BORROWER_WHITELIST": "{seed_borrower_whitelist}",
    "BLACKLIST": "{seed_blacklist}"
  }},
  "instructionDiscriminators": {{
    "InitializeProtocol": {ix_initialize_protocol},
    "SetFeeConfig": {ix_set_fee_config},
    "CreateMarket": {ix_create_market},
    "Deposit": {ix_deposit},
    "Borrow": {ix_borrow},
    "Repay": {ix_repay},
    "RepayInterest": {ix_repay_interest},
    "Withdraw": {ix_withdraw},
    "CollectFees": {ix_collect_fees},
    "ReSettle": {ix_resettle},
    "CloseLenderPosition": {ix_close_lender_position},
    "WithdrawExcess": {ix_withdraw_excess},
    "SetBorrowerWhitelist": {ix_set_borrower_whitelist},
    "SetPause": {ix_set_pause},
    "SetBlacklistMode": {ix_set_blacklist_mode},
    "SetAdmin": {ix_set_admin},
    "SetWhitelistManager": {ix_set_whitelist_manager}
  }},
  "errorCodes": {{
    "AlreadyInitialized": {err_already_initialized},
    "InvalidFeeRate": {err_invalid_fee_rate},
    "InvalidCapacity": {err_invalid_capacity},
    "InvalidMaturity": {err_invalid_maturity},
    "MarketAlreadyExists": {err_market_already_exists},
    "Unauthorized": {err_unauthorized},
    "NotWhitelisted": {err_not_whitelisted},
    "Blacklisted": {err_blacklisted},
    "ProtocolPaused": {err_protocol_paused},
    "BorrowerHasActiveDebt": {err_borrower_has_active_debt},
    "InvalidAddress": {err_invalid_address},
    "InvalidMint": {err_invalid_mint},
    "InvalidVault": {err_invalid_vault},
    "InvalidPDA": {err_invalid_pda},
    "InvalidAccountOwner": {err_invalid_account_owner},
    "InvalidTokenProgram": {err_invalid_token_program},
    "InvalidTokenAccountOwner": {err_invalid_token_account_owner},
    "ZeroAmount": {err_zero_amount},
    "ZeroScaledAmount": {err_zero_scaled_amount},
    "InvalidScaleFactor": {err_invalid_scale_factor},
    "InvalidTimestamp": {err_invalid_timestamp},
    "InsufficientBalance": {err_insufficient_balance},
    "InsufficientScaledBalance": {err_insufficient_scaled_balance},
    "NoBalance": {err_no_balance},
    "ZeroPayout": {err_zero_payout},
    "CapExceeded": {err_cap_exceeded},
    "BorrowAmountTooHigh": {err_borrow_amount_too_high},
    "GlobalCapacityExceeded": {err_global_capacity_exceeded},
    "MarketMatured": {err_market_matured},
    "NotMatured": {err_not_matured},
    "NotSettled": {err_not_settled},
    "SettlementNotImproved": {err_settlement_not_improved},
    "SettlementGracePeriod": {err_settlement_grace_period},
    "SettlementNotComplete": {err_settlement_not_complete},
    "PositionNotEmpty": {err_position_not_empty},
    "RepaymentExceedsDebt": {err_repayment_exceeds_debt},
    "NoFeesToCollect": {err_no_fees_to_collect},
    "FeeCollectionDuringDistress": {err_fee_collection_during_distress},
    "LendersPendingWithdrawals": {err_lenders_pending_withdrawals},
    "FeesNotCollected": {err_fees_not_collected},
    "NoExcessToWithdraw": {err_no_excess_to_withdraw},
    "MathOverflow": {err_math_overflow},
    "PayoutBelowMinimum": {err_payout_below_minimum}
  }},
  "programIds": {{
    "devnet": "{program_id_devnet}",
    "mainnet": "{program_id_mainnet}",
    "localnet": "{program_id_localnet}"
  }}
}}"#,
        // Math constants
        wad = WAD,
        bps = BPS,
        seconds_per_year = SECONDS_PER_YEAR,
        usdc_decimals = USDC_DECIMALS,
        // Protocol limits
        max_annual_interest_bps = MAX_ANNUAL_INTEREST_BPS,
        max_fee_rate_bps = MAX_FEE_RATE_BPS,
        min_maturity_delta = MIN_MATURITY_DELTA,
        settlement_grace_period = SETTLEMENT_GRACE_PERIOD,
        // Account sizes
        protocol_config_size = PROTOCOL_CONFIG_SIZE,
        market_size = MARKET_SIZE,
        lender_position_size = LENDER_POSITION_SIZE,
        borrower_whitelist_size = BORROWER_WHITELIST_SIZE,
        // Discriminators (convert bytes to UTF-8 string)
        disc_protocol_config = std::str::from_utf8(DISC_PROTOCOL_CONFIG).unwrap(),
        disc_market = std::str::from_utf8(DISC_MARKET).unwrap(),
        disc_lender_position = std::str::from_utf8(DISC_LENDER_POSITION).unwrap(),
        disc_borrower_wl = std::str::from_utf8(DISC_BORROWER_WL).unwrap(),
        // PDA seeds (convert bytes to UTF-8 string)
        seed_protocol_config = std::str::from_utf8(SEED_PROTOCOL_CONFIG).unwrap(),
        seed_market = std::str::from_utf8(SEED_MARKET).unwrap(),
        seed_market_authority = std::str::from_utf8(SEED_MARKET_AUTHORITY).unwrap(),
        seed_lender = std::str::from_utf8(SEED_LENDER).unwrap(),
        seed_vault = std::str::from_utf8(SEED_VAULT).unwrap(),
        seed_borrower_whitelist = std::str::from_utf8(SEED_BORROWER_WHITELIST).unwrap(),
        seed_blacklist = std::str::from_utf8(SEED_BLACKLIST).unwrap(),
        // Instruction discriminators
        ix_initialize_protocol = InstructionDiscriminator::InitializeProtocol.to_u8(),
        ix_set_fee_config = InstructionDiscriminator::SetFeeConfig.to_u8(),
        ix_create_market = InstructionDiscriminator::CreateMarket.to_u8(),
        ix_deposit = InstructionDiscriminator::Deposit.to_u8(),
        ix_borrow = InstructionDiscriminator::Borrow.to_u8(),
        ix_repay = InstructionDiscriminator::Repay.to_u8(),
        ix_repay_interest = InstructionDiscriminator::RepayInterest.to_u8(),
        ix_withdraw = InstructionDiscriminator::Withdraw.to_u8(),
        ix_collect_fees = InstructionDiscriminator::CollectFees.to_u8(),
        ix_resettle = InstructionDiscriminator::ReSettle.to_u8(),
        ix_close_lender_position = InstructionDiscriminator::CloseLenderPosition.to_u8(),
        ix_withdraw_excess = InstructionDiscriminator::WithdrawExcess.to_u8(),
        ix_set_borrower_whitelist = InstructionDiscriminator::SetBorrowerWhitelist.to_u8(),
        ix_set_pause = InstructionDiscriminator::SetPause.to_u8(),
        ix_set_blacklist_mode = InstructionDiscriminator::SetBlacklistMode.to_u8(),
        ix_set_admin = InstructionDiscriminator::SetAdmin.to_u8(),
        ix_set_whitelist_manager = InstructionDiscriminator::SetWhitelistManager.to_u8(),
        // Error codes
        err_already_initialized = CoalescefiError::AlreadyInitialized.code(),
        err_invalid_fee_rate = CoalescefiError::InvalidFeeRate.code(),
        err_invalid_capacity = CoalescefiError::InvalidCapacity.code(),
        err_invalid_maturity = CoalescefiError::InvalidMaturity.code(),
        err_market_already_exists = CoalescefiError::MarketAlreadyExists.code(),
        err_unauthorized = CoalescefiError::Unauthorized.code(),
        err_not_whitelisted = CoalescefiError::NotWhitelisted.code(),
        err_blacklisted = CoalescefiError::Blacklisted.code(),
        err_protocol_paused = CoalescefiError::ProtocolPaused.code(),
        err_borrower_has_active_debt = CoalescefiError::BorrowerHasActiveDebt.code(),
        err_invalid_address = CoalescefiError::InvalidAddress.code(),
        err_invalid_mint = CoalescefiError::InvalidMint.code(),
        err_invalid_vault = CoalescefiError::InvalidVault.code(),
        err_invalid_pda = CoalescefiError::InvalidPDA.code(),
        err_invalid_account_owner = CoalescefiError::InvalidAccountOwner.code(),
        err_invalid_token_program = CoalescefiError::InvalidTokenProgram.code(),
        err_invalid_token_account_owner = CoalescefiError::InvalidTokenAccountOwner.code(),
        err_zero_amount = CoalescefiError::ZeroAmount.code(),
        err_zero_scaled_amount = CoalescefiError::ZeroScaledAmount.code(),
        err_invalid_scale_factor = CoalescefiError::InvalidScaleFactor.code(),
        err_invalid_timestamp = CoalescefiError::InvalidTimestamp.code(),
        err_insufficient_balance = CoalescefiError::InsufficientBalance.code(),
        err_insufficient_scaled_balance = CoalescefiError::InsufficientScaledBalance.code(),
        err_no_balance = CoalescefiError::NoBalance.code(),
        err_zero_payout = CoalescefiError::ZeroPayout.code(),
        err_cap_exceeded = CoalescefiError::CapExceeded.code(),
        err_borrow_amount_too_high = CoalescefiError::BorrowAmountTooHigh.code(),
        err_global_capacity_exceeded = CoalescefiError::GlobalCapacityExceeded.code(),
        err_market_matured = CoalescefiError::MarketMatured.code(),
        err_not_matured = CoalescefiError::NotMatured.code(),
        err_not_settled = CoalescefiError::NotSettled.code(),
        err_settlement_not_improved = CoalescefiError::SettlementNotImproved.code(),
        err_settlement_grace_period = CoalescefiError::SettlementGracePeriod.code(),
        err_settlement_not_complete = CoalescefiError::SettlementNotComplete.code(),
        err_position_not_empty = CoalescefiError::PositionNotEmpty.code(),
        err_repayment_exceeds_debt = CoalescefiError::RepaymentExceedsDebt.code(),
        err_no_fees_to_collect = CoalescefiError::NoFeesToCollect.code(),
        err_fee_collection_during_distress = CoalescefiError::FeeCollectionDuringDistress.code(),
        err_lenders_pending_withdrawals = CoalescefiError::LendersPendingWithdrawals.code(),
        err_fees_not_collected = CoalescefiError::FeesNotCollected.code(),
        err_no_excess_to_withdraw = CoalescefiError::NoExcessToWithdraw.code(),
        err_math_overflow = CoalescefiError::MathOverflow.code(),
        err_payout_below_minimum = CoalescefiError::PayoutBelowMinimum.code(),
        // Program IDs
        program_id_devnet = PROGRAM_ID_DEVNET,
        program_id_mainnet = PROGRAM_ID_MAINNET,
        program_id_localnet = PROGRAM_ID_LOCALNET,
    );

    println!("{json}");
}
