type Cfg = {
  explorers: { sepolia: string; creditcoin: string };
  sepoliaChainId: number;
  xLogin?: { enabled: boolean; clientId: string; redirectUri: string };
};

type SearchAccount = { handle: string; address: string };

type ActivityItem = {
  at: string;
  kind?: string;
  source: string;
  text: string;
  from?: string;
  to?: string;
  amount?: string;
  handle?: string;
  author?: string;
  sepoliaTx?: string;
  creditcoinTx?: string;
};

type Session = { kind: 'wallet' | 'x'; address: string; handle?: string };

const SESSION_KEY = 'manatee.session';
const PKCE_KEY = 'manatee.pkce';

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

let cfg: Cfg | undefined;
let account = '';
let sessionHandle = '';
let copiedTimer = 0;

function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function loadSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function applySession(session: Session): void {
  account = session.address;
  sessionHandle = session.handle ?? '';
  updateConnectButton();
}

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

function updateConnectButton(): void {
  $('connect').textContent = account ? 'Dashboard' : 'Connect wallet';
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomB64Url(size: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256B64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return b64url(new Uint8Array(digest));
}

function closeAccountMenu(): void {
  $('account-dropdown').classList.remove('is-open');
}

function setView(name: 'home' | 'dash'): void {
  const home = $('home');
  const dash = $('dash');
  const onDash = name === 'dash';
  home.classList.toggle('is-on', !onDash);
  dash.classList.toggle('is-on', onDash);
  home.setAttribute('aria-hidden', onDash ? 'true' : 'false');
  dash.setAttribute('aria-hidden', onDash ? 'false' : 'true');
  home.inert = onDash;
  dash.inert = !onDash;
  if (!onDash) {
    closeAccountMenu();
  }
  updateConnectButton();
}

function showHome(): void {
  setView('home');
}

function showDash(): void {
  $('dash-addr').textContent = shorten(account);
  setView('dash');
}

function showTab(name: 'overview' | 'activity'): void {
  $('overview').classList.toggle('is-on', name === 'overview');
  $('activity').classList.toggle('is-on', name === 'activity');
  $('tab-overview').classList.toggle('on', name === 'overview');
  $('tab-activity').classList.toggle('on', name === 'activity');
}

function fmtAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return value;
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 4 });
}

function relTime(iso: string): string {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) {
    return '';
  }
  const seconds = Math.max(0, Math.floor((Date.now() - stamp) / 1000));
  if (seconds < 45) {
    return 'just now';
  }
  const units: Array<[string, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const unit = units.find(([, size]) => seconds >= size) ?? ['second', 1];
  const value = Math.floor(seconds / unit[1]);
  return `${value} ${unit[0]}${value === 1 ? '' : 's'} ago`;
}

function activityLabel(item: ActivityItem): string {
  if (item.kind === 'faucet') {
    return 'Deposit';
  }
  if (item.kind === 'send') {
    return 'Transfer';
  }
  if (item.kind === 'mint') {
    return 'Mint';
  }
  if (item.kind === 'register') {
    return 'Register';
  }
  const lower = item.text.toLowerCase();
  if (lower.includes('faucet')) {
    return 'Deposit';
  }
  if (lower.includes('send') || lower.includes('lock')) {
    return 'Transfer';
  }
  if (lower.includes('mint')) {
    return 'Mint';
  }
  if (lower.includes('register')) {
    return 'Register';
  }
  return item.text;
}

function activityAmount(item: ActivityItem): string {
  if (!item.amount) {
    if (item.kind === 'faucet' || item.text.toLowerCase().includes('faucet')) {
      return '+10 mtee';
    }
    return '';
  }
  const amount = `${fmtAmount(item.amount)} mtee`;
  const me = account.toLowerCase();
  const mine = sessionHandle.toLowerCase();
  const outgoing =
    item.from?.toLowerCase() === me ||
    (Boolean(mine) && item.author?.toLowerCase() === mine && item.handle?.toLowerCase() !== mine);
  if (item.kind === 'send' && outgoing) {
    return `-${amount}`;
  }
  if (
    item.kind === 'faucet' ||
    item.kind === 'mint' ||
    item.to?.toLowerCase() === me ||
    (Boolean(mine) && item.handle?.toLowerCase() === mine)
  ) {
    return `+${amount}`;
  }
  return amount;
}

function renderActivity(items: ActivityItem[]): void {
  const list = $('activity-list');
  list.replaceChildren();
  for (const item of items.slice(0, 20)) {
    const href = item.sepoliaTx
      ? `${cfg?.explorers.sepolia ?? 'https://sepolia.etherscan.io/tx/'}${item.sepoliaTx}`
      : item.creditcoinTx
        ? `${cfg?.explorers.creditcoin ?? 'https://creditcoin-testnet.blockscout.com/tx/'}${item.creditcoinTx}`
        : '';
    const row = document.createElement(href ? 'a' : 'div');
    if (href && row instanceof HTMLAnchorElement) {
      row.href = href;
      row.target = '_blank';
      row.rel = 'noreferrer';
    }
    const title = document.createElement('span');
    title.textContent = activityLabel(item);
    const meta = document.createElement('span');
    meta.className = 'meta';
    const amountText = activityAmount(item);
    if (amountText) {
      const amount = document.createElement('strong');
      amount.textContent = amountText;
      meta.append(amount);
    }
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = relTime(item.at);
    meta.append(when);
    row.append(title, meta);
    list.append(row);
  }
}

function renderResults(accounts: SearchAccount[], query: string): void {
  const list = $('search-results');
  list.replaceChildren();
  $('home').classList.toggle('has-results', accounts.length > 0);
  if (accounts.length === 0) {
    setStatus('home-status', `No accounts found for “${escapeHtml(query)}”`, 'err');
    return;
  }
  setStatus('home-status', '');
  for (const row of accounts) {
    const item = document.createElement('li');
    const handle = document.createElement('span');
    handle.textContent = `@${row.handle}`;
    const address = document.createElement('strong');
    address.textContent = shorten(row.address);
    item.append(handle, address);
    item.onclick = () => {
      void openHandleDash(row.handle, row.address);
    };
    list.append(item);
  }
}

async function openHandleDash(handle: string, address: string): Promise<void> {
  applySession({ kind: 'x', address, handle });
  saveSession({ kind: 'x', address, handle });
  await enterDash();
}

async function refreshDash(): Promise<void> {
  if (!account) {
    return;
  }
  try {
    const activityPath = sessionHandle
      ? `/api/activity?handle=${encodeURIComponent(sessionHandle)}`
      : `/api/activity?address=${account}`;
    const [bal, activity] = await Promise.all([
      api(`/api/balances?address=${account}`),
      api(activityPath),
    ]);
    const mtee = fmtAmount(String(bal.sepoliaMtee));
    $('hero-mtee').textContent = mtee;
    $('bal-eth').textContent = fmtAmount(String(bal.sepoliaEth));
    $('bal-mtee').textContent = mtee;
    $('bal-cc3').textContent = fmtAmount(String(bal.creditcoinMtee));
    const shownHandle = sessionHandle || bal.handle;
    $('dash-addr').textContent = shownHandle ? `@${shownHandle}` : shorten(account);
    $('wallet-label').textContent = shownHandle
      ? `@${shownHandle} · ${shorten(account)}`
      : `Connected · ${shorten(account)}`;
    renderActivity(Array.isArray(activity) ? (activity as ActivityItem[]) : []);
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
  const login = $('login-x') as HTMLButtonElement;
  login.hidden = !cfg?.xLogin?.enabled;
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
  sessionHandle = '';
  saveSession({ kind: 'wallet', address: account });
  updateConnectButton();
  return account;
}

async function enterDash(): Promise<void> {
  if (!account) {
    await connect();
  }
  showDash();
  showTab('overview');
  try {
    await ensureSepolia();
  } catch {
    // still show the dashboard; faucet can retry the switch
  }
  await refreshDash();
}

async function resumeSession(): Promise<void> {
  const saved = loadSession();
  if (saved?.address) {
    applySession(saved);
    return;
  }
  if (!window.ethereum) {
    return;
  }
  const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
  if (!accounts[0]) {
    return;
  }
  applySession({ kind: 'wallet', address: accounts[0] });
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
    sessionHandle = '';
    saveSession({ kind: 'wallet', address: account });
    updateConnectButton();
    if ($('dash').classList.contains('is-on')) {
      void enterDash();
    }
  });
}

async function copyAddress(): Promise<void> {
  if (!account) {
    return;
  }
  await navigator.clipboard.writeText(account);
  const label = $('copy-addr');
  const prev = label.textContent;
  label.textContent = 'Copied';
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    label.textContent = prev || 'Copy address';
  }, 1600);
}

$('connect').onclick = () =>
  enterDash().catch((e) => setStatus('home-status', e instanceof Error ? e.message : String(e), 'err'));

$('account-trigger').onclick = (event) => {
  event.stopPropagation();
  $('account-dropdown').classList.toggle('is-open');
};

$('copy-addr').onclick = () => {
  void copyAddress();
};

$('wallet-bar').onclick = () => {
  void copyAddress();
};

$('disconnect').onclick = () => {
  account = '';
  sessionHandle = '';
  clearSession();
  setStatus('status', '');
  setStatus('home-status', '');
  showHome();
};

async function startXLogin(): Promise<void> {
  const oauth = cfg?.xLogin;
  if (!oauth?.enabled || !oauth.clientId || !oauth.redirectUri) {
    throw new Error('X login is not configured');
  }
  const verifier = randomB64Url(32);
  const state = randomB64Url(16);
  const challenge = await sha256B64Url(verifier);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

async function finishXLogin(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code) {
    return false;
  }
  window.history.replaceState({}, '', '/');
  const stored = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  const pkce = stored ? (JSON.parse(stored) as { verifier?: string; state?: string }) : {};
  if (!pkce.verifier || !pkce.state || pkce.state !== state) {
    throw new Error('X login expired — try Continue with X again');
  }
  const redirectUri = cfg?.xLogin?.redirectUri;
  if (!redirectUri) {
    throw new Error('X login is not configured');
  }
  const out = await api('/api/auth/x', {
    method: 'POST',
    body: JSON.stringify({
      code,
      code_verifier: pkce.verifier,
      redirect_uri: redirectUri,
    }),
  });
  await openHandleDash(String(out.handle), String(out.address));
  return true;
}

$('login-x').onclick = () =>
  startXLogin().catch((e) => setStatus('home-status', e instanceof Error ? e.message : String(e), 'err'));

$('home-link').onclick = () => {
  showHome();
};

$('tab-overview').onclick = () => showTab('overview');
$('tab-activity').onclick = () => showTab('activity');

document.addEventListener('click', (event) => {
  if (!$('account-menu').contains(event.target as Node)) {
    closeAccountMenu();
  }
});

$('home-search').onsubmit = async (event) => {
  event.preventDefault();
  const query = ($('query') as HTMLInputElement).value.trim();
  if (!query) {
    return;
  }
  try {
    const out = await api(`/api/search?q=${encodeURIComponent(query)}`);
    renderResults((out.accounts ?? []) as SearchAccount[], query);
  } catch (error) {
    $('search-results').replaceChildren();
    $('home').classList.remove('has-results');
    setStatus('home-status', error instanceof Error ? error.message : String(error), 'err');
  }
};

$('faucet').onclick = async () => {
  const faucet = $('faucet') as HTMLButtonElement;
  faucet.disabled = true;
  try {
    if (!account) {
      await connect();
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
  .then(async () => {
    if (await finishXLogin()) {
      return;
    }
    await resumeSession();
  })
  .catch((e) => setStatus('home-status', e instanceof Error ? e.message : String(e), 'err'));
bindProvider();
