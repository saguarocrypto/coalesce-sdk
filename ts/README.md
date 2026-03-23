# @coalescefi/sdk

TypeScript SDK for the [CoalesceFi](https://www.coalescefi.com/en/docs) on-chain lending protocol on Solana.

## Installation

```bash
pnpm add @coalescefi/sdk
```

## Quick Start — CoalesceClient

The high-level `CoalesceClient` handles PDA derivation, account resolution, and caching automatically. Every method returns `TransactionInstruction[]` — you control how to sign and send.

```ts
import { CoalesceClient } from '@coalescefi/sdk';
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const client = CoalesceClient.mainnet(connection);

// Lender deposits (position auto-created on first deposit)
const depositIxs = await client.deposit(lender.publicKey, marketPda, 100_000_000_000n);
await sendAndConfirmTransaction(connection, new Transaction().add(...depositIxs), [lender]);

// Borrower repays interest + principal in one transaction
const repayIxs = await client.repay(borrower.publicKey, marketPda, 52_000_000_000n, 2_000_000_000n);
await sendAndConfirmTransaction(connection, new Transaction().add(...repayIxs), [borrower]);

// Lender withdraws all + closes position in one transaction
const exitIxs = await client.withdrawAndClose(lender.publicKey, marketPda);
await sendAndConfirmTransaction(connection, new Transaction().add(...exitIxs), [lender]);

// Or use the convenience helper for scripts/tests:
const sig = await client.sendAndConfirm(
  await client.deposit(lender.publicKey, marketPda, 50_000_000_000n),
  [lender]
);

// Market discovery (helper — use indexer/API for production)
const markets = await client.scanMarkets(borrowerPubkey);
const marketPda = client.getMarketAddress(borrowerPubkey, 0n);
```

Override token accounts for multisig, custody, or non-ATA setups:

```ts
const ixs = await client.deposit(vaultPda, marketPda, amount, {
  lenderTokenAccount: squadsVaultAta,  // override default ATA derivation
});
```

See `ts/examples/integration.ts` for the complete copy-paste reference with every operation.

---

## Advanced: Low-Level Configuration

For direct instruction building without `CoalesceClient`:

```ts
import { configureSdk, getProgramId } from '@coalescefi/sdk';

// Option 1: Explicit program ID
import { PublicKey } from '@solana/web3.js';
configureSdk({ programId: new PublicKey('GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR') });

// Option 2: By network name
configureSdk({ network: 'mainnet' });

// Option 3: Environment variable
//   COALESCEFI_PROGRAM_ID=GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR
//   COALESCEFI_NETWORK=mainnet

// Retrieve the resolved program ID
const programId = getProgramId();
```

Resolution priority: explicit `programId` > `COALESCEFI_PROGRAM_ID` env var > `network` config > `COALESCEFI_NETWORK` env var > localnet default.

## Full Example: Create a Lending Market

Admin initializes the protocol, whitelists a borrower, and the borrower creates a market.

```ts
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  configureSdk,
  findProtocolConfigPda,
  findProgramDataPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  deriveMarketPdas,
  createInitializeProtocolInstruction,
  createSetBorrowerWhitelistInstruction,
  createCreateMarketInstruction,
} from '@coalescefi/sdk';

configureSdk({ network: 'mainnet' });
const connection = new Connection('https://api.mainnet-beta.solana.com');

const admin = Keypair.generate(); // protocol admin (upgrade authority)
const feeAuthority = Keypair.generate(); // collects protocol fees
const whitelistManager = Keypair.generate();
const borrower = Keypair.generate();
const blacklistProgram = new PublicKey('...');

// 1. Derive protocol config PDA
const [protocolConfig] = findProtocolConfigPda();
const [programData] = findProgramDataPda();

// 2. Initialize protocol (one-time, admin only)
const initIx = createInitializeProtocolInstruction(
  {
    protocolConfig,
    admin: admin.publicKey,
    feeAuthority: feeAuthority.publicKey,
    whitelistManager: whitelistManager.publicKey,
    blacklistProgram,
    systemProgram: SystemProgram.programId,
    programData,
  },
  { feeRateBps: 500 } // 5% protocol fee
);

await sendAndConfirmTransaction(connection, new Transaction().add(initIx), [admin]);

// 3. Whitelist a borrower
const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower.publicKey);

const whitelistIx = createSetBorrowerWhitelistInstruction(
  {
    borrowerWhitelist,
    protocolConfig,
    whitelistManager: whitelistManager.publicKey,
    borrower: borrower.publicKey,
    systemProgram: SystemProgram.programId,
  },
  { isWhitelisted: true, maxBorrowCapacity: 1_000_000_000_000n } // 1M USDC
);

await sendAndConfirmTransaction(connection, new Transaction().add(whitelistIx), [whitelistManager]);

// 4. Derive market PDAs
const marketNonce = 0n;
const { market, marketAuthority, vault } = deriveMarketPdas(borrower.publicKey, marketNonce);

const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const [blacklistCheck] = findBlacklistCheckPda(borrower.publicKey, blacklistProgram);

// 5. Create market
const maturity = BigInt(Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60); // 90 days

const createMarketIx = createCreateMarketInstruction(
  {
    market: market.address,
    borrower: borrower.publicKey,
    mint: usdcMint,
    vault: vault.address,
    marketAuthority: marketAuthority.address,
    protocolConfig,
    borrowerWhitelist,
    blacklistCheck,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  },
  {
    marketNonce,
    annualInterestBps: 800, // 8% annual interest
    maturityTimestamp: maturity,
    maxTotalSupply: 500_000_000_000n, // 500K USDC (6 decimals)
  }
);

await sendAndConfirmTransaction(connection, new Transaction().add(createMarketIx), [borrower]);
```

## Full Example: Complete Borrow-Lend Lifecycle

End-to-end flow covering deposit, borrow, repay, settlement, withdrawal, and cleanup.

```ts
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  configureSdk,
  findProtocolConfigPda,
  findLenderPositionPda,
  findBorrowerWhitelistPda,
  findBlacklistCheckPda,
  deriveMarketPdas,
  createDepositInstruction,
  createBorrowInstruction,
  createWaterfallRepayInstructions,
  createReSettleInstruction,
  createCollectFeesInstruction,
  createWithdrawAndCloseInstructions,
  createWithdrawExcessInstruction,
  findHaircutStatePda,
  fetchMarket,
  SYSTEM_PROGRAM_ID,
} from '@coalescefi/sdk';

configureSdk({ network: 'mainnet' });
const connection = new Connection('https://api.mainnet-beta.solana.com');

const lender = Keypair.generate();
const borrower = Keypair.generate();
const feeAuthority = Keypair.generate();
const blacklistProgram = new PublicKey('...');
const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const marketNonce = 0n;
const { market, marketAuthority, vault } = deriveMarketPdas(borrower.publicKey, marketNonce);
const [protocolConfig] = findProtocolConfigPda();
const [lenderPosition] = findLenderPositionPda(market.address, lender.publicKey);
const [borrowerWhitelist] = findBorrowerWhitelistPda(borrower.publicKey);
const [lenderBlacklistCheck] = findBlacklistCheckPda(lender.publicKey, blacklistProgram);
const [borrowerBlacklistCheck] = findBlacklistCheckPda(borrower.publicKey, blacklistProgram);

const lenderTokenAccount = await getAssociatedTokenAddress(usdcMint, lender.publicKey);
const borrowerTokenAccount = await getAssociatedTokenAddress(usdcMint, borrower.publicKey);
const feeTokenAccount = await getAssociatedTokenAddress(usdcMint, feeAuthority.publicKey);

// 1. Lender deposits USDC into market
const depositIx = createDepositInstruction(
  {
    market: market.address,
    lender: lender.publicKey,
    lenderTokenAccount,
    vault: vault.address,
    lenderPosition,
    blacklistCheck: lenderBlacklistCheck,
    protocolConfig,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  },
  { amount: 100_000_000_000n } // 100K USDC
);

await sendAndConfirmTransaction(connection, new Transaction().add(depositIx), [lender]);

// 2. Borrower borrows from vault
const borrowIx = createBorrowInstruction(
  {
    market: market.address,
    borrower: borrower.publicKey,
    borrowerTokenAccount,
    vault: vault.address,
    marketAuthority: marketAuthority.address,
    borrowerWhitelist,
    blacklistCheck: borrowerBlacklistCheck,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
  },
  { amount: 50_000_000_000n } // 50K USDC
);

await sendAndConfirmTransaction(connection, new Transaction().add(borrowIx), [borrower]);

// 3. Borrower repays (interest-first waterfall)
//    createWaterfallRepayInstructions returns 0-2 instructions:
//    RepayInterest (if interest > 0), then Repay (if principal > 0)
const repayIxs = createWaterfallRepayInstructions(
  {
    market: market.address,
    payer: borrower.publicKey,
    payerTokenAccount: borrowerTokenAccount,
    vault: vault.address,
    protocolConfig,
    mint: usdcMint,
    borrowerWhitelist,
    tokenProgram: TOKEN_PROGRAM_ID,
  },
  {
    totalAmount: 52_000_000_000n, // 52K USDC total
    interestAmount: 2_000_000_000n, // 2K USDC interest portion
  }
);

await sendAndConfirmTransaction(connection, new Transaction().add(...repayIxs), [borrower]);

// 4. Market matures + settlement grace period elapses → anyone calls ReSettle
const [haircutState] = findHaircutStatePda(market.address);

const resettleIx = createReSettleInstruction({
  market: market.address,
  vault: vault.address,
  protocolConfig,
  haircutState,
});

await sendAndConfirmTransaction(connection, new Transaction().add(resettleIx), [lender]);

// 5. Fee authority collects protocol fees
const collectFeesIx = createCollectFeesInstruction({
  market: market.address,
  protocolConfig,
  feeAuthority: feeAuthority.publicKey,
  feeTokenAccount,
  vault: vault.address,
  marketAuthority: marketAuthority.address,
  tokenProgram: TOKEN_PROGRAM_ID,
});

await sendAndConfirmTransaction(connection, new Transaction().add(collectFeesIx), [feeAuthority]);

// 6. Lender withdraws all + closes position in a single transaction
const withdrawAndCloseIxs = createWithdrawAndCloseInstructions(
  {
    market: market.address,
    lender: lender.publicKey,
    lenderTokenAccount,
    vault: vault.address,
    lenderPosition,
    marketAuthority: marketAuthority.address,
    blacklistCheck: lenderBlacklistCheck,
    protocolConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
    haircutState,
    systemProgram: SYSTEM_PROGRAM_ID,
  },
  {
    scaledAmount: 0n, // 0 = full withdrawal
    minPayout: 99_000_000_000n, // slippage protection: expect at least 99K USDC
  }
);

await sendAndConfirmTransaction(
  connection,
  new Transaction().add(...withdrawAndCloseIxs),
  [lender]
);

// 7. Borrower withdraws excess funds from vault
const withdrawExcessIx = createWithdrawExcessInstruction({
  market: market.address,
  borrower: borrower.publicKey,
  borrowerTokenAccount,
  vault: vault.address,
  marketAuthority: marketAuthority.address,
  tokenProgram: TOKEN_PROGRAM_ID,
  protocolConfig,
});

await sendAndConfirmTransaction(connection, new Transaction().add(withdrawExcessIx), [borrower]);
```

## Reading On-Chain State

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import {
  fetchMarket,
  fetchLenderPosition,
  fetchBorrowerWhitelist,
  findMarketPda,
  findLenderPositionPda,
  findBorrowerWhitelistPda,
} from '@coalescefi/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// Fetch and decode a market account
const [marketAddress] = findMarketPda(borrower, 0n);
const market = await fetchMarket(connection, marketAddress);
if (market) {
  console.log('Total deposited:', market.totalDeposited);
  console.log('Total borrowed:', market.totalBorrowed);
  console.log('Scale factor:', market.scaleFactor);
  console.log('Maturity:', new Date(Number(market.maturityTimestamp) * 1000));
  console.log('Settlement factor:', market.settlementFactorWad);
}

// Fetch a lender position
const [positionAddress] = findLenderPositionPda(marketAddress, lender);
const position = await fetchLenderPosition(connection, positionAddress);
if (position) {
  console.log('Scaled balance:', position.scaledBalance);
}

// Fetch whitelist status
const [whitelistAddress] = findBorrowerWhitelistPda(borrower);
const whitelist = await fetchBorrowerWhitelist(connection, whitelistAddress);
if (whitelist) {
  console.log('Whitelisted:', whitelist.isWhitelisted);
  console.log('Max borrow capacity:', whitelist.maxBorrowCapacity);
  console.log('Current borrowed:', whitelist.currentBorrowed);
}
```

Fetch functions accept an optional `RetryConfig` for transient network errors:

```ts
const market = await fetchMarket(connection, address, {
  maxRetries: 5,
  baseDelayMs: 500,
  maxDelayMs: 15000,
});
```

## Error Handling

```ts
import {
  parseCoalescefiError,
  isCoalescefiError,
  isRetryableError,
  getErrorRecoveryAction,
  getErrorCategory,
  getErrorSeverity,
  CoalescefiErrorCode,
} from '@coalescefi/sdk';

try {
  await sendAndConfirmTransaction(connection, tx, [signer]);
} catch (err) {
  if (isRetryableError(err)) {
    // Network / transient error — safe to retry
    return;
  }

  const programError = parseCoalescefiError(err);
  if (programError) {
    console.error(`Error ${programError.code}: ${programError.message}`);
    console.error('Category:', getErrorCategory(programError.code));
    console.error('Severity:', getErrorSeverity(programError.code));

    const recovery = getErrorRecoveryAction(programError.code);
    if (recovery) {
      console.log('Recovery action:', recovery);
    }
  }
}
```

## PDA Reference

| PDA                | Seeds                              | Function                                            |
| ------------------ | ---------------------------------- | --------------------------------------------------- |
| Protocol Config    | `["protocol_config"]`              | `findProtocolConfigPda(programId?)`                 |
| Market             | `["market", borrower, nonce]`      | `findMarketPda(borrower, marketNonce, programId?)`  |
| Market Authority   | `["market_authority", market]`     | `findMarketAuthorityPda(market, programId?)`        |
| Vault              | `["vault", market]`                | `findVaultPda(market, programId?)`                  |
| Lender Position    | `["lender", market, lender]`       | `findLenderPositionPda(market, lender, programId?)` |
| Borrower Whitelist | `["borrower_whitelist", borrower]` | `findBorrowerWhitelistPda(borrower, programId?)`    |
| Blacklist Check    | `["blacklist", address]`           | `findBlacklistCheckPda(address, blacklistProgram)`  |
| Haircut State      | `["haircut_state", market]`        | `findHaircutStatePda(market, programId?)`           |

All PDA functions return `[PublicKey, number]`. Use `deriveMarketPdas(borrower, marketNonce, programId?)` to derive market, authority, vault, and haircut state PDAs in one call.

## Instruction Reference

### Protocol Administration

| Instruction         | Builder                                | Args             |
| ------------------- | -------------------------------------- | ---------------- |
| InitializeProtocol  | `createInitializeProtocolInstruction`  | `{ feeRateBps }` |
| SetFeeConfig        | `createSetFeeConfigInstruction`        | `{ feeRateBps }` |
| SetAdmin            | `createSetAdminInstruction`            | —                |
| SetWhitelistManager | `createSetWhitelistManagerInstruction` | —                |
| SetPause            | `createSetPauseInstruction`            | `{ paused }`     |
| SetBlacklistMode    | `createSetBlacklistModeInstruction`    | `{ failClosed }` |

### Borrower Access

| Instruction          | Builder                                 | Args                                   |
| -------------------- | --------------------------------------- | -------------------------------------- |
| SetBorrowerWhitelist | `createSetBorrowerWhitelistInstruction` | `{ isWhitelisted, maxBorrowCapacity }` |

### Market Lifecycle

| Instruction         | Builder                                | Args                                                                    |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| CreateMarket        | `createCreateMarketInstruction`        | `{ marketNonce, annualInterestBps, maturityTimestamp, maxTotalSupply }` |
| Deposit             | `createDepositInstruction`             | `{ amount }`                                                            |
| Borrow              | `createBorrowInstruction`              | `{ amount }`                                                            |
| RepayInterest       | `createRepayInterestInstruction`       | `{ amount }`                                                            |
| Repay               | `createRepayInstruction`               | `{ amount }`                                                            |
| Withdraw            | `createWithdrawInstruction`            | `{ scaledAmount, minPayout? }`                                          |
| ReSettle            | `createReSettleInstruction`            | — (permissionless)                                                      |
| CollectFees         | `createCollectFeesInstruction`         | —                                                                       |
| CloseLenderPosition | `createCloseLenderPositionInstruction`  | —                                                                       |
| WithdrawExcess      | `createWithdrawExcessInstruction`       | —                                                                       |

### Post-Maturity / Haircut Recovery

| Instruction       | Builder                                  | Args | Description                                          |
| ----------------- | ---------------------------------------- | ---- | ---------------------------------------------------- |
| ForceClosePosition | `createForceClosePositionInstruction`   | —    | Borrower force-closes a lender's position (post-maturity) |
| ClaimHaircut       | `createClaimHaircutInstruction`         | —    | Lender claims haircut recovery tokens                |
| ForceClaimHaircut  | `createForceClaimHaircutInstruction`    | —    | Borrower force-claims haircut on behalf of a lender  |

### Combined Instruction Builders

These helpers return arrays of instructions to add to a single transaction,
reducing the number of transactions a user needs to send.

| Helper                   | Function                                    | Description                                              |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| Waterfall Repay          | `createWaterfallRepayInstructions`          | Interest-first, then principal repayment (0–2 ixs)      |
| Withdraw + Close         | `createWithdrawAndCloseInstructions`        | Withdraw all + close position in one tx (2 ixs)         |
| Claim Haircut + Close    | `createClaimHaircutAndCloseInstructions`    | Claim haircut recovery + close position in one tx (2 ixs) |

---

For full documentation, visit [coalescefi.com/en/docs](https://www.coalescefi.com/en/docs).

License: [Apache-2.0](./LICENSE)
