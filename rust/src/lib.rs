//! CoalesceFi Rust SDK
//!
//! A Rust SDK for interacting with the CoalesceFi lending protocol on Solana.
//!
//! # Features
//!
//! - **Zero-copy deserialization**: All account types use `bytemuck::Pod` for efficient
//!   zero-copy deserialization, making it suitable for both on-chain and off-chain use.
//!
//! - **PDA derivation**: Functions to derive all Program Derived Addresses used by the protocol.
//!
//! - **Instruction builders**: Type-safe builders for all 17 protocol instructions.
//!
//! - **Error handling**: Complete error types matching the on-chain program.
//!
//! # Feature Flags
//!
//! - `std` (default): Includes RPC client functionality via `solana-client`.
//! - `no-std`: Minimal build for CPI/on-chain use without std dependencies.
//!
//! # Example
//!
//! ```no_run
//! use coalescefi_sdk::{
//!     pdas::find_protocol_config_pda,
//!     instructions::{create_deposit_instruction, DepositAccounts},
//!     types::DepositArgs,
//!     constants::localnet_program_id,
//! };
//!
//! // Find the protocol config PDA
//! let program_id = localnet_program_id();
//! let protocol_config = find_protocol_config_pda(&program_id);
//!
//! println!("Protocol config: {} (bump: {})", protocol_config.address, protocol_config.bump);
//! ```
//!
//! # On-chain Usage (CPI)
//!
//! When using this SDK for CPI from another Solana program, use the `no-std` feature
//! and the `create_*_pda` functions with known bumps to avoid the overhead of
//! `find_program_address`:
//!
//! ```ignore
//! use coalescefi_sdk::pdas::create_market_pda;
//!
//! // Use stored bump from account data
//! let market_pda = create_market_pda(&borrower, nonce, bump, &program_id);
//! ```

#![cfg_attr(not(feature = "std"), no_std)]

// Use alloc crate for Vec and String in no_std environments
#[cfg(not(feature = "std"))]
extern crate alloc;

pub mod accounts;
pub mod constants;
pub mod errors;

// Instructions module requires alloc for Vec, available in both std and no_std with alloc
#[cfg(any(feature = "std", feature = "no-std"))]
pub mod instructions;

pub mod pdas;
pub mod types;

// Re-export commonly used items at crate root
pub use constants::{
    devnet_program_id, localnet_program_id, mainnet_program_id, InstructionDiscriminator, BPS,
    SECONDS_PER_YEAR, WAD,
};
pub use errors::CoalescefiError;
pub use pdas::{
    derive_market_pdas, find_borrower_whitelist_pda, find_lender_position_pda, find_market_pda,
    find_protocol_config_pda, find_vault_pda, PdaResult,
};
pub use types::{BorrowerWhitelist, LenderPosition, Market, ProtocolConfig};

/// Prelude module for convenient imports.
///
/// ```
/// use coalescefi_sdk::prelude::*;
/// ```
pub mod prelude {
    pub use crate::accounts::{
        decode_account, decode_borrower_whitelist, decode_lender_position, decode_market,
        decode_protocol_config, AccountType, DecodedAccount,
    };
    pub use crate::constants::{
        devnet_program_id, localnet_program_id, mainnet_program_id, InstructionDiscriminator, BPS,
        SECONDS_PER_YEAR, WAD,
    };
    pub use crate::errors::{CoalescefiError, ErrorCategory, ErrorSeverity};
    #[cfg(any(feature = "std", feature = "no-std"))]
    pub use crate::instructions::*;
    pub use crate::pdas::{
        derive_market_pdas, find_blacklist_check_pda, find_borrower_whitelist_pda,
        find_lender_position_pda, find_market_authority_pda, find_market_pda,
        find_program_data_pda, find_protocol_config_pda, find_vault_pda, MarketPdas, PdaResult,
    };
    pub use crate::types::{
        BorrowArgs, BorrowerWhitelist, CreateMarketArgs, DepositArgs, InitializeProtocolArgs,
        LenderPosition, Market, ProtocolConfig, RepayArgs, RepayInterestArgs,
        SetBlacklistModeArgs, SetBorrowerWhitelistArgs, SetFeeConfigArgs, SetPauseArgs,
        WithdrawArgs,
    };

    #[cfg(feature = "std")]
    pub use crate::accounts::{
        fetch_borrower_whitelist, fetch_lender_position, fetch_market, fetch_protocol_config,
        try_fetch_borrower_whitelist, try_fetch_lender_position, try_fetch_market,
        try_fetch_protocol_config,
    };
    #[cfg(feature = "std")]
    pub use crate::errors::parse_error_code;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prelude_imports() {
        // Just verify prelude compiles and types are accessible
        use crate::prelude::*;

        let _ = WAD;
        let _ = BPS;
        let _ = SECONDS_PER_YEAR;
    }

    #[test]
    fn test_root_exports() {
        // Verify root exports are accessible
        let _ = WAD;
        let _ = BPS;

        let program_id = localnet_program_id();
        let pda = find_protocol_config_pda(&program_id);
        assert_ne!(pda.address, solana_program::pubkey::Pubkey::default());
    }

    #[test]
    fn test_error_type() {
        let err = CoalescefiError::ZeroAmount;
        assert_eq!(err.code(), 17);
        assert!(err.is_user_recoverable());
    }
}
