//! Error types for the CoalesceFi protocol.
//!
//! All error codes must match the Rust LendingError enum exactly.

use thiserror::Error;

/// CoalesceFi program error codes.
///
/// Must match the Rust LendingError enum exactly.
///
/// Errors are organized by category:
/// - INITIALIZATION ERRORS (0-4)
/// - AUTHORIZATION ERRORS (5-9)
/// - ACCOUNT VALIDATION ERRORS (10-16)
/// - INPUT VALIDATION ERRORS (17-20)
/// - BALANCE/CAPACITY ERRORS (21-27)
/// - MARKET STATE ERRORS (28-35)
/// - FEE/WITHDRAWAL ERRORS (36-40)
/// - OPERATIONAL ERRORS (41-42)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
#[repr(u32)]
pub enum CoalescefiError {
    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION ERRORS (0-4)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-001: ProtocolConfig already exists
    #[error("Protocol configuration already exists")]
    AlreadyInitialized = 0,

    /// ERR-002: Fee rate exceeds 10,000 bps
    #[error("Fee rate exceeds maximum of 10,000 basis points (100%)")]
    InvalidFeeRate = 1,

    /// ERR-003: max_total_supply is 0
    #[error("Invalid capacity: max total supply must be greater than 0")]
    InvalidCapacity = 2,

    /// ERR-004: Maturity not in future
    #[error("Invalid maturity: must be in the future")]
    InvalidMaturity = 3,

    /// ERR-005: Market PDA already initialized
    #[error("Market with this nonce already exists")]
    MarketAlreadyExists = 4,

    // ═══════════════════════════════════════════════════════════════
    // AUTHORIZATION ERRORS (5-9)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-006: Signer lacks authority
    #[error("Unauthorized: signer does not have required authority")]
    Unauthorized = 5,

    /// ERR-007: Borrower not whitelisted
    #[error("Borrower is not whitelisted for this market")]
    NotWhitelisted = 6,

    /// ERR-008: Address on blacklist
    #[error("Address is on the global blacklist")]
    Blacklisted = 7,

    /// ERR-009: Protocol is paused
    #[error("Protocol is paused: no operations allowed")]
    ProtocolPaused = 8,

    /// ERR-010: Cannot blacklist with debt
    #[error("Cannot blacklist borrower: borrower has outstanding debt")]
    BorrowerHasActiveDebt = 9,

    // ═══════════════════════════════════════════════════════════════
    // ACCOUNT VALIDATION ERRORS (10-16)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-011: Zero pubkey
    #[error("Invalid address: cannot use zero pubkey")]
    InvalidAddress = 10,

    /// ERR-012: Wrong mint or decimals
    #[error("Invalid mint: wrong token mint or unsupported decimals")]
    InvalidMint = 11,

    /// ERR-013: Vault mismatch
    #[error("Invalid vault: account mismatch or wrong owner")]
    InvalidVault = 12,

    /// ERR-014: PDA derivation mismatch
    #[error("Account is not the expected PDA")]
    InvalidPDA = 13,

    /// ERR-015: Wrong program owner
    #[error("Account is not owned by the program")]
    InvalidAccountOwner = 14,

    /// ERR-016: Wrong token program
    #[error("Invalid token program")]
    InvalidTokenProgram = 15,

    /// ERR-017: Token account owner mismatch
    #[error("Token account owner does not match expected authority")]
    InvalidTokenAccountOwner = 16,

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION ERRORS (17-20)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-018: Amount is 0
    #[error("Amount must be greater than 0")]
    ZeroAmount = 17,

    /// ERR-019: Scaled amount rounds to 0
    #[error("Deposit amount too small: rounds to zero shares")]
    ZeroScaledAmount = 18,

    /// ERR-020: Scale factor is 0
    #[error("Scale factor is zero (invalid market state)")]
    InvalidScaleFactor = 19,

    /// ERR-021: Timestamp < last_accrual
    #[error("Timestamp is invalid: effective time cannot be before last accrual time")]
    InvalidTimestamp = 20,

    // ═══════════════════════════════════════════════════════════════
    // BALANCE/CAPACITY ERRORS (21-27)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-022: Insufficient token balance
    #[error("Insufficient token balance")]
    InsufficientBalance = 21,

    /// ERR-023: Insufficient scaled balance
    #[error("Withdrawal exceeds position balance")]
    InsufficientScaledBalance = 22,

    /// ERR-024: No scaled balance
    #[error("No position balance to withdraw")]
    NoBalance = 23,

    /// ERR-025: Vault empty, nothing to withdraw
    #[error("Vault is empty: no funds to withdraw")]
    ZeroPayout = 24,

    /// ERR-026: Deposit exceeds max_total_supply
    #[error("Deposit would exceed market capacity")]
    CapExceeded = 25,

    /// ERR-027: Borrow exceeds vault funds
    #[error("Borrow amount exceeds available vault funds")]
    BorrowAmountTooHigh = 26,

    /// ERR-028: Exceeds borrower capacity
    #[error("Borrow exceeds global whitelist capacity")]
    GlobalCapacityExceeded = 27,

    // ═══════════════════════════════════════════════════════════════
    // MARKET STATE ERRORS (28-35)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-029: Operation blocked after maturity
    #[error("Market has matured: operation not allowed")]
    MarketMatured = 28,

    /// ERR-030: Withdrawal before maturity
    #[error("Market has not matured: withdrawal not allowed")]
    NotMatured = 29,

    /// ERR-031: Market not settled yet
    #[error("Market is not yet settled")]
    NotSettled = 30,

    /// ERR-032: New factor not > current
    #[error("New settlement factor must be greater than current")]
    SettlementNotImproved = 31,

    /// ERR-033: Grace period not elapsed
    #[error("Settlement grace period has not elapsed yet (wait 5 minutes after maturity)")]
    SettlementGracePeriod = 32,

    /// ERR-034: settlement_factor == 0
    #[error("Settlement has not occurred (settlement_factor == 0)")]
    SettlementNotComplete = 33,

    /// ERR-035: Cannot close, balance > 0
    #[error("Position still has balance: cannot close")]
    PositionNotEmpty = 34,

    /// ERR-036: Repayment > borrowed
    #[error("Repayment amount exceeds the current borrowed amount")]
    RepaymentExceedsDebt = 35,

    // ═══════════════════════════════════════════════════════════════
    // FEE/WITHDRAWAL ERRORS (36-40)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-037: No accrued protocol fees
    #[error("No accrued fees to collect")]
    NoFeesToCollect = 36,

    /// ERR-038: Blocked during distress
    #[error("Fee collection blocked during market distress (settlement < 100%)")]
    FeeCollectionDuringDistress = 37,

    /// ERR-039: Lenders have pending
    #[error("Fee collection blocked while lenders have pending withdrawals")]
    LendersPendingWithdrawals = 38,

    /// ERR-040: Protocol fees not collected
    #[error("Protocol fees have not been collected yet")]
    FeesNotCollected = 39,

    /// ERR-041: No excess in vault
    #[error("No excess funds in vault to withdraw")]
    NoExcessToWithdraw = 40,

    // ═══════════════════════════════════════════════════════════════
    // OPERATIONAL ERRORS (41-42)
    // ═══════════════════════════════════════════════════════════════
    /// ERR-042: Arithmetic overflow
    #[error("Mathematical overflow or underflow")]
    MathOverflow = 41,

    /// ERR-043: Slippage protection triggered
    #[error("Payout is below the minimum specified (slippage protection triggered)")]
    PayoutBelowMinimum = 42,

    /// ERR-044: No haircut to claim
    #[error("No haircut recovery owed to this lender")]
    NoHaircutToClaim = 43,
}

impl CoalescefiError {
    /// Get the error code as u32.
    pub fn code(&self) -> u32 {
        *self as u32
    }

    /// Try to convert from u32.
    pub fn from_code(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::AlreadyInitialized),
            1 => Some(Self::InvalidFeeRate),
            2 => Some(Self::InvalidCapacity),
            3 => Some(Self::InvalidMaturity),
            4 => Some(Self::MarketAlreadyExists),
            5 => Some(Self::Unauthorized),
            6 => Some(Self::NotWhitelisted),
            7 => Some(Self::Blacklisted),
            8 => Some(Self::ProtocolPaused),
            9 => Some(Self::BorrowerHasActiveDebt),
            10 => Some(Self::InvalidAddress),
            11 => Some(Self::InvalidMint),
            12 => Some(Self::InvalidVault),
            13 => Some(Self::InvalidPDA),
            14 => Some(Self::InvalidAccountOwner),
            15 => Some(Self::InvalidTokenProgram),
            16 => Some(Self::InvalidTokenAccountOwner),
            17 => Some(Self::ZeroAmount),
            18 => Some(Self::ZeroScaledAmount),
            19 => Some(Self::InvalidScaleFactor),
            20 => Some(Self::InvalidTimestamp),
            21 => Some(Self::InsufficientBalance),
            22 => Some(Self::InsufficientScaledBalance),
            23 => Some(Self::NoBalance),
            24 => Some(Self::ZeroPayout),
            25 => Some(Self::CapExceeded),
            26 => Some(Self::BorrowAmountTooHigh),
            27 => Some(Self::GlobalCapacityExceeded),
            28 => Some(Self::MarketMatured),
            29 => Some(Self::NotMatured),
            30 => Some(Self::NotSettled),
            31 => Some(Self::SettlementNotImproved),
            32 => Some(Self::SettlementGracePeriod),
            33 => Some(Self::SettlementNotComplete),
            34 => Some(Self::PositionNotEmpty),
            35 => Some(Self::RepaymentExceedsDebt),
            36 => Some(Self::NoFeesToCollect),
            37 => Some(Self::FeeCollectionDuringDistress),
            38 => Some(Self::LendersPendingWithdrawals),
            39 => Some(Self::FeesNotCollected),
            40 => Some(Self::NoExcessToWithdraw),
            41 => Some(Self::MathOverflow),
            42 => Some(Self::PayoutBelowMinimum),
            43 => Some(Self::NoHaircutToClaim),
            _ => None,
        }
    }

    /// Get the error code name.
    pub fn name(&self) -> &'static str {
        match self {
            Self::AlreadyInitialized => "AlreadyInitialized",
            Self::InvalidFeeRate => "InvalidFeeRate",
            Self::InvalidCapacity => "InvalidCapacity",
            Self::InvalidMaturity => "InvalidMaturity",
            Self::MarketAlreadyExists => "MarketAlreadyExists",
            Self::Unauthorized => "Unauthorized",
            Self::NotWhitelisted => "NotWhitelisted",
            Self::Blacklisted => "Blacklisted",
            Self::ProtocolPaused => "ProtocolPaused",
            Self::BorrowerHasActiveDebt => "BorrowerHasActiveDebt",
            Self::InvalidAddress => "InvalidAddress",
            Self::InvalidMint => "InvalidMint",
            Self::InvalidVault => "InvalidVault",
            Self::InvalidPDA => "InvalidPDA",
            Self::InvalidAccountOwner => "InvalidAccountOwner",
            Self::InvalidTokenProgram => "InvalidTokenProgram",
            Self::InvalidTokenAccountOwner => "InvalidTokenAccountOwner",
            Self::ZeroAmount => "ZeroAmount",
            Self::ZeroScaledAmount => "ZeroScaledAmount",
            Self::InvalidScaleFactor => "InvalidScaleFactor",
            Self::InvalidTimestamp => "InvalidTimestamp",
            Self::InsufficientBalance => "InsufficientBalance",
            Self::InsufficientScaledBalance => "InsufficientScaledBalance",
            Self::NoBalance => "NoBalance",
            Self::ZeroPayout => "ZeroPayout",
            Self::CapExceeded => "CapExceeded",
            Self::BorrowAmountTooHigh => "BorrowAmountTooHigh",
            Self::GlobalCapacityExceeded => "GlobalCapacityExceeded",
            Self::MarketMatured => "MarketMatured",
            Self::NotMatured => "NotMatured",
            Self::NotSettled => "NotSettled",
            Self::SettlementNotImproved => "SettlementNotImproved",
            Self::SettlementGracePeriod => "SettlementGracePeriod",
            Self::SettlementNotComplete => "SettlementNotComplete",
            Self::PositionNotEmpty => "PositionNotEmpty",
            Self::RepaymentExceedsDebt => "RepaymentExceedsDebt",
            Self::NoFeesToCollect => "NoFeesToCollect",
            Self::FeeCollectionDuringDistress => "FeeCollectionDuringDistress",
            Self::LendersPendingWithdrawals => "LendersPendingWithdrawals",
            Self::FeesNotCollected => "FeesNotCollected",
            Self::NoExcessToWithdraw => "NoExcessToWithdraw",
            Self::MathOverflow => "MathOverflow",
            Self::PayoutBelowMinimum => "PayoutBelowMinimum",
            Self::NoHaircutToClaim => "NoHaircutToClaim",
        }
    }

    /// Check if this is a user-recoverable error.
    pub fn is_user_recoverable(&self) -> bool {
        matches!(
            self,
            Self::ZeroAmount
                | Self::InsufficientBalance
                | Self::BorrowAmountTooHigh
                | Self::InsufficientScaledBalance
                | Self::CapExceeded
                | Self::GlobalCapacityExceeded
                | Self::ZeroScaledAmount
        )
    }

    /// Get a recovery action suggestion for this error.
    pub fn recovery_action(&self) -> Option<&'static str> {
        match self {
            Self::ZeroAmount => Some("Enter an amount greater than 0"),
            Self::ZeroScaledAmount => {
                Some("Increase deposit amount - the current amount rounds to zero shares")
            }
            Self::InvalidFeeRate => {
                Some("Fee rate must be between 0 and 10,000 basis points (0-100%)")
            }
            Self::InvalidMaturity => {
                Some("Set a maturity date in the future (at least 60 seconds from now)")
            }
            Self::InvalidCapacity => Some("Set a max total supply greater than 0"),
            Self::InvalidAddress => Some("Provide a valid Solana address (not the zero address)"),
            Self::InvalidMint => Some("Use a supported token mint (USDC with 6 decimals)"),
            Self::InsufficientBalance => {
                Some("Add more tokens to your wallet or reduce the amount")
            }
            Self::BorrowAmountTooHigh => {
                Some("Reduce borrow amount to available vault balance, or wait for more deposits")
            }
            Self::InsufficientScaledBalance => {
                Some("Reduce withdrawal amount to your available position balance")
            }
            Self::CapExceeded => {
                Some("Reduce deposit amount - market has reached its capacity limit")
            }
            Self::GlobalCapacityExceeded => {
                Some("Reduce borrow amount - you have reached your global borrowing capacity")
            }
            Self::NoBalance => Some("You have no position in this market to withdraw"),
            Self::ZeroPayout => {
                Some("Vault is empty - borrower must repay before withdrawals are possible")
            }
            Self::PayoutBelowMinimum => {
                Some("Increase min_payout tolerance or wait for better settlement conditions")
            }
            Self::NotMatured => Some("Wait until the market maturity date to withdraw funds"),
            Self::MarketMatured => {
                Some("Market has matured - deposits and borrows are no longer allowed")
            }
            Self::SettlementGracePeriod => {
                Some("Wait 5 minutes after maturity for the settlement grace period to elapse")
            }
            Self::NotSettled => {
                Some("Market must be settled first - call withdraw or force-close to trigger settlement")
            }
            Self::SettlementNotImproved => {
                Some("New settlement must be better than current - ensure more funds were added to vault")
            }
            Self::Unauthorized => {
                Some("This operation requires admin or whitelist manager authority")
            }
            Self::NotWhitelisted => {
                Some("Contact the whitelist manager to request borrowing access")
            }
            Self::Blacklisted => Some(
                "Your address is on the blacklist - contact support if you believe this is an error",
            ),
            Self::ProtocolPaused => Some("Protocol is paused - wait for admin to resume operations"),
            Self::AlreadyInitialized => Some("Protocol is already initialized - no action needed"),
            Self::MarketAlreadyExists => Some("Use a different nonce to create a new market"),
            Self::NoFeesToCollect => Some("No fees have accrued yet - wait for interest to accrue"),
            Self::FeeCollectionDuringDistress => {
                Some("Fee collection blocked - market is in distress with settlement factor below 100%")
            }
            Self::LendersPendingWithdrawals => {
                Some("Fee collection blocked - wait for all lenders to withdraw first")
            }
            Self::FeesNotCollected => {
                Some("Protocol fees must be collected before withdrawing excess")
            }
            Self::NoExcessToWithdraw => {
                Some("No excess funds available - all funds allocated to lenders/fees")
            }
            Self::PositionNotEmpty => Some("Withdraw all funds before closing your position"),
            Self::MathOverflow => {
                Some("Mathematical overflow occurred - try with smaller amounts or contact support")
            }
            Self::RepaymentExceedsDebt => {
                Some("Reduce repayment amount to match or be less than the outstanding debt")
            }
            Self::BorrowerHasActiveDebt => {
                Some("Borrower must repay all outstanding debt before being blacklisted")
            }
            Self::NoHaircutToClaim => {
                Some("No haircut recovery is owed to this lender position")
            }
            _ => None,
        }
    }

    /// Get the error category.
    pub fn category(&self) -> ErrorCategory {
        let code = self.code();
        match code {
            0..=4 => ErrorCategory::Initialization,
            5..=9 => ErrorCategory::Authorization,
            10..=16 => ErrorCategory::AccountValidation,
            17..=20 => ErrorCategory::InputValidation,
            21..=27 => ErrorCategory::Balance,
            28..=35 => ErrorCategory::MarketState,
            36..=40 => ErrorCategory::FeeWithdrawal,
            _ => ErrorCategory::Operational,
        }
    }

    /// Get the error severity.
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            Self::MathOverflow
            | Self::InvalidPDA
            | Self::InvalidAccountOwner
            | Self::InvalidTokenProgram
            | Self::InvalidScaleFactor => ErrorSeverity::Critical,

            Self::ZeroAmount
            | Self::InsufficientBalance
            | Self::ZeroScaledAmount
            | Self::NotMatured
            | Self::SettlementGracePeriod => ErrorSeverity::Warning,

            _ => ErrorSeverity::Error,
        }
    }
}

/// Error categories for grouping related errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCategory {
    /// Protocol initialization and configuration errors.
    Initialization,
    /// Authorization and permission errors.
    Authorization,
    /// Account validation errors.
    AccountValidation,
    /// Input validation errors.
    InputValidation,
    /// User balance and capacity errors.
    Balance,
    /// Market state errors.
    MarketState,
    /// Fee and withdrawal errors.
    FeeWithdrawal,
    /// Operational errors.
    Operational,
}

impl ErrorCategory {
    /// Get the category name.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Initialization => "initialization",
            Self::Authorization => "authorization",
            Self::AccountValidation => "account_validation",
            Self::InputValidation => "input_validation",
            Self::Balance => "balance",
            Self::MarketState => "market_state",
            Self::FeeWithdrawal => "fee_withdrawal",
            Self::Operational => "operational",
        }
    }
}

/// Error severity levels for categorizing errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorSeverity {
    /// User input or recoverable errors.
    Warning,
    /// Transaction failures that may be retried.
    Error,
    /// Critical protocol or system errors.
    Critical,
}

impl ErrorSeverity {
    /// Get the severity name.
    pub fn name(&self) -> &'static str {
        match self {
            Self::Warning => "warning",
            Self::Error => "error",
            Self::Critical => "critical",
        }
    }
}

/// Parse an error code from a Solana program error.
///
/// This attempts to extract a CoalesceFi error code from various error formats.
///
/// Note: This function requires std due to string operations.
#[cfg(feature = "std")]
pub fn parse_error_code(message: &str) -> Option<CoalescefiError> {
    // Try to match "custom program error: 0x{hex}"
    if let Some(hex_start) = message.find("0x") {
        let hex_str = &message[hex_start + 2..];
        let hex_end = hex_str
            .find(|c: char| !c.is_ascii_hexdigit())
            .unwrap_or(hex_str.len());
        if let Ok(code) = u32::from_str_radix(&hex_str[..hex_end], 16) {
            return CoalescefiError::from_code(code);
        }
    }

    // Try to match "Custom({decimal})"
    if let Some(start) = message.find("Custom(") {
        let num_start = start + 7;
        let num_end = message[num_start..]
            .find(')')
            .map(|i| num_start + i)
            .unwrap_or(message.len());
        if let Ok(code) = message[num_start..num_end].parse::<u32>() {
            return CoalescefiError::from_code(code);
        }
    }

    // Try to match "error {decimal}" (case-insensitive)
    let lower = message.to_ascii_lowercase();
    if let Some(start) = lower.find("error ") {
        let num_start = start + 6;
        let slice = &message[num_start..];
        // Find the end of the number
        let num_end = slice
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(slice.len());
        if num_end > 0 {
            if let Ok(code) = slice[..num_end].parse::<u32>() {
                return CoalescefiError::from_code(code);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_roundtrip() {
        for code in 0..=43u32 {
            let error = CoalescefiError::from_code(code).unwrap();
            assert_eq!(error.code(), code);
        }
        assert!(CoalescefiError::from_code(44).is_none());
    }

    #[test]
    fn test_error_names() {
        assert_eq!(
            CoalescefiError::AlreadyInitialized.name(),
            "AlreadyInitialized"
        );
        assert_eq!(CoalescefiError::MathOverflow.name(), "MathOverflow");
        assert_eq!(
            CoalescefiError::PayoutBelowMinimum.name(),
            "PayoutBelowMinimum"
        );
        assert_eq!(
            CoalescefiError::NoHaircutToClaim.name(),
            "NoHaircutToClaim"
        );
    }

    #[test]
    fn test_error_categories() {
        assert_eq!(
            CoalescefiError::AlreadyInitialized.category(),
            ErrorCategory::Initialization
        );
        assert_eq!(
            CoalescefiError::Unauthorized.category(),
            ErrorCategory::Authorization
        );
        assert_eq!(
            CoalescefiError::InvalidPDA.category(),
            ErrorCategory::AccountValidation
        );
        assert_eq!(
            CoalescefiError::ZeroAmount.category(),
            ErrorCategory::InputValidation
        );
        assert_eq!(
            CoalescefiError::InsufficientBalance.category(),
            ErrorCategory::Balance
        );
        assert_eq!(
            CoalescefiError::MarketMatured.category(),
            ErrorCategory::MarketState
        );
        assert_eq!(
            CoalescefiError::NoFeesToCollect.category(),
            ErrorCategory::FeeWithdrawal
        );
        assert_eq!(
            CoalescefiError::MathOverflow.category(),
            ErrorCategory::Operational
        );
    }

    #[test]
    fn test_error_severity() {
        assert_eq!(
            CoalescefiError::MathOverflow.severity(),
            ErrorSeverity::Critical
        );
        assert_eq!(
            CoalescefiError::ZeroAmount.severity(),
            ErrorSeverity::Warning
        );
        assert_eq!(
            CoalescefiError::Unauthorized.severity(),
            ErrorSeverity::Error
        );
    }

    #[test]
    fn test_user_recoverable() {
        assert!(CoalescefiError::ZeroAmount.is_user_recoverable());
        assert!(CoalescefiError::InsufficientBalance.is_user_recoverable());
        assert!(!CoalescefiError::MathOverflow.is_user_recoverable());
        assert!(!CoalescefiError::Unauthorized.is_user_recoverable());
    }

    #[test]
    fn test_recovery_actions() {
        assert!(CoalescefiError::ZeroAmount.recovery_action().is_some());
        assert!(CoalescefiError::InsufficientBalance
            .recovery_action()
            .is_some());
    }

    #[test]
    #[cfg(feature = "std")]
    fn test_parse_error_code_hex() {
        let msg = "custom program error: 0x5";
        assert_eq!(parse_error_code(msg), Some(CoalescefiError::Unauthorized));
    }

    #[test]
    #[cfg(feature = "std")]
    fn test_parse_error_code_custom() {
        let msg = "Custom(17)";
        assert_eq!(parse_error_code(msg), Some(CoalescefiError::ZeroAmount));
    }

    #[test]
    fn test_error_display() {
        let err = CoalescefiError::ZeroAmount;
        let display = format!("{}", err);
        assert!(display.contains("Amount must be greater than 0"));
    }

    #[test]
    fn test_all_errors_have_messages() {
        for code in 0..=43u32 {
            let error = CoalescefiError::from_code(code).unwrap();
            let message = format!("{}", error);
            assert!(!message.is_empty(), "Error {} has empty message", code);
        }
    }

    #[test]
    fn test_category_names() {
        assert_eq!(ErrorCategory::Initialization.name(), "initialization");
        assert_eq!(ErrorCategory::Authorization.name(), "authorization");
        assert_eq!(
            ErrorCategory::AccountValidation.name(),
            "account_validation"
        );
        assert_eq!(ErrorCategory::InputValidation.name(), "input_validation");
        assert_eq!(ErrorCategory::Balance.name(), "balance");
        assert_eq!(ErrorCategory::MarketState.name(), "market_state");
        assert_eq!(ErrorCategory::FeeWithdrawal.name(), "fee_withdrawal");
        assert_eq!(ErrorCategory::Operational.name(), "operational");
    }

    #[test]
    fn test_severity_names() {
        assert_eq!(ErrorSeverity::Warning.name(), "warning");
        assert_eq!(ErrorSeverity::Error.name(), "error");
        assert_eq!(ErrorSeverity::Critical.name(), "critical");
    }
}
