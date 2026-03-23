# coalescefi-sdk

Rust SDK for the [CoalesceFi](https://www.coalescefi.com/en/docs) on-chain lending protocol on Solana.

## Installation

```bash
cargo add coalescefi-sdk
```

### Features

- **`std`** (default) — Includes RPC client helpers via `solana-client` for fetching and decoding accounts.
- **`no-std`** — Minimal build for CPI / on-chain use. Provides instruction builders, PDA derivation, and account types without std dependencies.

`std` and `no-std` are mutually exclusive. To use `no-std`:

```toml
[dependencies]
coalescefi-sdk = { version = "0.1", default-features = false, features = ["no-std"] }
```

## Configuration

```rust
use coalescefi_sdk::mainnet_program_id;

// Use the mainnet program ID
let program_id = mainnet_program_id();

// Or parse from a string / env var
let program_id: Pubkey = "GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR"
    .parse()
    .unwrap();
```

Available helpers: `mainnet_program_id()`, `devnet_program_id()`, `localnet_program_id()`.

## Full Example: Create a Lending Market

Admin initializes the protocol, whitelists a borrower, and the borrower creates a market.

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::Transaction,
};
use spl_token;
use coalescefi_sdk::prelude::*;

let client = RpcClient::new_with_commitment(
    "https://api.mainnet-beta.solana.com",
    CommitmentConfig::confirmed(),
);
let program_id = mainnet_program_id();

let admin = Keypair::new();
let fee_authority = Keypair::new();
let whitelist_manager = Keypair::new();
let borrower = Keypair::new();
let blacklist_program: Pubkey = "...".parse().unwrap();

// 1. Derive protocol config PDA
let protocol_config = find_protocol_config_pda(&program_id);
let program_data = find_program_data_pda(&program_id);

// 2. Initialize protocol (one-time, admin only)
let init_ix = create_initialize_protocol_instruction(
    InitializeProtocolAccounts {
        protocol_config: protocol_config.address,
        admin: admin.pubkey(),
        fee_authority: fee_authority.pubkey(),
        whitelist_manager: whitelist_manager.pubkey(),
        blacklist_program,
        system_program: system_program::id(),
        program_data: program_data.address,
    },
    InitializeProtocolArgs {
        fee_rate_bps: 500, // 5% protocol fee
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(&[init_ix], Some(&admin.pubkey()), &[&admin], blockhash);
client.send_and_confirm_transaction(&tx).unwrap();

// 3. Whitelist a borrower
let borrower_whitelist = find_borrower_whitelist_pda(&borrower.pubkey(), &program_id);

let whitelist_ix = create_set_borrower_whitelist_instruction(
    SetBorrowerWhitelistAccounts {
        borrower_whitelist: borrower_whitelist.address,
        protocol_config: protocol_config.address,
        whitelist_manager: whitelist_manager.pubkey(),
        borrower: borrower.pubkey(),
        system_program: system_program::id(),
    },
    SetBorrowerWhitelistArgs {
        is_whitelisted: true,
        max_borrow_capacity: 1_000_000_000_000, // 1M USDC
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(
    &[whitelist_ix], Some(&whitelist_manager.pubkey()), &[&whitelist_manager], blockhash,
);
client.send_and_confirm_transaction(&tx).unwrap();

// 4. Derive market PDAs
let market_nonce: u64 = 0;
let pdas = derive_market_pdas(&borrower.pubkey(), market_nonce, &program_id);

let usdc_mint: Pubkey = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".parse().unwrap();
let blacklist_check = find_blacklist_check_pda(&borrower.pubkey(), &blacklist_program);

// 5. Create market
let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs() as i64;
let maturity_timestamp = now + 90 * 24 * 60 * 60; // 90 days

let create_market_ix = create_create_market_instruction(
    CreateMarketAccounts {
        market: pdas.market.address,
        borrower: borrower.pubkey(),
        mint: usdc_mint,
        vault: pdas.vault.address,
        market_authority: pdas.market_authority.address,
        protocol_config: protocol_config.address,
        borrower_whitelist: borrower_whitelist.address,
        blacklist_check: blacklist_check.address,
        system_program: system_program::id(),
        token_program: spl_token::id(),
    },
    CreateMarketArgs {
        market_nonce,
        annual_interest_bps: 800,              // 8% annual interest
        maturity_timestamp,
        max_total_supply: 500_000_000_000,     // 500K USDC (6 decimals)
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(
    &[create_market_ix], Some(&borrower.pubkey()), &[&borrower], blockhash,
);
client.send_and_confirm_transaction(&tx).unwrap();
```

## Full Example: Complete Borrow-Lend Lifecycle

End-to-end flow covering deposit, borrow, repay, settlement, withdrawal, and cleanup.

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::Transaction,
};
use spl_associated_token_account::get_associated_token_address;
use spl_token;
use coalescefi_sdk::prelude::*;

let client = RpcClient::new_with_commitment(
    "https://api.mainnet-beta.solana.com",
    CommitmentConfig::confirmed(),
);
let program_id = mainnet_program_id();

let lender = Keypair::new();
let borrower = Keypair::new();
let fee_authority = Keypair::new();
let blacklist_program: Pubkey = "...".parse().unwrap();
let usdc_mint: Pubkey = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".parse().unwrap();

let market_nonce: u64 = 0;
let pdas = derive_market_pdas(&borrower.pubkey(), market_nonce, &program_id);
let protocol_config = find_protocol_config_pda(&program_id);
let lender_position = find_lender_position_pda(
    &pdas.market.address, &lender.pubkey(), &program_id,
);
let borrower_whitelist = find_borrower_whitelist_pda(&borrower.pubkey(), &program_id);
let lender_blacklist = find_blacklist_check_pda(&lender.pubkey(), &blacklist_program);
let borrower_blacklist = find_blacklist_check_pda(&borrower.pubkey(), &blacklist_program);

let lender_token_account = get_associated_token_address(&lender.pubkey(), &usdc_mint);
let borrower_token_account = get_associated_token_address(&borrower.pubkey(), &usdc_mint);
let fee_token_account = get_associated_token_address(&fee_authority.pubkey(), &usdc_mint);

// 1. Lender deposits USDC into market
let deposit_ix = create_deposit_instruction(
    DepositAccounts {
        market: pdas.market.address,
        lender: lender.pubkey(),
        lender_token_account,
        vault: pdas.vault.address,
        lender_position: lender_position.address,
        blacklist_check: lender_blacklist.address,
        protocol_config: protocol_config.address,
        mint: usdc_mint,
        token_program: spl_token::id(),
        system_program: system_program::id(),
    },
    DepositArgs { amount: 100_000_000_000 }, // 100K USDC
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(&[deposit_ix], Some(&lender.pubkey()), &[&lender], blockhash);
client.send_and_confirm_transaction(&tx).unwrap();

// 2. Borrower borrows from vault
let borrow_ix = create_borrow_instruction(
    BorrowAccounts {
        market: pdas.market.address,
        borrower: borrower.pubkey(),
        borrower_token_account,
        vault: pdas.vault.address,
        market_authority: pdas.market_authority.address,
        borrower_whitelist: borrower_whitelist.address,
        blacklist_check: borrower_blacklist.address,
        protocol_config: protocol_config.address,
        token_program: spl_token::id(),
    },
    BorrowArgs { amount: 50_000_000_000 }, // 50K USDC
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(&[borrow_ix], Some(&borrower.pubkey()), &[&borrower], blockhash);
client.send_and_confirm_transaction(&tx).unwrap();

// 3. Borrower repays (interest-first waterfall)
//    create_waterfall_repay_instructions returns 0-2 instructions:
//    RepayInterest (if interest > 0), then Repay (if principal > 0)
let repay_ixs = create_waterfall_repay_instructions(
    WaterfallRepayAccounts {
        market: pdas.market.address,
        payer: borrower.pubkey(),
        payer_token_account: borrower_token_account,
        vault: pdas.vault.address,
        protocol_config: protocol_config.address,
        mint: usdc_mint,
        borrower_whitelist: borrower_whitelist.address,
        token_program: spl_token::id(),
    },
    WaterfallRepayArgs {
        total_amount: 52_000_000_000,   // 52K USDC total
        interest_amount: 2_000_000_000, // 2K USDC interest portion
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(
    &repay_ixs, Some(&borrower.pubkey()), &[&borrower], blockhash,
);
client.send_and_confirm_transaction(&tx).unwrap();

// 4. Market matures + settlement grace period elapses → anyone calls ReSettle
let haircut_state = find_haircut_state_pda(&pdas.market.address, &program_id);

let resettle_ix = create_resettle_instruction(
    ReSettleAccounts {
        market: pdas.market.address,
        vault: pdas.vault.address,
        protocol_config: protocol_config.address,
        haircut_state: haircut_state.address,
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(&[resettle_ix], Some(&lender.pubkey()), &[&lender], blockhash);
client.send_and_confirm_transaction(&tx).unwrap();

// 5. Fee authority collects protocol fees
let collect_fees_ix = create_collect_fees_instruction(
    CollectFeesAccounts {
        market: pdas.market.address,
        protocol_config: protocol_config.address,
        fee_authority: fee_authority.pubkey(),
        fee_token_account,
        vault: pdas.vault.address,
        market_authority: pdas.market_authority.address,
        token_program: spl_token::id(),
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(
    &[collect_fees_ix], Some(&fee_authority.pubkey()), &[&fee_authority], blockhash,
);
client.send_and_confirm_transaction(&tx).unwrap();

// 6. Lender withdraws all + closes position in a single transaction
let withdraw_and_close_ixs = create_withdraw_and_close_instructions(
    WithdrawAndCloseAccounts {
        market: pdas.market.address,
        lender: lender.pubkey(),
        lender_token_account,
        vault: pdas.vault.address,
        lender_position: lender_position.address,
        market_authority: pdas.market_authority.address,
        blacklist_check: lender_blacklist.address,
        protocol_config: protocol_config.address,
        token_program: spl_token::id(),
        haircut_state: haircut_state.address,
        system_program: system_program::id(),
    },
    WithdrawArgs {
        scaled_amount: 0,              // 0 = full withdrawal
        min_payout: 99_000_000_000,    // slippage protection: expect at least 99K USDC
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(
    &withdraw_and_close_ixs, Some(&lender.pubkey()), &[&lender], blockhash,
);
client.send_and_confirm_transaction(&tx).unwrap();

// 7. Borrower withdraws excess funds from vault
let withdraw_excess_ix = create_withdraw_excess_instruction(
    WithdrawExcessAccounts {
        market: pdas.market.address,
        borrower: borrower.pubkey(),
        borrower_token_account,
        vault: pdas.vault.address,
        market_authority: pdas.market_authority.address,
        token_program: spl_token::id(),
        protocol_config: protocol_config.address,
    },
    &program_id,
);

let blockhash = client.get_latest_blockhash().unwrap();
let tx = Transaction::new_signed_with_payer(
    &[withdraw_excess_ix], Some(&borrower.pubkey()), &[&borrower], blockhash,
);
client.send_and_confirm_transaction(&tx).unwrap();
```

## Reading On-Chain State

Requires the `std` feature (enabled by default).

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use coalescefi_sdk::prelude::*;

let client = RpcClient::new("https://api.mainnet-beta.solana.com");
let program_id = mainnet_program_id();

// Fetch and decode a market account
let market_pda = find_market_pda(&borrower, 0, &program_id);
let market = fetch_market(&client, &market_pda.address).unwrap();

println!("Total deposited: {}", market.total_deposited());
println!("Total borrowed: {}", market.total_borrowed());
println!("Scale factor: {}", market.scale_factor());
println!("Maturity: {}", market.maturity_timestamp());
println!("Settled: {}", market.is_settled());

// Fetch a lender position
let position_pda = find_lender_position_pda(&market_pda.address, &lender, &program_id);
let position = fetch_lender_position(&client, &position_pda.address).unwrap();
println!("Scaled balance: {}", position.scaled_balance());
println!("Has balance: {}", position.has_balance());

// Fetch whitelist status
let whitelist_pda = find_borrower_whitelist_pda(&borrower, &program_id);
let whitelist = fetch_borrower_whitelist(&client, &whitelist_pda.address).unwrap();
println!("Whitelisted: {}", whitelist.is_whitelisted());
println!("Max capacity: {}", whitelist.max_borrow_capacity());
println!("Available: {}", whitelist.available_capacity());

// try_fetch variants return Option instead of erroring on missing accounts
let maybe_market = try_fetch_market(&client, &market_pda.address).unwrap();
if let Some(m) = maybe_market {
    println!("Found market: {}", m.borrower_pubkey());
}
```

## Error Handling

```rust
use coalescefi_sdk::prelude::*;

match client.send_and_confirm_transaction(&tx) {
    Ok(sig) => println!("Success: {sig}"),
    Err(err) => {
        let msg = err.to_string();
        if let Some(program_err) = parse_error_code(&msg) {
            println!("Error {}: {}", program_err.code(), program_err.name());
            println!("Category: {:?}", program_err.category());
            println!("Severity: {:?}", program_err.severity());

            if program_err.is_user_recoverable() {
                if let Some(action) = program_err.recovery_action() {
                    println!("Recovery: {action}");
                }
            }
        }
    }
}
```

## PDA Reference

| PDA                | Seeds                              | Function                                               |
| ------------------ | ---------------------------------- | ------------------------------------------------------ |
| Protocol Config    | `["protocol_config"]`              | `find_protocol_config_pda(program_id)`                 |
| Market             | `["market", borrower, nonce]`      | `find_market_pda(borrower, market_nonce, program_id)`  |
| Market Authority   | `["market_authority", market]`     | `find_market_authority_pda(market, program_id)`        |
| Vault              | `["vault", market]`                | `find_vault_pda(market, program_id)`                   |
| Lender Position    | `["lender", market, lender]`       | `find_lender_position_pda(market, lender, program_id)` |
| Borrower Whitelist | `["borrower_whitelist", borrower]` | `find_borrower_whitelist_pda(borrower, program_id)`    |
| Blacklist Check    | `["blacklist", address]`           | `find_blacklist_check_pda(address, blacklist_program)` |
| Haircut State      | `["haircut_state", market]`        | `find_haircut_state_pda(market, program_id)`           |

All PDA functions return `PdaResult { address: Pubkey, bump: u8 }`. Use `derive_market_pdas(borrower, market_nonce, program_id)` to derive market, authority, vault, and haircut state PDAs in one call, returning `MarketPdas`.

## Instruction Reference

### Protocol Administration

| Instruction         | Builder                                    | Args                                      |
| ------------------- | ------------------------------------------ | ----------------------------------------- |
| InitializeProtocol  | `create_initialize_protocol_instruction`   | `InitializeProtocolArgs { fee_rate_bps }` |
| SetFeeConfig        | `create_set_fee_config_instruction`        | `SetFeeConfigArgs { fee_rate_bps }`       |
| SetAdmin            | `create_set_admin_instruction`             | —                                         |
| SetWhitelistManager | `create_set_whitelist_manager_instruction` | —                                         |
| SetPause            | `create_set_pause_instruction`             | `SetPauseArgs { paused }`                 |
| SetBlacklistMode    | `create_set_blacklist_mode_instruction`    | `SetBlacklistModeArgs { fail_closed }`    |

### Borrower Access

| Instruction          | Builder                                     | Args                                                               |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| SetBorrowerWhitelist | `create_set_borrower_whitelist_instruction` | `SetBorrowerWhitelistArgs { is_whitelisted, max_borrow_capacity }` |

### Market Lifecycle

| Instruction         | Builder                                    | Args                                                                                           |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| CreateMarket        | `create_create_market_instruction`         | `CreateMarketArgs { market_nonce, annual_interest_bps, maturity_timestamp, max_total_supply }` |
| Deposit             | `create_deposit_instruction`               | `DepositArgs { amount }`                                                                       |
| Borrow              | `create_borrow_instruction`                | `BorrowArgs { amount }`                                                                        |
| RepayInterest       | `create_repay_interest_instruction`        | `RepayInterestArgs { amount }`                                                                 |
| Repay               | `create_repay_instruction`                 | `RepayArgs { amount }`                                                                         |
| Withdraw            | `create_withdraw_instruction`              | `WithdrawArgs { scaled_amount, min_payout }`                                                   |
| ReSettle            | `create_resettle_instruction`              | — (permissionless)                                                                             |
| CollectFees         | `create_collect_fees_instruction`          | —                                                                                              |
| CloseLenderPosition | `create_close_lender_position_instruction` | —                                                                                              |
| WithdrawExcess      | `create_withdraw_excess_instruction`       | —                                                                                              |

### Post-Maturity / Haircut Recovery

| Instruction        | Builder                                     | Args | Description                                               |
| ------------------ | ------------------------------------------- | ---- | --------------------------------------------------------- |
| ForceClosePosition | `create_force_close_position_instruction`   | —    | Borrower force-closes a lender's position (post-maturity) |
| ClaimHaircut       | `create_claim_haircut_instruction`          | —    | Lender claims haircut recovery tokens                     |
| ForceClaimHaircut  | `create_force_claim_haircut_instruction`    | —    | Borrower force-claims haircut on behalf of a lender       |

### Combined Instruction Builders

These helpers return `Vec<Instruction>` to add to a single transaction,
reducing the number of transactions a user needs to send.

| Helper                | Function                                       | Description                                                |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Waterfall Repay       | `create_waterfall_repay_instructions`          | Interest-first, then principal repayment (0–2 ixs)        |
| Withdraw + Close      | `create_withdraw_and_close_instructions`       | Withdraw all + close position in one tx (2 ixs)           |
| Claim Haircut + Close | `create_claim_haircut_and_close_instructions`  | Claim haircut recovery + close position in one tx (2 ixs) |

---

For full documentation, visit [coalescefi.com/en/docs](https://www.coalescefi.com/en/docs).

License: [Apache-2.0](./LICENSE)
