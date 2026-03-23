//! PDA (Program Derived Address) derivation functions for the CoalesceFi protocol.
//!
//! All PDA derivations use the same seeds as the TypeScript SDK and on-chain program.

#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use solana_program::pubkey::Pubkey;

use crate::constants::{
    SEED_BLACKLIST, SEED_BORROWER_WHITELIST, SEED_HAIRCUT_STATE, SEED_LENDER, SEED_MARKET,
    SEED_MARKET_AUTHORITY, SEED_PROTOCOL_CONFIG, SEED_VAULT,
};

/// Result of a PDA derivation.
#[derive(Debug, Clone, Copy)]
pub struct PdaResult {
    /// The derived address.
    pub address: Pubkey,
    /// The bump seed used.
    pub bump: u8,
}

impl PdaResult {
    /// Create a new PDA result.
    pub fn new(address: Pubkey, bump: u8) -> Self {
        Self { address, bump }
    }
}

/// Find the Program Data PDA for a given program.
///
/// This is used to verify the upgrade authority during initialization.
/// Seeds: [program_id] with BPF Loader Upgradeable as the program.
pub fn find_program_data_pda(program_id: &Pubkey) -> PdaResult {
    let bpf_loader_upgradeable: Pubkey = crate::constants::bpf_loader_upgradeable_program_id();
    let (address, bump) =
        Pubkey::find_program_address(&[program_id.as_ref()], &bpf_loader_upgradeable);
    PdaResult::new(address, bump)
}

/// Find the ProtocolConfig PDA.
///
/// Seeds: [SEED_PROTOCOL_CONFIG]
pub fn find_protocol_config_pda(program_id: &Pubkey) -> PdaResult {
    let (address, bump) = Pubkey::find_program_address(&[SEED_PROTOCOL_CONFIG], program_id);
    PdaResult::new(address, bump)
}

/// Find a Market PDA.
///
/// Seeds: [SEED_MARKET, borrower_pubkey, market_nonce (u64 LE)]
pub fn find_market_pda(borrower: &Pubkey, market_nonce: u64, program_id: &Pubkey) -> PdaResult {
    let nonce_bytes = market_nonce.to_le_bytes();
    let (address, bump) =
        Pubkey::find_program_address(&[SEED_MARKET, borrower.as_ref(), &nonce_bytes], program_id);
    PdaResult::new(address, bump)
}

/// Find a Market Authority PDA.
///
/// Seeds: [SEED_MARKET_AUTHORITY, market_pubkey]
pub fn find_market_authority_pda(market: &Pubkey, program_id: &Pubkey) -> PdaResult {
    let (address, bump) =
        Pubkey::find_program_address(&[SEED_MARKET_AUTHORITY, market.as_ref()], program_id);
    PdaResult::new(address, bump)
}

/// Find a Vault PDA.
///
/// Seeds: [SEED_VAULT, market_pubkey]
pub fn find_vault_pda(market: &Pubkey, program_id: &Pubkey) -> PdaResult {
    let (address, bump) = Pubkey::find_program_address(&[SEED_VAULT, market.as_ref()], program_id);
    PdaResult::new(address, bump)
}

/// Find a LenderPosition PDA.
///
/// Seeds: [SEED_LENDER, market, lender]
pub fn find_lender_position_pda(
    market: &Pubkey,
    lender: &Pubkey,
    program_id: &Pubkey,
) -> PdaResult {
    let (address, bump) =
        Pubkey::find_program_address(&[SEED_LENDER, market.as_ref(), lender.as_ref()], program_id);
    PdaResult::new(address, bump)
}

/// Find a BorrowerWhitelist PDA.
///
/// Seeds: [SEED_BORROWER_WHITELIST, borrower]
pub fn find_borrower_whitelist_pda(borrower: &Pubkey, program_id: &Pubkey) -> PdaResult {
    let (address, bump) =
        Pubkey::find_program_address(&[SEED_BORROWER_WHITELIST, borrower.as_ref()], program_id);
    PdaResult::new(address, bump)
}

/// Find a Blacklist check PDA (for external blacklist program).
///
/// Seeds: [SEED_BLACKLIST, address]
///
/// Note: This uses the blacklist_program as the program_id, not the CoalesceFi program.
pub fn find_blacklist_check_pda(address: &Pubkey, blacklist_program: &Pubkey) -> PdaResult {
    let (pda_address, bump) =
        Pubkey::find_program_address(&[SEED_BLACKLIST, address.as_ref()], blacklist_program);
    PdaResult::new(pda_address, bump)
}

/// Find a HaircutState PDA.
///
/// Seeds: [SEED_HAIRCUT_STATE, market_pubkey]
pub fn find_haircut_state_pda(market: &Pubkey, program_id: &Pubkey) -> PdaResult {
    let (address, bump) =
        Pubkey::find_program_address(&[SEED_HAIRCUT_STATE, market.as_ref()], program_id);
    PdaResult::new(address, bump)
}

/// Create HaircutState PDA with known bump.
pub fn create_haircut_state_pda(
    market: &Pubkey,
    bump: u8,
    program_id: &Pubkey,
) -> Option<Pubkey> {
    create_pda_with_bump(&[SEED_HAIRCUT_STATE, market.as_ref()], bump, program_id)
}

/// Derive all PDAs needed for creating a new market.
///
/// Market PDA depends on borrower + nonce; authority and vault depend on market pubkey.
#[derive(Debug, Clone, Copy)]
pub struct MarketPdas {
    /// The market PDA.
    pub market: PdaResult,
    /// The market authority PDA.
    pub market_authority: PdaResult,
    /// The vault PDA.
    pub vault: PdaResult,
}

/// Derive all market-related PDAs.
pub fn derive_market_pdas(borrower: &Pubkey, market_nonce: u64, program_id: &Pubkey) -> MarketPdas {
    let market = find_market_pda(borrower, market_nonce, program_id);
    let market_authority = find_market_authority_pda(&market.address, program_id);
    let vault = find_vault_pda(&market.address, program_id);

    MarketPdas {
        market,
        market_authority,
        vault,
    }
}

/// Create a PDA with known bump (for CPI calls where bump is stored in account).
///
/// This avoids the overhead of find_program_address when you already know the bump.
pub fn create_pda_with_bump(seeds: &[&[u8]], bump: u8, program_id: &Pubkey) -> Option<Pubkey> {
    let bump_slice = &[bump];
    let mut seeds_with_bump: Vec<&[u8]> = seeds.to_vec();
    seeds_with_bump.push(bump_slice);

    Pubkey::create_program_address(&seeds_with_bump, program_id).ok()
}

/// Create ProtocolConfig PDA with known bump.
pub fn create_protocol_config_pda(bump: u8, program_id: &Pubkey) -> Option<Pubkey> {
    create_pda_with_bump(&[SEED_PROTOCOL_CONFIG], bump, program_id)
}

/// Create Market PDA with known bump.
pub fn create_market_pda(
    borrower: &Pubkey,
    market_nonce: u64,
    bump: u8,
    program_id: &Pubkey,
) -> Option<Pubkey> {
    let nonce_bytes = market_nonce.to_le_bytes();
    create_pda_with_bump(
        &[SEED_MARKET, borrower.as_ref(), &nonce_bytes],
        bump,
        program_id,
    )
}

/// Create Market Authority PDA with known bump.
pub fn create_market_authority_pda(
    market: &Pubkey,
    bump: u8,
    program_id: &Pubkey,
) -> Option<Pubkey> {
    create_pda_with_bump(&[SEED_MARKET_AUTHORITY, market.as_ref()], bump, program_id)
}

/// Create Vault PDA with known bump.
pub fn create_vault_pda(market: &Pubkey, bump: u8, program_id: &Pubkey) -> Option<Pubkey> {
    create_pda_with_bump(&[SEED_VAULT, market.as_ref()], bump, program_id)
}

/// Create LenderPosition PDA with known bump.
pub fn create_lender_position_pda(
    market: &Pubkey,
    lender: &Pubkey,
    bump: u8,
    program_id: &Pubkey,
) -> Option<Pubkey> {
    create_pda_with_bump(
        &[SEED_LENDER, market.as_ref(), lender.as_ref()],
        bump,
        program_id,
    )
}

/// Create BorrowerWhitelist PDA with known bump.
pub fn create_borrower_whitelist_pda(
    borrower: &Pubkey,
    bump: u8,
    program_id: &Pubkey,
) -> Option<Pubkey> {
    create_pda_with_bump(
        &[SEED_BORROWER_WHITELIST, borrower.as_ref()],
        bump,
        program_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{devnet_program_id, localnet_program_id};

    fn test_pubkey(seed: u8) -> Pubkey {
        let mut bytes = [0u8; 32];
        bytes[0] = seed;
        Pubkey::new_from_array(bytes)
    }

    #[test]
    fn test_find_protocol_config_pda() {
        let program_id = localnet_program_id();
        let result = find_protocol_config_pda(&program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_protocol_config_pda(result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_find_market_pda() {
        let program_id = localnet_program_id();
        let borrower = test_pubkey(1);
        let market_nonce = 12345u64;

        let result = find_market_pda(&borrower, market_nonce, &program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_market_pda(&borrower, market_nonce, result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_find_market_authority_pda() {
        let program_id = localnet_program_id();
        let market = test_pubkey(2);

        let result = find_market_authority_pda(&market, &program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_market_authority_pda(&market, result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_find_vault_pda() {
        let program_id = localnet_program_id();
        let market = test_pubkey(3);

        let result = find_vault_pda(&market, &program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_vault_pda(&market, result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_find_lender_position_pda() {
        let program_id = localnet_program_id();
        let market = test_pubkey(4);
        let lender = test_pubkey(5);

        let result = find_lender_position_pda(&market, &lender, &program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_lender_position_pda(&market, &lender, result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_find_borrower_whitelist_pda() {
        let program_id = localnet_program_id();
        let borrower = test_pubkey(6);

        let result = find_borrower_whitelist_pda(&borrower, &program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_borrower_whitelist_pda(&borrower, result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_derive_market_pdas() {
        let program_id = localnet_program_id();
        let borrower = test_pubkey(7);
        let market_nonce = 42u64;

        let pdas = derive_market_pdas(&borrower, market_nonce, &program_id);

        // Verify market PDA
        let market_recreated =
            create_market_pda(&borrower, market_nonce, pdas.market.bump, &program_id);
        assert_eq!(market_recreated, Some(pdas.market.address));

        // Verify market authority PDA uses the derived market address
        let authority_recreated = create_market_authority_pda(
            &pdas.market.address,
            pdas.market_authority.bump,
            &program_id,
        );
        assert_eq!(authority_recreated, Some(pdas.market_authority.address));

        // Verify vault PDA uses the derived market address
        let vault_recreated = create_vault_pda(&pdas.market.address, pdas.vault.bump, &program_id);
        assert_eq!(vault_recreated, Some(pdas.vault.address));
    }

    #[test]
    fn test_pda_determinism() {
        // PDAs should be deterministic - same inputs produce same outputs
        let program_id = devnet_program_id();
        let borrower = test_pubkey(8);
        let market_nonce = 100u64;

        let result1 = find_market_pda(&borrower, market_nonce, &program_id);
        let result2 = find_market_pda(&borrower, market_nonce, &program_id);

        assert_eq!(result1.address, result2.address);
        assert_eq!(result1.bump, result2.bump);
    }

    #[test]
    fn test_pda_uniqueness() {
        // Different nonces should produce different PDAs
        let program_id = localnet_program_id();
        let borrower = test_pubkey(9);

        let result1 = find_market_pda(&borrower, 1, &program_id);
        let result2 = find_market_pda(&borrower, 2, &program_id);

        assert_ne!(result1.address, result2.address);
    }

    #[test]
    fn test_find_haircut_state_pda() {
        let program_id = localnet_program_id();
        let market = test_pubkey(10);

        let result = find_haircut_state_pda(&market, &program_id);

        // Verify the PDA can be recreated with the bump
        let recreated = create_haircut_state_pda(&market, result.bump, &program_id);
        assert_eq!(recreated, Some(result.address));
    }

    #[test]
    fn test_find_program_data_pda() {
        let program_id = localnet_program_id();
        let result = find_program_data_pda(&program_id);

        // Just verify it returns a valid result
        assert_ne!(result.address, Pubkey::default());
    }
}
