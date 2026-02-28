# coalescefi-sdk

Python SDK for the [CoalesceFi](https://www.coalescefi.com/en/docs) on-chain lending protocol on Solana.

## Installation

```bash
uv add coalescefi-sdk
```

Requires Python >= 3.10.

## Configuration

```python
from coalescefi_sdk import configure_sdk, get_program_id
from solders.pubkey import Pubkey

# Option 1: Explicit program ID
configure_sdk(program_id=Pubkey.from_string("GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR"))

# Option 2: By network name
configure_sdk(network="mainnet")

# Option 3: Environment variable
#   COALESCEFI_PROGRAM_ID=GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR
#   COALESCEFI_NETWORK=mainnet

# Retrieve the resolved program ID
program_id = get_program_id()
```

Resolution priority: explicit `program_id` > `COALESCEFI_PROGRAM_ID` env var > `network` config > `COALESCEFI_NETWORK` env var > localnet default.

## Full Example: Create a Lending Market

Admin initializes the protocol, whitelists a borrower, and the borrower creates a market.

```python
import time
from solana.rpc.async_api import AsyncClient
from solana.transaction import Transaction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID

from coalescefi_sdk import (
    configure_sdk,
    find_protocol_config_pda,
    find_program_data_pda,
    find_borrower_whitelist_pda,
    find_blacklist_check_pda,
    derive_market_pdas,
    create_initialize_protocol_instruction,
    create_set_borrower_whitelist_instruction,
    create_create_market_instruction,
    SPL_TOKEN_PROGRAM_ID,
)

configure_sdk(network="mainnet")
client = AsyncClient("https://api.mainnet-beta.solana.com")

admin = Keypair()           # protocol admin (upgrade authority)
fee_authority = Keypair()   # collects protocol fees
whitelist_manager = Keypair()
borrower = Keypair()
blacklist_program = Pubkey.from_string("...")  # external blacklist program

# 1. Derive protocol config PDA
protocol_config, _ = find_protocol_config_pda()
program_data, _ = find_program_data_pda()

# 2. Initialize protocol (one-time, admin only)
init_ix = create_initialize_protocol_instruction(
    accounts={
        "protocol_config": protocol_config,
        "admin": admin.pubkey(),
        "fee_authority": fee_authority.pubkey(),
        "whitelist_manager": whitelist_manager.pubkey(),
        "blacklist_program": blacklist_program,
        "system_program": SYSTEM_PROGRAM_ID,
        "program_data": program_data,
    },
    args={"fee_rate_bps": 500},  # 5% protocol fee
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([init_ix], admin.pubkey(), [admin], blockhash)
await client.send_transaction(tx)

# 3. Whitelist a borrower
borrower_whitelist, _ = find_borrower_whitelist_pda(borrower.pubkey())

whitelist_ix = create_set_borrower_whitelist_instruction(
    accounts={
        "borrower_whitelist": borrower_whitelist,
        "protocol_config": protocol_config,
        "whitelist_manager": whitelist_manager.pubkey(),
        "borrower": borrower.pubkey(),
        "system_program": SYSTEM_PROGRAM_ID,
    },
    args={"is_whitelisted": True, "max_borrow_capacity": 1_000_000_000_000},  # 1M USDC
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([whitelist_ix], whitelist_manager.pubkey(), [whitelist_manager], blockhash)
await client.send_transaction(tx)

# 4. Derive market PDAs
market_nonce = 0
pdas = derive_market_pdas(borrower.pubkey(), market_nonce)

usdc_mint = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
blacklist_check, _ = find_blacklist_check_pda(borrower.pubkey(), blacklist_program)

# 5. Create market
maturity_timestamp = int(time.time()) + 90 * 24 * 60 * 60  # 90 days

create_market_ix = create_create_market_instruction(
    accounts={
        "market": pdas.market.address,
        "borrower": borrower.pubkey(),
        "mint": usdc_mint,
        "vault": pdas.vault.address,
        "market_authority": pdas.market_authority.address,
        "protocol_config": protocol_config,
        "borrower_whitelist": borrower_whitelist,
        "blacklist_check": blacklist_check,
        "system_program": SYSTEM_PROGRAM_ID,
        "token_program": SPL_TOKEN_PROGRAM_ID,
    },
    args={
        "market_nonce": market_nonce,
        "annual_interest_bps": 800,              # 8% annual interest
        "maturity_timestamp": maturity_timestamp,
        "max_total_supply": 500_000_000_000,     # 500K USDC (6 decimals)
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([create_market_ix], borrower.pubkey(), [borrower], blockhash)
await client.send_transaction(tx)
```

## Full Example: Complete Borrow-Lend Lifecycle

End-to-end flow covering deposit, borrow, repay, settlement, withdrawal, and cleanup.

```python
from solana.rpc.async_api import AsyncClient
from solana.transaction import Transaction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.instructions import get_associated_token_address

from coalescefi_sdk import (
    configure_sdk,
    find_protocol_config_pda,
    find_lender_position_pda,
    find_borrower_whitelist_pda,
    find_blacklist_check_pda,
    derive_market_pdas,
    create_deposit_instruction,
    create_borrow_instruction,
    create_waterfall_repay_instructions,
    create_re_settle_instruction,
    create_collect_fees_instruction,
    create_withdraw_instruction,
    create_close_lender_position_instruction,
    create_withdraw_excess_instruction,
    SPL_TOKEN_PROGRAM_ID,
)

configure_sdk(network="mainnet")
client = AsyncClient("https://api.mainnet-beta.solana.com")

lender = Keypair()
borrower = Keypair()
fee_authority = Keypair()
blacklist_program = Pubkey.from_string("...")
usdc_mint = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

market_nonce = 0
pdas = derive_market_pdas(borrower.pubkey(), market_nonce)
protocol_config, _ = find_protocol_config_pda()
lender_position, _ = find_lender_position_pda(pdas.market.address, lender.pubkey())
borrower_whitelist, _ = find_borrower_whitelist_pda(borrower.pubkey())
lender_blacklist, _ = find_blacklist_check_pda(lender.pubkey(), blacklist_program)
borrower_blacklist, _ = find_blacklist_check_pda(borrower.pubkey(), blacklist_program)

lender_token_account = get_associated_token_address(lender.pubkey(), usdc_mint)
borrower_token_account = get_associated_token_address(borrower.pubkey(), usdc_mint)
fee_token_account = get_associated_token_address(fee_authority.pubkey(), usdc_mint)

# 1. Lender deposits USDC into market
deposit_ix = create_deposit_instruction(
    accounts={
        "market": pdas.market.address,
        "lender": lender.pubkey(),
        "lender_token_account": lender_token_account,
        "vault": pdas.vault.address,
        "lender_position": lender_position,
        "blacklist_check": lender_blacklist,
        "protocol_config": protocol_config,
        "mint": usdc_mint,
        "token_program": SPL_TOKEN_PROGRAM_ID,
        "system_program": SYSTEM_PROGRAM_ID,
    },
    args={"amount": 100_000_000_000},  # 100K USDC
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([deposit_ix], lender.pubkey(), [lender], blockhash)
await client.send_transaction(tx)

# 2. Borrower borrows from vault
borrow_ix = create_borrow_instruction(
    accounts={
        "market": pdas.market.address,
        "borrower": borrower.pubkey(),
        "borrower_token_account": borrower_token_account,
        "vault": pdas.vault.address,
        "market_authority": pdas.market_authority.address,
        "borrower_whitelist": borrower_whitelist,
        "blacklist_check": borrower_blacklist,
        "protocol_config": protocol_config,
        "token_program": SPL_TOKEN_PROGRAM_ID,
    },
    args={"amount": 50_000_000_000},  # 50K USDC
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([borrow_ix], borrower.pubkey(), [borrower], blockhash)
await client.send_transaction(tx)

# 3. Borrower repays (interest-first waterfall)
#    create_waterfall_repay_instructions returns 0-2 instructions:
#    RepayInterest (if interest > 0), then Repay (if principal > 0)
repay_ixs = create_waterfall_repay_instructions(
    accounts={
        "market": pdas.market.address,
        "payer": borrower.pubkey(),
        "payer_token_account": borrower_token_account,
        "vault": pdas.vault.address,
        "protocol_config": protocol_config,
        "mint": usdc_mint,
        "borrower_whitelist": borrower_whitelist,
        "token_program": SPL_TOKEN_PROGRAM_ID,
    },
    args={
        "total_amount": 52_000_000_000,   # 52K USDC total
        "interest_amount": 2_000_000_000,  # 2K USDC interest portion
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer(repay_ixs, borrower.pubkey(), [borrower], blockhash)
await client.send_transaction(tx)

# 4. Market matures + settlement grace period elapses → anyone calls ReSettle
resettle_ix = create_re_settle_instruction(
    accounts={
        "market": pdas.market.address,
        "vault": pdas.vault.address,
        "protocol_config": protocol_config,
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([resettle_ix], lender.pubkey(), [lender], blockhash)
await client.send_transaction(tx)

# 5. Fee authority collects protocol fees
collect_fees_ix = create_collect_fees_instruction(
    accounts={
        "market": pdas.market.address,
        "protocol_config": protocol_config,
        "fee_authority": fee_authority.pubkey(),
        "fee_token_account": fee_token_account,
        "vault": pdas.vault.address,
        "market_authority": pdas.market_authority.address,
        "token_program": SPL_TOKEN_PROGRAM_ID,
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([collect_fees_ix], fee_authority.pubkey(), [fee_authority], blockhash)
await client.send_transaction(tx)

# 6. Lender withdraws with slippage protection
withdraw_ix = create_withdraw_instruction(
    accounts={
        "market": pdas.market.address,
        "lender": lender.pubkey(),
        "lender_token_account": lender_token_account,
        "vault": pdas.vault.address,
        "lender_position": lender_position,
        "market_authority": pdas.market_authority.address,
        "blacklist_check": lender_blacklist,
        "protocol_config": protocol_config,
        "token_program": SPL_TOKEN_PROGRAM_ID,
    },
    args={
        "scaled_amount": 0,              # 0 = full withdrawal
        "min_payout": 99_000_000_000,    # slippage protection: expect at least 99K USDC
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([withdraw_ix], lender.pubkey(), [lender], blockhash)
await client.send_transaction(tx)

# 7. Lender closes empty position (reclaims rent)
close_ix = create_close_lender_position_instruction(
    accounts={
        "market": pdas.market.address,
        "lender": lender.pubkey(),
        "lender_position": lender_position,
        "system_program": SYSTEM_PROGRAM_ID,
        "protocol_config": protocol_config,
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([close_ix], lender.pubkey(), [lender], blockhash)
await client.send_transaction(tx)

# 8. Borrower withdraws excess funds from vault
withdraw_excess_ix = create_withdraw_excess_instruction(
    accounts={
        "market": pdas.market.address,
        "borrower": borrower.pubkey(),
        "borrower_token_account": borrower_token_account,
        "vault": pdas.vault.address,
        "market_authority": pdas.market_authority.address,
        "token_program": SPL_TOKEN_PROGRAM_ID,
        "protocol_config": protocol_config,
    },
)

blockhash = (await client.get_latest_blockhash()).value.blockhash
tx = Transaction.new_signed_with_payer([withdraw_excess_ix], borrower.pubkey(), [borrower], blockhash)
await client.send_transaction(tx)
```

## Reading On-Chain State

```python
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

from coalescefi_sdk import (
    fetch_market,
    fetch_lender_position,
    fetch_borrower_whitelist,
    find_market_pda,
    find_lender_position_pda,
    find_borrower_whitelist_pda,
)

client = AsyncClient("https://api.mainnet-beta.solana.com")

# Fetch and decode a market account
market_address, _ = find_market_pda(borrower, 0)
market = await fetch_market(client, market_address)
if market:
    print("Total deposited:", market.total_deposited)
    print("Total borrowed:", market.total_borrowed)
    print("Scale factor:", market.scale_factor)
    print("Maturity:", market.maturity_timestamp)
    print("Settlement factor:", market.settlement_factor_wad)

# Fetch a lender position
position_address, _ = find_lender_position_pda(market_address, lender)
position = await fetch_lender_position(client, position_address)
if position:
    print("Scaled balance:", position.scaled_balance)

# Fetch whitelist status
whitelist_address, _ = find_borrower_whitelist_pda(borrower)
whitelist = await fetch_borrower_whitelist(client, whitelist_address)
if whitelist:
    print("Whitelisted:", whitelist.is_whitelisted)
    print("Max borrow capacity:", whitelist.max_borrow_capacity)
    print("Current borrowed:", whitelist.current_borrowed)
```

Fetch functions accept an optional `RetryConfig` for transient network errors:

```python
from coalescefi_sdk import RetryConfig

market = await fetch_market(client, address, retry_config=RetryConfig(
    max_retries=5,
    base_delay_ms=500,
    max_delay_ms=15000,
))
```

## Error Handling

```python
from coalescefi_sdk import (
    parse_coalescefi_error,
    is_retryable_error,
    get_error_recovery_action,
    get_error_category,
    get_error_severity,
)

try:
    await client.send_transaction(tx)
except Exception as err:
    if is_retryable_error(err):
        # Network / transient error — safe to retry
        return

    program_error = parse_coalescefi_error(err)
    if program_error:
        print(f"Error {program_error.code}: {program_error.message}")
        print("Category:", get_error_category(program_error.code))
        print("Severity:", get_error_severity(program_error.code))

        recovery = get_error_recovery_action(program_error.code)
        if recovery:
            print("Recovery action:", recovery)
```

## PDA Reference

| PDA                | Seeds                              | Function                                                |
| ------------------ | ---------------------------------- | ------------------------------------------------------- |
| Protocol Config    | `["protocol_config"]`              | `find_protocol_config_pda(program_id?)`                 |
| Market             | `["market", borrower, nonce]`      | `find_market_pda(borrower, market_nonce, program_id?)`  |
| Market Authority   | `["market_authority", market]`     | `find_market_authority_pda(market, program_id?)`        |
| Vault              | `["vault", market]`                | `find_vault_pda(market, program_id?)`                   |
| Lender Position    | `["lender", market, lender]`       | `find_lender_position_pda(market, lender, program_id?)` |
| Borrower Whitelist | `["borrower_whitelist", borrower]` | `find_borrower_whitelist_pda(borrower, program_id?)`    |
| Blacklist Check    | `["blacklist", address]`           | `find_blacklist_check_pda(address, blacklist_program)`  |

All PDA functions return `tuple[Pubkey, int]`. Use `derive_market_pdas(borrower, market_nonce, program_id?)` to derive market, authority, and vault PDAs in one call, returning a `MarketPdas` dataclass.

## Instruction Reference

### Protocol Administration

| Instruction         | Builder                                    | Args               |
| ------------------- | ------------------------------------------ | ------------------ |
| InitializeProtocol  | `create_initialize_protocol_instruction`   | `{"fee_rate_bps"}` |
| SetFeeConfig        | `create_set_fee_config_instruction`        | `{"fee_rate_bps"}` |
| SetAdmin            | `create_set_admin_instruction`             | —                  |
| SetWhitelistManager | `create_set_whitelist_manager_instruction` | —                  |
| SetPause            | `create_set_pause_instruction`             | `{"paused"}`       |
| SetBlacklistMode    | `create_set_blacklist_mode_instruction`    | `{"fail_closed"}`  |

### Borrower Access

| Instruction          | Builder                                     | Args                                        |
| -------------------- | ------------------------------------------- | ------------------------------------------- |
| SetBorrowerWhitelist | `create_set_borrower_whitelist_instruction` | `{"is_whitelisted", "max_borrow_capacity"}` |

### Market Lifecycle

| Instruction         | Builder                                    | Args                                                                                |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| CreateMarket        | `create_create_market_instruction`         | `{"market_nonce", "annual_interest_bps", "maturity_timestamp", "max_total_supply"}` |
| Deposit             | `create_deposit_instruction`               | `{"amount"}`                                                                        |
| Borrow              | `create_borrow_instruction`                | `{"amount"}`                                                                        |
| RepayInterest       | `create_repay_interest_instruction`        | `{"amount"}`                                                                        |
| Repay               | `create_repay_instruction`                 | `{"amount"}`                                                                        |
| Withdraw            | `create_withdraw_instruction`              | `{"scaled_amount", "min_payout"?}`                                                  |
| ReSettle            | `create_re_settle_instruction`             | — (permissionless)                                                                  |
| CollectFees         | `create_collect_fees_instruction`          | —                                                                                   |
| CloseLenderPosition | `create_close_lender_position_instruction` | —                                                                                   |
| WithdrawExcess      | `create_withdraw_excess_instruction`       | —                                                                                   |

### Helpers

| Helper          | Function                              | Description                              |
| --------------- | ------------------------------------- | ---------------------------------------- |
| Waterfall Repay | `create_waterfall_repay_instructions` | Interest-first, then principal repayment |

---

For full documentation, visit [coalescefi.com/en/docs](https://www.coalescefi.com/en/docs).

License: [Apache-2.0](./LICENSE)
