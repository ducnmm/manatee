import { Contract, EventLog, JsonRpcProvider, ZeroAddress, formatEther } from 'ethers';

import { LOCK_ABI, MINT_ABI, TOKEN_ABI } from './abi';
import { type ActivityItem, loadActivity, matchesAddress, mergeActivity } from './activity';
import { loadConfig } from './config';

const LOOKBACK_BLOCKS = 40_000;
const cache = new Map<string, { at: number; items: ActivityItem[] }>();
const CACHE_MS = 20_000;

function asEventLog(value: unknown): EventLog | null {
  return value instanceof EventLog ? value : null;
}

async function stamps(
  provider: JsonRpcProvider,
  events: EventLog[],
): Promise<Map<number, string>> {
  const blocks = [...new Set(events.map((event) => event.blockNumber))];
  const out = new Map<number, string>();
  await Promise.all(
    blocks.map(async (blockNumber) => {
      const block = await provider.getBlock(blockNumber);
      out.set(blockNumber, new Date((block?.timestamp ?? 0) * 1000).toISOString());
    }),
  );
  return out;
}

async function fromBlock(provider: JsonRpcProvider): Promise<number> {
  const latest = await provider.getBlockNumber();
  return Math.max(0, latest - LOOKBACK_BLOCKS);
}

async function loadChainActivity(address: string): Promise<ActivityItem[]> {
  const cfg = loadConfig();
  const items: ActivityItem[] = [];
  const me = address.toLowerCase();

  if (cfg.sourceRpc && cfg.sepoliaMtee) {
    const sepolia = new JsonRpcProvider(cfg.sourceRpc);
    const start = await fromBlock(sepolia);
    const token = new Contract(cfg.sepoliaMtee, TOKEN_ABI, sepolia);
    const incoming = (await token.queryFilter(token.filters.Transfer(null, address), start)).map(asEventLog).filter(Boolean) as EventLog[];
    const times = await stamps(sepolia, incoming);
    for (const event of incoming) {
      const from = String(event.args?.from ?? event.args?.[0] ?? '');
      const amount = formatEther(event.args?.value ?? event.args?.[2] ?? 0n);
      const faucet = from.toLowerCase() === ZeroAddress.toLowerCase();
      items.push({
        at: times.get(event.blockNumber) ?? new Date().toISOString(),
        kind: faucet ? 'faucet' : 'send',
        source: 'chain',
        text: faucet ? 'faucet 10 mtee' : 'receive mtee',
        address,
        from,
        to: address,
        amount,
        sepoliaTx: event.transactionHash,
      });
    }

    if (cfg.sepoliaLock) {
      const lock = new Contract(cfg.sepoliaLock, LOCK_ABI, sepolia);
      const sent = (await lock.queryFilter(lock.filters.TokensSentForBridging(address), start)).map(asEventLog).filter(Boolean) as EventLog[];
      const recv = (await lock.queryFilter(lock.filters.TokensSentForBridging(null, address), start)).map(asEventLog).filter(Boolean) as EventLog[];
      const lockEvents = [...sent, ...recv];
      const lockTimes = await stamps(sepolia, lockEvents);
      for (const event of lockEvents) {
        const from = String(event.args?.from ?? event.args?.[0] ?? '');
        const to = String(event.args?.to ?? event.args?.[1] ?? '');
        const amount = formatEther(event.args?.amount ?? event.args?.[3] ?? 0n);
        items.push({
          at: lockTimes.get(event.blockNumber) ?? new Date().toISOString(),
          kind: 'send',
          source: 'chain',
          text: `send ${amount} mtee`,
          address,
          from,
          to,
          amount,
          sepoliaTx: event.transactionHash,
        });
      }
    }
  }

  if (cfg.creditcoinRpc && cfg.creditcoinMint) {
    const cc3 = new JsonRpcProvider(cfg.creditcoinRpc);
    const start = await fromBlock(cc3);
    const minter = new Contract(cfg.creditcoinMint, MINT_ABI, cc3);
    const minted = (await minter.queryFilter(minter.filters.TokensMinted(null, address), start)).map(asEventLog).filter(Boolean) as EventLog[];
    const times = await stamps(cc3, minted);
    for (const event of minted) {
      const to = String(event.args?.to ?? event.args?.[1] ?? address);
      const amount = formatEther(event.args?.amount ?? event.args?.[2] ?? 0n);
      items.push({
        at: times.get(event.blockNumber) ?? new Date().toISOString(),
        kind: 'mint',
        source: 'chain',
        text: `mint ${amount} mtee`,
        address,
        to,
        amount,
        creditcoinTx: event.transactionHash,
      });
    }
  } else if (cfg.creditcoinRpc && cfg.creditcoinMtee) {
    const cc3 = new JsonRpcProvider(cfg.creditcoinRpc);
    const start = await fromBlock(cc3);
    const token = new Contract(cfg.creditcoinMtee, TOKEN_ABI, cc3);
    const incoming = (await token.queryFilter(token.filters.Transfer(ZeroAddress, address), start)).map(asEventLog).filter(Boolean) as EventLog[];
    const times = await stamps(cc3, incoming);
    for (const event of incoming) {
      const amount = formatEther(event.args?.value ?? event.args?.[2] ?? 0n);
      items.push({
        at: times.get(event.blockNumber) ?? new Date().toISOString(),
        kind: 'mint',
        source: 'chain',
        text: `mint ${amount} mtee`,
        address,
        from: ZeroAddress,
        to: address,
        amount,
        creditcoinTx: event.transactionHash,
      });
    }
  }

  return items.filter((item) => matchesAddress(item, me) || item.address?.toLowerCase() === me);
}

export async function listActivityForAddress(address: string): Promise<ActivityItem[]> {
  const key = address.toLowerCase();
  const stored = loadActivity().filter((item) => matchesAddress(item, address));
  let chain: ActivityItem[] = [];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    chain = hit.items;
  } else {
    try {
      chain = await loadChainActivity(address);
      cache.set(key, { at: Date.now(), items: chain });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`chain activity failed: ${message}`);
    }
  }
  return mergeActivity(stored, chain).slice(0, 50);
}
