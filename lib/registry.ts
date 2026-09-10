import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAddress, getAddress } from 'ethers';

import { dataFile } from './paths';

export type Registry = Record<string, string>;

const HANDLE_BODY_RE = /^[a-z0-9_]+$/;

export function registryPath(filePath?: string): string {
  return filePath ?? process.env.REGISTRY_PATH ?? dataFile('registry.json');
}

export function ensureSeedRegistry(): void {
  const path = registryPath();
  const seed = join(process.cwd(), 'registry.seed.json');
  if (!existsSync(path) && existsSync(seed)) {
    copyFileSync(seed, path);
  }
}

export function loadRegistry(filePath?: string): Registry {
  const path = registryPath(filePath);
  if (!existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid registry file: ${path}`);
  }
  const out: Registry = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`invalid registry entry for "${key}"`);
    }
    out[key.toLowerCase()] = value;
  }
  return out;
}

export function saveRegistry(registry: Registry, filePath?: string): void {
  const path = registryPath(filePath);
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

export function registerHandle(handle: string, address: string, filePath?: string): string {
  const key = normalizeHandle(handle);
  if (!isAddress(address)) {
    throw new Error(`invalid address: ${address}`);
  }
  const checksummed = getAddress(address);
  const registry = loadRegistry(filePath);
  registry[key] = checksummed;
  saveRegistry(registry, filePath);
  return checksummed;
}

export function listRegistry(filePath?: string): Registry {
  return loadRegistry(filePath);
}

export function resolveHandle(handle: string, filePath?: string): string {
  const key = normalizeHandle(handle);
  const registry = loadRegistry(filePath);
  const address = registry[key];
  if (!address) {
    throw new Error(`unknown handle "@${key}" — register it first`);
  }
  return address;
}

function normalizeHandle(handle: string): string {
  const key = (handle.startsWith('@') ? handle.slice(1) : handle).toLowerCase();
  if (!HANDLE_BODY_RE.test(key)) {
    throw new Error(`invalid handle: ${handle}`);
  }
  return key;
}
