import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export type Explorers = {
  sepolia: string;
  creditcoin: string;
};

export const explorers: Explorers = {
  sepolia: 'https://sepolia.etherscan.io/tx/',
  creditcoin: 'https://creditcoin-testnet.blockscout.com/tx/',
};

export type Config = {
  sourceChainKey: number;
  sourceRpc: string | undefined;
  creditcoinRpc: string | undefined;
  proofBuilderUrl: string | undefined;
  privateKey: string | undefined;
  sepoliaMtee: string | undefined;
  sepoliaLock: string | undefined;
  creditcoinMint: string | undefined;
  creditcoinMtee: string | undefined;
  explorers: Explorers;
};

function optional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function loadConfig(): Config {
  dotenv.config({ quiet: true });
  const keyRaw = optional('SOURCE_CHAIN_KEY');
  const sourceChainKey = keyRaw === undefined ? 1 : Number(keyRaw);
  if (!Number.isInteger(sourceChainKey) || sourceChainKey < 0) {
    throw new Error('SOURCE_CHAIN_KEY must be a non-negative integer (Sepolia = 1)');
  }
  return {
    sourceChainKey,
    sourceRpc: optional('SOURCE_CHAIN_RPC_URL'),
    creditcoinRpc: optional('CREDITCOIN_RPC_URL'),
    proofBuilderUrl: optional('PROOF_BUILDER_URL'),
    privateKey: optional('PRIVATE_KEY'),
    sepoliaMtee: optional('SEPOLIA_MTEE'),
    sepoliaLock: optional('SEPOLIA_LOCK'),
    creditcoinMint: optional('CREDITCOIN_MINT'),
    creditcoinMtee: optional('CREDITCOIN_MTEE'),
    explorers,
  };
}

const ENV_NAMES = {
  sourceRpc: 'SOURCE_CHAIN_RPC_URL',
  creditcoinRpc: 'CREDITCOIN_RPC_URL',
  proofBuilderUrl: 'PROOF_BUILDER_URL',
  privateKey: 'PRIVATE_KEY',
  sepoliaMtee: 'SEPOLIA_MTEE',
  sepoliaLock: 'SEPOLIA_LOCK',
  creditcoinMint: 'CREDITCOIN_MINT',
  creditcoinMtee: 'CREDITCOIN_MTEE',
} as const;

function requireFields<K extends keyof typeof ENV_NAMES>(
  cfg: Config,
  keys: readonly K[],
): Config & { [P in K]: string } {
  const missing = keys.filter((k) => !cfg[k]).map((k) => ENV_NAMES[k]);
  if (missing.length > 0) {
    throw new Error(`deploy first / set .env (missing ${missing.join(', ')})`);
  }
  return cfg as Config & { [P in K]: string };
}

export function requireRuntime(cfg: Config): Config & {
  sourceRpc: string;
  creditcoinRpc: string;
  proofBuilderUrl: string;
  privateKey: string;
} {
  return requireFields(cfg, ['sourceRpc', 'creditcoinRpc', 'proofBuilderUrl', 'privateKey']);
}

export function requireSepoliaSend(cfg: Config): Config & {
  sourceRpc: string;
  privateKey: string;
  sepoliaLock: string;
} {
  return requireFields(cfg, ['sourceRpc', 'privateKey', 'sepoliaLock']);
}

export function requireDeployed(cfg: Config): Config & {
  sourceRpc: string;
  creditcoinRpc: string;
  proofBuilderUrl: string;
  privateKey: string;
  sepoliaMtee: string;
  sepoliaLock: string;
  creditcoinMint: string;
} {
  return requireFields(cfg, [
    'sourceRpc',
    'creditcoinRpc',
    'proofBuilderUrl',
    'privateKey',
    'sepoliaMtee',
    'sepoliaLock',
    'creditcoinMint',
  ]);
}

export function requireWorker(cfg: Config): Config & {
  sourceRpc: string;
  creditcoinRpc: string;
  proofBuilderUrl: string;
  privateKey: string;
  sepoliaLock: string;
  creditcoinMint: string;
} {
  return requireFields(cfg, [
    'sourceRpc',
    'creditcoinRpc',
    'proofBuilderUrl',
    'privateKey',
    'sepoliaLock',
    'creditcoinMint',
  ]);
}

export function sepoliaTxUrl(hash: string): string {
  return `${explorers.sepolia}${hash}`;
}

export function creditcoinTxUrl(hash: string): string {
  return `${explorers.creditcoin}${hash}`;
}
