# Changelog

All notable changes to `coalescefi-sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-27

### Added

- Instruction builders for all 17 protocol instructions.
- `create_waterfall_repay_instructions` composite helper for interest-first repayment.
- PDA derivation helpers for all 7 account types plus `derive_market_pdas` batch helper.
- Frozen dataclass account types (`Market`, `LenderPosition`, `BorrowerWhitelist`, `ProtocolConfig`).
- Async account fetchers (`fetch_market`, `fetch_lender_position`, etc.) with configurable retry via `RetryConfig`.
- SDK configuration via `configure_sdk` with explicit program ID, network name, or environment variable resolution.
- Error parsing with 43 error codes, categories, severity levels, and recovery actions.
- Idempotency utilities (`IdempotencyManager`).
- Input validation helpers (`validate_u64`, `validate_basis_points`, `validate_timestamp`, etc.).
- PEP 561 `py.typed` marker for type checker support.
