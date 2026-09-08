import { Contract, JsonRpcProvider, Wallet, type TransactionReceipt } from 'ethers';

import { LOCK_ABI, MINT_ABI, TOKEN_ABI } from './abi';
import { loadConfig, requireRuntime, requireSepoliaSend } from './config';
import {
  computeGasLimitForMinter,
  generateProofFor,
  submitProofToMinterAndAwait,
  type MintResult,
} from './proof';

export type LockSendResult = {
  txHash: string;
  receipt: TransactionReceipt;
};

export async function sendOnSepolia(args: {
  token: string;
  to: string;
  amountWei: bigint;
}): Promise<LockSendResult> {
  const cfg = requireSepoliaSend(loadConfig());
  const provider = new JsonRpcProvider(cfg.sourceRpc);
  const signer = new Wallet(cfg.privateKey, provider);
  const token = new Contract(args.token, TOKEN_ABI, signer);
  const lock = new Contract(cfg.sepoliaLock, LOCK_ABI, signer);

  const allowance = (await token.allowance(signer.address, cfg.sepoliaLock)) as bigint;
  if (allowance < args.amountWei) {
    const approveTx = await token.approve(cfg.sepoliaLock, args.amountWei);
    const approveReceipt = (await approveTx.wait()) as TransactionReceipt | null;
    if (!approveReceipt || approveReceipt.status !== 1) {
      throw new Error('mtee approve failed');
    }
  }

  const sendTx = await lock.send(args.token, args.to, args.amountWei);
  const receipt = (await sendTx.wait()) as TransactionReceipt | null;
  if (!receipt || receipt.status !== 1) {
    throw new Error('lock.send failed');
  }
  return { txHash: sendTx.hash as string, receipt };
}

const mintInflight = new Map<string, Promise<MintResult>>();

export async function mintOnCreditcoin(sepoliaTxHash: string): Promise<MintResult> {
  const key = sepoliaTxHash.toLowerCase();
  const existing = mintInflight.get(key);
  if (existing) {
    return existing;
  }
  const pending = mintOnCreditcoinUncached(sepoliaTxHash).catch((error: unknown) => {
    mintInflight.delete(key);
    throw error;
  });
  mintInflight.set(key, pending);
  return pending;
}

async function mintOnCreditcoinUncached(sepoliaTxHash: string): Promise<MintResult> {
  const cfg = requireRuntime(loadConfig());
  if (!cfg.creditcoinMint) {
    throw new Error('deploy first / set .env (missing CREDITCOIN_MINT)');
  }

  const source = new JsonRpcProvider(cfg.sourceRpc);
  const creditcoin = new JsonRpcProvider(cfg.creditcoinRpc);
  const wallet = new Wallet(cfg.privateKey, creditcoin);
  const minter = new Contract(cfg.creditcoinMint, MINT_ABI, wallet);

  const proof = await generateProofFor(
    sepoliaTxHash,
    cfg.sourceChainKey,
    cfg.proofBuilderUrl,
    creditcoin,
    source,
  );
  const gasLimit = await computeGasLimitForMinter(creditcoin, minter, proof, wallet.address);
  return submitProofToMinterAndAwait(minter, proof, gasLimit);
}
