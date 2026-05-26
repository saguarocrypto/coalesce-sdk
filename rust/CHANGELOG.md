# Changelog

All notable changes to `coalescefi-sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CoalesceClient::withdraw_by_usdc(lender, market_pda, usdc_base_units, min_payout, override?)` — convenience method that takes a USDC amount, converts to scaled shares via the market's `scale_factor`, fetches the lender's `LenderPosition`, and clamps to the on-chain `scaled_balance` to absorb the 1-unit overshoot at the upper boundary.
- README: new "Amounts and Units" section explaining that `scaled_amount` is a u128 share quantity (not a token amount), with a recommended-paths table.

### Changed

- `CoalesceClient::withdraw` docstring expanded to document the `scaled_amount = 0` sentinel for full withdrawals and direct callers to `calculate_scaled_amount` / `withdraw_by_usdc` instead of hand-rolling unit conversions.

### Fixed

- `withdraw_by_usdc` rejects `usdc_base_units` values that floor-convert to 0 scaled shares (e.g. 1 base unit when `scale_factor >= WAD`). Without the guard the resulting `scaled_amount = 0` would collide with the full-withdrawal sentinel and drain the entire position.
- `withdraw_by_usdc` now uses `try_fetch_lender_position` so a missing position surfaces as a descriptive `Validation` error instead of the opaque `CoalescefiError::InvalidAddress` returned when an account is absent on-chain.

## [0.1.0] - 2026-02-27

### Added

- Instruction builders for all 17 protocol instructions.
- `create_waterfall_repay_instructions` composite helper for interest-first repayment.
- PDA derivation helpers for all 7 account types plus `derive_market_pdas` batch helper.
- Zero-copy account types (`Market`, `LenderPosition`, `BorrowerWhitelist`, `ProtocolConfig`) with bytemuck `Pod` deserialization and accessor methods.
- Account fetchers (`fetch_market`, `fetch_lender_position`, etc.) with `try_fetch_*` variants (requires `std` feature).
- `std` (default) and `no-std` feature flags for off-chain and CPI use respectively.
- `mainnet_program_id()`, `devnet_program_id()`, `localnet_program_id()` helpers.
- Error type with 43 error codes, categories, severity levels, and recovery actions.
- `parse_error_code` for extracting program errors from Solana transaction messages.
