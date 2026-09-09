type Cfg = {
  explorers: { sepolia: string; creditcoin: string };
  sepoliaChainId: number;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const $ = (id: string) => document.getElementById(id)!;

const SEPOLIA = {
  chainId: '0xaa36a7',
  chainName: 'Sepolia',
  nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

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

function setStatus(html: string, kind: '' | 'ok' | 'err' = ''): void {
  const el = $('status');
  el.classList.remove('ok', 'err');
  if (kind) {
    el.classList.add(kind);
  }
  el.innerHTML = html;
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

async function loadCfg() {
  cfg = await api('/api/config');
}

async function ensureSepolia(): Promise<void> {
  const eth = window.ethereum!;
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA.chainId }],
    });
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? Number((error as { code: unknown }).code)
        : 0;
    if (code !== 4902) {
      throw error;
    }
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [SEPOLIA],
    });
  }
}

async function connect() {
  if (!window.ethereum) {
    throw new Error('install MetaMask');
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  await ensureSepolia();
  account = accounts[0] ?? '';
  if (!account) {
    throw new Error('no account');
  }
  $('connect').textContent = `${shorten(account)} · Sepolia`;
  return account;
}

$('connect').onclick = () =>
  connect().catch((e) => setStatus(e instanceof Error ? e.message : String(e), 'err'));

$('deposit').onsubmit = async (event) => {
  event.preventDefault();
  const faucet = $('faucet') as HTMLButtonElement;
  faucet.disabled = true;
  try {
    if (!account) {
      await connect();
    }
    const handle = ($('handle') as HTMLInputElement).value.trim();
    if (handle) {
      const registered = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ handle, address: account }),
      });
      setStatus(`registered @${escapeHtml(registered.handle)}`, 'ok');
    }
    const out = await api('/api/faucet', {
      method: 'POST',
      body: JSON.stringify({ address: account }),
    });
    setStatus(
      `+10 mtee <a href="${out.url}" target="_blank" rel="noreferrer">${shorten(out.tx)}</a>`,
      'ok',
    );
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), 'err');
  } finally {
    faucet.disabled = false;
  }
};

void loadCfg();
