//! Instruction builders for the CoalesceFi protocol.
//!
//! All instruction builders create Solana instructions that can be used
//! to build transactions for interacting with the CoalesceFi program.

#[cfg(not(feature = "std"))]
use alloc::vec;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};

use crate::constants::InstructionDiscriminator;
use crate::types::{
    BorrowArgs, CreateMarketArgs, DepositArgs, InitializeProtocolArgs, RepayArgs,
    RepayInterestArgs, SetBlacklistModeArgs, SetBorrowerWhitelistArgs, SetFeeConfigArgs,
    SetPauseArgs, WithdrawArgs,
};

// ============================================================================
// Helper functions for serialization
// ============================================================================

fn write_u16_le(buf: &mut Vec<u8>, value: u16) {
    buf.extend_from_slice(&value.to_le_bytes());
}

fn write_u64_le(buf: &mut Vec<u8>, value: u64) {
    buf.extend_from_slice(&value.to_le_bytes());
}

fn write_i64_le(buf: &mut Vec<u8>, value: i64) {
    buf.extend_from_slice(&value.to_le_bytes());
}

fn write_u128_le(buf: &mut Vec<u8>, value: u128) {
    buf.extend_from_slice(&value.to_le_bytes());
}

// ============================================================================
// Account structs for instruction builders
// ============================================================================

/// Accounts for InitializeProtocol instruction.
pub struct InitializeProtocolAccounts {
    pub protocol_config: Pubkey,
    pub admin: Pubkey,
    pub fee_authority: Pubkey,
    pub whitelist_manager: Pubkey,
    pub blacklist_program: Pubkey,
    pub system_program: Pubkey,
    pub program_data: Pubkey,
}

/// Accounts for SetFeeConfig instruction.
pub struct SetFeeConfigAccounts {
    pub protocol_config: Pubkey,
    pub admin: Pubkey,
    pub new_fee_authority: Pubkey,
}

/// Accounts for CreateMarket instruction.
pub struct CreateMarketAccounts {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub market_authority: Pubkey,
    pub protocol_config: Pubkey,
    pub borrower_whitelist: Pubkey,
    pub blacklist_check: Pubkey,
    pub system_program: Pubkey,
    pub token_program: Pubkey,
}

/// Accounts for Deposit instruction.
pub struct DepositAccounts {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub lender_token_account: Pubkey,
    pub vault: Pubkey,
    pub lender_position: Pubkey,
    pub blacklist_check: Pubkey,
    pub protocol_config: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
}

/// Accounts for Borrow instruction.
pub struct BorrowAccounts {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub borrower_token_account: Pubkey,
    pub vault: Pubkey,
    pub market_authority: Pubkey,
    pub borrower_whitelist: Pubkey,
    pub blacklist_check: Pubkey,
    pub protocol_config: Pubkey,
    pub token_program: Pubkey,
}

/// Accounts for Repay instruction.
pub struct RepayAccounts {
    pub market: Pubkey,
    pub payer: Pubkey,
    pub payer_token_account: Pubkey,
    pub vault: Pubkey,
    pub protocol_config: Pubkey,
    pub mint: Pubkey,
    pub borrower_whitelist: Pubkey,
    pub token_program: Pubkey,
}

/// Accounts for RepayInterest instruction.
pub struct RepayInterestAccounts {
    pub market: Pubkey,
    pub payer: Pubkey,
    pub payer_token_account: Pubkey,
    pub vault: Pubkey,
    pub protocol_config: Pubkey,
    pub token_program: Pubkey,
}

/// Accounts for Withdraw instruction.
pub struct WithdrawAccounts {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub lender_token_account: Pubkey,
    pub vault: Pubkey,
    pub lender_position: Pubkey,
    pub market_authority: Pubkey,
    pub blacklist_check: Pubkey,
    pub protocol_config: Pubkey,
    pub token_program: Pubkey,
    pub haircut_state: Pubkey,
}

/// Accounts for CollectFees instruction.
pub struct CollectFeesAccounts {
    pub market: Pubkey,
    pub protocol_config: Pubkey,
    pub fee_authority: Pubkey,
    pub fee_token_account: Pubkey,
    pub vault: Pubkey,
    pub market_authority: Pubkey,
    pub token_program: Pubkey,
}

/// Accounts for ReSettle instruction.
pub struct ReSettleAccounts {
    pub market: Pubkey,
    pub vault: Pubkey,
    pub protocol_config: Pubkey,
    pub haircut_state: Pubkey,
}

/// Accounts for CloseLenderPosition instruction.
pub struct CloseLenderPositionAccounts {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub lender_position: Pubkey,
    pub system_program: Pubkey,
    pub protocol_config: Pubkey,
}

/// Accounts for WithdrawExcess instruction.
pub struct WithdrawExcessAccounts {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub borrower_token_account: Pubkey,
    pub vault: Pubkey,
    pub market_authority: Pubkey,
    pub token_program: Pubkey,
    pub protocol_config: Pubkey,
    pub blacklist_check: Pubkey,
    pub borrower_whitelist: Pubkey,
}

/// Accounts for SetBorrowerWhitelist instruction.
pub struct SetBorrowerWhitelistAccounts {
    pub borrower_whitelist: Pubkey,
    pub protocol_config: Pubkey,
    pub whitelist_manager: Pubkey,
    pub borrower: Pubkey,
    pub system_program: Pubkey,
}

/// Accounts for SetPause instruction.
pub struct SetPauseAccounts {
    pub protocol_config: Pubkey,
    pub admin: Pubkey,
}

/// Accounts for SetBlacklistMode instruction.
pub struct SetBlacklistModeAccounts {
    pub protocol_config: Pubkey,
    pub admin: Pubkey,
}

/// Accounts for SetAdmin instruction.
pub struct SetAdminAccounts {
    pub protocol_config: Pubkey,
    pub current_admin: Pubkey,
    pub new_admin: Pubkey,
}

/// Accounts for SetWhitelistManager instruction.
pub struct SetWhitelistManagerAccounts {
    pub protocol_config: Pubkey,
    pub admin: Pubkey,
    pub new_whitelist_manager: Pubkey,
}

/// Accounts for ForceClosePosition instruction.
pub struct ForceClosePositionAccounts {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub lender_position: Pubkey,
    pub vault: Pubkey,
    pub escrow_token_account: Pubkey,
    pub market_authority: Pubkey,
    pub protocol_config: Pubkey,
    pub token_program: Pubkey,
    pub haircut_state: Pubkey,
}

// ============================================================================
// Instruction builders
// ============================================================================

/// Create InitializeProtocol instruction.
///
/// Discriminator: 0
/// Data layout: [fee_rate_bps(2 bytes)]
///
/// Note: Only the program's upgrade authority can initialize the protocol.
pub fn create_initialize_protocol_instruction(
    accounts: InitializeProtocolAccounts,
    args: InitializeProtocolArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::InitializeProtocol.to_u8()];
    write_u16_le(&mut data, args.fee_rate_bps);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.protocol_config, false),
            AccountMeta::new(accounts.admin, true),
            AccountMeta::new_readonly(accounts.fee_authority, false),
            AccountMeta::new_readonly(accounts.whitelist_manager, false),
            AccountMeta::new_readonly(accounts.blacklist_program, false),
            AccountMeta::new_readonly(accounts.system_program, false),
            AccountMeta::new_readonly(accounts.program_data, false),
        ],
        data,
    }
}

/// Create SetFeeConfig instruction.
///
/// Discriminator: 1
/// Data layout: [fee_rate_bps(2 bytes)]
pub fn create_set_fee_config_instruction(
    accounts: SetFeeConfigAccounts,
    args: SetFeeConfigArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::SetFeeConfig.to_u8()];
    write_u16_le(&mut data, args.fee_rate_bps);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.admin, true),
            AccountMeta::new_readonly(accounts.new_fee_authority, false),
        ],
        data,
    }
}

/// Create CreateMarket instruction.
///
/// Discriminator: 2
/// Data layout: [market_nonce(8), annual_interest_bps(2), maturity_timestamp(8), max_total_supply(8)]
pub fn create_create_market_instruction(
    accounts: CreateMarketAccounts,
    args: CreateMarketArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::CreateMarket.to_u8()];
    write_u64_le(&mut data, args.market_nonce);
    write_u16_le(&mut data, args.annual_interest_bps);
    write_i64_le(&mut data, args.maturity_timestamp);
    write_u64_le(&mut data, args.max_total_supply);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new(accounts.borrower, true),
            AccountMeta::new_readonly(accounts.mint, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.borrower_whitelist, false),
            AccountMeta::new_readonly(accounts.blacklist_check, false),
            AccountMeta::new_readonly(accounts.system_program, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Create Deposit instruction.
///
/// Discriminator: 3
/// Data layout: [amount(8 bytes)]
pub fn create_deposit_instruction(
    accounts: DepositAccounts,
    args: DepositArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::Deposit.to_u8()];
    write_u64_le(&mut data, args.amount);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new(accounts.lender, true),
            AccountMeta::new(accounts.lender_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new(accounts.lender_position, false),
            AccountMeta::new_readonly(accounts.blacklist_check, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.mint, false),
            AccountMeta::new_readonly(accounts.token_program, false),
            AccountMeta::new_readonly(accounts.system_program, false),
        ],
        data,
    }
}

/// Create Borrow instruction.
///
/// Discriminator: 4
/// Data layout: [amount(8 bytes)]
pub fn create_borrow_instruction(
    accounts: BorrowAccounts,
    args: BorrowArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::Borrow.to_u8()];
    write_u64_le(&mut data, args.amount);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.borrower, true),
            AccountMeta::new(accounts.borrower_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new(accounts.borrower_whitelist, false),
            AccountMeta::new_readonly(accounts.blacklist_check, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Create Repay instruction.
///
/// Discriminator: 5
/// Data layout: [amount(8 bytes)]
///
/// Note: The borrower_whitelist account is derived from the market's borrower address.
pub fn create_repay_instruction(
    accounts: RepayAccounts,
    args: RepayArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::Repay.to_u8()];
    write_u64_le(&mut data, args.amount);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.payer, true),
            AccountMeta::new(accounts.payer_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.mint, false),
            AccountMeta::new(accounts.borrower_whitelist, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Create RepayInterest instruction.
///
/// Discriminator: 6
/// Data layout: [amount(8 bytes)]
///
/// Repays accrued interest to the market vault WITHOUT affecting borrower capacity.
pub fn create_repay_interest_instruction(
    accounts: RepayInterestAccounts,
    args: RepayInterestArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::RepayInterest.to_u8()];
    write_u64_le(&mut data, args.amount);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.payer, true),
            AccountMeta::new(accounts.payer_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Create Withdraw instruction.
///
/// Discriminator: 7
/// Data layout: [scaled_amount(16 bytes, u128), min_payout(8 bytes, u64)]
///
/// The min_payout parameter provides slippage protection.
pub fn create_withdraw_instruction(
    accounts: WithdrawAccounts,
    args: WithdrawArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::Withdraw.to_u8()];
    write_u128_le(&mut data, args.scaled_amount);
    write_u64_le(&mut data, args.min_payout);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.lender, true),
            AccountMeta::new(accounts.lender_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new(accounts.lender_position, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new_readonly(accounts.blacklist_check, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.token_program, false),
            AccountMeta::new(accounts.haircut_state, false),
        ],
        data,
    }
}

/// Create CollectFees instruction.
///
/// Discriminator: 8
/// Data layout: [discriminator only]
pub fn create_collect_fees_instruction(
    accounts: CollectFeesAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::CollectFees.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.fee_authority, true),
            AccountMeta::new(accounts.fee_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Create ReSettle instruction.
///
/// Discriminator: 9
/// Data layout: [discriminator only] - permissionless, no args
///
/// The new settlement factor is computed automatically from the vault balance.
pub fn create_resettle_instruction(accounts: ReSettleAccounts, program_id: &Pubkey) -> Instruction {
    let data = vec![InstructionDiscriminator::ReSettle.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.vault, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new(accounts.haircut_state, false),
        ],
        data,
    }
}

/// Create CloseLenderPosition instruction.
///
/// Discriminator: 10
/// Data layout: [discriminator only]
///
/// On-chain account order: [market, lender, lender_position, system_program, protocol_config]
pub fn create_close_lender_position_instruction(
    accounts: CloseLenderPositionAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::CloseLenderPosition.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(accounts.market, false),
            AccountMeta::new(accounts.lender, true),
            AccountMeta::new(accounts.lender_position, false),
            AccountMeta::new_readonly(accounts.system_program, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
        ],
        data,
    }
}

/// Create WithdrawExcess instruction.
///
/// Discriminator: 11
/// Data layout: [discriminator only]
///
/// Allows the borrower to withdraw excess funds from the vault.
///
/// On-chain account order: [market, borrower, borrower_token, vault, market_authority, token_program, protocol_config, blacklist_check]
pub fn create_withdraw_excess_instruction(
    accounts: WithdrawExcessAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::WithdrawExcess.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(accounts.market, false),
            AccountMeta::new_readonly(accounts.borrower, true),
            AccountMeta::new(accounts.borrower_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new_readonly(accounts.token_program, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.blacklist_check, false),
            AccountMeta::new_readonly(accounts.borrower_whitelist, false),
        ],
        data,
    }
}

/// Create SetBorrowerWhitelist instruction.
///
/// Discriminator: 12
/// Data layout: [is_whitelisted(1 byte), max_borrow_capacity(8 bytes)]
pub fn create_set_borrower_whitelist_instruction(
    accounts: SetBorrowerWhitelistAccounts,
    args: SetBorrowerWhitelistArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::SetBorrowerWhitelist.to_u8()];
    data.push(if args.is_whitelisted { 1 } else { 0 });
    write_u64_le(&mut data, args.max_borrow_capacity);

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.borrower_whitelist, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new(accounts.whitelist_manager, true),
            AccountMeta::new_readonly(accounts.borrower, false),
            AccountMeta::new_readonly(accounts.system_program, false),
        ],
        data,
    }
}

/// Create SetPause instruction.
///
/// Discriminator: 13
/// Data layout: [paused(1 byte)]
pub fn create_set_pause_instruction(
    accounts: SetPauseAccounts,
    args: SetPauseArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::SetPause.to_u8()];
    data.push(if args.paused { 1 } else { 0 });

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.admin, true),
        ],
        data,
    }
}

/// Create SetBlacklistMode instruction.
///
/// Discriminator: 14
/// Data layout: [fail_closed(1 byte)]
pub fn create_set_blacklist_mode_instruction(
    accounts: SetBlacklistModeAccounts,
    args: SetBlacklistModeArgs,
    program_id: &Pubkey,
) -> Instruction {
    let mut data = vec![InstructionDiscriminator::SetBlacklistMode.to_u8()];
    data.push(if args.fail_closed { 1 } else { 0 });

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.admin, true),
        ],
        data,
    }
}

/// Create SetAdmin instruction.
///
/// Discriminator: 15
/// Data layout: (no data)
///
/// Transfers admin role to a new address. Only the current admin can call this.
pub fn create_set_admin_instruction(
    accounts: SetAdminAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::SetAdmin.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.current_admin, true),
            AccountMeta::new_readonly(accounts.new_admin, false),
        ],
        data,
    }
}

/// Create SetWhitelistManager instruction.
///
/// Discriminator: 16
/// Data layout: (no data)
///
/// Changes the whitelist manager to a new address. Only the admin can call this.
pub fn create_set_whitelist_manager_instruction(
    accounts: SetWhitelistManagerAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::SetWhitelistManager.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.admin, true),
            AccountMeta::new_readonly(accounts.new_whitelist_manager, false),
        ],
        data,
    }
}

/// Create ForceClosePosition instruction.
///
/// Data layout: `[18]` (discriminator only, no additional data)
///
/// Borrower force-closes a lender position after maturity + grace period.
/// Computes payout (same as withdraw), transfers to escrow ATA, zeros
/// the position, and decrements scaled_total_supply.
pub fn create_force_close_position_instruction(
    accounts: ForceClosePositionAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::ForceClosePosition.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.borrower, true),
            AccountMeta::new(accounts.lender_position, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new(accounts.escrow_token_account, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.token_program, false),
            AccountMeta::new(accounts.haircut_state, false),
        ],
        data,
    }
}

/// Accounts for ClaimHaircut instruction.
pub struct ClaimHaircutAccounts {
    pub market: Pubkey,
    pub lender: Pubkey,
    pub lender_position: Pubkey,
    pub lender_token_account: Pubkey,
    pub vault: Pubkey,
    pub market_authority: Pubkey,
    pub haircut_state: Pubkey,
    pub protocol_config: Pubkey,
    pub token_program: Pubkey,
}

/// Create ClaimHaircut instruction.
///
/// Discriminator: 19
/// Data layout: [discriminator only]
///
/// Allows a lender to claim their haircut recovery tokens.
pub fn create_claim_haircut_instruction(
    accounts: ClaimHaircutAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::ClaimHaircut.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.lender, true),
            AccountMeta::new(accounts.lender_position, false),
            AccountMeta::new(accounts.lender_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new(accounts.haircut_state, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Accounts for ForceClaimHaircut instruction.
pub struct ForceClaimHaircutAccounts {
    pub market: Pubkey,
    pub borrower: Pubkey,
    pub lender_position: Pubkey,
    pub escrow_token_account: Pubkey,
    pub vault: Pubkey,
    pub market_authority: Pubkey,
    pub haircut_state: Pubkey,
    pub protocol_config: Pubkey,
    pub token_program: Pubkey,
}

/// Create ForceClaimHaircut instruction.
///
/// Discriminator: 20
/// Data layout: [discriminator only]
///
/// Allows the borrower to force-claim haircut recovery on behalf of a lender.
pub fn create_force_claim_haircut_instruction(
    accounts: ForceClaimHaircutAccounts,
    program_id: &Pubkey,
) -> Instruction {
    let data = vec![InstructionDiscriminator::ForceClaimHaircut.to_u8()];

    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(accounts.market, false),
            AccountMeta::new_readonly(accounts.borrower, true),
            AccountMeta::new(accounts.lender_position, false),
            AccountMeta::new(accounts.escrow_token_account, false),
            AccountMeta::new(accounts.vault, false),
            AccountMeta::new_readonly(accounts.market_authority, false),
            AccountMeta::new(accounts.haircut_state, false),
            AccountMeta::new_readonly(accounts.protocol_config, false),
            AccountMeta::new_readonly(accounts.token_program, false),
        ],
        data,
    }
}

/// Accounts for a waterfall repay (interest-first, then principal).
/// Combines the accounts needed by both RepayInterest and Repay instructions.
#[derive(Debug, Clone, Copy)]
pub struct WaterfallRepayAccounts {
    pub market: Pubkey,
    pub payer: Pubkey,
    pub payer_token_account: Pubkey,
    pub vault: Pubkey,
    pub protocol_config: Pubkey,
    /// Token mint — required for the principal Repay instruction.
    pub mint: Pubkey,
    /// Borrower whitelist PDA — required for the principal Repay instruction.
    pub borrower_whitelist: Pubkey,
    pub token_program: Pubkey,
}

/// Arguments for a waterfall repay.
/// The helper splits `total_amount` into interest-first, then principal.
#[derive(Debug, Clone, Copy)]
pub struct WaterfallRepayArgs {
    /// Total amount to repay in token smallest units.
    pub total_amount: u64,
    /// Amount allocated to interest (0 to total_amount).
    /// The remainder (total_amount - interest_amount) goes to principal.
    pub interest_amount: u64,
}

/// Create waterfall repay instructions: interest-first, then principal.
///
/// Builds up to two instructions that should be added to a single transaction:
/// 1. RepayInterest (if interest_amount > 0) — pays accrued interest
/// 2. Repay (if total_amount - interest_amount > 0) — repays principal and frees borrow capacity
///
/// Interest is paid first so that on-chain state is correct when the principal
/// instruction executes.
///
/// # Panics
///
/// Panics if `interest_amount > total_amount`.
///
/// # Returns
///
/// A `Vec` of 0–2 instructions to add to a transaction. Empty if `total_amount` is 0.
pub fn create_waterfall_repay_instructions(
    accounts: WaterfallRepayAccounts,
    args: WaterfallRepayArgs,
    program_id: &Pubkey,
) -> Vec<Instruction> {
    assert!(
        args.interest_amount <= args.total_amount,
        "interest_amount cannot exceed total_amount"
    );

    if args.total_amount == 0 {
        return vec![];
    }

    let mut instructions = Vec::with_capacity(2);

    // Interest instruction first (so on-chain state is correct when principal executes)
    if args.interest_amount > 0 {
        let interest_ix = create_repay_interest_instruction(
            RepayInterestAccounts {
                market: accounts.market,
                payer: accounts.payer,
                payer_token_account: accounts.payer_token_account,
                vault: accounts.vault,
                protocol_config: accounts.protocol_config,
                token_program: accounts.token_program,
            },
            RepayInterestArgs {
                amount: args.interest_amount,
            },
            program_id,
        );
        instructions.push(interest_ix);
    }

    // Principal instruction for the remainder
    let principal_amount = args.total_amount - args.interest_amount;
    if principal_amount > 0 {
        let principal_ix = create_repay_instruction(
            RepayAccounts {
                market: accounts.market,
                payer: accounts.payer,
                payer_token_account: accounts.payer_token_account,
                vault: accounts.vault,
                protocol_config: accounts.protocol_config,
                mint: accounts.mint,
                borrower_whitelist: accounts.borrower_whitelist,
                token_program: accounts.token_program,
            },
            RepayArgs {
                amount: principal_amount,
            },
            program_id,
        );
        instructions.push(principal_ix);
    }

    instructions
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::localnet_program_id;

    fn test_pubkey(seed: u8) -> Pubkey {
        let mut bytes = [0u8; 32];
        bytes[0] = seed;
        Pubkey::new_from_array(bytes)
    }

    #[test]
    fn test_initialize_protocol_instruction() {
        let program_id = localnet_program_id();
        let accounts = InitializeProtocolAccounts {
            protocol_config: test_pubkey(1),
            admin: test_pubkey(2),
            fee_authority: test_pubkey(3),
            whitelist_manager: test_pubkey(4),
            blacklist_program: test_pubkey(5),
            system_program: test_pubkey(6),
            program_data: test_pubkey(7),
        };
        let args = InitializeProtocolArgs {
            fee_rate_bps: 500,
        };

        let ix = create_initialize_protocol_instruction(accounts, args, &program_id);

        assert_eq!(ix.program_id, program_id);
        assert_eq!(ix.accounts.len(), 7);
        assert_eq!(
            ix.data[0],
            InstructionDiscriminator::InitializeProtocol.to_u8()
        );
        assert_eq!(u16::from_le_bytes([ix.data[1], ix.data[2]]), 500);
    }

    #[test]
    fn test_deposit_instruction() {
        let program_id = localnet_program_id();
        let accounts = DepositAccounts {
            market: test_pubkey(1),
            lender: test_pubkey(2),
            lender_token_account: test_pubkey(3),
            vault: test_pubkey(4),
            lender_position: test_pubkey(5),
            blacklist_check: test_pubkey(6),
            protocol_config: test_pubkey(7),
            mint: test_pubkey(8),
            token_program: test_pubkey(9),
            system_program: test_pubkey(10),
        };
        let args = DepositArgs { amount: 1_000_000 };

        let ix = create_deposit_instruction(accounts, args, &program_id);

        assert_eq!(ix.program_id, program_id);
        assert_eq!(ix.accounts.len(), 10);
        assert_eq!(ix.data[0], InstructionDiscriminator::Deposit.to_u8());
        assert_eq!(
            u64::from_le_bytes(ix.data[1..9].try_into().unwrap()),
            1_000_000
        );
    }

    #[test]
    fn test_withdraw_instruction() {
        let program_id = localnet_program_id();
        let accounts = WithdrawAccounts {
            market: test_pubkey(1),
            lender: test_pubkey(2),
            lender_token_account: test_pubkey(3),
            vault: test_pubkey(4),
            lender_position: test_pubkey(5),
            market_authority: test_pubkey(6),
            blacklist_check: test_pubkey(7),
            protocol_config: test_pubkey(8),
            token_program: test_pubkey(9),
            haircut_state: test_pubkey(10),
        };
        let args = WithdrawArgs {
            scaled_amount: 1_000_000_000_000_000_000u128,
            min_payout: 900_000,
        };

        let ix = create_withdraw_instruction(accounts, args, &program_id);

        assert_eq!(ix.program_id, program_id);
        assert_eq!(ix.accounts.len(), 10);
        assert_eq!(ix.data[0], InstructionDiscriminator::Withdraw.to_u8());
        // Data: 1 byte discriminator + 16 bytes scaled_amount + 8 bytes min_payout
        assert_eq!(ix.data.len(), 1 + 16 + 8);
    }

    #[test]
    fn test_create_market_instruction() {
        let program_id = localnet_program_id();
        let accounts = CreateMarketAccounts {
            market: test_pubkey(1),
            borrower: test_pubkey(2),
            mint: test_pubkey(3),
            vault: test_pubkey(4),
            market_authority: test_pubkey(5),
            protocol_config: test_pubkey(6),
            borrower_whitelist: test_pubkey(7),
            blacklist_check: test_pubkey(8),
            system_program: test_pubkey(9),
            token_program: test_pubkey(10),
        };
        let args = CreateMarketArgs {
            market_nonce: 42,
            annual_interest_bps: 1000,
            maturity_timestamp: 1700000000,
            max_total_supply: 1_000_000_000,
        };

        let ix = create_create_market_instruction(accounts, args, &program_id);

        assert_eq!(ix.program_id, program_id);
        assert_eq!(ix.accounts.len(), 10);
        assert_eq!(ix.data[0], InstructionDiscriminator::CreateMarket.to_u8());
        // Data: 1 + 8 + 2 + 8 + 8 = 27 bytes
        assert_eq!(ix.data.len(), 27);
    }

    #[test]
    fn test_set_borrower_whitelist_instruction() {
        let program_id = localnet_program_id();
        let accounts = SetBorrowerWhitelistAccounts {
            borrower_whitelist: test_pubkey(1),
            protocol_config: test_pubkey(2),
            whitelist_manager: test_pubkey(3),
            borrower: test_pubkey(4),
            system_program: test_pubkey(5),
        };
        let args = SetBorrowerWhitelistArgs {
            is_whitelisted: true,
            max_borrow_capacity: 10_000_000,
        };

        let ix = create_set_borrower_whitelist_instruction(accounts, args, &program_id);

        assert_eq!(ix.program_id, program_id);
        assert_eq!(ix.accounts.len(), 5);
        assert_eq!(
            ix.data[0],
            InstructionDiscriminator::SetBorrowerWhitelist.to_u8()
        );
        assert_eq!(ix.data[1], 1); // is_whitelisted = true
    }

    #[test]
    fn test_set_pause_instruction() {
        let program_id = localnet_program_id();
        let accounts = SetPauseAccounts {
            protocol_config: test_pubkey(1),
            admin: test_pubkey(2),
        };
        let args = SetPauseArgs { paused: true };

        let ix = create_set_pause_instruction(accounts, args, &program_id);

        assert_eq!(ix.data[0], InstructionDiscriminator::SetPause.to_u8());
        assert_eq!(ix.data[1], 1); // paused = true
    }

    // ---- Waterfall repay helper tests ----

    fn test_waterfall_accounts() -> WaterfallRepayAccounts {
        WaterfallRepayAccounts {
            market: test_pubkey(1),
            payer: test_pubkey(2),
            payer_token_account: test_pubkey(3),
            vault: test_pubkey(4),
            protocol_config: test_pubkey(5),
            mint: test_pubkey(6),
            borrower_whitelist: test_pubkey(7),
            token_program: test_pubkey(8),
        }
    }

    #[test]
    fn test_waterfall_interest_and_principal() {
        let program_id = localnet_program_id();
        let ixs = create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 1_000_000,
                interest_amount: 50_000,
            },
            &program_id,
        );

        assert_eq!(ixs.len(), 2);
        // First: RepayInterest (disc 6), 6 accounts
        assert_eq!(
            ixs[0].data[0],
            InstructionDiscriminator::RepayInterest.to_u8()
        );
        assert_eq!(ixs[0].accounts.len(), 6);
        // Second: Repay (disc 5), 8 accounts
        assert_eq!(ixs[1].data[0], InstructionDiscriminator::Repay.to_u8());
        assert_eq!(ixs[1].accounts.len(), 8);
    }

    #[test]
    fn test_waterfall_correct_amounts() {
        let program_id = localnet_program_id();
        let ixs = create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 1_000_000,
                interest_amount: 50_000,
            },
            &program_id,
        );

        let interest_encoded = u64::from_le_bytes(ixs[0].data[1..9].try_into().unwrap());
        assert_eq!(interest_encoded, 50_000);

        let principal_encoded = u64::from_le_bytes(ixs[1].data[1..9].try_into().unwrap());
        assert_eq!(principal_encoded, 950_000);
    }

    #[test]
    fn test_waterfall_interest_equals_total() {
        let program_id = localnet_program_id();
        let ixs = create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 500_000,
                interest_amount: 500_000,
            },
            &program_id,
        );

        assert_eq!(ixs.len(), 1);
        assert_eq!(
            ixs[0].data[0],
            InstructionDiscriminator::RepayInterest.to_u8()
        );
    }

    #[test]
    fn test_waterfall_zero_interest() {
        let program_id = localnet_program_id();
        let ixs = create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 500_000,
                interest_amount: 0,
            },
            &program_id,
        );

        assert_eq!(ixs.len(), 1);
        assert_eq!(ixs[0].data[0], InstructionDiscriminator::Repay.to_u8());
    }

    #[test]
    fn test_waterfall_zero_total() {
        let program_id = localnet_program_id();
        let ixs = create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 0,
                interest_amount: 0,
            },
            &program_id,
        );

        assert_eq!(ixs.len(), 0);
    }

    #[test]
    #[should_panic(expected = "interest_amount cannot exceed total_amount")]
    fn test_waterfall_interest_exceeds_total() {
        let program_id = localnet_program_id();
        create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 100_000,
                interest_amount: 200_000,
            },
            &program_id,
        );
    }

    #[test]
    fn test_waterfall_correct_accounts() {
        let program_id = localnet_program_id();
        let accts = test_waterfall_accounts();
        let ixs = create_waterfall_repay_instructions(
            accts,
            WaterfallRepayArgs {
                total_amount: 1_000_000,
                interest_amount: 50_000,
            },
            &program_id,
        );

        // RepayInterest: [market, payer, payer_token_account, vault, protocol_config, token_program]
        assert_eq!(ixs[0].accounts[0].pubkey, accts.market);
        assert_eq!(ixs[0].accounts[1].pubkey, accts.payer);
        assert_eq!(ixs[0].accounts[2].pubkey, accts.payer_token_account);
        assert_eq!(ixs[0].accounts[3].pubkey, accts.vault);
        assert_eq!(ixs[0].accounts[4].pubkey, accts.protocol_config);
        assert_eq!(ixs[0].accounts[5].pubkey, accts.token_program);

        // Repay: [market, payer, payer_token_account, vault, protocol_config, mint, borrower_whitelist, token_program]
        assert_eq!(ixs[1].accounts[0].pubkey, accts.market);
        assert_eq!(ixs[1].accounts[1].pubkey, accts.payer);
        assert_eq!(ixs[1].accounts[2].pubkey, accts.payer_token_account);
        assert_eq!(ixs[1].accounts[3].pubkey, accts.vault);
        assert_eq!(ixs[1].accounts[4].pubkey, accts.protocol_config);
        assert_eq!(ixs[1].accounts[5].pubkey, accts.mint);
        assert_eq!(ixs[1].accounts[6].pubkey, accts.borrower_whitelist);
        assert_eq!(ixs[1].accounts[7].pubkey, accts.token_program);
    }

    #[test]
    fn test_waterfall_program_id_propagated() {
        let custom_id = test_pubkey(99);
        let ixs = create_waterfall_repay_instructions(
            test_waterfall_accounts(),
            WaterfallRepayArgs {
                total_amount: 1_000_000,
                interest_amount: 50_000,
            },
            &custom_id,
        );

        assert_eq!(ixs[0].program_id, custom_id);
        assert_eq!(ixs[1].program_id, custom_id);
    }

    #[test]
    fn test_account_meta_properties() {
        let program_id = localnet_program_id();
        let accounts = DepositAccounts {
            market: test_pubkey(1),
            lender: test_pubkey(2),
            lender_token_account: test_pubkey(3),
            vault: test_pubkey(4),
            lender_position: test_pubkey(5),
            blacklist_check: test_pubkey(6),
            protocol_config: test_pubkey(7),
            mint: test_pubkey(8),
            token_program: test_pubkey(9),
            system_program: test_pubkey(10),
        };
        let args = DepositArgs { amount: 1_000_000 };

        let ix = create_deposit_instruction(accounts, args, &program_id);

        // market should be writable
        assert!(ix.accounts[0].is_writable);
        // lender should be signer and writable
        assert!(ix.accounts[1].is_signer);
        assert!(ix.accounts[1].is_writable);
        // blacklist_check should be read-only
        assert!(!ix.accounts[5].is_writable);
    }
}
