//! Constants for the CoalesceFi lending protocol.
//!
//! This module contains all constants that must match the on-chain Rust program exactly,
//! including PDA seeds, discriminators, account sizes, and mathematical constants.

use solana_program::pubkey::Pubkey;

// ============================================================================
// Program IDs
// ============================================================================

/// Program ID for mainnet deployment.
pub const PROGRAM_ID_MAINNET: &str = "GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR";

/// Program ID for devnet deployment.
///
/// **Note:** Currently identical to [`PROGRAM_ID_MAINNET`]. There is no separate devnet
/// deployment — the same program is used on all clusters. This constant exists for
/// forward-compatibility if a devnet-specific deployment is added in the future.
pub const PROGRAM_ID_DEVNET: &str = "GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR";

/// Program ID for localnet deployment (testing only).
pub const PROGRAM_ID_LOCALNET: &str = "2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy";

/// Get the mainnet program ID as a [`Pubkey`].
pub fn mainnet_program_id() -> Pubkey {
    PROGRAM_ID_MAINNET
        .parse()
        .expect("Invalid mainnet program ID")
}

/// Get the devnet program ID as a [`Pubkey`].
///
/// **Note:** Currently returns the same address as [`mainnet_program_id()`].
/// See [`PROGRAM_ID_DEVNET`] for details.
pub fn devnet_program_id() -> Pubkey {
    PROGRAM_ID_DEVNET
        .parse()
        .expect("Invalid devnet program ID")
}

/// Get the localnet program ID as a [`Pubkey`].
pub fn localnet_program_id() -> Pubkey {
    PROGRAM_ID_LOCALNET
        .parse()
        .expect("Invalid localnet program ID")
}

// ============================================================================
// PDA Seeds - Must match the Rust program exactly
// ============================================================================

/// Seed for ProtocolConfig PDA derivation.
pub const SEED_PROTOCOL_CONFIG: &[u8] = b"protocol_config";

/// Seed for Market PDA derivation.
pub const SEED_MARKET: &[u8] = b"market";

/// Seed for Market Authority PDA derivation.
pub const SEED_MARKET_AUTHORITY: &[u8] = b"market_authority";

/// Seed for Lender Position PDA derivation.
pub const SEED_LENDER: &[u8] = b"lender";

/// Seed for Vault PDA derivation.
pub const SEED_VAULT: &[u8] = b"vault";

/// Seed for Borrower Whitelist PDA derivation.
pub const SEED_BORROWER_WHITELIST: &[u8] = b"borrower_whitelist";

/// Seed for Blacklist check PDA derivation.
pub const SEED_BLACKLIST: &[u8] = b"blacklist";

/// Seed for HaircutState PDA derivation.
pub const SEED_HAIRCUT_STATE: &[u8] = b"haircut_state";

// ============================================================================
// Account Discriminators - 8-byte prefixes for each account type
// ============================================================================

/// Discriminator for ProtocolConfig accounts.
pub const DISC_PROTOCOL_CONFIG: &[u8; 8] = b"COALPC__";

/// Discriminator for Market accounts.
pub const DISC_MARKET: &[u8; 8] = b"COALMKT_";

/// Discriminator for LenderPosition accounts.
pub const DISC_LENDER_POSITION: &[u8; 8] = b"COALLPOS";

/// Discriminator for BorrowerWhitelist accounts.
pub const DISC_BORROWER_WL: &[u8; 8] = b"COALBWL_";

/// Discriminator for HaircutState accounts.
pub const DISC_HAIRCUT_STATE: &[u8; 8] = b"COALHCST";

// ============================================================================
// Account Sizes - Must match the Rust #[repr(C)] structs exactly
// ============================================================================

/// Size of ProtocolConfig account in bytes.
pub const PROTOCOL_CONFIG_SIZE: usize = 194;

/// Size of Market account in bytes.
pub const MARKET_SIZE: usize = 250;

/// Size of LenderPosition account in bytes.
pub const LENDER_POSITION_SIZE: usize = 128;

/// Size of BorrowerWhitelist account in bytes.
pub const BORROWER_WHITELIST_SIZE: usize = 96;

/// Size of HaircutState account in bytes.
pub const HAIRCUT_STATE_SIZE: usize = 88;

// ============================================================================
// Mathematical Constants
// ============================================================================

/// WAD precision factor (1e18) for fixed-point arithmetic.
pub const WAD: u128 = 1_000_000_000_000_000_000;

/// Basis points denominator (10,000 = 100%).
pub const BPS: u64 = 10_000;

/// Seconds per year (365 days).
pub const SECONDS_PER_YEAR: i64 = 31_536_000;

// ============================================================================
// Protocol Limits
// ============================================================================

/// Maximum annual interest rate in basis points (100% = 10,000 bps).
pub const MAX_ANNUAL_INTEREST_BPS: u16 = 10_000;

/// Maximum fee rate in basis points (100% = 10,000 bps).
pub const MAX_FEE_RATE_BPS: u16 = 10_000;

/// USDC token decimals.
pub const USDC_DECIMALS: u8 = 6;

/// Minimum seconds until maturity when creating a market.
pub const MIN_MATURITY_DELTA: i64 = 60;

/// Settlement grace period in seconds (5 minutes) - prevents front-running settlement.
pub const SETTLEMENT_GRACE_PERIOD: i64 = 300;

// ============================================================================
// Instruction Discriminators
// ============================================================================

/// Instruction discriminators for the CoalesceFi protocol.
///
/// These MUST match the Rust program's lib.rs dispatch exactly.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstructionDiscriminator {
    // ADMIN/SETUP (0-2)
    /// Initialize the protocol configuration.
    InitializeProtocol = 0,
    /// Set fee configuration.
    SetFeeConfig = 1,
    /// Create a new lending market.
    CreateMarket = 2,

    // CORE LENDING (3-7)
    /// Deposit tokens into a market.
    Deposit = 3,
    /// Borrow tokens from a market.
    Borrow = 4,
    /// Repay borrowed tokens (principal).
    Repay = 5,
    /// Repay interest only.
    RepayInterest = 6,
    /// Withdraw tokens from a market.
    Withdraw = 7,

    // SETTLEMENT (8-11)
    /// Collect accrued protocol fees.
    CollectFees = 8,
    /// Re-settle a market with improved factor.
    ReSettle = 9,
    /// Close a lender position.
    CloseLenderPosition = 10,
    /// Withdraw excess funds (borrower only).
    WithdrawExcess = 11,

    // ACCESS CONTROL (12-16)
    /// Set borrower whitelist status.
    SetBorrowerWhitelist = 12,
    /// Pause or unpause the protocol.
    SetPause = 13,
    /// Set blacklist mode (fail-open or fail-closed).
    SetBlacklistMode = 14,
    /// Transfer admin role.
    SetAdmin = 15,
    /// Set whitelist manager.
    SetWhitelistManager = 16,

    // FORCE-CLOSE (18)
    /// Force-close a lender position after maturity + grace period (borrower only).
    ForceClosePosition = 18,

    // HAIRCUT RECOVERY (19-20)
    /// Claim haircut recovery tokens (lender only).
    ClaimHaircut = 19,
    /// Force-claim haircut recovery on behalf of a lender (borrower only).
    ForceClaimHaircut = 20,
}

impl InstructionDiscriminator {
    /// Convert to u8 for serialization.
    pub fn to_u8(self) -> u8 {
        self as u8
    }

    /// Try to convert from u8.
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::InitializeProtocol),
            1 => Some(Self::SetFeeConfig),
            2 => Some(Self::CreateMarket),
            3 => Some(Self::Deposit),
            4 => Some(Self::Borrow),
            5 => Some(Self::Repay),
            6 => Some(Self::RepayInterest),
            7 => Some(Self::Withdraw),
            8 => Some(Self::CollectFees),
            9 => Some(Self::ReSettle),
            10 => Some(Self::CloseLenderPosition),
            11 => Some(Self::WithdrawExcess),
            12 => Some(Self::SetBorrowerWhitelist),
            13 => Some(Self::SetPause),
            14 => Some(Self::SetBlacklistMode),
            15 => Some(Self::SetAdmin),
            16 => Some(Self::SetWhitelistManager),
            18 => Some(Self::ForceClosePosition),
            19 => Some(Self::ClaimHaircut),
            20 => Some(Self::ForceClaimHaircut),
            _ => None,
        }
    }
}

// ============================================================================
// Known Program Addresses
// ============================================================================

/// SPL Token Program ID.
pub const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/// System Program ID.
pub const SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";

/// BPF Loader Upgradeable Program ID.
pub const BPF_LOADER_UPGRADEABLE_PROGRAM_ID: &str = "BPFLoaderUpgradeab1e11111111111111111111111";

/// Get the SPL Token Program ID as a Pubkey.
pub fn spl_token_program_id() -> Pubkey {
    SPL_TOKEN_PROGRAM_ID
        .parse()
        .expect("Invalid SPL Token program ID")
}

/// Get the System Program ID as a Pubkey.
pub fn system_program_id() -> Pubkey {
    SYSTEM_PROGRAM_ID
        .parse()
        .expect("Invalid System program ID")
}

/// Get the BPF Loader Upgradeable Program ID as a Pubkey.
pub fn bpf_loader_upgradeable_program_id() -> Pubkey {
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
        .parse()
        .expect("Invalid BPF Loader program ID")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discriminator_roundtrip() {
        for i in 0..=16u8 {
            let disc = InstructionDiscriminator::from_u8(i).unwrap();
            assert_eq!(disc.to_u8(), i);
        }
        assert!(InstructionDiscriminator::from_u8(17).is_none());
        let fc = InstructionDiscriminator::from_u8(18).unwrap();
        assert_eq!(fc.to_u8(), 18);
        let ch = InstructionDiscriminator::from_u8(19).unwrap();
        assert_eq!(ch.to_u8(), 19);
        let fch = InstructionDiscriminator::from_u8(20).unwrap();
        assert_eq!(fch.to_u8(), 20);
        assert!(InstructionDiscriminator::from_u8(21).is_none());
    }

    #[test]
    fn test_seed_lengths() {
        assert_eq!(SEED_PROTOCOL_CONFIG, b"protocol_config");
        assert_eq!(SEED_MARKET, b"market");
        assert_eq!(SEED_MARKET_AUTHORITY, b"market_authority");
        assert_eq!(SEED_LENDER, b"lender");
        assert_eq!(SEED_VAULT, b"vault");
        assert_eq!(SEED_BORROWER_WHITELIST, b"borrower_whitelist");
        assert_eq!(SEED_BLACKLIST, b"blacklist");
        assert_eq!(SEED_HAIRCUT_STATE, b"haircut_state");
    }

    #[test]
    fn test_discriminator_lengths() {
        assert_eq!(DISC_PROTOCOL_CONFIG.len(), 8);
        assert_eq!(DISC_MARKET.len(), 8);
        assert_eq!(DISC_LENDER_POSITION.len(), 8);
        assert_eq!(DISC_BORROWER_WL.len(), 8);
        assert_eq!(DISC_HAIRCUT_STATE.len(), 8);
    }

    #[test]
    fn test_math_constants() {
        assert_eq!(WAD, 1_000_000_000_000_000_000u128);
        assert_eq!(BPS, 10_000u64);
        assert_eq!(SECONDS_PER_YEAR, 31_536_000i64);
    }

    #[test]
    fn test_program_ids_are_valid() {
        // These should not panic
        let _ = mainnet_program_id();
        let _ = devnet_program_id();
        let _ = localnet_program_id();
        let _ = spl_token_program_id();
        let _ = system_program_id();
        let _ = bpf_loader_upgradeable_program_id();
    }
}
