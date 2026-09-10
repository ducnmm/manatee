import { parseUnits } from 'ethers';

import { mintOnCreditcoin, sendOnSepolia } from './bridge';
import { loadConfig, requireDeployed } from './config';
import { parseCommand } from './parser';
import { ensureHandle, registerHandle } from './registry';

export type CommandOutcome =
  | { kind: 'register'; handle: string; address: string }
  | {
      kind: 'send';
      amount: string;
      coin: 'mtee';
      handle: string;
      to: string;
      amountWei: string;
      created?: boolean;
      sepoliaTx?: string;
      creditcoinTx?: string;
    };

export async function handleCommand(args: {
  text: string;
  author?: string;
  execute?: boolean;
  onLocked?: (sepoliaTx: string) => Promise<void> | void;
}): Promise<CommandOutcome> {
  const parsed = parseCommand(args.text);

  if (parsed.kind === 'register') {
    const handle = parsed.handle ?? args.author;
    if (!handle) {
      throw new Error('register needs @handle or tweet author');
    }
    const address = registerHandle(handle, parsed.address);
    return { kind: 'register', handle, address };
  }

  const cfg = loadConfig();
  if (!cfg.privateKey) {
    throw new Error('PRIVATE_KEY required to resolve handles');
  }
  const ensured = ensureHandle(parsed.handle, cfg.privateKey);
  const to = ensured.address;
  const amountWei = parseUnits(parsed.amount, 18);
  const outcome: CommandOutcome = {
    kind: 'send',
    amount: parsed.amount,
    coin: 'mtee',
    handle: parsed.handle,
    to,
    created: ensured.created,
    amountWei: amountWei.toString(),
  };

  if (!args.execute) {
    return outcome;
  }

  const deployed = requireDeployed(loadConfig());
  const locked = await sendOnSepolia({ token: deployed.sepoliaMtee, to, amountWei });
  outcome.sepoliaTx = locked.txHash;
  await args.onLocked?.(locked.txHash);
  const minted = await mintOnCreditcoin(locked.txHash);
  outcome.creditcoinTx = minted.txHash;
  return outcome;
}
