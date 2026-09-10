import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAddress } from 'ethers';

import { parseCommand } from './parser';

const ADDR = '0x1234567890123456789012345678901234567890';
const MIXED = getAddress(ADDR);

test('happy send with @ManateeWallet prefix', () => {
  assert.deepEqual(parseCommand('@ManateeWallet send 10 mtee @bob'), {
    kind: 'send',
    amount: '10',
    coin: 'mtee',
    handle: 'bob',
  });
});

test('prefix optional: send 10 mtee @bob', () => {
  assert.deepEqual(parseCommand('send 10 mtee @bob'), {
    kind: 'send',
    amount: '10',
    coin: 'mtee',
    handle: 'bob',
  });
});

test('strips X reply auto-mentions before send', () => {
  assert.deepEqual(
    parseCommand('@ManateeWallet @AJEnglish @ManateeWallet send 1 mtee @AJEnglish'),
    { kind: 'send', amount: '1', coin: 'mtee', handle: 'ajenglish' },
  );
  assert.deepEqual(parseCommand('@AJEnglish send 1 mtee @AJEnglish'), {
    kind: 'send',
    amount: '1',
    coin: 'mtee',
    handle: 'ajenglish',
  });
});

test('strips extra whitespace and lowercases handle', () => {
  assert.deepEqual(parseCommand('  @ManateeWallet   send   1.5   mtee   @Bob_123  '), {
    kind: 'send',
    amount: '1.5',
    coin: 'mtee',
    handle: 'bob_123',
  });
});

test('ctc hint', () => {
  assert.throws(() => parseCommand('send 10 ctc @bob'), /ctc is gas/);
  assert.throws(() => parseCommand('@ManateeWallet send 1 CTC @bob'), /ctc is gas/);
});

test('unknown coin', () => {
  assert.throws(() => parseCommand('send 10 eth @bob'), /coin not allowed/);
  assert.throws(() => parseCommand('send 10 usdc @bob'), /coin not allowed/);
  assert.throws(() => parseCommand('send 10 foo @bob'), /coin not allowed/);
});

test('amount 0', () => {
  assert.throws(() => parseCommand('send 0 mtee @bob'), /positive decimal/);
  assert.throws(() => parseCommand('send 0.0 mtee @bob'), /positive decimal/);
  assert.throws(() => parseCommand('send 00 mtee @bob'), /positive decimal/);
});

test('invalid amount format', () => {
  assert.throws(() => parseCommand('send .5 mtee @bob'), /positive decimal/);
  assert.throws(() => parseCommand('send 10. mtee @bob'), /positive decimal/);
  assert.throws(() => parseCommand('send -1 mtee @bob'), /positive decimal/);
});

test('missing coin', () => {
  assert.throws(() => parseCommand('send 10 @bob'), /missing coin/);
  assert.throws(() => parseCommand('send 10'), /missing coin/);
  assert.throws(() => parseCommand('@ManateeWallet send'), /missing amount|missing coin/);
});

test('missing handle', () => {
  assert.throws(() => parseCommand('send 10 mtee'), /missing handle/);
});

test('rejects extra tokens on send', () => {
  assert.throws(() => parseCommand('send 10 mtee @bob please'), /extra tokens/);
});

test('invalid handle', () => {
  assert.throws(() => parseCommand('send 10 mtee bob'), /invalid handle/);
  assert.throws(() => parseCommand('send 10 mtee @bob!'), /invalid handle/);
});

test('register tweet form: address only', () => {
  assert.deepEqual(parseCommand(`@ManateeWallet register ${ADDR}`), {
    kind: 'register',
    address: ADDR,
  });
  const parsed = parseCommand(`register ${MIXED}`);
  assert.equal(parsed.kind, 'register');
  assert.equal(parsed.handle, undefined);
  assert.equal(parsed.address, MIXED);
});

test('register handle + address', () => {
  assert.deepEqual(parseCommand(`register @bob ${ADDR}`), {
    kind: 'register',
    handle: 'bob',
    address: ADDR,
  });
  assert.deepEqual(parseCommand(`@ManateeWallet register @Alice ${ADDR}`), {
    kind: 'register',
    handle: 'alice',
    address: ADDR,
  });
});

test('register rejects invalid address and extra tokens', () => {
  assert.throws(() => parseCommand('register 0x123'), /invalid address/);
  assert.throws(() => parseCommand(`register @bob ${ADDR} extra`), /extra tokens/);
  assert.throws(() => parseCommand('register @bob'), /invalid address/);
});
