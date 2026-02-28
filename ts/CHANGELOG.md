# Changelog

All notable changes to `@coalescefi/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-27

### Added

- Instruction builders for all 17 protocol instructions.
- `createWaterfallRepayInstructions` composite helper for interest-first repayment.
- PDA derivation helpers for all 7 account types plus `deriveMarketPdas` batch helper.
- Account decoders and async fetchers (`fetchMarket`, `fetchLenderPosition`, `fetchBorrowerWhitelist`, `fetchProtocolConfig`) with configurable retry.
- SDK configuration via `configureSdk` with explicit program ID, network name, or environment variable resolution.
- Error parsing with 43 error codes, categories, severity levels, and recovery actions.
- Idempotency utilities (`IdempotencyManager`, `withIdempotency`).
- Solana Kit 2.0 compatibility layer (`publicKeyToAddress`, `addressToPublicKey`).
- Input validation helpers (`validateU64`, `validateBasisPoints`, `validateTimestamp`, etc.).
