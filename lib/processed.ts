import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dataFile } from './paths';

const MAX_IDS = 500;

function processedPath(): string {
  return process.env.PROCESSED_TWEETS_PATH ?? dataFile('processed-tweets.json');
}

function readIdList(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function loadProcessedTweets(): Set<string> {
  const seed = join(process.cwd(), 'processed.seed.json');
  return new Set([...readIdList(seed), ...readIdList(processedPath())]);
}

export function saveProcessedTweets(ids: Set<string>): void {
  writeFileSync(processedPath(), `${JSON.stringify([...ids].slice(-MAX_IDS))}\n`);
}

export function markTweetProcessed(ids: Set<string>, id: string): void {
  if (ids.has(id)) {
    return;
  }
  ids.add(id);
  saveProcessedTweets(ids);
}
