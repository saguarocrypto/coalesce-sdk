//! Account structures and instruction argument types for the CoalesceFi protocol.
//!
//! All structs use `#[repr(C)]` and implement `bytemuck::Pod` for zero-copy deserialization.
//! Field sizes and ordering must match the on-chain Rust program exactly.

use bytemuck::{Pod, Zeroable};

// ============================================================================
// Account Structures - Zero-copy deserialization
// ============================================================================

/// ProtocolConfig account structure (194 bytes).
///
/// Layout:
/// - discriminator: [u8; 8]          (0-7)
/// - version: u8                     (8)
/// - admin: [u8; 32]                 (9-40)
/// - fee_rate_bps: [u8; 2]           (41-42)
/// - fee_authority: [u8; 32]         (43-74)
/// - whitelist_manager: [u8; 32]     (75-106)
/// - blacklist_program: [u8; 32]     (107-138)
/// - is_initialized: u8              (139)
/// - bump: u8                        (140)
/// - is_paused: u8                   (141)
/// - is_blacklist_fail_closed: u8    (142)
/// - _padding: [u8; 51]              (143-193) (split: 32 + 19)
#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct ProtocolConfig {
    /// Account discriminator (8 bytes): "COALPC__"
    pub discriminator: [u8; 8],
    /// Account schema version
    pub version: u8,
    /// Protocol admin pubkey
    pub admin: [u8; 32],
    /// Fee rate as basis points (little-endian u16)
    pub fee_rate_bps: [u8; 2],
    /// Fee collection wallet
    pub fee_authority: [u8; 32],
    /// Whitelist manager pubkey
    pub whitelist_manager: [u8; 32],
    /// External blacklist program
    pub blacklist_program: [u8; 32],
    /// Guard against double-init (1 = initialized)
    pub is_initialized: u8,
    /// PDA bump seed
    pub bump: u8,
    /// Emergency pause flag (1 = paused)
    pub is_paused: u8,
    /// Blacklist mode (1 = fail-closed, 0 = fail-open)
    pub is_blacklist_fail_closed: u8,
    /// Padding for future use (split for bytemuck compatibility: 32 + 19 = 51)
    pub _padding1: [u8; 32],
    pub _padding2: [u8; 19],
}

impl ProtocolConfig {
    /// Get fee rate as u16.
    pub fn fee_rate_bps(&self) -> u16 {
        u16::from_le_bytes(self.fee_rate_bps)
    }

    /// Check if the protocol is initialized.
    pub fn is_initialized(&self) -> bool {
        self.is_initialized == 1
    }

    /// Check if the protocol is paused.
    pub fn is_paused(&self) -> bool {
        self.is_paused == 1
    }

    /// Check if blacklist mode is fail-closed.
    pub fn is_blacklist_fail_closed(&self) -> bool {
        self.is_blacklist_fail_closed == 1
    }
}

/// Market account structure (250 bytes).
///
/// Layout:
/// - discriminator: [u8; 8]                (0-7)
/// - version: u8                           (8)
/// - borrower: [u8; 32]                    (9-40)
/// - mint: [u8; 32]                        (41-72)
/// - vault: [u8; 32]                       (73-104)
/// - market_authority_bump: u8             (105)
/// - annual_interest_bps: [u8; 2]          (106-107)
/// - maturity_timestamp: [u8; 8]           (108-115)
/// - max_total_supply: [u8; 8]             (116-123)
/// - market_nonce: [u8; 8]                 (124-131)
/// - scaled_total_supply: [u8; 16]         (132-147)
/// - scale_factor: [u8; 16]                (148-163)
/// - accrued_protocol_fees: [u8; 8]        (164-171)
/// - total_deposited: [u8; 8]              (172-179)
/// - total_borrowed: [u8; 8]               (180-187)
/// - total_repaid: [u8; 8]                 (188-195)
/// - total_interest_repaid: [u8; 8]        (196-203)
/// - last_accrual_timestamp: [u8; 8]       (204-211)
/// - settlement_factor_wad: [u8; 16]       (212-227)
/// - bump: u8                              (228)
/// - haircut_accumulator: [u8; 8]          (229-236)
/// - _padding: [u8; 13]                    (237-249)
#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Market {
    /// Account discriminator (8 bytes): "COALMKT_"
    pub discriminator: [u8; 8],
    /// Account schema version
    pub version: u8,
    /// Borrower pubkey
    pub borrower: [u8; 32],
    /// USDC mint pubkey
    pub mint: [u8; 32],
    /// Vault PDA pubkey
    pub vault: [u8; 32],
    /// Market authority PDA bump
    pub market_authority_bump: u8,
    /// Fixed annual rate in bps (little-endian u16)
    pub annual_interest_bps: [u8; 2],
    /// Loan maturity timestamp (little-endian i64)
    pub maturity_timestamp: [u8; 8],
    /// Market capacity in raw-principal USDC (little-endian u64)
    pub max_total_supply: [u8; 8],
    /// PDA derivation nonce (little-endian u64)
    pub market_nonce: [u8; 8],
    /// Sum of lender scaled balances (little-endian u128)
    pub scaled_total_supply: [u8; 16],
    /// WAD precision scale factor (little-endian u128)
    pub scale_factor: [u8; 16],
    /// Uncollected fees (little-endian u64)
    pub accrued_protocol_fees: [u8; 8],
    /// Running total raw-principal deposits (little-endian u64)
    pub total_deposited: [u8; 8],
    /// Running total borrowed (little-endian u64)
    pub total_borrowed: [u8; 8],
    /// Running total repaid (little-endian u64)
    pub total_repaid: [u8; 8],
    /// Running total interest repaid (little-endian u64)
    pub total_interest_repaid: [u8; 8],
    /// Last interest accrual timestamp (little-endian i64)
    pub last_accrual_timestamp: [u8; 8],
    /// Payout ratio at settlement (little-endian u128)
    pub settlement_factor_wad: [u8; 16],
    /// Market PDA bump
    pub bump: u8,
    /// Cumulative haircut gap from distressed withdrawals (COAL-H01, little-endian u64)
    pub haircut_accumulator: [u8; 8],
    /// Reserved padding
    pub _padding: [u8; 13],
}

impl Market {
    /// Get annual interest rate as u16 bps.
    pub fn annual_interest_bps(&self) -> u16 {
        u16::from_le_bytes(self.annual_interest_bps)
    }

    /// Get maturity timestamp as i64.
    pub fn maturity_timestamp(&self) -> i64 {
        i64::from_le_bytes(self.maturity_timestamp)
    }

    /// Get max total supply as u64.
    pub fn max_total_supply(&self) -> u64 {
        u64::from_le_bytes(self.max_total_supply)
    }

    /// Get market nonce as u64.
    pub fn market_nonce(&self) -> u64 {
        u64::from_le_bytes(self.market_nonce)
    }

    /// Get scaled total supply as u128.
    pub fn scaled_total_supply(&self) -> u128 {
        u128::from_le_bytes(self.scaled_total_supply)
    }

    /// Get scale factor as u128.
    pub fn scale_factor(&self) -> u128 {
        u128::from_le_bytes(self.scale_factor)
    }

    /// Get accrued protocol fees as u64.
    pub fn accrued_protocol_fees(&self) -> u64 {
        u64::from_le_bytes(self.accrued_protocol_fees)
    }

    /// Get total deposited as u64.
    pub fn total_deposited(&self) -> u64 {
        u64::from_le_bytes(self.total_deposited)
    }

    /// Get total borrowed as u64.
    pub fn total_borrowed(&self) -> u64 {
        u64::from_le_bytes(self.total_borrowed)
    }

    /// Get total repaid as u64.
    pub fn total_repaid(&self) -> u64 {
        u64::from_le_bytes(self.total_repaid)
    }

    /// Get total interest repaid as u64.
    pub fn total_interest_repaid(&self) -> u64 {
        u64::from_le_bytes(self.total_interest_repaid)
    }

    /// Get last accrual timestamp as i64.
    pub fn last_accrual_timestamp(&self) -> i64 {
        i64::from_le_bytes(self.last_accrual_timestamp)
    }

    /// Get settlement factor as u128 (WAD precision).
    pub fn settlement_factor_wad(&self) -> u128 {
        u128::from_le_bytes(self.settlement_factor_wad)
    }

    /// Check if the market has been settled (settlement_factor > 0).
    pub fn is_settled(&self) -> bool {
        self.settlement_factor_wad() > 0
    }

    /// Check if the market has matured.
    pub fn is_matured(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.maturity_timestamp()
    }

    /// Get haircut accumulator as u64 (COAL-H01).
    pub fn haircut_accumulator(&self) -> u64 {
        u64::from_le_bytes(self.haircut_accumulator)
    }
}

/// LenderPosition account structure (128 bytes).
///
/// Layout:
/// - discriminator: [u8; 8]      (0-7)
/// - version: u8                 (8)
/// - market: [u8; 32]            (9-40)
/// - lender: [u8; 32]            (41-72)
/// - scaled_balance: [u8; 16]    (73-88)
/// - bump: u8                    (89)
/// - haircut_owed: [u8; 8]       (90-97)
/// - withdrawal_sf: [u8; 16]     (98-113)
/// - _padding: [u8; 14]          (114-127)
#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct LenderPosition {
    /// Account discriminator (8 bytes): "COALLPOS"
    pub discriminator: [u8; 8],
    /// Account schema version
    pub version: u8,
    /// Market this position belongs to
    pub market: [u8; 32],
    /// Lender wallet address
    pub lender: [u8; 32],
    /// Lender's share balance (little-endian u128)
    pub scaled_balance: [u8; 16],
    /// PDA bump
    pub bump: u8,
    /// Haircut recovery owed to this lender (little-endian u64)
    pub haircut_owed: [u8; 8],
    /// Settlement factor at time of last withdrawal (little-endian u128)
    pub withdrawal_sf: [u8; 16],
    /// Reserved padding
    pub _padding: [u8; 14],
}

impl LenderPosition {
    /// Get scaled balance as u128.
    pub fn scaled_balance(&self) -> u128 {
        u128::from_le_bytes(self.scaled_balance)
    }

    /// Check if position has balance.
    pub fn has_balance(&self) -> bool {
        self.scaled_balance() > 0
    }

    /// Get haircut recovery owed as u64.
    pub fn haircut_owed(&self) -> u64 {
        u64::from_le_bytes(self.haircut_owed)
    }

    /// Get withdrawal settlement factor as u128 (WAD precision).
    pub fn withdrawal_sf(&self) -> u128 {
        u128::from_le_bytes(self.withdrawal_sf)
    }
}

/// BorrowerWhitelist account structure (96 bytes).
///
/// Layout:
/// - discriminator: [u8; 8]          (0-7)
/// - version: u8                     (8)
/// - borrower: [u8; 32]              (9-40)
/// - is_whitelisted: u8              (41)
/// - max_borrow_capacity: [u8; 8]    (42-49)
/// - current_borrowed: [u8; 8]       (50-57)
/// - bump: u8                        (58)
/// - _padding: [u8; 37]              (59-95)
#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct BorrowerWhitelist {
    /// Account discriminator (8 bytes): "COALBWL_"
    pub discriminator: [u8; 8],
    /// Account schema version
    pub version: u8,
    /// Borrower wallet pubkey
    pub borrower: [u8; 32],
    /// Whitelist status (1 = whitelisted)
    pub is_whitelisted: u8,
    /// Maximum USDC that can be outstanding at any time (little-endian u64)
    pub max_borrow_capacity: [u8; 8],
    /// Current outstanding USDC debt (little-endian u64)
    pub current_borrowed: [u8; 8],
    /// PDA bump
    pub bump: u8,
    /// Padding for future use (split for bytemuck compatibility: 32 + 5 = 37)
    pub _padding1: [u8; 32],
    pub _padding2: [u8; 5],
}

impl BorrowerWhitelist {
    /// Check if borrower is whitelisted.
    pub fn is_whitelisted(&self) -> bool {
        self.is_whitelisted == 1
    }

    /// Get max borrow capacity as u64.
    pub fn max_borrow_capacity(&self) -> u64 {
        u64::from_le_bytes(self.max_borrow_capacity)
    }

    /// Get current borrowed as u64.
    pub fn current_borrowed(&self) -> u64 {
        u64::from_le_bytes(self.current_borrowed)
    }

    /// Get available borrow capacity.
    pub fn available_capacity(&self) -> u64 {
        self.max_borrow_capacity()
            .saturating_sub(self.current_borrowed())
    }
}

/// HaircutState account structure (88 bytes).
///
/// Layout:
/// - discriminator: [u8; 8]       (0-7)
/// - version: u8                  (8)
/// - market: [u8; 32]             (9-40)
/// - claim_weight_sum: [u8; 16]   (41-56)
/// - claim_offset_sum: [u8; 16]   (57-72)
/// - bump: u8                     (73)
/// - _padding: [u8; 14]           (74-87)
#[derive(Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct HaircutState {
    /// Account discriminator (8 bytes): "COALHCST"
    pub discriminator: [u8; 8],
    /// Account schema version
    pub version: u8,
    /// Market this haircut state belongs to
    pub market: [u8; 32],
    /// Sum of claim weights (little-endian u128)
    pub claim_weight_sum: [u8; 16],
    /// Sum of claim offsets (little-endian u128)
    pub claim_offset_sum: [u8; 16],
    /// PDA bump
    pub bump: u8,
    /// Reserved padding
    pub _padding: [u8; 14],
}

impl HaircutState {
    /// Get the market pubkey.
    pub fn market_pubkey(&self) -> solana_program::pubkey::Pubkey {
        solana_program::pubkey::Pubkey::new_from_array(self.market)
    }

    /// Get claim weight sum as u128.
    pub fn claim_weight_sum(&self) -> u128 {
        u128::from_le_bytes(self.claim_weight_sum)
    }

    /// Get claim offset sum as u128.
    pub fn claim_offset_sum(&self) -> u128 {
        u128::from_le_bytes(self.claim_offset_sum)
    }
}

// ============================================================================
// Instruction Argument Types
// ============================================================================

/// Arguments for InitializeProtocol instruction.
#[derive(Debug, Clone, Copy)]
pub struct InitializeProtocolArgs {
    /// Fee rate in basis points (0-10000).
    pub fee_rate_bps: u16,
}

/// Arguments for SetFeeConfig instruction.
#[derive(Debug, Clone, Copy)]
pub struct SetFeeConfigArgs {
    /// Fee rate in basis points (0-10000).
    pub fee_rate_bps: u16,
}

/// Arguments for CreateMarket instruction.
#[derive(Debug, Clone, Copy)]
pub struct CreateMarketArgs {
    /// Unique nonce for market PDA derivation.
    pub market_nonce: u64,
    /// Annual interest rate in basis points (0-10000).
    pub annual_interest_bps: u16,
    /// Unix timestamp when the loan matures.
    pub maturity_timestamp: i64,
    /// Maximum total supply in token smallest units.
    pub max_total_supply: u64,
}

/// Arguments for Deposit instruction.
#[derive(Debug, Clone, Copy)]
pub struct DepositArgs {
    /// Amount to deposit in token smallest units.
    pub amount: u64,
}

/// Arguments for Borrow instruction.
#[derive(Debug, Clone, Copy)]
pub struct BorrowArgs {
    /// Amount to borrow in token smallest units.
    pub amount: u64,
}

/// Arguments for Repay instruction.
#[derive(Debug, Clone, Copy)]
pub struct RepayArgs {
    /// Amount to repay in token smallest units.
    pub amount: u64,
}

/// Arguments for RepayInterest instruction.
#[derive(Debug, Clone, Copy)]
pub struct RepayInterestArgs {
    /// Amount of interest to repay in token smallest units.
    pub amount: u64,
}

/// Arguments for Withdraw instruction.
#[derive(Debug, Clone, Copy)]
pub struct WithdrawArgs {
    /// Scaled amount of shares to withdraw (0 = full withdrawal).
    pub scaled_amount: u128,
    /// Minimum payout amount for slippage protection (0 = disabled).
    pub min_payout: u64,
}

/// Arguments for SetBorrowerWhitelist instruction.
#[derive(Debug, Clone, Copy)]
pub struct SetBorrowerWhitelistArgs {
    /// Whether the borrower is whitelisted.
    pub is_whitelisted: bool,
    /// Maximum borrow capacity in token smallest units.
    pub max_borrow_capacity: u64,
}

/// Arguments for SetPause instruction.
#[derive(Debug, Clone, Copy)]
pub struct SetPauseArgs {
    /// Whether the protocol should be paused.
    pub paused: bool,
}

/// Arguments for SetBlacklistMode instruction.
#[derive(Debug, Clone, Copy)]
pub struct SetBlacklistModeArgs {
    /// Whether to use fail-closed mode.
    pub fail_closed: bool,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::*;

    #[test]
    fn test_protocol_config_size() {
        assert_eq!(
            std::mem::size_of::<ProtocolConfig>(),
            PROTOCOL_CONFIG_SIZE,
            "ProtocolConfig size mismatch"
        );
    }

    #[test]
    fn test_market_size() {
        assert_eq!(
            std::mem::size_of::<Market>(),
            MARKET_SIZE,
            "Market size mismatch"
        );
    }

    #[test]
    fn test_lender_position_size() {
        assert_eq!(
            std::mem::size_of::<LenderPosition>(),
            LENDER_POSITION_SIZE,
            "LenderPosition size mismatch"
        );
    }

    #[test]
    fn test_haircut_state_size() {
        assert_eq!(
            std::mem::size_of::<HaircutState>(),
            HAIRCUT_STATE_SIZE,
            "HaircutState size mismatch"
        );
    }

    #[test]
    fn test_borrower_whitelist_size() {
        assert_eq!(
            std::mem::size_of::<BorrowerWhitelist>(),
            BORROWER_WHITELIST_SIZE,
            "BorrowerWhitelist size mismatch"
        );
    }

    #[test]
    fn test_protocol_config_methods() {
        let mut config = ProtocolConfig::zeroed();
        config.fee_rate_bps = 500u16.to_le_bytes();
        config.is_initialized = 1;
        config.is_paused = 1;
        config.is_blacklist_fail_closed = 1;

        assert_eq!(config.fee_rate_bps(), 500);
        assert!(config.is_initialized());
        assert!(config.is_paused());
        assert!(config.is_blacklist_fail_closed());
    }

    #[test]
    fn test_market_methods() {
        let mut market = Market::zeroed();
        market.annual_interest_bps = 1000u16.to_le_bytes();
        market.maturity_timestamp = 1700000000i64.to_le_bytes();
        market.max_total_supply = 1_000_000u64.to_le_bytes();
        market.market_nonce = 42u64.to_le_bytes();
        market.scale_factor = WAD.to_le_bytes();
        market.settlement_factor_wad = WAD.to_le_bytes();
        market.haircut_accumulator = 500u64.to_le_bytes();

        assert_eq!(market.annual_interest_bps(), 1000);
        assert_eq!(market.maturity_timestamp(), 1700000000);
        assert_eq!(market.max_total_supply(), 1_000_000);
        assert_eq!(market.market_nonce(), 42);
        assert_eq!(market.scale_factor(), WAD);
        assert!(market.is_settled());
        assert!(market.is_matured(1700000001));
        assert!(!market.is_matured(1699999999));
        assert_eq!(market.haircut_accumulator(), 500);
    }

    #[test]
    fn test_lender_position_methods() {
        let mut position = LenderPosition::zeroed();
        position.scaled_balance = 1_000_000u128.to_le_bytes();

        assert_eq!(position.scaled_balance(), 1_000_000);
        assert!(position.has_balance());

        let empty_position = LenderPosition::zeroed();
        assert!(!empty_position.has_balance());
    }

    #[test]
    fn test_borrower_whitelist_methods() {
        let mut whitelist = BorrowerWhitelist::zeroed();
        whitelist.is_whitelisted = 1;
        whitelist.max_borrow_capacity = 1_000_000u64.to_le_bytes();
        whitelist.current_borrowed = 400_000u64.to_le_bytes();

        assert!(whitelist.is_whitelisted());
        assert_eq!(whitelist.max_borrow_capacity(), 1_000_000);
        assert_eq!(whitelist.current_borrowed(), 400_000);
        assert_eq!(whitelist.available_capacity(), 600_000);
    }
}
