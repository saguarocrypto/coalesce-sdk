import { PublicKey } from '@solana/web3.js';

/**
 * Network identifiers for program ID resolution.
 */
export type NetworkName = 'mainnet' | 'devnet' | 'localnet';

/**
 * SDK configuration options.
 */
export interface SdkConfig {
  /**
   * The program ID to use for all operations.
   * If not provided, will attempt to resolve from network or environment.
   */
  programId?: PublicKey;
  /**
   * The network to use for program ID resolution.
   * Only used if programId is not explicitly provided.
   */
  network?: NetworkName;
}

/**
 * Default program IDs for each network.
 * These can be overridden via environment variables or explicit configuration.
 *
 * Environment variables (checked in order):
 * - COALESCEFI_PROGRAM_ID: Explicit program ID (highest priority)
 * - COALESCEFI_NETWORK: Network name ('mainnet', 'devnet', 'localnet')
 */
export const DEFAULT_PROGRAM_IDS: Record<NetworkName, string> = {
  mainnet: 'GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR',
  // Note: devnet uses the same program ID as mainnet — there is no separate devnet deployment.
  // This entry exists for forward-compatibility if a devnet-specific deployment is added later.
  devnet: 'GooseA4bSoxitTMPa4ppe2zUQ9fu4139u8pEk6x65SR',
  localnet: '2xuc7ZLcVMWkVwVoVPkmeS6n3Picycyek4wqVVy2QbGy',
};

/**
 * Global SDK configuration state.
 * Use `configureSdk()` to set these values.
 */
let globalConfig: SdkConfig = {};

/**
 * Configure the SDK with custom settings.
 * Call this once at application startup.
 *
 * @example
 * // Option 1: Explicit program ID
 * configureSdk({ programId: new PublicKey('...') });
 *
 * // Option 2: Network-based resolution
 * configureSdk({ network: 'mainnet' });
 *
 * // Option 3: Environment variables (automatic)
 * // Set COALESCEFI_PROGRAM_ID or COALESCEFI_NETWORK
 */
export function configureSdk(config: SdkConfig): void {
  globalConfig = { ...config };
}

/**
 * Reset SDK configuration to defaults.
 * Useful for testing.
 *
 * NOTE: This also clears the cached program ID. After calling this,
 * the next access to PROGRAM_ID or getProgramId() will re-resolve
 * the program ID from the new configuration.
 */
export function resetSdkConfig(): void {
  globalConfig = {};
  // Clear cached program ID when config is reset
  // This is defined later in the file but TypeScript hoisting handles it
  if (typeof clearProgramIdCache === 'function') {
    clearProgramIdCache();
  }
}

/**
 * Get the current SDK configuration.
 */
export function getSdkConfig(): Readonly<SdkConfig> {
  return { ...globalConfig };
}

/**
 * Safely get an environment variable.
 * Returns undefined in browser environments.
 */
function getEnvVar(name: string): string | undefined {
  if (typeof process !== 'undefined' && typeof process.env === 'object' && process.env !== null) {
    return process.env[name];
  }
  return undefined;
}

/**
 * Resolve the program ID based on configuration priority:
 * 1. Explicit programId in global config
 * 2. COALESCEFI_PROGRAM_ID environment variable
 * 3. Network from global config
 * 4. COALESCEFI_NETWORK environment variable
 * 5. Default to localnet (for development)
 *
 * @throws Error if an invalid program ID or network is specified
 */
export function resolveProgramId(): PublicKey {
  // Priority 1: Explicit programId in config
  if (globalConfig.programId) {
    return globalConfig.programId;
  }

  // Priority 2: Environment variable for explicit program ID
  const envProgramId = getEnvVar('COALESCEFI_PROGRAM_ID');
  if (envProgramId !== undefined && envProgramId !== '') {
    try {
      return new PublicKey(envProgramId);
    } catch {
      throw new Error(
        `Invalid COALESCEFI_PROGRAM_ID environment variable: "${envProgramId}". ` +
          'Must be a valid base58-encoded Solana public key.'
      );
    }
  }

  // Priority 3: Network from config
  if (globalConfig.network) {
    const programIdStr = DEFAULT_PROGRAM_IDS[globalConfig.network];
    if (programIdStr === '11111111111111111111111111111111') {
      throw new Error(
        `Program ID for network "${globalConfig.network}" is not configured. ` +
          'Please set COALESCEFI_PROGRAM_ID environment variable or use configureSdk() ' +
          'with an explicit programId.'
      );
    }
    return new PublicKey(programIdStr);
  }

  // Priority 4: Environment variable for network
  const envNetwork = getEnvVar('COALESCEFI_NETWORK') as NetworkName | undefined;
  if (envNetwork) {
    if (!(envNetwork in DEFAULT_PROGRAM_IDS)) {
      throw new Error(
        `Invalid COALESCEFI_NETWORK environment variable: "${envNetwork}". ` +
          `Must be one of: ${Object.keys(DEFAULT_PROGRAM_IDS).join(', ')}`
      );
    }
    const programIdStr = DEFAULT_PROGRAM_IDS[envNetwork];
    if (programIdStr === '11111111111111111111111111111111') {
      throw new Error(
        `Program ID for network "${envNetwork}" is not configured. ` +
          'Please set COALESCEFI_PROGRAM_ID environment variable.'
      );
    }
    return new PublicKey(programIdStr);
  }

  // Priority 5: Default to localnet for development
  return new PublicKey(DEFAULT_PROGRAM_IDS.localnet);
}

/**
 * Get the program ID, resolving from configuration.
 * This is the preferred way to get the program ID.
 */
export function getProgramId(): PublicKey {
  return resolveProgramId();
}

/**
 * PDA seed constants - must match the Rust program exactly.
 */
export const SEED_PROTOCOL_CONFIG = Buffer.from('protocol_config');
export const SEED_MARKET = Buffer.from('market');
export const SEED_MARKET_AUTHORITY = Buffer.from('market_authority');
export const SEED_LENDER = Buffer.from('lender');
export const SEED_VAULT = Buffer.from('vault');
export const SEED_BORROWER_WHITELIST = Buffer.from('borrower_whitelist');
export const SEED_BLACKLIST = Buffer.from('blacklist');

/**
 * Mathematical constants - must match the Rust program exactly.
 */
export const WAD = BigInt('1000000000000000000'); // 1e18 for fixed-point precision
export const BPS = BigInt(10_000); // Basis points denominator
export const SECONDS_PER_YEAR = BigInt(31_536_000); // 365 days

/**
 * Protocol limits - must match the Rust program exactly.
 */
export const MAX_ANNUAL_INTEREST_BPS = 10_000; // 100% annual max
export const MAX_FEE_RATE_BPS = 10_000; // 100% fee rate max
export const USDC_DECIMALS = 6;
export const MIN_MATURITY_DELTA = 60; // Minimum seconds until maturity
export const SETTLEMENT_GRACE_PERIOD = 300; // 5 minutes - prevents front-running settlement

/**
 * Account sizes in bytes - must match the Rust #[repr(C)] structs exactly.
 */
export const PROTOCOL_CONFIG_SIZE = 194;
export const MARKET_SIZE = 250;
export const LENDER_POSITION_SIZE = 128;
export const BORROWER_WHITELIST_SIZE = 96;

/**
 * Account discriminators - 8-byte prefixes at the start of each account.
 * Must match the Rust DISC_* constants exactly.
 */
export const DISC_PROTOCOL_CONFIG = Buffer.from('COALPC__');
export const DISC_MARKET = Buffer.from('COALMKT_');
export const DISC_LENDER_POSITION = Buffer.from('COALLPOS');
export const DISC_BORROWER_WL = Buffer.from('COALBWL_');

/**
 * Instruction discriminators for the CoalesceFi protocol.
 *
 * These MUST match the Rust program's lib.rs dispatch exactly.
 * See: program/src/lib.rs
 *
 * Categories:
 * - ADMIN/SETUP (0-2): Protocol initialization and configuration
 * - CORE LENDING (3-7): Deposit, borrow, repay, withdraw operations
 * - SETTLEMENT (8-11): Post-maturity operations
 * - ACCESS CONTROL (12-16): Whitelist and admin management
 */
export enum InstructionDiscriminator {
  // ═══════════════════════════════════════════════════════════════
  // ADMIN/SETUP (0-2)
  // ═══════════════════════════════════════════════════════════════
  InitializeProtocol = 0,
  SetFeeConfig = 1,
  CreateMarket = 2,

  // ═══════════════════════════════════════════════════════════════
  // CORE LENDING (3-7)
  // ═══════════════════════════════════════════════════════════════
  Deposit = 3,
  Borrow = 4,
  Repay = 5,
  RepayInterest = 6,
  Withdraw = 7,

  // ═══════════════════════════════════════════════════════════════
  // SETTLEMENT (8-11)
  // ═══════════════════════════════════════════════════════════════
  CollectFees = 8,
  ReSettle = 9,
  CloseLenderPosition = 10,
  WithdrawExcess = 11,

  // ═══════════════════════════════════════════════════════════════
  // ACCESS CONTROL (12-16)
  // ═══════════════════════════════════════════════════════════════
  SetBorrowerWhitelist = 12,
  SetPause = 13,
  SetBlacklistMode = 14,
  SetAdmin = 15,
  SetWhitelistManager = 16,
}

/**
 * Known program addresses.
 */
export const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

