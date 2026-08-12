# Changelog

All notable changes to `@coalescefi/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `findNextMarketNonce(connection, borrower, programId?, options?)` — finds the borrower's next unused market nonce by probing market PDA occupancy on-chain with batched `getMultipleAccountsInfo` calls (configurable batch size, probe window, and floor). Reads the chain directly so a lagging off-chain data source can never hand back an already-taken nonce.
- `CoalesceClient.findNextMarketNonce(borrower, options?)` — client wrapper for the probe; deliberately bypasses the client's account cache.
- `CoalesceClient.createMarketWithFreshNonce(borrower, mint, args, send, options?)` — derives a fresh nonce, builds the create-market instructions, and sends them via the caller's `send` callback, retrying exactly once if the chain reports the nonce was claimed concurrently (`MarketAlreadyExists`). Attributes the failing program from transaction logs before retrying so a foreign program's error code never burns the retry.
- `findFailedProgramIds(error)` — extracts the base58 ids of every program the runtime blamed for a failure from any `logs` array reachable in the error graph.
- Automatic destination-ATA self-healing: `borrow`, `withdraw`, `claimHaircut`, `withdrawExcess`, and `collectFees` now prepend an idempotent create-ATA instruction whenever the destination is the recipient's canonical associated token account, so a missing ATA no longer fails the transfer.
- Rate-model helpers: `lenderAprPercent`, `protocolFeePercent`, `borrowerAllInPercent`, `allInToStoredBps`, `borrowerTotalCostPercent`, `isTransformedRateModel`, `transformedRemainingInterest`, plus the `LEGACY_MARKET_ADDRESSES` set and `RATE_MODEL_TRANSFORM_CUTOVER_ISO` reference constant. Lenders realize the full gross `annualInterestBps`; the protocol fee is a separate, junior accrual charged on top.
- `CoalesceClient.withdrawByUsdc(lender, market, usdcBaseUnits, overrides?)` — convenience method that takes a USDC amount, converts to scaled shares via the market's `scale_factor`, fetches the lender's `LenderPosition`, and clamps to the on-chain `scaled_balance` to absorb the 1-unit overshoot at the upper boundary.
- README: new "Amounts and Units" section explaining that `scaled_amount` is a u128 share quantity (not a token amount), with a recommended-paths table.

### Changed

- `collectFees` now derives the fee authority's associated token account with `allowOwnerOffCurve`, so off-curve fee authorities (e.g. Squads vaults) resolve — and self-heal — their canonical ATA instead of throwing.
- Error parsing hardened: recognises JSON-stringified `"Custom": N` transaction errors, decoded `Program error: {CodeName}` messages (recovered via the error-code enum's reverse mapping), and wallet-connector wrappers that stash the wrapped error under `originalError` without populating `cause`. Traversal of nested error graphs is now cycle-safe and work-budgeted.
- Log-based error-code extraction only parses `0x`-prefixed captures as hex; all other patterns are read as decimal (previously `Custom(12)` could be misread as `0x12`).
- `CoalesceClient.withdraw` and `createWithdrawInstruction` now document the `scaledAmount = 0n` sentinel for full withdrawals and direct callers to `calculateScaledAmount` / `withdrawByUsdc` instead of hand-rolling unit conversions.
- Dev dependency: vitest upgraded from v1 to v4.

### Removed

- `calculateNetAPR` — a `gross × (1 − fee)` figure does not represent lender yield (lenders realize the full gross rate; the protocol fee accrues on top) and must not be displayed as the lender's APR. Use `lenderAprPercent` / `borrowerAllInPercent` instead.

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
