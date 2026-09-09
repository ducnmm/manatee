type Cfg = {
  explorers: { sepolia: string; creditcoin: string };
  sepoliaChainId: number;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
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

function setStatus(id: 'status' | 'home-status', html: string, kind: '' | 'ok' | 'err' = ''): void {
  const el = $(id);
  el.classList.remove('ok', 'err');
  if (kind) {
    el.classList.add(kind);
  }
  el.innerHTML = html;
}

function showHome(): void {
  $('home').hidden = false;
  $('dash').hidden = true;
}

function showDash(): void {
  $('home').hidden = true;
  $('dash').hidden = false;
  $('dash-addr').textContent = `${shorten(account)} · Sepolia`;
}

function fmtAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return value;
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

async function refreshDash(): Promise<void> {
  if (!account) {
    return;
  }
  try {
    const bal = await api(`/api/balances?address=${account}`);
    $('bal-eth').textContent = fmtAmount(String(bal.sepoliaEth));
    $('bal-mtee').textContent = fmtAmount(String(bal.sepoliaMtee));
    $('bal-cc3').textContent = fmtAmount(String(bal.creditcoinMtee));
    if (bal.handle) {
      ($('handle') as HTMLInputElement).value = `@${bal.handle}`;
    }
  } catch (error) {
    setStatus('status', error instanceof Error ? error.message : String(error), 'err');
  }
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
    throw new Error('install a wallet (Phantom / MetaMask)');
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  await ensureSepolia();
  account = accounts[0] ?? '';
  if (!account) {
    throw new Error('no account');
  }
  return account;
}

async function enterDash(): Promise<void> {
  showDash();
  await refreshDash();
}

async function resumeSession(): Promise<void> {
  if (!window.ethereum) {
    return;
  }
  const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
  if (!accounts[0]) {
    return;
  }
  account = accounts[0];
  try {
    await ensureSepolia();
  } catch {
    // still open the dashboard; faucet/connect can retry the switch
  }
  await enterDash();
}

function bindProvider(): void {
  window.ethereum?.on?.('accountsChanged', (accounts: unknown) => {
    const list = Array.isArray(accounts) ? (accounts as string[]) : [];
    if (!list[0]) {
      account = '';
      showHome();
      return;
    }
    account = list[0];
    void enterDash();
  });
}

$('connect').onclick = () =>
  connect()
    .then(() => enterDash())
    .catch((e) => setStatus('home-status', e instanceof Error ? e.message : String(e), 'err'));

$('disconnect').onclick = () => {
  account = '';
  setStatus('status', '');
  setStatus('home-status', '');
  showHome();
};

$('home-link').onclick = () => {
  showHome();
};

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
      setStatus('status', `registered @${escapeHtml(registered.handle)}`, 'ok');
    }
    const out = await api('/api/faucet', {
      method: 'POST',
      body: JSON.stringify({ address: account }),
    });
    setStatus(
      'status',
      `+10 mtee <a href="${out.url}" target="_blank" rel="noreferrer">${shorten(out.tx)}</a>`,
      'ok',
    );
    await refreshDash();
  } catch (e) {
    setStatus('status', e instanceof Error ? e.message : String(e), 'err');
  } finally {
    faucet.disabled = false;
  }
};

void loadCfg()
  .then(() => resumeSession())
  .catch((e) => setStatus('home-status', e instanceof Error ? e.message : String(e), 'err'));
bindProvider();
