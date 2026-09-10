import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMentionQuery, tweetIdFromUnixMs, tweetIdFromUrl } from './x';

test('tweetIdFromUrl parses x.com and twitter.com status URLs', () => {
  assert.equal(tweetIdFromUrl('https://x.com/alice/status/1234567890'), '1234567890');
  assert.equal(tweetIdFromUrl('https://twitter.com/bob/status/99?s=20'), '99');
  assert.equal(tweetIdFromUrl('not a url'), undefined);
});

test('buildMentionQuery windows search like dugong (since_time/until_time)', () => {
  assert.equal(
    buildMentionQuery('ManateeWallet', 1700000000, 1700000030),
    '@ManateeWallet (send OR register) since_time:1700000000 until_time:1700000030',
  );
  assert.equal(
    buildMentionQuery('@ManateeWallet', 1, 2),
    '@ManateeWallet (send OR register) since_time:1 until_time:2',
  );
});

test('tweetIdFromUnixMs is monotonic', () => {
  const a = BigInt(tweetIdFromUnixMs(1_700_000_000_000));
  const b = BigInt(tweetIdFromUnixMs(1_700_000_001_000));
  assert.ok(b > a);
});
