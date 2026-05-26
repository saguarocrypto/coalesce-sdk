# Changelog

All notable changes to `@coalescefi/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CoalesceClient.withdrawByUsdc(lender, market, usdcBaseUnits, overrides?)` — convenience method that takes a USDC amount, converts to scaled shares via the market's `scale_factor`, fetches the lender's `LenderPosition`, and clamps to the on-chain `scaled_balance` to absorb the 1-unit overshoot at the upper boundary.
- README: new "Amounts and Units" section explaining that `scaled_amount` is a u128 share quantity (not a token amount), with a recommended-paths table.

### Changed

- `CoalesceClient.withdraw` and `createWithdrawInstruction` now document the `scaledAmount = 0n` sentinel for full withdrawals and direct callers to `calculateScaledAmount` / `withdrawByUsdc` instead of hand-rolling unit conversions.

### Fixed

- `withdrawByUsdc` rejects `usdcBaseUnits` values that floor-convert to 0 scaled shares (e.g. 1 base unit when `scale_factor >= WAD`). Without the guard the resulting `scaled_amount = 0n` would collide with the full-withdrawal sentinel and drain the entire position.

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
