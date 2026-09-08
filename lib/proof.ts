import {
  Contract,
  type ContractTransactionResponse,
  type JsonRpcApiProvider,
  type Log,
  type LogDescription,
  type TransactionReceipt,
} from 'ethers';
import { chainInfo, proofProvider } from '@gluwa/usc-sdk';

export type ContinuityResponse = proofProvider.ContinuityResponse;

export type MintEvent = {
  token: string;
  to: string;
  amount: bigint;
  queryId: string;
};

export type MintResult = {
  txHash: string;
  receipt: TransactionReceipt;
  mintEvent: MintEvent | null;
};

const MINT_ACTION = 0;
const GAS_BUFFER_MULTIPLIER = 135n;
const POLL_MS = 15_000;
const ATTEST_WAIT_MS = 1_200_000;

function shortError(error: unknown): string {
  if (error && typeof error === 'object' && 'shortMessage' in error) {
    return String((error as { shortMessage: unknown }).shortMessage);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function generateProofFor(
  txHash: string,
  chainKey: number,
  proofBuilderUrl: string,
  creditcoinRpc: JsonRpcApiProvider,
  sourceChainRpc: JsonRpcApiProvider,
): Promise<ContinuityResponse> {
  const transaction = await sourceChainRpc.getTransaction(txHash);
  if (!transaction) {
    throw new Error(`transaction ${txHash} does not exist on source chain`);
  }
  const blockNumber = transaction.blockNumber;
  if (blockNumber === null || blockNumber === undefined) {
    throw new Error(`transaction ${txHash} is not yet mined on source chain`);
  }

  const proofBuilder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);
  const info = new chainInfo.PrecompileChainInfoProvider(creditcoinRpc);

  console.log('locked, waiting for attest (~8-10 min)');
  console.log(`waiting for sepolia block ${blockNumber} to be attested on Creditcoin`);

  const latest = await info.getLatestAttestedHeightAndHash(chainKey);
  if (latest.exists) {
    console.log(`latest attested height for chainKey ${chainKey}: ${latest.height}`);
  } else {
    console.log(`latest attested height for chainKey ${chainKey}: none yet`);
  }

  await proofBuilder.waitUntilHeightAttested(chainKey, blockNumber, POLL_MS, ATTEST_WAIT_MS);

  const result = await proofBuilder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(result.error ?? `proof generation failed for ${txHash}`);
  }
  return result.data;
}

async function computeGasLimit(
  provider: JsonRpcApiProvider,
  contract: Contract,
  data: string,
  from: string,
  continuityLength: number,
): Promise<bigint> {
  console.log('estimating gas for minter execute');
  try {
    const to = await contract.getAddress();
    const estimatedGas = await provider.estimateGas({ to, data, from });
    const gasLimit = (estimatedGas * GAS_BUFFER_MULTIPLIER) / 100n;
    console.log(`estimated gas ${estimatedGas.toString()}, limit with 35% buffer ${gasLimit.toString()}`);
    return gasLimit;
  } catch (error) {
    const calculatedGas = 800_000n;
    console.warn(`gas estimation failed: ${shortError(error)}`);
    console.log(
      `using fallback gas limit ${calculatedGas.toString()} (${continuityLength} continuity blocks); Gluwa estimateGas often fails on the precompile`,
    );
    return calculatedGas;
  }
}

function encodeExecute(contract: Contract, proofData: ContinuityResponse): string {
  const siblings = proofData.merkleProof.siblings.map((s) => ({
    hash: s.hash,
    isLeft: s.isLeft,
  }));
  return contract.interface.encodeFunctionData('execute', [
    MINT_ACTION,
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof.root,
    siblings,
    proofData.continuityProof.lowerEndpointDigest,
    proofData.continuityProof.roots,
  ]);
}

export async function computeGasLimitForMinter(
  provider: JsonRpcApiProvider,
  contract: Contract,
  proofData: ContinuityResponse,
  signerAddress: string,
): Promise<bigint> {
  const data = encodeExecute(contract, proofData);
  const continuityLength = proofData.continuityProof.roots?.length || 1;
  return computeGasLimit(provider, contract, data, signerAddress, continuityLength);
}

export async function submitProofToMinter(
  minterContract: Contract,
  proofData: ContinuityResponse,
  gasLimit: bigint,
): Promise<ContractTransactionResponse> {
  const siblings = proofData.merkleProof.siblings.map((s) => ({
    hash: s.hash,
    isLeft: s.isLeft,
  }));
  return minterContract.execute(
    MINT_ACTION,
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof.root,
    siblings,
    proofData.continuityProof.lowerEndpointDigest,
    proofData.continuityProof.roots,
    { gasLimit },
  ) as Promise<ContractTransactionResponse>;
}

export async function submitProofToMinterAndAwait(
  minterContract: Contract,
  proofData: ContinuityResponse,
  gasLimit: bigint,
): Promise<MintResult> {
  const response = await submitProofToMinter(minterContract, proofData, gasLimit);
  const txHash = response.hash;
  console.log(`proof submitted: ${txHash}`);
  console.log('waiting for Creditcoin receipt (do not treat Sepolia lock as minted)');

  const receipt = await response.wait();
  if (!receipt) {
    throw new Error(`minter execute ${txHash} returned no receipt`);
  }
  if (receipt.status !== 1) {
    throw new Error(`minter execute ${txHash} reverted (status=${receipt.status})`);
  }

  const tokensMintedEvent = receipt.logs
    .map((log: Log): LogDescription | null => {
      try {
        return minterContract.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find((parsed): parsed is LogDescription => parsed?.name === 'TokensMinted');

  let mintEvent: MintEvent | null = null;
  if (tokensMintedEvent) {
    const token = String(tokensMintedEvent.args[0]);
    const to = String(tokensMintedEvent.args[1]);
    const amount = BigInt(tokensMintedEvent.args[2]);
    const queryId = String(tokensMintedEvent.args[3]);
    mintEvent = { token, to, amount, queryId };
    console.log(`minted token=${token} to=${to} amount=${amount.toString()} queryId=${queryId}`);
  } else {
    console.log('Creditcoin tx mined but TokensMinted event not found');
  }

  return { txHash, receipt, mintEvent };
}
