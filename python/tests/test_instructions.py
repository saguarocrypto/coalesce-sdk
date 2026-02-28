"""
Tests for waterfall repay instruction helper.

Mirrors the TypeScript SDK's createWaterfallRepayInstructions test coverage.
"""

import struct

import pytest
from solders.pubkey import Pubkey

from coalescefi_sdk import (
    InstructionDiscriminator,
    create_waterfall_repay_instructions,
)

# Test program ID (localnet)
LOCALNET_PROGRAM_ID = Pubkey.from_string("2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy")


def _test_pubkey(seed: int) -> Pubkey:
    """Create a deterministic pubkey for testing."""
    return Pubkey.from_bytes(bytes([seed] + [0] * 31))


def _waterfall_accounts() -> dict:
    return {
        "market": _test_pubkey(1),
        "payer": _test_pubkey(2),
        "payer_token_account": _test_pubkey(3),
        "vault": _test_pubkey(4),
        "protocol_config": _test_pubkey(5),
        "mint": _test_pubkey(6),
        "borrower_whitelist": _test_pubkey(7),
        "token_program": _test_pubkey(8),
    }


class TestWaterfallRepayInstructions:
    """Tests for create_waterfall_repay_instructions."""

    def test_interest_and_principal_in_correct_order(self) -> None:
        ixs = create_waterfall_repay_instructions(
            accounts=_waterfall_accounts(),
            args={"total_amount": 1_000_000, "interest_amount": 50_000},
            program_id=LOCALNET_PROGRAM_ID,
        )

        assert len(ixs) == 2
        # First: RepayInterest (disc 6), 6 accounts
        assert ixs[0].data[0] == InstructionDiscriminator.RepayInterest
        assert len(ixs[0].accounts) == 6
        # Second: Repay (disc 5), 8 accounts
        assert ixs[1].data[0] == InstructionDiscriminator.Repay
        assert len(ixs[1].accounts) == 8

    def test_correct_amounts_encoded(self) -> None:
        ixs = create_waterfall_repay_instructions(
            accounts=_waterfall_accounts(),
            args={"total_amount": 1_000_000, "interest_amount": 50_000},
            program_id=LOCALNET_PROGRAM_ID,
        )

        # Interest amount in bytes 1-8 (little-endian u64)
        interest_encoded = struct.unpack_from("<Q", bytes(ixs[0].data), 1)[0]
        assert interest_encoded == 50_000

        # Principal amount = total - interest = 950_000
        principal_encoded = struct.unpack_from("<Q", bytes(ixs[1].data), 1)[0]
        assert principal_encoded == 950_000

    def test_interest_equals_total_returns_one_instruction(self) -> None:
        ixs = create_waterfall_repay_instructions(
            accounts=_waterfall_accounts(),
            args={"total_amount": 500_000, "interest_amount": 500_000},
            program_id=LOCALNET_PROGRAM_ID,
        )

        assert len(ixs) == 1
        assert ixs[0].data[0] == InstructionDiscriminator.RepayInterest

    def test_zero_interest_returns_only_repay(self) -> None:
        ixs = create_waterfall_repay_instructions(
            accounts=_waterfall_accounts(),
            args={"total_amount": 500_000, "interest_amount": 0},
            program_id=LOCALNET_PROGRAM_ID,
        )

        assert len(ixs) == 1
        assert ixs[0].data[0] == InstructionDiscriminator.Repay

    def test_zero_total_returns_empty(self) -> None:
        ixs = create_waterfall_repay_instructions(
            accounts=_waterfall_accounts(),
            args={"total_amount": 0, "interest_amount": 0},
            program_id=LOCALNET_PROGRAM_ID,
        )

        assert len(ixs) == 0

    def test_interest_exceeds_total_raises(self) -> None:
        with pytest.raises(ValueError, match="interest_amount cannot exceed total_amount"):
            create_waterfall_repay_instructions(
                accounts=_waterfall_accounts(),
                args={"total_amount": 100_000, "interest_amount": 200_000},
                program_id=LOCALNET_PROGRAM_ID,
            )

    def test_correct_accounts_passed(self) -> None:
        accts = _waterfall_accounts()
        ixs = create_waterfall_repay_instructions(
            accounts=accts,
            args={"total_amount": 1_000_000, "interest_amount": 50_000},
            program_id=LOCALNET_PROGRAM_ID,
        )

        # RepayInterest: [market, payer, payer_token_account, vault, protocol_config, token_program]
        interest_keys = ixs[0].accounts
        assert interest_keys[0].pubkey == accts["market"]
        assert interest_keys[1].pubkey == accts["payer"]
        assert interest_keys[2].pubkey == accts["payer_token_account"]
        assert interest_keys[3].pubkey == accts["vault"]
        assert interest_keys[4].pubkey == accts["protocol_config"]
        assert interest_keys[5].pubkey == accts["token_program"]

        # Repay: [market, payer, payer_token_account, vault, protocol_config, mint, borrower_whitelist, token_program]
        repay_keys = ixs[1].accounts
        assert repay_keys[0].pubkey == accts["market"]
        assert repay_keys[1].pubkey == accts["payer"]
        assert repay_keys[2].pubkey == accts["payer_token_account"]
        assert repay_keys[3].pubkey == accts["vault"]
        assert repay_keys[4].pubkey == accts["protocol_config"]
        assert repay_keys[5].pubkey == accts["mint"]
        assert repay_keys[6].pubkey == accts["borrower_whitelist"]
        assert repay_keys[7].pubkey == accts["token_program"]

    def test_program_id_propagated(self) -> None:
        custom_id = _test_pubkey(99)
        ixs = create_waterfall_repay_instructions(
            accounts=_waterfall_accounts(),
            args={"total_amount": 1_000_000, "interest_amount": 50_000},
            program_id=custom_id,
        )

        assert ixs[0].program_id == custom_id
        assert ixs[1].program_id == custom_id

    def test_negative_total_amount_raises(self) -> None:
        with pytest.raises(ValueError, match="total_amount must be a u64 value"):
            create_waterfall_repay_instructions(
                accounts=_waterfall_accounts(),
                args={"total_amount": -1, "interest_amount": 0},
                program_id=LOCALNET_PROGRAM_ID,
            )

    def test_negative_interest_amount_raises(self) -> None:
        with pytest.raises(ValueError, match="interest_amount must be a u64 value"):
            create_waterfall_repay_instructions(
                accounts=_waterfall_accounts(),
                args={"total_amount": 1_000_000, "interest_amount": -1},
                program_id=LOCALNET_PROGRAM_ID,
            )
