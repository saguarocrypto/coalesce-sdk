"""Unit tests for the high-level CoalesceClient.

Focused on `withdraw_by_usdc` — the convenience method whose conversion +
clamp + sub-unit guard contain the only non-trivial logic in the client.
Other client methods are thin wrappers around instruction builders and are
exercised by the e2e_lifecycle integration tests.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from solders.pubkey import Pubkey

from coalescefi_sdk.client import CoalesceClient
from coalescefi_sdk.constants import DEFAULT_PROGRAM_IDS
from coalescefi_sdk.errors import SdkError
from coalescefi_sdk.types import LenderPosition, Market

WAD = 10**18
# Real on-chain values from the mainnet withdraw failure that motivated this method.
SCALE_FACTOR = 1_027_772_191_401_129_296  # ~1.027772 WAD
SCALED_BALANCE = 4_999_329


def _market(scale_factor: int = SCALE_FACTOR) -> Market:
    return Market(
        version=1,
        borrower=Pubkey.new_unique(),
        mint=Pubkey.new_unique(),
        vault=Pubkey.new_unique(),
        market_authority_bump=255,
        annual_interest_bps=1000,
        maturity_timestamp=1700000000 + 31536000,
        max_total_supply=1_000_000_000_000,
        market_nonce=0,
        scaled_total_supply=500_000_000_000,
        scale_factor=scale_factor,
        accrued_protocol_fees=0,
        total_deposited=500_000_000_000,
        total_borrowed=0,
        total_repaid=0,
        total_interest_repaid=0,
        last_accrual_timestamp=1700000000,
        settlement_factor_wad=0,
        bump=254,
        haircut_accumulator=0,
    )  # type: ignore[call-arg]


def _position(scaled_balance: int = SCALED_BALANCE) -> LenderPosition:
    return LenderPosition(
        version=1,
        market=Pubkey.new_unique(),
        lender=Pubkey.new_unique(),
        scaled_balance=scaled_balance,
        bump=255,
        haircut_owed=0,
        withdrawal_sf=0,
    )  # type: ignore[call-arg]


def _client() -> CoalesceClient:
    """Build a client with a stub RPC connection. Tests patch fetchers directly."""
    connection = AsyncMock()
    return CoalesceClient(
        connection=connection,
        program_id=Pubkey.from_string(DEFAULT_PROGRAM_IDS["localnet"]),
    )


def _extract_scaled_amount(call_args: object) -> int:
    """`withdraw` is called with kwargs scaled_amount=clamped — pull it out."""
    # call_args is a Call object; use .kwargs.
    kwargs = call_args.kwargs  # type: ignore[attr-defined]
    return int(kwargs["scaled_amount"])


class TestWithdrawByUsdc:
    @pytest.fixture(autouse=True)
    def patch_fetchers(self) -> None:
        pass  # No-op; each test patches per its own setup.

    @pytest.mark.asyncio
    async def test_clamps_to_scaled_balance_when_conversion_overshoots(self) -> None:
        """The mainnet bug guard: 5.14 USDC requested but position is ~5.138 USDC.
        Conversion overshoots — clamp must absorb it."""
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with patch("coalescefi_sdk.client.fetch_market", new=AsyncMock(return_value=_market())), \
             patch(
                "coalescefi_sdk.client.fetch_lender_position",
                new=AsyncMock(return_value=_position()),
             ), \
             patch.object(client, "withdraw", new=AsyncMock(return_value=[MagicMock()])) as mock_withdraw:
            await client.withdraw_by_usdc(lender, market_pda, 5_140_000)

        assert _extract_scaled_amount(mock_withdraw.call_args) == SCALED_BALANCE

    @pytest.mark.asyncio
    async def test_partial_within_balance_converts_via_calculate_scaled_amount(self) -> None:
        """1 USDC → floor(1_000_000 * 1e18 / SCALE_FACTOR) = 972_978 scaled."""
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with patch("coalescefi_sdk.client.fetch_market", new=AsyncMock(return_value=_market())), \
             patch(
                "coalescefi_sdk.client.fetch_lender_position",
                new=AsyncMock(return_value=_position()),
             ), \
             patch.object(client, "withdraw", new=AsyncMock(return_value=[MagicMock()])) as mock_withdraw:
            await client.withdraw_by_usdc(lender, market_pda, 1_000_000)

        assert _extract_scaled_amount(mock_withdraw.call_args) == 972_978

    @pytest.mark.asyncio
    async def test_rejects_sub_unit_usdc_to_prevent_sentinel_collision(self) -> None:
        """1 base unit floor-converts to 0 scaled shares when SCALE_FACTOR > WAD.
        Without the guard, withdraw(scaled_amount=0) would trigger the full-
        withdrawal sentinel and drain the entire position."""
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with patch("coalescefi_sdk.client.fetch_market", new=AsyncMock(return_value=_market())), \
             patch(
                "coalescefi_sdk.client.fetch_lender_position",
                new=AsyncMock(return_value=_position()),
             ), \
             patch.object(client, "withdraw", new=AsyncMock(return_value=[MagicMock()])) as mock_withdraw:
            with pytest.raises(SdkError, match="too small"):
                await client.withdraw_by_usdc(lender, market_pda, 1)

            mock_withdraw.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_when_position_missing(self) -> None:
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with patch("coalescefi_sdk.client.fetch_market", new=AsyncMock(return_value=_market())), \
             patch(
                "coalescefi_sdk.client.fetch_lender_position",
                new=AsyncMock(return_value=None),
             ):
            with pytest.raises(SdkError, match="no lender position"):
                await client.withdraw_by_usdc(lender, market_pda, 1_000_000)

    @pytest.mark.asyncio
    async def test_raises_when_position_empty(self) -> None:
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with patch("coalescefi_sdk.client.fetch_market", new=AsyncMock(return_value=_market())), \
             patch(
                "coalescefi_sdk.client.fetch_lender_position",
                new=AsyncMock(return_value=_position(scaled_balance=0)),
             ):
            with pytest.raises(SdkError, match="position is empty"):
                await client.withdraw_by_usdc(lender, market_pda, 1_000_000)

    @pytest.mark.asyncio
    async def test_raises_when_scale_factor_zero(self) -> None:
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with patch("coalescefi_sdk.client.fetch_market", new=AsyncMock(return_value=_market(scale_factor=0))):
            with pytest.raises(SdkError, match="scale_factor is 0"):
                await client.withdraw_by_usdc(lender, market_pda, 1_000_000)

    @pytest.mark.asyncio
    async def test_raises_when_usdc_base_units_zero(self) -> None:
        client = _client()
        lender = Pubkey.new_unique()
        market_pda = Pubkey.new_unique()

        with pytest.raises(SdkError, match="greater than 0"):
            await client.withdraw_by_usdc(lender, market_pda, 0)
