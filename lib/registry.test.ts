import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { getAddress } from 'ethers';

import { loadRegistry, registerHandle, resolveHandle, saveRegistry } from './registry';

const ADDR_A = '0x1234567890123456789012345678901234567890';
const ADDR_B = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

let dir: string;
let file: string;
const prevPath = process.env.REGISTRY_PATH;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'manatee-registry-'));
  file = join(dir, 'registry.json');
  process.env.REGISTRY_PATH = file;
});

after(async () => {
  if (prevPath === undefined) {
    delete process.env.REGISTRY_PATH;
  } else {
    process.env.REGISTRY_PATH = prevPath;
  }
  await rm(dir, { recursive: true, force: true });
});

test('loadRegistry returns empty object when file is missing', () => {
  assert.deepEqual(loadRegistry(file), {});
});

test('registerHandle writes lowercase handle and checksummed address', async () => {
  const stored = registerHandle('@Bob', ADDR_A, file);
  assert.equal(stored, getAddress(ADDR_A));
  assert.equal(resolveHandle('BOB', file), getAddress(ADDR_A));
  assert.equal(resolveHandle('@bob', file), getAddress(ADDR_A));

  const onDisk = JSON.parse(await readFile(file, 'utf8')) as Record<string, string>;
  assert.equal(onDisk.bob, getAddress(ADDR_A));
  assert.equal(onDisk.Bob, undefined);
});

test('registerHandle overwrites an existing handle', () => {
  registerHandle('alice', ADDR_A, file);
  registerHandle('@alice', ADDR_B, file);
  assert.equal(resolveHandle('@alice', file), getAddress(ADDR_B));
});

test('resolveHandle throws a clear error for unknown handles', () => {
  assert.throws(() => resolveHandle('@nobody', file), /unknown handle "@nobody"/);
});

test('registerHandle rejects invalid address and handle', () => {
  assert.throws(() => registerHandle('@bob', '0x123', file), /invalid address/);
  assert.throws(() => registerHandle('@bob!', ADDR_A, file), /invalid handle/);
});

test('saveRegistry / loadRegistry round-trip via REGISTRY_PATH env', () => {
  saveRegistry({ carol: getAddress(ADDR_A) }, file);
  assert.equal(resolveHandle('carol'), getAddress(ADDR_A));
});
