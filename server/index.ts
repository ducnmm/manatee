import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, formatEther, isAddress, parseUnits } from 'ethers';

import { TOKEN_ABI } from '../lib/abi';
import { patchActivityBySepolia, pushActivity } from '../lib/activity';
import { listActivityForAddress } from '../lib/history';
import { handleCommand } from '../lib/command';
import { creditcoinTxUrl, loadConfig, sepoliaTxUrl } from '../lib/config';
import { parseCommand } from '../lib/parser';
import { ensureSeedRegistry, listRegistry } from '../lib/registry';
import { loadProcessedTweets, markTweetProcessed } from '../lib/processed';
import { fetchTweetById, replyToTweet, searchMentions, tweetIdFromUrl, type XTweet } from '../lib/x';
import { startChainWorker } from '../worker/index';

ensureSeedRegistry();

const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIR = join(process.cwd(), 'web', 'dist');
const faucetCooldown = new Map<string, number>();
const processedTweets = loadProcessedTweets();

function envPositiveSeconds(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number of seconds (got ${JSON.stringify(raw)})`);
  }
  return n;
}

/** Demo: POLL_INTERVAL_SEC=5 SEARCH_LOOKBACK_SEC=10 */
const POLL_INTERVAL_SEC = envPositiveSeconds('POLL_INTERVAL_SEC', 60);
const SEARCH_LOOKBACK_SEC = envPositiveSeconds('SEARCH_LOOKBACK_SEC', 120);

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function faucetTo(address: string): Promise<string> {
  const cfg = loadConfig();
  if (!cfg.sourceRpc || !cfg.privateKey || !cfg.sepoliaMtee) {
    throw new Error('deploy first / set .env');
  }
  const now = Date.now();
  const last = faucetCooldown.get(address.toLowerCase()) ?? 0;
  if (now - last < 60_000) {
    throw new Error('faucet cooldown 60s');
  }
  const provider = new JsonRpcProvider(cfg.sourceRpc);
  const wallet = new Wallet(cfg.privateKey, provider);
  const token = new Contract(cfg.sepoliaMtee, TOKEN_ABI, wallet);
  const tx = await token.mint(address, parseUnits('10', 18));
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error('faucet mint failed');
  }
  faucetCooldown.set(address.toLowerCase(), now);
  return tx.hash as string;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (url.pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      x: Boolean(process.env.TWITTERAPI_IO_API_KEY),
      xPost: Boolean(process.env.TWITTERAPI_IO_LOGIN_COOKIES && process.env.TWITTERAPI_IO_PROXY),
      pollIntervalSec: POLL_INTERVAL_SEC,
      searchLookbackSec: SEARCH_LOOKBACK_SEC,
    });
    return;
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    const cfg = loadConfig();
    json(res, 200, {
      sepoliaMtee: cfg.sepoliaMtee,
      sepoliaLock: cfg.sepoliaLock,
      creditcoinMint: cfg.creditcoinMint,
      creditcoinMtee: cfg.creditcoinMtee,
      explorers: cfg.explorers,
      sepoliaChainId: 11155111,
      creditcoinChainId: 102031,
      bot: process.env.X_BOT_HANDLE ?? 'ManateeWallet',
    });
    return;
  }

  if (url.pathname === '/api/balances' && req.method === 'GET') {
    const address = url.searchParams.get('address') ?? '';
    if (!isAddress(address)) {
      throw new Error('invalid address');
    }
    const cfg = loadConfig();
    if (!cfg.sourceRpc || !cfg.sepoliaMtee) {
      throw new Error('deploy first / set .env');
    }
    const sepolia = new JsonRpcProvider(cfg.sourceRpc);
    const token = new Contract(cfg.sepoliaMtee, TOKEN_ABI, sepolia);
    const [eth, mtee] = await Promise.all([sepolia.getBalance(address), token.balanceOf(address)]);
    let creditcoinMtee = '0';
    if (cfg.creditcoinRpc && cfg.creditcoinMtee) {
      const cc3 = new JsonRpcProvider(cfg.creditcoinRpc);
      const ccToken = new Contract(cfg.creditcoinMtee, TOKEN_ABI, cc3);
      creditcoinMtee = formatEther(await ccToken.balanceOf(address));
    }
    const registry = listRegistry();
    const handle = Object.entries(registry).find(([, value]) => value.toLowerCase() === address.toLowerCase())?.[0];
    json(res, 200, {
      address,
      handle: handle ?? null,
      sepoliaEth: formatEther(eth),
      sepoliaMtee: formatEther(mtee),
      creditcoinMtee,
    });
    return;
  }

  if (url.pathname === '/api/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').replace(/^@/, '').trim().toLowerCase();
    if (!q) {
      json(res, 200, { accounts: [] });
      return;
    }
    const accounts = Object.entries(listRegistry())
      .filter(([handle, address]) => handle.includes(q) || address.toLowerCase().includes(q))
      .map(([handle, address]) => ({ handle, address }))
      .slice(0, 10);
    json(res, 200, { accounts });
    return;
  }

  if (url.pathname === '/api/registry' && req.method === 'GET') {
    json(res, 200, listRegistry());
    return;
  }

  if (url.pathname === '/api/activity' && req.method === 'GET') {
    const address = url.searchParams.get('address') ?? '';
    if (address) {
      if (!isAddress(address)) {
        throw new Error('invalid address');
      }
      json(res, 200, await listActivityForAddress(address));
      return;
    }
    json(res, 200, []);
    return;
  }

  if (url.pathname === '/api/register' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { handle?: string; address?: string };
    const handle = (body.handle ?? '').replace(/^@/, '');
    const out = await handleCommand({
      text: `register @${handle} ${body.address}`,
      execute: false,
    });
    pushActivity({
      source: 'web',
      kind: 'register',
      text: `register @${body.handle}`,
      author: body.handle,
      handle: handle,
      address: body.address,
      to: body.address,
    });
    json(res, 200, out);
    return;
  }

  if (url.pathname === '/api/faucet' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { address?: string };
    if (!body.address) {
      throw new Error('missing address');
    }
    const tx = await faucetTo(body.address);
    pushActivity({
      source: 'web',
      kind: 'faucet',
      text: 'faucet 10 mtee',
      address: body.address,
      to: body.address,
      amount: '10',
      sepoliaTx: tx,
    });
    json(res, 200, { tx, url: sepoliaTxUrl(tx) });
    return;
  }

  if (url.pathname === '/api/command' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as {
      text?: string;
      author?: string;
      execute?: boolean;
    };
    if (!body.text) {
      throw new Error('missing text');
    }
    const out = await handleCommand({
      text: body.text,
      author: body.author,
      execute: Boolean(body.execute),
    });
    pushActivity({
      source: 'web',
      kind: out.kind === 'send' ? 'send' : 'register',
      text: body.text,
      author: body.author,
      address: out.kind === 'send' ? out.to : out.address,
      to: out.kind === 'send' ? out.to : out.address,
      amount: out.kind === 'send' ? out.amount : undefined,
      handle: out.handle,
      sepoliaTx: out.kind === 'send' ? out.sepoliaTx : undefined,
      creditcoinTx: out.kind === 'send' ? out.creditcoinTx : undefined,
    });
    json(res, 200, out);
    return;
  }

  if (url.pathname === '/api/locked' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as {
      sepoliaTx?: string;
      text?: string;
      author?: string;
    };
    if (!body.sepoliaTx) {
      throw new Error('missing sepoliaTx');
    }
    pushActivity({
      source: 'web',
      kind: 'send',
      text: body.text ?? 'send',
      author: body.author,
      sepoliaTx: body.sepoliaTx,
    });
    json(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/tweet' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { url?: string; execute?: boolean };
    if (!body.url) {
      throw new Error('missing url');
    }
    const id = tweetIdFromUrl(body.url);
    if (!id) {
      throw new Error('not an X status URL');
    }
    const tweet = await fetchTweetById(id);
    if (body.execute) {
      const as = process.env.X_REPLY_AS ?? 'ManateeWallet';
      void processXTweet(tweet, as);
      json(res, 202, { tweet, accepted: true });
      return;
    }
    const out = await handleCommand({
      text: tweet.text,
      author: tweet.author,
      execute: false,
    });
    json(res, 200, { tweet, result: out });
    return;
  }

  json(res, 404, { error: 'not found' });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function serveStatic(res: ServerResponse, pathname: string): void {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR) || !existsSync(file)) {
    const index = join(WEB_DIR, 'index.html');
    if (existsSync(index)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(index));
      return;
    }
    json(res, 404, { error: 'web not built — run npm run web:build' });
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

function isCommandTweet(text: string): boolean {
  try {
    parseCommand(text);
    return true;
  } catch {
    return false;
  }
}

async function processXTweet(tweet: XTweet, replyAs: string): Promise<void> {
  if (processedTweets.has(tweet.id)) {
    return;
  }
  markTweetProcessed(processedTweets, tweet.id);
  console.log(`X @${tweet.author}: ${tweet.text}`);
  try {
    const out = await handleCommand({
      text: tweet.text,
      author: tweet.author,
      execute: true,
      onLocked: async (sepoliaTx) => {
        pushActivity({
          source: 'x',
          kind: 'send',
          text: tweet.text,
          author: tweet.author,
          handle: tweet.author,
          sepoliaTx,
        });
        const r1 = `submitted — locked on Sepolia, waiting Attestcoin confirm ~8-10 min (not minted yet)\n${sepoliaTxUrl(sepoliaTx)}`;
        try {
          const id = await replyToTweet(tweet.id, r1);
          console.log(`X reply 1/2 as @${replyAs}: ${id}`);
        } catch (replyError: unknown) {
          const replyMessage = replyError instanceof Error ? replyError.message : String(replyError);
          console.error(`X reply 1/2 failed (mint continues): ${replyMessage}`);
        }
      },
    });
    const sepoliaTx = out.kind === 'send' ? out.sepoliaTx : undefined;
    const creditcoinTx = out.kind === 'send' ? out.creditcoinTx : undefined;
    if (sepoliaTx && creditcoinTx) {
      patchActivityBySepolia(sepoliaTx, { creditcoinTx });
    } else if (out.kind === 'register') {
      pushActivity({
        source: 'x',
        kind: 'register',
        text: tweet.text,
        author: tweet.author,
        handle: out.handle,
        address: out.address,
        to: out.address,
      });
    }
    let r2 = '';
    if (out.kind === 'send' && creditcoinTx) {
      const created = out.created ? ` (new account ${out.to})` : '';
      r2 = `confirmed — minted ${out.amount} mtee to @${out.handle}${created} on Creditcoin\n${creditcoinTxUrl(creditcoinTx)}`;
      console.log(`X minted ${creditcoinTxUrl(creditcoinTx)}`);
    } else if (out.kind === 'register') {
      r2 = `registered @${out.handle} -> ${out.address}`;
    }
    if (r2) {
      const id = await replyToTweet(tweet.id, r2);
      console.log(`X reply 2/2 as @${replyAs}: ${id}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    pushActivity({ source: 'x', text: tweet.text, author: tweet.author, error: message });
    console.error(`X command failed: ${message}`);
    try {
      await replyToTweet(tweet.id, `failed: ${message}`.slice(0, 240));
    } catch (replyError: unknown) {
      const replyMessage = replyError instanceof Error ? replyError.message : String(replyError);
      console.error(`X error reply failed: ${replyMessage}`);
    }
  }
}

async function pollX(): Promise<void> {
  if (!process.env.TWITTERAPI_IO_API_KEY) {
    console.log('X poller off (no TWITTERAPI_IO_API_KEY). Web still works.');
    return;
  }
  const bot = process.env.X_BOT_HANDLE ?? 'ManateeWallet';
  const as = process.env.X_REPLY_AS ?? 'ManateeWallet';
  console.log(
    `X poller on — @${bot.replace(/^@/, '')} every ${POLL_INTERVAL_SEC}s, lookback ${SEARCH_LOOKBACK_SEC}s, 1 tweet/poll (replies as @${as.replace(/^@/, '')})`,
  );
  const pending: XTweet[] = [];
  let busy = false;
  for (;;) {
    try {
      const sinceUnix = Math.floor(Date.now() / 1000) - SEARCH_LOOKBACK_SEC;
      const tweets = await searchMentions(undefined, sinceUnix);
      const commands = tweets
        .slice()
        .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
        .filter((tweet) => {
          if (processedTweets.has(tweet.id) || pending.some((item) => item.id === tweet.id)) {
            return false;
          }
          if (!isCommandTweet(tweet.text)) {
            markTweetProcessed(processedTweets, tweet.id);
            console.log(`X skip (not a command) ${tweet.id} @${tweet.author}`);
            return false;
          }
          return true;
        });
      pending.push(...commands);
      if (pending.length > 1) {
        console.log(`X queued ${pending.length - (busy ? 0 : 1)} tweet(s) for later polls`);
      }
      if (!busy) {
        const tweet = pending.shift();
        if (tweet) {
          busy = true;
          void processXTweet(tweet, as).finally(() => {
            busy = false;
          });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`X poll error: ${message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_SEC * 1000));
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      json(res, 400, { error: message });
    });
    return;
  }
  serveStatic(res, url.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`manatee web+api http://0.0.0.0:${PORT}`);
});

if (process.env.START_CHAIN_WORKER !== '0') {
  startChainWorker().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
  });
}

void pollX();
