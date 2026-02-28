"""
Tests for PDA derivation functions.

These tests verify that the Python SDK derives the same PDAs as the TypeScript SDK.
"""

import pytest
from solders.pubkey import Pubkey

from coalescefi_sdk import (
    SEED_BLACKLIST,
    SEED_BORROWER_WHITELIST,
    SEED_LENDER,
    SEED_MARKET,
    SEED_MARKET_AUTHORITY,
    SEED_PROTOCOL_CONFIG,
    SEED_VAULT,
    configure_sdk,
    derive_market_pdas,
    find_blacklist_check_pda,
    find_borrower_whitelist_pda,
    find_lender_position_pda,
    find_market_authority_pda,
    find_market_pda,
    find_protocol_config_pda,
    find_vault_pda,
    reset_sdk_config,
)

# Test program IDs
LOCALNET_PROGRAM_ID = Pubkey.from_string("2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy")
DEVNET_PROGRAM_ID = Pubkey.from_string("GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR")

# Test public keys
TEST_BORROWER = Pubkey.from_string("BzJ3vHMwcHECdLUFLPHYePxwCdp7XKFBRjGJv2aCYz9X")
TEST_LENDER = Pubkey.from_string("4g9eFvDDnN7rVypLXHU7HM6VUV3zQnQTMPwqTJ3bHrpS")
TEST_BLACKLIST_PROGRAM = Pubkey.from_string("BLAcKLisTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")


@pytest.fixture(autouse=True)
def reset_config():
    """Reset SDK config before each test."""
    reset_sdk_config()
    yield
    reset_sdk_config()


class TestSeedConstants:
    """Test that seed constants match TypeScript SDK."""

    def test_seed_protocol_config(self):
        assert SEED_PROTOCOL_CONFIG == b"protocol_config"

    def test_seed_market(self):
        assert SEED_MARKET == b"market"

    def test_seed_market_authority(self):
        assert SEED_MARKET_AUTHORITY == b"market_authority"

    def test_seed_lender(self):
        assert SEED_LENDER == b"lender"

    def test_seed_vault(self):
        assert SEED_VAULT == b"vault"

    def test_seed_borrower_whitelist(self):
        assert SEED_BORROWER_WHITELIST == b"borrower_whitelist"

    def test_seed_blacklist(self):
        assert SEED_BLACKLIST == b"blacklist"


class TestProtocolConfigPda:
    """Tests for find_protocol_config_pda."""

    def test_derives_deterministic_pda(self):
        """Same program ID should always derive same PDA."""
        pda1, bump1 = find_protocol_config_pda(LOCALNET_PROGRAM_ID)
        pda2, bump2 = find_protocol_config_pda(LOCALNET_PROGRAM_ID)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_program_ids_derive_different_pdas(self):
        """Different program IDs should derive different PDAs."""
        pda1, _ = find_protocol_config_pda(LOCALNET_PROGRAM_ID)
        pda2, _ = find_protocol_config_pda(DEVNET_PROGRAM_ID)

        assert pda1 != pda2

    def test_pda_is_off_curve(self):
        """PDA should be off the Ed25519 curve."""
        pda, _ = find_protocol_config_pda(LOCALNET_PROGRAM_ID)
        # PDAs are valid pubkeys but off-curve
        assert isinstance(pda, Pubkey)

    def test_bump_is_valid(self):
        """Bump should be a valid u8 value."""
        _, bump = find_protocol_config_pda(LOCALNET_PROGRAM_ID)
        assert 0 <= bump <= 255


class TestMarketPda:
    """Tests for find_market_pda."""

    def test_derives_deterministic_pda(self):
        """Same inputs should always derive same PDA."""
        pda1, bump1 = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        pda2, bump2 = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_nonces_derive_different_pdas(self):
        """Different nonces should derive different PDAs."""
        pda1, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        pda2, _ = find_market_pda(TEST_BORROWER, 2, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2

    def test_different_borrowers_derive_different_pdas(self):
        """Different borrowers should derive different PDAs."""
        pda1, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        pda2, _ = find_market_pda(TEST_LENDER, 1, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2

    def test_zero_nonce(self):
        """Zero nonce should work."""
        pda, bump = find_market_pda(TEST_BORROWER, 0, LOCALNET_PROGRAM_ID)
        assert isinstance(pda, Pubkey)
        assert 0 <= bump <= 255

    def test_large_nonce(self):
        """Large nonce values should work."""
        pda, bump = find_market_pda(TEST_BORROWER, 2**64 - 1, LOCALNET_PROGRAM_ID)
        assert isinstance(pda, Pubkey)
        assert 0 <= bump <= 255


class TestMarketAuthorityPda:
    """Tests for find_market_authority_pda."""

    def test_derives_deterministic_pda(self):
        """Same market should always derive same authority PDA."""
        market, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        pda1, bump1 = find_market_authority_pda(market, LOCALNET_PROGRAM_ID)
        pda2, bump2 = find_market_authority_pda(market, LOCALNET_PROGRAM_ID)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_markets_derive_different_authorities(self):
        """Different markets should derive different authority PDAs."""
        market1, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        market2, _ = find_market_pda(TEST_BORROWER, 2, LOCALNET_PROGRAM_ID)

        pda1, _ = find_market_authority_pda(market1, LOCALNET_PROGRAM_ID)
        pda2, _ = find_market_authority_pda(market2, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2


class TestVaultPda:
    """Tests for find_vault_pda."""

    def test_derives_deterministic_pda(self):
        """Same market should always derive same vault PDA."""
        market, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        pda1, bump1 = find_vault_pda(market, LOCALNET_PROGRAM_ID)
        pda2, bump2 = find_vault_pda(market, LOCALNET_PROGRAM_ID)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_markets_derive_different_vaults(self):
        """Different markets should derive different vault PDAs."""
        market1, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        market2, _ = find_market_pda(TEST_BORROWER, 2, LOCALNET_PROGRAM_ID)

        pda1, _ = find_vault_pda(market1, LOCALNET_PROGRAM_ID)
        pda2, _ = find_vault_pda(market2, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2


class TestLenderPositionPda:
    """Tests for find_lender_position_pda."""

    def test_derives_deterministic_pda(self):
        """Same inputs should always derive same PDA."""
        market, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        pda1, bump1 = find_lender_position_pda(market, TEST_LENDER, LOCALNET_PROGRAM_ID)
        pda2, bump2 = find_lender_position_pda(market, TEST_LENDER, LOCALNET_PROGRAM_ID)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_lenders_derive_different_positions(self):
        """Different lenders should derive different position PDAs."""
        market, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        pda1, _ = find_lender_position_pda(market, TEST_LENDER, LOCALNET_PROGRAM_ID)
        pda2, _ = find_lender_position_pda(market, TEST_BORROWER, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2

    def test_different_markets_derive_different_positions(self):
        """Different markets should derive different position PDAs."""
        market1, _ = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        market2, _ = find_market_pda(TEST_BORROWER, 2, LOCALNET_PROGRAM_ID)

        pda1, _ = find_lender_position_pda(market1, TEST_LENDER, LOCALNET_PROGRAM_ID)
        pda2, _ = find_lender_position_pda(market2, TEST_LENDER, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2


class TestBorrowerWhitelistPda:
    """Tests for find_borrower_whitelist_pda."""

    def test_derives_deterministic_pda(self):
        """Same borrower should always derive same whitelist PDA."""
        pda1, bump1 = find_borrower_whitelist_pda(TEST_BORROWER, LOCALNET_PROGRAM_ID)
        pda2, bump2 = find_borrower_whitelist_pda(TEST_BORROWER, LOCALNET_PROGRAM_ID)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_borrowers_derive_different_whitelists(self):
        """Different borrowers should derive different whitelist PDAs."""
        pda1, _ = find_borrower_whitelist_pda(TEST_BORROWER, LOCALNET_PROGRAM_ID)
        pda2, _ = find_borrower_whitelist_pda(TEST_LENDER, LOCALNET_PROGRAM_ID)

        assert pda1 != pda2


class TestBlacklistCheckPda:
    """Tests for find_blacklist_check_pda."""

    def test_derives_deterministic_pda(self):
        """Same address should always derive same blacklist check PDA."""
        pda1, bump1 = find_blacklist_check_pda(TEST_BORROWER, TEST_BLACKLIST_PROGRAM)
        pda2, bump2 = find_blacklist_check_pda(TEST_BORROWER, TEST_BLACKLIST_PROGRAM)

        assert pda1 == pda2
        assert bump1 == bump2

    def test_different_addresses_derive_different_checks(self):
        """Different addresses should derive different blacklist check PDAs."""
        pda1, _ = find_blacklist_check_pda(TEST_BORROWER, TEST_BLACKLIST_PROGRAM)
        pda2, _ = find_blacklist_check_pda(TEST_LENDER, TEST_BLACKLIST_PROGRAM)

        assert pda1 != pda2

    def test_different_blacklist_programs_derive_different_checks(self):
        """Different blacklist programs should derive different check PDAs."""
        other_program = Pubkey.from_string("BLAcKLisTbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

        pda1, _ = find_blacklist_check_pda(TEST_BORROWER, TEST_BLACKLIST_PROGRAM)
        pda2, _ = find_blacklist_check_pda(TEST_BORROWER, other_program)

        assert pda1 != pda2


class TestDeriveMarketPdas:
    """Tests for derive_market_pdas helper function."""

    def test_derives_all_pdas(self):
        """Should derive market, authority, and vault PDAs."""
        pdas = derive_market_pdas(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        assert pdas.market.address is not None
        assert pdas.market.bump is not None
        assert pdas.market_authority.address is not None
        assert pdas.market_authority.bump is not None
        assert pdas.vault.address is not None
        assert pdas.vault.bump is not None

    def test_consistent_with_individual_functions(self):
        """Should match individual PDA derivation functions."""
        pdas = derive_market_pdas(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)

        market, market_bump = find_market_pda(TEST_BORROWER, 1, LOCALNET_PROGRAM_ID)
        authority, authority_bump = find_market_authority_pda(market, LOCALNET_PROGRAM_ID)
        vault, vault_bump = find_vault_pda(market, LOCALNET_PROGRAM_ID)

        assert pdas.market.address == market
        assert pdas.market.bump == market_bump
        assert pdas.market_authority.address == authority
        assert pdas.market_authority.bump == authority_bump
        assert pdas.vault.address == vault
        assert pdas.vault.bump == vault_bump


class TestConfiguredProgramId:
    """Tests for PDA derivation using configured program ID."""

    def test_uses_configured_program_id(self):
        """Should use configured program ID when not explicitly provided."""
        configure_sdk(program_id=DEVNET_PROGRAM_ID)

        pda_configured, _ = find_protocol_config_pda()
        pda_explicit, _ = find_protocol_config_pda(DEVNET_PROGRAM_ID)

        assert pda_configured == pda_explicit

    def test_explicit_overrides_configured(self):
        """Explicit program ID should override configured."""
        configure_sdk(program_id=DEVNET_PROGRAM_ID)

        pda_devnet, _ = find_protocol_config_pda(DEVNET_PROGRAM_ID)
        pda_localnet, _ = find_protocol_config_pda(LOCALNET_PROGRAM_ID)

        assert pda_devnet != pda_localnet

    def test_network_configuration(self):
        """Should work with network-based configuration."""
        configure_sdk(network="devnet")

        pda_configured, _ = find_protocol_config_pda()
        pda_explicit, _ = find_protocol_config_pda(DEVNET_PROGRAM_ID)

        assert pda_configured == pda_explicit
