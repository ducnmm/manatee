import { BrowserProvider, Contract, parseUnits } from 'ethers';

import { LOCK_ABI, TOKEN_ABI } from '../../lib/abi';

type Cfg = {
  sepoliaMtee?: string;
  sepoliaLock?: string;
  explorers: { sepolia: string; creditcoin: string };
  sepoliaChainId: number;
  bot: string;
};

type Activity = {
  at: string;
  source: string;
  text: string;
  author?: string;
  sepoliaTx?: string;
  creditcoinTx?: string;
  error?: string;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const $ = (id: string) => document.getElementById(id)!;

let cfg: Cfg;
let account = '';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function shorten(address: string): string {
  if (address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function relative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return '';
  }
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 45) {
    return 'just now';
  }
  const units: Array<[string, number]> = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];
  for (const [label, size] of units) {
    if (seconds >= size) {
      return `${Math.floor(seconds / size)}${label} ago`;
    }
  }
  return `${seconds}s ago`;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? res.statusText);
  }
  return body;
}

function setStatus(id: string, html: string, err = false): void {
  const el = $(id);
  el.classList.toggle('err', err);
  el.innerHTML = html;
}

function formatResult(out: Record<string, unknown>): string {
  if (out.kind === 'send') {
    const to = typeof out.to === 'string' ? shorten(out.to) : '';
    return `send <strong>${escapeHtml(String(out.amount))} mtee</strong> → @${escapeHtml(String(out.handle))} (${escapeHtml(to)})`;
  }
  if (out.kind === 'register') {
    return `register @${escapeHtml(String(out.handle))} → ${escapeHtml(shorten(String(out.address)))}`;
  }
  return escapeHtml(JSON.stringify(out));
}

async function loadCfg() {
  cfg = await api('/api/config');
  const cmd = `@${cfg.bot} send 10 mtee @bob`;
  $('cmd').textContent = cmd;
  ($('tweet-intent') as HTMLAnchorElement).href =
    `https://x.com/intent/tweet?text=${encodeURIComponent(cmd)}`;
}

async function refreshActivity() {
  const items = (await api('/api/activity')) as Activity[];
  const rows = items
    .filter((i) => !(i.error && /create_tweet_v2|407/.test(i.error) && !i.sepoliaTx))
    .slice(0, 12);
  if (rows.length === 0) {
    $('activity').innerHTML = `<p class="empty">No sends yet. Tweet the command or send from here.</p>`;
    return;
  }
  $('activity').innerHTML = rows
    .map((i) => {
      const sepolia = i.sepoliaTx
        ? `<a href="${cfg.explorers.sepolia}${i.sepoliaTx}" target="_blank" rel="noreferrer">Sepolia ${shorten(i.sepoliaTx)}</a>`
        : '';
      const cc = i.creditcoinTx
        ? `<a href="${cfg.explorers.creditcoin}${i.creditcoinTx}" target="_blank" rel="noreferrer">Creditcoin ${shorten(i.creditcoinTx)}</a>`
        : '';
      const err = i.error && !i.creditcoinTx ? `<span class="err">${escapeHtml(i.error)}</span>` : '';
      return `<div class="item">
        <div class="head">
          <span class="badge ${escapeHtml(i.source)}">${escapeHtml(i.source)}</span>
          ${i.author ? `<strong>@${escapeHtml(i.author)}</strong>` : ''}
          <time>${escapeHtml(relative(i.at))}</time>
        </div>
        <div class="text">${escapeHtml(i.text)}</div>
        <div class="meta">${sepolia}${cc}${err}</div>
      </div>`;
    })
    .join('');
}

async function connect() {
  if (!window.ethereum) {
    throw new Error('install MetaMask');
  }
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const hexChain = `0x${cfg.sepoliaChainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChain }],
    });
  } catch {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexChain,
          chainName: 'Sepolia',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        },
      ],
    });
  }
  const signer = await provider.getSigner();
  account = await signer.getAddress();
  $('connect').textContent = shorten(account);
  setStatus('account', `connected ${escapeHtml(shorten(account))}`);
  return signer;
}

$('connect').onclick = () =>
  connect().catch((e) => setStatus('account', e instanceof Error ? e.message : String(e), true));

$('register').onclick = async () => {
  try {
    if (!account) {
      await connect();
    }
    const handle = ($('handle') as HTMLInputElement).value;
    const out = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ handle, address: account }),
    });
    setStatus('account', `registered @${escapeHtml(out.handle)} → ${escapeHtml(shorten(out.address))}`);
    await refreshActivity();
  } catch (e) {
    setStatus('account', e instanceof Error ? e.message : String(e), true);
  }
};

$('faucet').onclick = async () => {
  try {
    if (!account) {
      await connect();
    }
    const out = await api('/api/faucet', {
      method: 'POST',
      body: JSON.stringify({ address: account }),
    });
    setStatus('faucet-status', `<a href="${out.url}" target="_blank" rel="noreferrer">${shorten(out.tx)}</a>`);
    await refreshActivity();
  } catch (e) {
    setStatus('faucet-status', e instanceof Error ? e.message : String(e), true);
  }
};

$('send').onclick = async () => {
  try {
    const signer = await connect();
    if (!cfg.sepoliaLock || !cfg.sepoliaMtee) {
      throw new Error('server missing lock/token addresses');
    }
    const amount = ($('amount') as HTMLInputElement).value;
    const toHandle = ($('to-handle') as HTMLInputElement).value;
    const parsed = await api('/api/command', {
      method: 'POST',
      body: JSON.stringify({ text: `send ${amount} mtee ${toHandle}`, execute: false }),
    });
    const wei = parseUnits(amount, 18);
    const token = new Contract(cfg.sepoliaMtee, TOKEN_ABI, signer);
    const lock = new Contract(cfg.sepoliaLock, LOCK_ABI, signer);
    const allowance = (await token.allowance(account, cfg.sepoliaLock)) as bigint;
    if (allowance < wei) {
      const a = await token.approve(cfg.sepoliaLock, wei);
      await a.wait();
    }
    const tx = await lock.send(cfg.sepoliaMtee, parsed.to, wei);
    await api('/api/locked', {
      method: 'POST',
      body: JSON.stringify({
        sepoliaTx: tx.hash,
        text: `send ${amount} mtee ${toHandle}`,
      }),
    });
    setStatus(
      'send-status',
      `locked <a href="${cfg.explorers.sepolia}${tx.hash}" target="_blank" rel="noreferrer">${shorten(tx.hash)}</a> — wait ~8–10 min for attest`,
    );
    await refreshActivity();
  } catch (e) {
    setStatus('send-status', e instanceof Error ? e.message : String(e), true);
  }
};

$('parse').onclick = async () => {
  try {
    const raw = ($('paste') as HTMLInputElement).value.trim();
    if (/x\.com|twitter\.com/.test(raw)) {
      const out = await api('/api/tweet', {
        method: 'POST',
        body: JSON.stringify({ url: raw, execute: false }),
      });
      setStatus('paste-status', formatResult(out.result as Record<string, unknown>));
    } else {
      const out = await api('/api/command', {
        method: 'POST',
        body: JSON.stringify({ text: raw, execute: false }),
      });
      setStatus('paste-status', formatResult(out as Record<string, unknown>));
    }
    await refreshActivity();
  } catch (e) {
    setStatus('paste-status', e instanceof Error ? e.message : String(e), true);
  }
};

void loadCfg().then(refreshActivity);
setInterval(() => void refreshActivity(), 8000);
