import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type ActivityItem = {
  at: string;
  source: 'web' | 'x' | 'worker';
  text: string;
  author?: string;
  sepoliaTx?: string;
  creditcoinTx?: string;
  error?: string;
};

const PATH = process.env.ACTIVITY_PATH ?? './activity.json';

export function loadActivity(): ActivityItem[] {
  if (!existsSync(PATH)) {
    return [];
  }
  const raw = readFileSync(PATH, 'utf8').trim();
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ActivityItem[]) : [];
}

export function pushActivity(item: Omit<ActivityItem, 'at'>): ActivityItem {
  const full: ActivityItem = { at: new Date().toISOString(), ...item };
  const items = loadActivity();
  items.unshift(full);
  writeFileSync(PATH, `${JSON.stringify(items.slice(0, 50), null, 2)}\n`);
  return full;
}

export function patchActivityBySepolia(
  sepoliaTx: string,
  patch: Partial<Pick<ActivityItem, 'creditcoinTx' | 'error' | 'text'>>,
): ActivityItem {
  const items = loadActivity();
  const i = items.findIndex((x) => x.sepoliaTx === sepoliaTx);
  if (i >= 0) {
    items[i] = { ...items[i]!, ...patch };
    writeFileSync(PATH, `${JSON.stringify(items.slice(0, 50), null, 2)}\n`);
    return items[i]!;
  }
  return pushActivity({
    source: 'worker',
    text: patch.text ?? 'mint',
    sepoliaTx,
    creditcoinTx: patch.creditcoinTx,
    error: patch.error,
  });
}
