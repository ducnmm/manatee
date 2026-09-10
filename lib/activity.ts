import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { dataFile } from './paths';

export type ActivityKind = 'faucet' | 'send' | 'mint' | 'register';

export type ActivityItem = {
  at: string;
  kind?: ActivityKind;
  source: 'web' | 'x' | 'worker' | 'chain';
  text: string;
  address?: string;
  from?: string;
  to?: string;
  amount?: string;
  handle?: string;
  author?: string;
  sepoliaTx?: string;
  creditcoinTx?: string;
  error?: string;
};

const MAX_ITEMS = 200;

function activityPath(): string {
  return process.env.ACTIVITY_PATH ?? dataFile('activity.json');
}

export function loadActivity(): ActivityItem[] {
  const path = activityPath();
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ActivityItem[]) : [];
}

function saveActivity(items: ActivityItem[]): void {
  writeFileSync(activityPath(), `${JSON.stringify(items.slice(0, MAX_ITEMS), null, 2)}\n`);
}

export function pushActivity(item: Omit<ActivityItem, 'at'> & { at?: string }): ActivityItem {
  const full: ActivityItem = { at: item.at ?? new Date().toISOString(), ...item };
  const items = loadActivity();
  items.unshift(full);
  saveActivity(items);
  return full;
}

export function patchActivityBySepolia(
  sepoliaTx: string,
  patch: Partial<Omit<ActivityItem, 'sepoliaTx'>>,
): ActivityItem {
  const items = loadActivity();
  const i = items.findIndex((x) => x.sepoliaTx === sepoliaTx);
  if (i >= 0) {
    items[i] = { ...items[i]!, ...patch };
    saveActivity(items);
    return items[i]!;
  }
  return pushActivity({
    source: 'worker',
    kind: 'mint',
    text: patch.text ?? 'mint',
    sepoliaTx,
    ...patch,
  });
}

export function matchesAddress(item: ActivityItem, address: string): boolean {
  const key = address.toLowerCase();
  return [item.address, item.from, item.to].some((value) => value?.toLowerCase() === key);
}

export function matchesHandle(item: ActivityItem, handle: string): boolean {
  const key = handle.replace(/^@/, '').toLowerCase();
  return [item.author, item.handle].some((value) => value?.replace(/^@/, '').toLowerCase() === key);
}

export function mergeActivity(primary: ActivityItem[], extra: ActivityItem[]): ActivityItem[] {
  const byKey = new Map<string, ActivityItem>();
  for (const item of [...extra, ...primary]) {
    const key =
      item.sepoliaTx?.toLowerCase() ??
      item.creditcoinTx?.toLowerCase() ??
      `${item.kind}:${item.at}:${item.amount ?? ''}:${item.to ?? ''}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...item, ...prev } : item);
  }
  return [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
