//! High-level client for the CoalesceFi protocol.
//!
//! `CoalesceClient` handles PDA derivation, ATA resolution, and account fetching
//! automatically so callers only need to provide signers, market addresses, and amounts.
//!
//! # Example
//!
//! ```no_run
//! use coalescefi_sdk::client::CoalesceClient;
//! use solana_sdk::signer::Signer;
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let client = CoalesceClient::localnet("http://127.0.0.1:8899");
//! # Ok(())
//! # }
//! ```

use solana_client::rpc_client::RpcClient;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use solana_sdk::signature::Signature;
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use crate::accounts::{fetch_market, fetch_protocol_config};
use crate::constants::{
    devnet_program_id, localnet_program_id, mainnet_program_id, spl_token_program_id,
    system_program_id,
};
use crate::instructions::*;
use crate::pdas::*;
use crate::types::*;

use spl_associated_token_account::get_associated_token_address;

/// Errors specific to the high-level client.
#[derive(Debug)]
pub enum ClientError {
    /// A validation check failed before building the instruction.
    Validation(String),
    /// An RPC call (fetch/send) failed.
    Rpc(String),
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientError::Validation(msg) => write!(f, "validation error: {msg}"),
            ClientError::Rpc(msg) => write!(f, "RPC error: {msg}"),
        }
    }
}

impl std::error::Error for ClientError {}

impl From<solana_client::client_error::ClientError> for ClientError {
    fn from(e: solana_client::client_error::ClientError) -> Self {
        ClientError::Rpc(e.to_string())
    }
}

impl From<crate::errors::CoalescefiError> for ClientError {
    fn from(e: crate::errors::CoalescefiError) -> Self {
        ClientError::Rpc(format!("account fetch failed: {}", e.name()))
    }
}

/// High-level client for the CoalesceFi lending protocol.
///
/// Wraps an [`RpcClient`] and a `program_id`, providing ergonomic methods that
/// derive PDAs, resolve ATAs, fetch on-chain state, and return ready-to-sign
/// `Vec<Instruction>`.
pub struct CoalesceClient {
    /// The underlying Solana RPC client.
    pub rpc: RpcClient,
    /// The CoalesceFi program ID.
    pub program_id: Pubkey,
}

impl CoalesceClient {
    // ─── Constructors ──────────────────────────────────────────

    /// Create a client with a custom program ID.
    pub fn new(rpc_url: &str, program_id: Pubkey) -> Self {
        Self {
            rpc: RpcClient::new(rpc_url.to_string()),
            program_id,
        }
    }

    /// Create a client targeting mainnet.
    pub fn mainnet(rpc_url: &str) -> Self {
        Self::new(rpc_url, mainnet_program_id())
    }

    /// Create a client targeting devnet.
    pub fn devnet(rpc_url: &str) -> Self {
        Self::new(rpc_url, devnet_program_id())
    }

    /// Create a client targeting localnet.
    pub fn localnet(rpc_url: &str) -> Self {
        Self::new(rpc_url, localnet_program_id())
    }

    // ─── Lender Operations ─────────────────────────────────────

    /// Build a deposit instruction.
    ///
    /// Fetches the market and protocol config via RPC to resolve the mint,
    /// vault, blacklist check PDA, and lender ATA automatically.
    pub fn deposit(
        &self,
        lender: &Pubkey,
        market_pda: &Pubkey,
        amount: u64,
        lender_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();

        let lender_token_account =
            lender_token_account_override.unwrap_or_else(|| get_associated_token_address(lender, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let blacklist_check = self.resolve_blacklist_check(lender)?;

        let ix = create_deposit_instruction(
            DepositAccounts {
                market: *market_pda,
                lender: *lender,
                lender_token_account,
                vault,
                lender_position,
                blacklist_check,
                protocol_config,
                mint,
                token_program: spl_token_program_id(),
                system_program: system_program_id(),
            },
            DepositArgs { amount },
            &self.program_id,
        );

        Ok(vec![ix])
    }

    /// Build a withdraw instruction.
    ///
    /// Pass `scaled_amount = 0` for a full withdrawal. `min_payout` provides
    /// slippage protection (0 = disabled).
    pub fn withdraw(
        &self,
        lender: &Pubkey,
        market_pda: &Pubkey,
        scaled_amount: u128,
        min_payout: u64,
        lender_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();

        let lender_token_account =
            lender_token_account_override.unwrap_or_else(|| get_associated_token_address(lender, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let haircut_state = find_haircut_state_pda(market_pda, &self.program_id).address;
        let blacklist_check = self.resolve_blacklist_check(lender)?;

        let ix = create_withdraw_instruction(
            WithdrawAccounts {
                market: *market_pda,
                lender: *lender,
                lender_token_account,
                vault,
                lender_position,
                market_authority,
                blacklist_check,
                protocol_config,
                token_program: spl_token_program_id(),
                haircut_state,
            },
            WithdrawArgs {
                scaled_amount,
                min_payout,
            },
            &self.program_id,
        );

        Ok(vec![ix])
    }

    /// Build withdraw (full) + close lender position instructions.
    pub fn withdraw_and_close(
        &self,
        lender: &Pubkey,
        market_pda: &Pubkey,
        min_payout: u64,
        lender_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let mut ixs = self.withdraw(lender, market_pda, 0, min_payout, lender_token_account_override)?;

        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;

        let close_ix = create_close_lender_position_instruction(
            CloseLenderPositionAccounts {
                market: *market_pda,
                lender: *lender,
                lender_position,
                system_program: system_program_id(),
                protocol_config,
            },
            &self.program_id,
        );

        ixs.push(close_ix);
        Ok(ixs)
    }

    /// Build a close lender position instruction.
    ///
    /// The position must have zero balance and zero haircut_owed.
    pub fn close_lender_position(
        &self,
        lender: &Pubkey,
        market_pda: &Pubkey,
    ) -> Vec<Instruction> {
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;

        let ix = create_close_lender_position_instruction(
            CloseLenderPositionAccounts {
                market: *market_pda,
                lender: *lender,
                lender_position,
                system_program: system_program_id(),
                protocol_config,
            },
            &self.program_id,
        );

        vec![ix]
    }

    /// Build a claim haircut instruction.
    pub fn claim_haircut(
        &self,
        lender: &Pubkey,
        market_pda: &Pubkey,
        lender_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();

        let lender_token_account =
            lender_token_account_override.unwrap_or_else(|| get_associated_token_address(lender, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let haircut_state = find_haircut_state_pda(market_pda, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;

        let ix = create_claim_haircut_instruction(
            ClaimHaircutAccounts {
                market: *market_pda,
                lender: *lender,
                lender_position,
                lender_token_account,
                vault,
                market_authority,
                haircut_state,
                protocol_config,
                token_program: spl_token_program_id(),
            },
            &self.program_id,
        );

        Ok(vec![ix])
    }

    /// Build claim haircut + close lender position instructions.
    pub fn claim_haircut_and_close(
        &self,
        lender: &Pubkey,
        market_pda: &Pubkey,
        lender_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let mut ixs = self.claim_haircut(lender, market_pda, lender_token_account_override)?;

        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;

        let close_ix = create_close_lender_position_instruction(
            CloseLenderPositionAccounts {
                market: *market_pda,
                lender: *lender,
                lender_position,
                system_program: system_program_id(),
                protocol_config,
            },
            &self.program_id,
        );

        ixs.push(close_ix);
        Ok(ixs)
    }

    // ─── Borrower Operations ───────────────────────────────────

    /// Build a create market instruction.
    ///
    /// Returns the instructions and the derived market PDA.
    pub fn create_market(
        &self,
        borrower: &Pubkey,
        mint: &Pubkey,
        args: CreateMarketArgs,
    ) -> Result<(Vec<Instruction>, Pubkey), ClientError> {
        let pdas = derive_market_pdas(borrower, args.market_nonce, &self.program_id);
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let borrower_whitelist = find_borrower_whitelist_pda(borrower, &self.program_id).address;
        let blacklist_check = self.resolve_blacklist_check(borrower)?;

        let haircut_state = find_haircut_state_pda(&pdas.market.address, &self.program_id).address;

        let ix = create_create_market_instruction(
            CreateMarketAccounts {
                market: pdas.market.address,
                borrower: *borrower,
                mint: *mint,
                vault: pdas.vault.address,
                market_authority: pdas.market_authority.address,
                protocol_config,
                borrower_whitelist,
                blacklist_check,
                system_program: system_program_id(),
                token_program: spl_token_program_id(),
                haircut_state,
            },
            args,
            &self.program_id,
        );

        Ok((vec![ix], pdas.market.address))
    }

    /// Build a borrow instruction.
    pub fn borrow(
        &self,
        borrower: &Pubkey,
        market_pda: &Pubkey,
        amount: u64,
        borrower_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();

        let borrower_token_account =
            borrower_token_account_override.unwrap_or_else(|| get_associated_token_address(borrower, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let borrower_whitelist =
            find_borrower_whitelist_pda(borrower, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let blacklist_check = self.resolve_blacklist_check(borrower)?;

        let ix = create_borrow_instruction(
            BorrowAccounts {
                market: *market_pda,
                borrower: *borrower,
                borrower_token_account,
                vault,
                market_authority,
                borrower_whitelist,
                blacklist_check,
                protocol_config,
                token_program: spl_token_program_id(),
            },
            BorrowArgs { amount },
            &self.program_id,
        );

        Ok(vec![ix])
    }

    /// Build waterfall repay instructions (interest-first, then principal).
    ///
    /// Returns 0-2 instructions:
    /// 1. `RepayInterest` if `interest_amount > 0`
    /// 2. `Repay` (principal) if `total_amount - interest_amount > 0`
    pub fn repay(
        &self,
        payer: &Pubkey,
        market_pda: &Pubkey,
        total_amount: u64,
        interest_amount: u64,
        payer_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        if total_amount == 0 {
            return Err(ClientError::Validation("totalAmount must be greater than 0".into()));
        }
        if interest_amount > total_amount {
            return Err(ClientError::Validation("interestAmount cannot exceed totalAmount".into()));
        }

        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();
        let borrower = market.borrower_pubkey();

        let payer_token_account =
            payer_token_account_override.unwrap_or_else(|| get_associated_token_address(payer, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let borrower_whitelist =
            find_borrower_whitelist_pda(&borrower, &self.program_id).address;

        let mut ixs = Vec::new();

        // Interest first
        if interest_amount > 0 {
            let ix = create_repay_interest_instruction(
                RepayInterestAccounts {
                    market: *market_pda,
                    payer: *payer,
                    payer_token_account,
                    vault,
                    protocol_config,
                    token_program: spl_token_program_id(),
                },
                RepayInterestArgs {
                    amount: interest_amount,
                },
                &self.program_id,
            );
            ixs.push(ix);
        }

        // Then principal
        let principal_amount = total_amount - interest_amount;
        if principal_amount > 0 {
            let ix = create_repay_instruction(
                RepayAccounts {
                    market: *market_pda,
                    payer: *payer,
                    payer_token_account,
                    vault,
                    protocol_config,
                    mint,
                    borrower_whitelist,
                    token_program: spl_token_program_id(),
                },
                RepayArgs {
                    amount: principal_amount,
                },
                &self.program_id,
            );
            ixs.push(ix);
        }

        Ok(ixs)
    }

    /// Build a withdraw excess instruction (borrower reclaims excess vault funds).
    pub fn withdraw_excess(
        &self,
        borrower: &Pubkey,
        market_pda: &Pubkey,
        borrower_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();

        let borrower_token_account =
            borrower_token_account_override.unwrap_or_else(|| get_associated_token_address(borrower, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let borrower_whitelist =
            find_borrower_whitelist_pda(borrower, &self.program_id).address;
        let blacklist_check = self.resolve_blacklist_check(borrower)?;

        let ix = create_withdraw_excess_instruction(
            WithdrawExcessAccounts {
                market: *market_pda,
                borrower: *borrower,
                borrower_token_account,
                vault,
                market_authority,
                token_program: spl_token_program_id(),
                protocol_config,
                blacklist_check,
                borrower_whitelist,
            },
            &self.program_id,
        );

        Ok(vec![ix])
    }

    /// Build a force close position instruction.
    ///
    /// The borrower forces closure of a lender position after maturity + grace period.
    /// Payout is sent to `escrow_token_account`.
    pub fn force_close_position(
        &self,
        borrower: &Pubkey,
        market_pda: &Pubkey,
        lender: &Pubkey,
        escrow_token_account: &Pubkey,
    ) -> Vec<Instruction> {
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let haircut_state = find_haircut_state_pda(market_pda, &self.program_id).address;

        let ix = create_force_close_position_instruction(
            ForceClosePositionAccounts {
                market: *market_pda,
                borrower: *borrower,
                lender_position,
                vault,
                escrow_token_account: *escrow_token_account,
                market_authority,
                protocol_config,
                token_program: spl_token_program_id(),
                haircut_state,
            },
            &self.program_id,
        );

        vec![ix]
    }

    /// Build a force claim haircut instruction.
    ///
    /// The borrower force-claims haircut recovery on behalf of a lender.
    /// Payout is sent to `escrow_token_account`.
    pub fn force_claim_haircut(
        &self,
        borrower: &Pubkey,
        market_pda: &Pubkey,
        lender: &Pubkey,
        escrow_token_account: &Pubkey,
    ) -> Vec<Instruction> {
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let lender_position =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let haircut_state = find_haircut_state_pda(market_pda, &self.program_id).address;

        let ix = create_force_claim_haircut_instruction(
            ForceClaimHaircutAccounts {
                market: *market_pda,
                borrower: *borrower,
                lender_position,
                escrow_token_account: *escrow_token_account,
                vault,
                market_authority,
                haircut_state,
                protocol_config,
                token_program: spl_token_program_id(),
            },
            &self.program_id,
        );

        vec![ix]
    }

    // ─── Settlement ────────────────────────────────────────────

    /// Build a re-settle instruction (permissionless).
    pub fn re_settle(&self, market_pda: &Pubkey) -> Vec<Instruction> {
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;
        let haircut_state = find_haircut_state_pda(market_pda, &self.program_id).address;

        let ix = create_resettle_instruction(
            ReSettleAccounts {
                market: *market_pda,
                vault,
                protocol_config,
                haircut_state,
            },
            &self.program_id,
        );

        vec![ix]
    }

    /// Build a collect fees instruction.
    pub fn collect_fees(
        &self,
        fee_authority: &Pubkey,
        market_pda: &Pubkey,
        fee_token_account_override: Option<Pubkey>,
    ) -> Result<Vec<Instruction>, ClientError> {
        let market = fetch_market(&self.rpc, market_pda)?;
        let mint = market.mint_pubkey();

        let fee_token_account =
            fee_token_account_override.unwrap_or_else(|| get_associated_token_address(fee_authority, &mint));
        let vault = find_vault_pda(market_pda, &self.program_id).address;
        let market_authority = find_market_authority_pda(market_pda, &self.program_id).address;
        let protocol_config = find_protocol_config_pda(&self.program_id).address;

        let ix = create_collect_fees_instruction(
            CollectFeesAccounts {
                market: *market_pda,
                protocol_config,
                fee_authority: *fee_authority,
                fee_token_account,
                vault,
                market_authority,
                token_program: spl_token_program_id(),
            },
            &self.program_id,
        );

        Ok(vec![ix])
    }

    // ─── Convenience ───────────────────────────────────────────

    /// Send instructions in a transaction, sign, and confirm.
    ///
    /// The first signer is used as the fee payer.
    pub fn send_and_confirm(
        &self,
        instructions: &[Instruction],
        signers: &[&dyn Signer],
    ) -> Result<Signature, ClientError> {
        if instructions.is_empty() {
            return Err(ClientError::Validation("no instructions to send".into()));
        }
        if signers.is_empty() {
            return Err(ClientError::Validation("at least one signer is required".into()));
        }

        let recent_blockhash = self
            .rpc
            .get_latest_blockhash()?;

        let tx = Transaction::new_signed_with_payer(
            instructions,
            Some(&signers[0].pubkey()),
            signers,
            recent_blockhash,
        );

        Ok(self.rpc.send_and_confirm_transaction(&tx)?)
    }

    // ─── Discovery ─────────────────────────────────────────────

    /// Derive a market PDA address without fetching anything.
    pub fn get_market_address(&self, borrower: &Pubkey, nonce: u64) -> Pubkey {
        find_market_pda(borrower, nonce, &self.program_id).address
    }

    /// Fetch and decode a market account, returning `None` if not found.
    pub fn get_market(&self, market_pda: &Pubkey) -> Result<Option<Market>, ClientError> {
        Ok(crate::accounts::try_fetch_market(&self.rpc, market_pda)?)
    }

    /// Fetch and decode a lender position, returning `None` if not found.
    pub fn get_position(
        &self,
        market_pda: &Pubkey,
        lender: &Pubkey,
    ) -> Result<Option<LenderPosition>, ClientError> {
        let position_pda =
            find_lender_position_pda(market_pda, lender, &self.program_id).address;
        Ok(crate::accounts::try_fetch_lender_position(&self.rpc, &position_pda)?)
    }

    // ─── Internal Helpers ──────────────────────────────────────

    /// Resolve the blacklist check PDA for a given address.
    ///
    /// Fetches protocol config to get the blacklist program, then derives the PDA.
    fn resolve_blacklist_check(&self, address: &Pubkey) -> Result<Pubkey, ClientError> {
        let config_pda = find_protocol_config_pda(&self.program_id).address;
        let config = fetch_protocol_config(&self.rpc, &config_pda)?;
        let blacklist_program = config.blacklist_program_pubkey();
        Ok(find_blacklist_check_pda(address, &blacklist_program).address)
    }
}
