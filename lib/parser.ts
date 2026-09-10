import { isAddress } from 'ethers';

export type ParsedCommand =
  | { kind: 'send'; amount: string; coin: 'mtee'; handle: string }
  | { kind: 'register'; handle?: string; address: string };

const AMOUNT_RE = /^[0-9]+(\.[0-9]+)?$/;
const ZERO_AMOUNT_RE = /^0+(\.0+)?$/;
const HANDLE_RE = /^@[a-zA-Z0-9_]+$/;

export function parseCommand(text: string): ParsedCommand {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error('empty command');
  }

  // X prepends parent-thread mentions on replies, e.g.
  // `@ManateeWallet @AJEnglish @ManateeWallet send 1 mtee @AJEnglish`.
  let rest = tokens;
  while (rest.length > 0 && HANDLE_RE.test(rest[0]!)) {
    rest = rest.slice(1);
  }
  if (rest.length === 0) {
    throw new Error('empty command');
  }

  const verb = rest[0]!.toLowerCase();
  const args = rest.slice(1);

  if (verb === 'send') {
    return parseSend(args);
  }
  if (verb === 'register') {
    return parseRegister(args);
  }
  throw new Error(`unknown command: ${verb}`);
}

function parseSend(tokens: string[]): ParsedCommand {
  if (tokens.length > 3) {
    throw new Error('unexpected extra tokens');
  }

  const amount = tokens[0];
  const coin = tokens[1];
  const handle = tokens[2];

  if (amount === undefined) {
    throw new Error('missing amount');
  }
  if (coin === undefined || coin.startsWith('@')) {
    throw new Error('missing coin');
  }
  if (handle === undefined) {
    throw new Error('missing handle');
  }

  if (!AMOUNT_RE.test(amount) || ZERO_AMOUNT_RE.test(amount)) {
    throw new Error('amount must be a positive decimal');
  }

  const coinLc = coin.toLowerCase();
  if (coinLc === 'ctc') {
    throw new Error('ctc is gas');
  }
  if (coinLc !== 'mtee') {
    throw new Error('coin not allowed');
  }

  if (!HANDLE_RE.test(handle)) {
    throw new Error('invalid handle');
  }

  return {
    kind: 'send',
    amount,
    coin: 'mtee',
    handle: handle.slice(1).toLowerCase(),
  };
}

function parseRegister(tokens: string[]): ParsedCommand {
  if (tokens.length === 0) {
    throw new Error('missing address');
  }
  if (tokens.length > 2) {
    throw new Error('unexpected extra tokens');
  }

  if (tokens.length === 1) {
    const address = tokens[0]!;
    if (!isAddress(address)) {
      throw new Error('invalid address');
    }
    return { kind: 'register', address };
  }

  const handleTok = tokens[0]!;
  const address = tokens[1]!;
  if (!HANDLE_RE.test(handleTok)) {
    throw new Error('invalid handle');
  }
  if (!isAddress(address)) {
    throw new Error('invalid address');
  }
  return {
    kind: 'register',
    handle: handleTok.slice(1).toLowerCase(),
    address,
  };
}
