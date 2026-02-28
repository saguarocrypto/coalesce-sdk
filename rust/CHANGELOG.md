# Changelog

All notable changes to `coalescefi-sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
