//! Account decoding utilities for the CoalesceFi protocol.
//!
//! Provides zero-copy deserialization for all account types using bytemuck.

use bytemuck::try_from_bytes;
use solana_program::pubkey::Pubkey;

use crate::constants::{
    BORROWER_WHITELIST_SIZE, DISC_BORROWER_WL, DISC_HAIRCUT_STATE, DISC_LENDER_POSITION,
    DISC_MARKET, DISC_PROTOCOL_CONFIG, HAIRCUT_STATE_SIZE, LENDER_POSITION_SIZE, MARKET_SIZE,
    PROTOCOL_CONFIG_SIZE,
};
use crate::errors::CoalescefiError;
use crate::types::{BorrowerWhitelist, HaircutState, LenderPosition, Market, ProtocolConfig};

/// Account type enum for runtime type detection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountType {
    /// ProtocolConfig account.
    ProtocolConfig,
    /// Market account.
    Market,
    /// LenderPosition account.
    LenderPosition,
    /// BorrowerWhitelist account.
    BorrowerWhitelist,
    /// HaircutState account.
    HaircutState,
}

impl AccountType {
    /// Get the expected size for this account type.
    pub fn size(&self) -> usize {
        match self {
            AccountType::ProtocolConfig => PROTOCOL_CONFIG_SIZE,
            AccountType::Market => MARKET_SIZE,
            AccountType::LenderPosition => LENDER_POSITION_SIZE,
            AccountType::BorrowerWhitelist => BORROWER_WHITELIST_SIZE,
            AccountType::HaircutState => HAIRCUT_STATE_SIZE,
        }
    }

    /// Get the discriminator for this account type.
    pub fn discriminator(&self) -> &'static [u8; 8] {
        match self {
            AccountType::ProtocolConfig => DISC_PROTOCOL_CONFIG,
            AccountType::Market => DISC_MARKET,
            AccountType::LenderPosition => DISC_LENDER_POSITION,
            AccountType::BorrowerWhitelist => DISC_BORROWER_WL,
            AccountType::HaircutState => DISC_HAIRCUT_STATE,
        }
    }
}

/// Determine account type from data length and discriminator.
pub fn detect_account_type(data: &[u8]) -> Option<AccountType> {
    if data.len() < 8 {
        return None;
    }

    let discriminator: &[u8; 8] = data[..8].try_into().ok()?;

    match discriminator {
        d if d == DISC_PROTOCOL_CONFIG && data.len() >= PROTOCOL_CONFIG_SIZE => {
            Some(AccountType::ProtocolConfig)
        }
        d if d == DISC_MARKET && data.len() >= MARKET_SIZE => Some(AccountType::Market),
        d if d == DISC_LENDER_POSITION && data.len() >= LENDER_POSITION_SIZE => {
            Some(AccountType::LenderPosition)
        }
        d if d == DISC_BORROWER_WL && data.len() >= BORROWER_WHITELIST_SIZE => {
            Some(AccountType::BorrowerWhitelist)
        }
        d if d == DISC_HAIRCUT_STATE && data.len() >= HAIRCUT_STATE_SIZE => {
            Some(AccountType::HaircutState)
        }
        _ => None,
    }
}

/// Validate account discriminator.
fn check_discriminator(data: &[u8], expected: &[u8; 8]) -> Result<(), CoalescefiError> {
    if data.len() < 8 {
        return Err(CoalescefiError::InvalidAccountOwner);
    }
    if &data[..8] != expected {
        return Err(CoalescefiError::InvalidPDA);
    }
    Ok(())
}

/// Decode a ProtocolConfig account from raw bytes (zero-copy).
///
/// # Errors
/// Returns an error if the data is too short or has invalid discriminator.
pub fn decode_protocol_config(data: &[u8]) -> Result<&ProtocolConfig, CoalescefiError> {
    if data.len() < PROTOCOL_CONFIG_SIZE {
        return Err(CoalescefiError::InvalidAccountOwner);
    }

    check_discriminator(data, DISC_PROTOCOL_CONFIG)?;

    try_from_bytes(&data[..PROTOCOL_CONFIG_SIZE]).map_err(|_| CoalescefiError::InvalidAccountOwner)
}

/// Decode a Market account from raw bytes (zero-copy).
///
/// # Errors
/// Returns an error if the data is too short or has invalid discriminator.
pub fn decode_market(data: &[u8]) -> Result<&Market, CoalescefiError> {
    if data.len() < MARKET_SIZE {
        return Err(CoalescefiError::InvalidAccountOwner);
    }

    check_discriminator(data, DISC_MARKET)?;

    try_from_bytes(&data[..MARKET_SIZE]).map_err(|_| CoalescefiError::InvalidAccountOwner)
}

/// Decode a LenderPosition account from raw bytes (zero-copy).
///
/// # Errors
/// Returns an error if the data is too short or has invalid discriminator.
pub fn decode_lender_position(data: &[u8]) -> Result<&LenderPosition, CoalescefiError> {
    if data.len() < LENDER_POSITION_SIZE {
        return Err(CoalescefiError::InvalidAccountOwner);
    }

    check_discriminator(data, DISC_LENDER_POSITION)?;

    try_from_bytes(&data[..LENDER_POSITION_SIZE]).map_err(|_| CoalescefiError::InvalidAccountOwner)
}

/// Decode a BorrowerWhitelist account from raw bytes (zero-copy).
///
/// # Errors
/// Returns an error if the data is too short or has invalid discriminator.
pub fn decode_borrower_whitelist(data: &[u8]) -> Result<&BorrowerWhitelist, CoalescefiError> {
    if data.len() < BORROWER_WHITELIST_SIZE {
        return Err(CoalescefiError::InvalidAccountOwner);
    }

    check_discriminator(data, DISC_BORROWER_WL)?;

    try_from_bytes(&data[..BORROWER_WHITELIST_SIZE])
        .map_err(|_| CoalescefiError::InvalidAccountOwner)
}

/// Decode a HaircutState account from raw bytes (zero-copy).
///
/// # Errors
/// Returns an error if the data is too short or has invalid discriminator.
pub fn decode_haircut_state(data: &[u8]) -> Result<&HaircutState, CoalescefiError> {
    if data.len() < HAIRCUT_STATE_SIZE {
        return Err(CoalescefiError::InvalidAccountOwner);
    }

    check_discriminator(data, DISC_HAIRCUT_STATE)?;

    try_from_bytes(&data[..HAIRCUT_STATE_SIZE]).map_err(|_| CoalescefiError::InvalidAccountOwner)
}

/// Decoded account enum for dynamic dispatch.
pub enum DecodedAccount<'a> {
    /// ProtocolConfig account.
    ProtocolConfig(&'a ProtocolConfig),
    /// Market account.
    Market(&'a Market),
    /// LenderPosition account.
    LenderPosition(&'a LenderPosition),
    /// BorrowerWhitelist account.
    BorrowerWhitelist(&'a BorrowerWhitelist),
    /// HaircutState account.
    HaircutState(&'a HaircutState),
}

impl<'a> core::fmt::Debug for DecodedAccount<'a> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::ProtocolConfig(_) => write!(f, "DecodedAccount::ProtocolConfig"),
            Self::Market(_) => write!(f, "DecodedAccount::Market"),
            Self::LenderPosition(_) => write!(f, "DecodedAccount::LenderPosition"),
            Self::BorrowerWhitelist(_) => write!(f, "DecodedAccount::BorrowerWhitelist"),
            Self::HaircutState(_) => write!(f, "DecodedAccount::HaircutState"),
        }
    }
}

/// Decode any CoalesceFi account from raw data.
///
/// This function automatically detects the account type and decodes it.
pub fn decode_account(data: &[u8]) -> Result<DecodedAccount<'_>, CoalescefiError> {
    let account_type = detect_account_type(data).ok_or(CoalescefiError::InvalidAccountOwner)?;

    match account_type {
        AccountType::ProtocolConfig => Ok(DecodedAccount::ProtocolConfig(decode_protocol_config(
            data,
        )?)),
        AccountType::Market => Ok(DecodedAccount::Market(decode_market(data)?)),
        AccountType::LenderPosition => Ok(DecodedAccount::LenderPosition(decode_lender_position(
            data,
        )?)),
        AccountType::BorrowerWhitelist => Ok(DecodedAccount::BorrowerWhitelist(
            decode_borrower_whitelist(data)?,
        )),
        AccountType::HaircutState => {
            Ok(DecodedAccount::HaircutState(decode_haircut_state(data)?))
        }
    }
}

/// Helper to convert a 32-byte array to Pubkey.
pub fn bytes_to_pubkey(bytes: &[u8; 32]) -> Pubkey {
    Pubkey::new_from_array(*bytes)
}

/// Helper methods for ProtocolConfig.
impl ProtocolConfig {
    /// Get admin as Pubkey.
    pub fn admin_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.admin)
    }

    /// Get fee authority as Pubkey.
    pub fn fee_authority_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.fee_authority)
    }

    /// Get whitelist manager as Pubkey.
    pub fn whitelist_manager_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.whitelist_manager)
    }

    /// Get blacklist program as Pubkey.
    pub fn blacklist_program_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.blacklist_program)
    }
}

/// Helper methods for Market.
impl Market {
    /// Get borrower as Pubkey.
    pub fn borrower_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.borrower)
    }

    /// Get mint as Pubkey.
    pub fn mint_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.mint)
    }

    /// Get vault as Pubkey.
    pub fn vault_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.vault)
    }
}

/// Helper methods for LenderPosition.
impl LenderPosition {
    /// Get market as Pubkey.
    pub fn market_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.market)
    }

    /// Get lender as Pubkey.
    pub fn lender_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.lender)
    }
}

/// Helper methods for BorrowerWhitelist.
impl BorrowerWhitelist {
    /// Get borrower as Pubkey.
    pub fn borrower_pubkey(&self) -> Pubkey {
        bytes_to_pubkey(&self.borrower)
    }
}

// ============================================================================
// RPC fetch functions (std feature only)
// ============================================================================

#[cfg(feature = "std")]
mod rpc {
    use super::*;
    use solana_client::rpc_client::RpcClient;

    /// Fetch and decode a ProtocolConfig account.
    pub fn fetch_protocol_config(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<ProtocolConfig, CoalescefiError> {
        let account = client
            .get_account(address)
            .map_err(|_| CoalescefiError::InvalidAddress)?;

        let config = decode_protocol_config(&account.data)?;
        Ok(*config)
    }

    /// Fetch and decode a Market account.
    pub fn fetch_market(client: &RpcClient, address: &Pubkey) -> Result<Market, CoalescefiError> {
        let account = client
            .get_account(address)
            .map_err(|_| CoalescefiError::InvalidAddress)?;

        let market = decode_market(&account.data)?;
        Ok(*market)
    }

    /// Fetch and decode a LenderPosition account.
    pub fn fetch_lender_position(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<LenderPosition, CoalescefiError> {
        let account = client
            .get_account(address)
            .map_err(|_| CoalescefiError::InvalidAddress)?;

        let position = decode_lender_position(&account.data)?;
        Ok(*position)
    }

    /// Fetch and decode a BorrowerWhitelist account.
    pub fn fetch_borrower_whitelist(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<BorrowerWhitelist, CoalescefiError> {
        let account = client
            .get_account(address)
            .map_err(|_| CoalescefiError::InvalidAddress)?;

        let whitelist = decode_borrower_whitelist(&account.data)?;
        Ok(*whitelist)
    }

    /// Fetch and decode a ProtocolConfig account, returning None if not found.
    pub fn try_fetch_protocol_config(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<Option<ProtocolConfig>, CoalescefiError> {
        match client.get_account(address) {
            Ok(account) => {
                let config = decode_protocol_config(&account.data)?;
                Ok(Some(*config))
            }
            Err(_) => Ok(None),
        }
    }

    /// Fetch and decode a Market account, returning None if not found.
    pub fn try_fetch_market(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<Option<Market>, CoalescefiError> {
        match client.get_account(address) {
            Ok(account) => {
                let market = decode_market(&account.data)?;
                Ok(Some(*market))
            }
            Err(_) => Ok(None),
        }
    }

    /// Fetch and decode a LenderPosition account, returning None if not found.
    pub fn try_fetch_lender_position(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<Option<LenderPosition>, CoalescefiError> {
        match client.get_account(address) {
            Ok(account) => {
                let position = decode_lender_position(&account.data)?;
                Ok(Some(*position))
            }
            Err(_) => Ok(None),
        }
    }

    /// Fetch and decode a HaircutState account.
    pub fn fetch_haircut_state(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<HaircutState, CoalescefiError> {
        let account = client
            .get_account(address)
            .map_err(|_| CoalescefiError::InvalidAddress)?;

        let state = decode_haircut_state(&account.data)?;
        Ok(*state)
    }

    /// Fetch and decode a BorrowerWhitelist account, returning None if not found.
    pub fn try_fetch_borrower_whitelist(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<Option<BorrowerWhitelist>, CoalescefiError> {
        match client.get_account(address) {
            Ok(account) => {
                let whitelist = decode_borrower_whitelist(&account.data)?;
                Ok(Some(*whitelist))
            }
            Err(_) => Ok(None),
        }
    }
    /// Fetch and decode a HaircutState account, returning None if not found.
    pub fn try_fetch_haircut_state(
        client: &RpcClient,
        address: &Pubkey,
    ) -> Result<Option<HaircutState>, CoalescefiError> {
        match client.get_account(address) {
            Ok(account) => {
                let state = decode_haircut_state(&account.data)?;
                Ok(Some(*state))
            }
            Err(_) => Ok(None),
        }
    }
}

#[cfg(feature = "std")]
pub use rpc::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_protocol_config() -> Vec<u8> {
        let mut data = vec![0u8; PROTOCOL_CONFIG_SIZE];
        data[..8].copy_from_slice(DISC_PROTOCOL_CONFIG);
        data[8] = 1; // version
        data[139] = 1; // is_initialized
        data[140] = 255; // bump
        data
    }

    fn create_test_market() -> Vec<u8> {
        let mut data = vec![0u8; MARKET_SIZE];
        data[..8].copy_from_slice(DISC_MARKET);
        data[8] = 1; // version
        data[228] = 254; // bump
        data
    }

    fn create_test_lender_position() -> Vec<u8> {
        let mut data = vec![0u8; LENDER_POSITION_SIZE];
        data[..8].copy_from_slice(DISC_LENDER_POSITION);
        data[8] = 1; // version
        data[89] = 253; // bump
        data
    }

    fn create_test_haircut_state() -> Vec<u8> {
        let mut data = vec![0u8; HAIRCUT_STATE_SIZE];
        data[..8].copy_from_slice(DISC_HAIRCUT_STATE);
        data[8] = 1; // version
        data[73] = 251; // bump
        data
    }

    fn create_test_borrower_whitelist() -> Vec<u8> {
        let mut data = vec![0u8; BORROWER_WHITELIST_SIZE];
        data[..8].copy_from_slice(DISC_BORROWER_WL);
        data[8] = 1; // version
        data[41] = 1; // is_whitelisted
        data[58] = 252; // bump
        data
    }

    #[test]
    fn test_decode_protocol_config() {
        let data = create_test_protocol_config();
        let config = decode_protocol_config(&data).unwrap();

        assert_eq!(config.version, 1);
        assert!(config.is_initialized());
        assert_eq!(config.bump, 255);
    }

    #[test]
    fn test_decode_market() {
        let data = create_test_market();
        let market = decode_market(&data).unwrap();

        assert_eq!(market.version, 1);
        assert_eq!(market.bump, 254);
    }

    #[test]
    fn test_decode_lender_position() {
        let data = create_test_lender_position();
        let position = decode_lender_position(&data).unwrap();

        assert_eq!(position.version, 1);
        assert_eq!(position.bump, 253);
    }

    #[test]
    fn test_decode_borrower_whitelist() {
        let data = create_test_borrower_whitelist();
        let whitelist = decode_borrower_whitelist(&data).unwrap();

        assert_eq!(whitelist.version, 1);
        assert!(whitelist.is_whitelisted());
        assert_eq!(whitelist.bump, 252);
    }

    #[test]
    fn test_decode_haircut_state() {
        let data = create_test_haircut_state();
        let state = decode_haircut_state(&data).unwrap();

        assert_eq!(state.version, 1);
        assert_eq!(state.bump, 251);
    }

    #[test]
    fn test_detect_account_type() {
        let protocol_config = create_test_protocol_config();
        assert_eq!(
            detect_account_type(&protocol_config),
            Some(AccountType::ProtocolConfig)
        );

        let market = create_test_market();
        assert_eq!(detect_account_type(&market), Some(AccountType::Market));

        let lender_position = create_test_lender_position();
        assert_eq!(
            detect_account_type(&lender_position),
            Some(AccountType::LenderPosition)
        );

        let borrower_whitelist = create_test_borrower_whitelist();
        assert_eq!(
            detect_account_type(&borrower_whitelist),
            Some(AccountType::BorrowerWhitelist)
        );

        let haircut_state = create_test_haircut_state();
        assert_eq!(
            detect_account_type(&haircut_state),
            Some(AccountType::HaircutState)
        );

        // Invalid data
        assert_eq!(detect_account_type(&[0u8; 7]), None);
        assert_eq!(detect_account_type(&[0u8; 100]), None);
    }

    #[test]
    fn test_decode_account() {
        let protocol_config = create_test_protocol_config();
        match decode_account(&protocol_config).unwrap() {
            DecodedAccount::ProtocolConfig(config) => {
                assert_eq!(config.version, 1);
            }
            _ => panic!("Expected ProtocolConfig"),
        }

        let market = create_test_market();
        match decode_account(&market).unwrap() {
            DecodedAccount::Market(m) => {
                assert_eq!(m.version, 1);
            }
            _ => panic!("Expected Market"),
        }
    }

    #[test]
    fn test_invalid_discriminator() {
        let mut data = create_test_protocol_config();
        data[0] = 0xFF; // Corrupt discriminator

        assert!(decode_protocol_config(&data).is_err());
    }

    #[test]
    fn test_data_too_short() {
        let data = vec![0u8; 10];
        assert!(decode_protocol_config(&data).is_err());
        assert!(decode_market(&data).is_err());
        assert!(decode_lender_position(&data).is_err());
        assert!(decode_borrower_whitelist(&data).is_err());
    }

    #[test]
    fn test_pubkey_helpers() {
        let mut data = create_test_protocol_config();
        // Set admin to a known value
        let admin_bytes = [1u8; 32];
        data[9..41].copy_from_slice(&admin_bytes);

        let config = decode_protocol_config(&data).unwrap();
        let admin = config.admin_pubkey();
        assert_eq!(admin.to_bytes(), admin_bytes);
    }

    #[test]
    fn test_account_type_size() {
        assert_eq!(AccountType::ProtocolConfig.size(), PROTOCOL_CONFIG_SIZE);
        assert_eq!(AccountType::Market.size(), MARKET_SIZE);
        assert_eq!(AccountType::LenderPosition.size(), LENDER_POSITION_SIZE);
        assert_eq!(
            AccountType::BorrowerWhitelist.size(),
            BORROWER_WHITELIST_SIZE
        );
        assert_eq!(AccountType::HaircutState.size(), HAIRCUT_STATE_SIZE);
    }

    #[test]
    fn test_account_type_discriminator() {
        assert_eq!(
            AccountType::ProtocolConfig.discriminator(),
            DISC_PROTOCOL_CONFIG
        );
        assert_eq!(AccountType::Market.discriminator(), DISC_MARKET);
        assert_eq!(
            AccountType::LenderPosition.discriminator(),
            DISC_LENDER_POSITION
        );
        assert_eq!(
            AccountType::BorrowerWhitelist.discriminator(),
            DISC_BORROWER_WL
        );
        assert_eq!(
            AccountType::HaircutState.discriminator(),
            DISC_HAIRCUT_STATE
        );
    }
}
