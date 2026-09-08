import { Contract, EventLog, JsonRpcProvider, Wallet } from 'ethers';

import { LOCK_ABI } from '../lib/abi';
import { patchActivityBySepolia } from '../lib/activity';
import { mintOnCreditcoin } from '../lib/bridge';
import { creditcoinTxUrl, loadConfig, requireWorker, sepoliaTxUrl } from '../lib/config';

const POLLING_INTERVAL_MS = 5000;
const ERROR_BACKOFF_MS = 10_000;
const MAX_MINT_ATTEMPTS = 3;

let stopping = false;

process.on('SIGINT', () => {
  console.log('\nSIGINT — stopping after current poll');
  stopping = true;
});

process.on('SIGTERM', () => {
  console.log('\nSIGTERM — stopping after current poll');
  stopping = true;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollEvents(
  contract: Contract,
  eventName: string,
  fromBlock: number,
  handler: (event: EventLog) => Promise<void>,
): Promise<number> {
  try {
    const currentBlock = await contract.runner?.provider?.getBlockNumber();
    if (currentBlock === undefined || currentBlock === null || currentBlock < fromBlock) {
      return fromBlock;
    }

    const events = await contract.queryFilter(eventName, fromBlock, currentBlock);
    for (const event of events) {
      if (event instanceof EventLog) {
        await handler(event);
      }
    }
    return currentBlock + 1;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error polling ${eventName}: ${message}`);
    await sleep(ERROR_BACKOFF_MS);
    return fromBlock;
  }
}

export async function startChainWorker(): Promise<void> {
  const cfg = requireWorker(loadConfig());

  const sepolia = new JsonRpcProvider(cfg.sourceRpc);
  const creditcoin = new JsonRpcProvider(cfg.creditcoinRpc);
  const wallet = new Wallet(cfg.privateKey, creditcoin);
  const lock = new Contract(cfg.sepoliaLock, LOCK_ABI, sepolia);

  const fromEnv = process.env.WORKER_FROM_BLOCK?.trim();
  const parsedFrom = fromEnv ? Number(fromEnv) : Number.NaN;
  let fromBlock = Number.isInteger(parsedFrom) ? parsedFrom : await sepolia.getBlockNumber();

  const processed = new Set<string>();
  const attempts = new Map<string, number>();
  const pending = new Set<string>();

  async function proveTx(txHash: string): Promise<void> {
    if (processed.has(txHash)) {
      pending.delete(txHash);
      return;
    }
    try {
      const minted = await mintOnCreditcoin(txHash);
      processed.add(txHash);
      pending.delete(txHash);
      attempts.delete(txHash);
      patchActivityBySepolia(txHash, { creditcoinTx: minted.txHash });
      console.log(creditcoinTxUrl(minted.txHash));
      if (minted.mintEvent) {
        console.log(
          `minted to=${minted.mintEvent.to} amount=${minted.mintEvent.amount.toString()} token=${minted.mintEvent.token}`,
        );
      } else {
        console.log('minted');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already processed/i.test(message)) {
        processed.add(txHash);
        pending.delete(txHash);
        console.log(`already minted (replay guard): ${txHash}`);
        return;
      }
      const n = (attempts.get(txHash) ?? 0) + 1;
      attempts.set(txHash, n);
      console.error(`failed to prove/mint ${txHash} (${n}/${MAX_MINT_ATTEMPTS}): ${message}`);
      if (n >= MAX_MINT_ATTEMPTS) {
        processed.add(txHash);
        pending.delete(txHash);
        console.error(`giving up on ${txHash} after ${n} attempts`);
      } else {
        pending.add(txHash);
      }
    }
  }

  console.log('manatee worker: watching TokensSentForBridging (any sender)');
  console.log(`lock ${cfg.sepoliaLock} from block ${fromBlock}`);
  console.log(`minter ${cfg.creditcoinMint} signer ${wallet.address}`);

  while (!stopping) {
    for (const txHash of [...pending]) {
      if (stopping) {
        break;
      }
      await proveTx(txHash);
    }

    fromBlock = await pollEvents(lock, 'TokensSentForBridging', fromBlock, async (event) => {
      const txHash = event.transactionHash;
      if (processed.has(txHash) || pending.has(txHash)) {
        return;
      }

      const from = String(event.args[0]);
      const to = String(event.args[1]);
      const token = String(event.args[2]);
      const amount = event.args[3] as bigint;

      console.log(
        `TokensSentForBridging from=${from} to=${to} token=${token} amount=${amount.toString()} tx=${txHash}`,
      );
      console.log(sepoliaTxUrl(txHash));
      await proveTx(txHash);
    });

    if (!stopping) {
      await sleep(POLLING_INTERVAL_MS);
    }
  }

  console.log('worker stopped');
}

const entry = process.argv[1]?.replace(/\\/g, '/');
if (entry?.endsWith('worker/index.ts') || entry?.endsWith('worker/index.js')) {
  startChainWorker().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
