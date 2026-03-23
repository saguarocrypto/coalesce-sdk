"""
CoalesceFi High-Level Client.

Provides a ``CoalesceClient`` class that handles PDA derivation, account
resolution, and RPC fetching automatically — mirroring the ergonomics of the
TypeScript SDK's ``CoalesceClient``.
"""

from __future__ import annotations

from dataclasses import dataclass

from solana.rpc.async_api import AsyncClient
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction

from .accounts import (
    RetryConfig,
    fetch_market,
    fetch_protocol_config,
)
from .errors import SdkError
from .constants import (
    DEFAULT_PROGRAM_IDS,
    SPL_TOKEN_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
)
from .instructions import (
    create_borrow_instruction,
    create_claim_haircut_instruction,
    create_close_lender_position_instruction,
    create_collect_fees_instruction,
    create_create_market_instruction,
    create_deposit_instruction,
    create_force_claim_haircut_instruction,
    create_force_close_position_instruction,
    create_re_settle_instruction,
    create_waterfall_repay_instructions,
    create_withdraw_excess_instruction,
    create_withdraw_instruction,
)
from .pdas import (
    derive_market_pdas,
    find_blacklist_check_pda,
    find_borrower_whitelist_pda,
    find_haircut_state_pda,
    find_lender_position_pda,
    find_market_authority_pda,
    find_protocol_config_pda,
    find_vault_pda,
)
from .types import Market, ProtocolConfig

# ---------------------------------------------------------------------------
# ATA derivation (standard SPL Associated Token Account PDA)
# ---------------------------------------------------------------------------

_ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)


def _get_associated_token_address(
    owner: Pubkey,
    mint: Pubkey,
    token_program_id: Pubkey = SPL_TOKEN_PROGRAM_ID,
) -> Pubkey:
    """Derive the associated token account address for *owner* and *mint*."""
    address, _bump = Pubkey.find_program_address(
        [bytes(owner), bytes(token_program_id), bytes(mint)],
        _ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    return address


# ---------------------------------------------------------------------------
# CreateMarket result helper
# ---------------------------------------------------------------------------


@dataclass
class CreateMarketResult:
    """Result of a ``create_market`` call."""

    instructions: list[Instruction]
    market_pda: Pubkey


# ---------------------------------------------------------------------------
# CoalesceClient
# ---------------------------------------------------------------------------


class CoalesceClient:
    """High-level async client for the CoalesceFi lending protocol.

    Handles PDA derivation, on-chain account fetching, and instruction
    building so callers only need to supply the minimum required parameters.

    Args:
        connection: An ``AsyncClient`` connected to a Solana RPC endpoint.
        program_id: The CoalesceFi on-chain program ID.
        retry_config: Optional retry configuration for RPC calls.
    """

    def __init__(
        self,
        connection: AsyncClient,
        program_id: Pubkey,
        retry_config: RetryConfig | None = None,
    ) -> None:
        self.connection = connection
        self.program_id = program_id
        self._retry_config = retry_config

    # ── Named Constructors ─────────────────────────────────────────

    @classmethod
    def mainnet(cls, rpc_url: str, **kwargs: object) -> CoalesceClient:
        """Create a client targeting mainnet."""
        return cls(
            connection=AsyncClient(rpc_url),
            program_id=Pubkey.from_string(DEFAULT_PROGRAM_IDS["mainnet"]),
            **kwargs,  # type: ignore[arg-type]
        )

    @classmethod
    def devnet(cls, rpc_url: str, **kwargs: object) -> CoalesceClient:
        """Create a client targeting devnet."""
        return cls(
            connection=AsyncClient(rpc_url),
            program_id=Pubkey.from_string(DEFAULT_PROGRAM_IDS["devnet"]),
            **kwargs,  # type: ignore[arg-type]
        )

    @classmethod
    def localnet(cls, rpc_url: str = "http://localhost:8899", **kwargs: object) -> CoalesceClient:
        """Create a client targeting localnet."""
        return cls(
            connection=AsyncClient(rpc_url),
            program_id=Pubkey.from_string(DEFAULT_PROGRAM_IDS["localnet"]),
            **kwargs,  # type: ignore[arg-type]
        )

    # ── Internal Helpers ───────────────────────────────────────────

    async def _get_market(self, market_pda: Pubkey) -> Market:
        market = await fetch_market(self.connection, market_pda, self._retry_config)
        if market is None:
            raise SdkError(f"Market account not found: {market_pda}", error_type="validation")
        return market

    async def _get_protocol_config(self) -> ProtocolConfig:
        config_pda, _ = find_protocol_config_pda(self.program_id)
        config = await fetch_protocol_config(self.connection, config_pda, self._retry_config)
        if config is None:
            raise SdkError("ProtocolConfig account not found", error_type="configuration")
        return config

    async def _resolve_blacklist_check(self, address: Pubkey) -> Pubkey:
        config = await self._get_protocol_config()
        blacklist_program = config.blacklist_program_pubkey
        pda, _ = find_blacklist_check_pda(address, blacklist_program)
        return pda

    # ── Lender Operations ──────────────────────────────────────────

    async def deposit(
        self,
        lender: Pubkey,
        market_pda: Pubkey,
        amount: int,
        *,
        lender_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build instruction(s) for a lender deposit.

        Args:
            lender: The lender's wallet public key (signer).
            market_pda: The market PDA to deposit into.
            amount: Amount of tokens to deposit (u64).
            lender_token_account: Override for the lender's token account.
                Derived as the ATA if not provided.

        Returns:
            A list containing the deposit instruction.
        """
        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        lender_position_pda, _ = find_lender_position_pda(market_pda, lender, self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        blacklist_check = await self._resolve_blacklist_check(lender)

        resolved_lender_token = lender_token_account or _get_associated_token_address(
            lender, market.mint
        )

        ix = create_deposit_instruction(
            {
                "market": market_pda,
                "lender": lender,
                "lender_token_account": resolved_lender_token,
                "vault": vault_pda,
                "lender_position": lender_position_pda,
                "blacklist_check": blacklist_check,
                "protocol_config": protocol_config_pda,
                "mint": market.mint,
                "token_program": SPL_TOKEN_PROGRAM_ID,
                "system_program": SYSTEM_PROGRAM_ID,
            },
            {"amount": amount},
            self.program_id,
        )
        return [ix]

    async def withdraw(
        self,
        lender: Pubkey,
        market_pda: Pubkey,
        scaled_amount: int,
        *,
        min_payout: int = 0,
        lender_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build instruction(s) for a lender withdrawal.

        Args:
            lender: The lender's wallet public key (signer).
            market_pda: The market PDA.
            scaled_amount: Scaled share amount to withdraw (u128). Use 0 for full withdrawal.
            min_payout: Minimum payout for slippage protection (u64, default 0).
            lender_token_account: Override for the lender's token account.

        Returns:
            A list containing the withdraw instruction.
        """
        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        lender_position_pda, _ = find_lender_position_pda(market_pda, lender, self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)
        haircut_state_pda, _ = find_haircut_state_pda(market_pda, self.program_id)
        blacklist_check = await self._resolve_blacklist_check(lender)

        resolved_lender_token = lender_token_account or _get_associated_token_address(
            lender, market.mint
        )

        ix = create_withdraw_instruction(
            {
                "market": market_pda,
                "lender": lender,
                "lender_token_account": resolved_lender_token,
                "vault": vault_pda,
                "lender_position": lender_position_pda,
                "market_authority": market_authority_pda,
                "blacklist_check": blacklist_check,
                "protocol_config": protocol_config_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
                "haircut_state": haircut_state_pda,
            },
            {"scaled_amount": scaled_amount, "min_payout": min_payout},
            self.program_id,
        )
        return [ix]

    async def withdraw_and_close(
        self,
        lender: Pubkey,
        market_pda: Pubkey,
        *,
        min_payout: int = 0,
        lender_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Withdraw all shares and close the lender position in one transaction.

        Combines a full withdrawal (scaled_amount=0) with a close instruction.

        Returns:
            A list of instructions (withdraw + close).
        """
        withdraw_ixs = await self.withdraw(
            lender,
            market_pda,
            scaled_amount=0,
            min_payout=min_payout,
            lender_token_account=lender_token_account,
        )

        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        lender_position_pda, _ = find_lender_position_pda(market_pda, lender, self.program_id)

        close_ix = create_close_lender_position_instruction(
            {
                "market": market_pda,
                "lender": lender,
                "lender_position": lender_position_pda,
                "system_program": SYSTEM_PROGRAM_ID,
                "protocol_config": protocol_config_pda,
            },
            self.program_id,
        )
        return [*withdraw_ixs, close_ix]

    def close_lender_position(
        self,
        lender: Pubkey,
        market_pda: Pubkey,
    ) -> list[Instruction]:
        """Close an empty lender position to reclaim rent.

        The position must have zero balance and zero haircut_owed.
        This method is synchronous (no RPC calls required).

        Returns:
            A list containing the close instruction.
        """
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        lender_position_pda, _ = find_lender_position_pda(market_pda, lender, self.program_id)

        ix = create_close_lender_position_instruction(
            {
                "market": market_pda,
                "lender": lender,
                "lender_position": lender_position_pda,
                "system_program": SYSTEM_PROGRAM_ID,
                "protocol_config": protocol_config_pda,
            },
            self.program_id,
        )
        return [ix]

    async def claim_haircut(
        self,
        lender: Pubkey,
        market_pda: Pubkey,
        *,
        lender_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build instruction(s) for a lender to claim haircut recovery.

        Returns:
            A list containing the claim haircut instruction.
        """
        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        lender_position_pda, _ = find_lender_position_pda(market_pda, lender, self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)
        haircut_state_pda, _ = find_haircut_state_pda(market_pda, self.program_id)

        resolved_lender_token = lender_token_account or _get_associated_token_address(
            lender, market.mint
        )

        ix = create_claim_haircut_instruction(
            {
                "market": market_pda,
                "lender": lender,
                "lender_token_account": resolved_lender_token,
                "vault": vault_pda,
                "lender_position": lender_position_pda,
                "market_authority": market_authority_pda,
                "haircut_state": haircut_state_pda,
                "protocol_config": protocol_config_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
            },
            self.program_id,
        )
        return [ix]

    async def claim_haircut_and_close(
        self,
        lender: Pubkey,
        market_pda: Pubkey,
        *,
        lender_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Claim haircut recovery and close the lender position in one transaction.

        Returns:
            A list of instructions (claim + close).
        """
        claim_ixs = await self.claim_haircut(
            lender, market_pda, lender_token_account=lender_token_account
        )

        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        lender_position_pda, _ = find_lender_position_pda(market_pda, lender, self.program_id)

        close_ix = create_close_lender_position_instruction(
            {
                "market": market_pda,
                "lender": lender,
                "lender_position": lender_position_pda,
                "system_program": SYSTEM_PROGRAM_ID,
                "protocol_config": protocol_config_pda,
            },
            self.program_id,
        )
        return [*claim_ixs, close_ix]

    # ── Borrower Operations ────────────────────────────────────────

    async def create_market(
        self,
        borrower: Pubkey,
        mint: Pubkey,
        *,
        market_nonce: int,
        annual_interest_bps: int,
        maturity_timestamp: int,
        max_total_supply: int,
    ) -> CreateMarketResult:
        """Build instruction(s) to create a new market.

        Args:
            borrower: The borrower's wallet public key (signer).
            mint: The token mint (e.g. USDC).
            market_nonce: Unique nonce for PDA derivation (u64).
            annual_interest_bps: Annual interest rate in basis points.
            maturity_timestamp: Unix timestamp for loan maturity.
            max_total_supply: Maximum total supply in token smallest units.

        Returns:
            A ``CreateMarketResult`` with the instruction list and market PDA.
        """
        pdas = derive_market_pdas(borrower, market_nonce, self.program_id)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        borrower_whitelist_pda, _ = find_borrower_whitelist_pda(borrower, self.program_id)
        blacklist_check = await self._resolve_blacklist_check(borrower)

        ix = create_create_market_instruction(
            {
                "market": pdas.market.address,
                "borrower": borrower,
                "mint": mint,
                "vault": pdas.vault.address,
                "market_authority": pdas.market_authority.address,
                "protocol_config": protocol_config_pda,
                "borrower_whitelist": borrower_whitelist_pda,
                "blacklist_check": blacklist_check,
                "system_program": SYSTEM_PROGRAM_ID,
                "token_program": SPL_TOKEN_PROGRAM_ID,
                "haircut_state": find_haircut_state_pda(pdas.market.address, self.program_id)[0],
            },
            {
                "market_nonce": market_nonce,
                "annual_interest_bps": annual_interest_bps,
                "maturity_timestamp": maturity_timestamp,
                "max_total_supply": max_total_supply,
            },
            self.program_id,
        )
        return CreateMarketResult(instructions=[ix], market_pda=pdas.market.address)

    async def borrow(
        self,
        borrower: Pubkey,
        market_pda: Pubkey,
        amount: int,
        *,
        borrower_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build instruction(s) for a borrower to borrow from a market.

        Returns:
            A list containing the borrow instruction.
        """
        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)
        borrower_whitelist_pda, _ = find_borrower_whitelist_pda(borrower, self.program_id)
        blacklist_check = await self._resolve_blacklist_check(borrower)

        resolved_borrower_token = borrower_token_account or _get_associated_token_address(
            borrower, market.mint
        )

        ix = create_borrow_instruction(
            {
                "market": market_pda,
                "borrower": borrower,
                "borrower_token_account": resolved_borrower_token,
                "vault": vault_pda,
                "market_authority": market_authority_pda,
                "borrower_whitelist": borrower_whitelist_pda,
                "blacklist_check": blacklist_check,
                "protocol_config": protocol_config_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
            },
            {"amount": amount},
            self.program_id,
        )
        return [ix]

    async def repay(
        self,
        payer: Pubkey,
        market_pda: Pubkey,
        total_amount: int,
        interest_amount: int,
        *,
        payer_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build waterfall repay instructions (interest-first, then principal).

        Args:
            payer: The payer's wallet public key (signer).
            market_pda: The market PDA.
            total_amount: Total amount to repay (u64).
            interest_amount: Amount allocated to interest (u64).
                The remainder goes to principal.
            payer_token_account: Override for the payer's token account.

        Returns:
            A list of 0-2 instructions (interest repay + principal repay).

        Raises:
            SdkError: If total_amount is 0 or interest_amount exceeds total_amount.
        """
        if total_amount == 0:
            raise SdkError("total_amount must be greater than 0", error_type="validation")
        if interest_amount > total_amount:
            raise SdkError("interest_amount cannot exceed total_amount", error_type="validation")

        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        borrower_whitelist_pda, _ = find_borrower_whitelist_pda(
            market.borrower, self.program_id
        )

        resolved_payer_token = payer_token_account or _get_associated_token_address(
            payer, market.mint
        )

        return create_waterfall_repay_instructions(
            {
                "market": market_pda,
                "payer": payer,
                "payer_token_account": resolved_payer_token,
                "vault": market.vault,
                "protocol_config": protocol_config_pda,
                "mint": market.mint,
                "borrower_whitelist": borrower_whitelist_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
            },
            {"total_amount": total_amount, "interest_amount": interest_amount},
            self.program_id,
        )

    async def withdraw_excess(
        self,
        borrower: Pubkey,
        market_pda: Pubkey,
        *,
        borrower_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build instruction(s) for the borrower to withdraw excess vault funds.

        Returns:
            A list containing the withdraw excess instruction.
        """
        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)
        blacklist_check = await self._resolve_blacklist_check(borrower)
        borrower_whitelist_pda, _ = find_borrower_whitelist_pda(borrower, self.program_id)

        resolved_borrower_token = borrower_token_account or _get_associated_token_address(
            borrower, market.mint
        )

        ix = create_withdraw_excess_instruction(
            {
                "market": market_pda,
                "borrower": borrower,
                "borrower_token_account": resolved_borrower_token,
                "vault": vault_pda,
                "market_authority": market_authority_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
                "protocol_config": protocol_config_pda,
                "blacklist_check": blacklist_check,
                "borrower_whitelist": borrower_whitelist_pda,
            },
            self.program_id,
        )
        return [ix]

    def force_close_position(
        self,
        borrower: Pubkey,
        market_pda: Pubkey,
        lender_pubkey: Pubkey,
        escrow_token_account: Pubkey,
    ) -> list[Instruction]:
        """Build instruction(s) for the borrower to force-close a lender position.

        This method is synchronous (no RPC calls required).

        Args:
            borrower: The borrower's wallet (signer).
            market_pda: The market PDA.
            lender_pubkey: The lender whose position is being force-closed.
            escrow_token_account: Token account to receive the lender's funds.

        Returns:
            A list containing the force close instruction.
        """
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)
        lender_position_pda, _ = find_lender_position_pda(
            market_pda, lender_pubkey, self.program_id
        )
        haircut_state_pda, _ = find_haircut_state_pda(market_pda, self.program_id)

        ix = create_force_close_position_instruction(
            {
                "market": market_pda,
                "borrower": borrower,
                "lender_position": lender_position_pda,
                "vault": vault_pda,
                "escrow_token_account": escrow_token_account,
                "market_authority": market_authority_pda,
                "protocol_config": protocol_config_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
                "haircut_state": haircut_state_pda,
            },
            self.program_id,
        )
        return [ix]

    def force_claim_haircut(
        self,
        borrower: Pubkey,
        market_pda: Pubkey,
        lender_pubkey: Pubkey,
        escrow_token_account: Pubkey,
    ) -> list[Instruction]:
        """Build instruction(s) for the borrower to force-claim a lender's haircut.

        This method is synchronous (no RPC calls required).

        Args:
            borrower: The borrower's wallet (signer).
            market_pda: The market PDA.
            lender_pubkey: The lender whose haircut is being force-claimed.
            escrow_token_account: Token account to receive the haircut funds.

        Returns:
            A list containing the force claim haircut instruction.
        """
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)
        lender_position_pda, _ = find_lender_position_pda(
            market_pda, lender_pubkey, self.program_id
        )
        haircut_state_pda, _ = find_haircut_state_pda(market_pda, self.program_id)

        ix = create_force_claim_haircut_instruction(
            {
                "market": market_pda,
                "borrower": borrower,
                "lender_position": lender_position_pda,
                "vault": vault_pda,
                "escrow_token_account": escrow_token_account,
                "market_authority": market_authority_pda,
                "haircut_state": haircut_state_pda,
                "protocol_config": protocol_config_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
            },
            self.program_id,
        )
        return [ix]

    # ── Settlement ─────────────────────────────────────────────────

    def re_settle(self, market_pda: Pubkey) -> list[Instruction]:
        """Build instruction(s) to re-settle a market (permissionless).

        This method is synchronous (no RPC calls required).

        Returns:
            A list containing the re-settle instruction.
        """
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        haircut_state_pda, _ = find_haircut_state_pda(market_pda, self.program_id)

        ix = create_re_settle_instruction(
            {
                "market": market_pda,
                "vault": vault_pda,
                "protocol_config": protocol_config_pda,
                "haircut_state": haircut_state_pda,
            },
            self.program_id,
        )
        return [ix]

    async def collect_fees(
        self,
        fee_authority: Pubkey,
        market_pda: Pubkey,
        *,
        fee_token_account: Pubkey | None = None,
    ) -> list[Instruction]:
        """Build instruction(s) to collect accrued protocol fees.

        Args:
            fee_authority: The fee authority wallet (signer).
            market_pda: The market PDA.
            fee_token_account: Override for the fee destination token account.
                Derived as the ATA of fee_authority if not provided.

        Returns:
            A list containing the collect fees instruction.
        """
        market = await self._get_market(market_pda)
        protocol_config_pda, _ = find_protocol_config_pda(self.program_id)
        vault_pda, _ = find_vault_pda(market_pda, self.program_id)
        market_authority_pda, _ = find_market_authority_pda(market_pda, self.program_id)

        resolved_fee_token = fee_token_account or _get_associated_token_address(
            fee_authority, market.mint
        )

        ix = create_collect_fees_instruction(
            {
                "market": market_pda,
                "protocol_config": protocol_config_pda,
                "fee_authority": fee_authority,
                "fee_token_account": resolved_fee_token,
                "vault": vault_pda,
                "market_authority": market_authority_pda,
                "token_program": SPL_TOKEN_PROGRAM_ID,
            },
            self.program_id,
        )
        return [ix]

    # ── Convenience: send_and_confirm ──────────────────────────────

    async def send_and_confirm(
        self,
        instructions: list[Instruction],
        signers: list[Keypair],
    ) -> str:
        """Build, send, and confirm a transaction.

        Args:
            instructions: Instructions to include in the transaction.
            signers: Keypair signers for the transaction.

        Returns:
            The transaction signature string.

        Raises:
            ValueError: If no instructions or signers are provided.
        """
        if not instructions:
            raise SdkError("No instructions to send", error_type="validation")
        if not signers:
            raise SdkError("At least one signer is required", error_type="validation")

        blockhash_resp = await self.connection.get_latest_blockhash()
        recent_blockhash = blockhash_resp.value.blockhash

        tx = Transaction.new_signed_with_payer(
            instructions,
            signers[0].pubkey(),
            signers,
            recent_blockhash,
        )

        resp = await self.connection.send_transaction(tx)
        signature = resp.value

        await self.connection.confirm_transaction(signature)
        return str(signature)
