import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function dataDir(): string {
  const candidates = [process.env.DATA_DIR?.trim(), '/data', join(process.cwd(), 'data')].filter(
    (value): value is string => Boolean(value),
  );
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      continue;
    }
  }
  return process.cwd();
}

export function dataFile(name: string): string {
  return join(dataDir(), name);
}
