import { BrowserProvider, Contract, parseUnits } from 'ethers';

import { LOCK_ABI, TOKEN_ABI } from '../../lib/abi';

type Cfg = {
  sepoliaMtee?: string;
  sepoliaLock?: string;
  explorers: { sepolia: string; creditcoin: string };
  sepoliaChainId: number;
  bot: string;
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

async function loadCfg() {
  cfg = await api('/api/config');
  const cmd = `@${cfg.bot} send 10 mtee @bob`;
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(cmd)}`;
  ($('tweet-intent') as HTMLAnchorElement).href = intent;
}

async function refreshActivity() {
  const items = (await api('/api/activity')) as Array<{
    at: string;
    source: string;
    text: string;
    author?: string;
    sepoliaTx?: string;
    creditcoinTx?: string;
    error?: string;
  }>;
  $('activity').innerHTML = items
    .slice(0, 12)
    .map((i) => {
      const sepolia = i.sepoliaTx
        ? `<a href="${cfg.explorers.sepolia}${i.sepoliaTx}">sepolia</a>`
        : '';
      const cc = i.creditcoinTx
        ? `<a href="${cfg.explorers.creditcoin}${i.creditcoinTx}">creditcoin</a>`
        : '';
      return `<div class="row"><strong>${i.source}</strong> ${i.author ? `@${i.author}` : ''} — ${i.text}<br>${sepolia} ${cc} ${i.error ? `<span class="err">${i.error}</span>` : ''}</div>`;
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
  $('account').textContent = account;
  return signer;
}

$('connect').onclick = () => connect().catch((e) => ($('account').textContent = String(e.message)));

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
    $('account').textContent = `registered @${out.handle} -> ${out.address}`;
    await refreshActivity();
  } catch (e) {
    $('account').textContent = e instanceof Error ? e.message : String(e);
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
    $('faucet-status').innerHTML = `<a href="${out.url}">${out.tx}</a>`;
    await refreshActivity();
  } catch (e) {
    $('faucet-status').textContent = e instanceof Error ? e.message : String(e);
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
    $('send-status').textContent = `locked ${tx.hash} — wait ~8-10 min for attest (keep worker running)`;
    await refreshActivity();
  } catch (e) {
    $('send-status').textContent = e instanceof Error ? e.message : String(e);
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
      $('paste-status').textContent = JSON.stringify(out.result);
    } else {
      const out = await api('/api/command', {
        method: 'POST',
        body: JSON.stringify({ text: raw, execute: false }),
      });
      $('paste-status').textContent = JSON.stringify(out);
    }
    await refreshActivity();
  } catch (e) {
    $('paste-status').textContent = e instanceof Error ? e.message : String(e);
  }
};

void loadCfg().then(refreshActivity);
setInterval(() => void refreshActivity(), 8000);
