# How manatee uses Attestcoin

This is the protocol map for this repo. It is not a substitute for the Gluwa tutorials. Read those first if the names below are new.

manatee is a testnet dApp: Foundry + the Gluwa examples + CC3 testnet. It is not a production bridge.

## What Attestcoin is doing here

1. User (X or web) locks allowlisted `mtee` in `ManateeLock` on **Ethereum Sepolia**.
2. That tx emits `TokensSentForBridging(from, to, token, amount)`.
3. Off-chain code waits until Creditcoin attestors have that Sepolia **block**, then asks the proof builder for Merkle + continuity proofs of the **transaction**.
4. `ManateeMint` on **Creditcoin CC3 testnet** calls the Block Prover precompile with those proofs, decodes the receipt, and mints only if the checks below pass.

The tweet/web command never settles. The worker never chooses `to` or `token` at mint time. CTC pays Creditcoin gas.

## chainKey vs chainId

Attestcoin identifies a source chain by **chain key**, not by EVM `chainId`.

| Network | EVM chainId | Attestcoin chainKey (CC3 testnet) |
|---|---|---|
| Ethereum Sepolia | `11155111` | **`1`** |
| Ethereum mainnet (testnet table) | `1` | `3` |

This repo sets `SOURCE_CHAIN_KEY=1`. Using `11155111` as the chain key will not attest Sepolia.

`chainId` still appears inside the encoded EVM transaction bytes. The oracle API, `waitUntilHeightAttested`, `getProof`, and `verifyAndEmit` all take **chainKey**.

CC3 testnet endpoints this repo uses:

| Piece | Value |
|---|---|
| Creditcoin RPC | `https://rpc.cc3-testnet.creditcoin.network` |
| Proof builder | `https://prover.cc3-testnet.creditcoin.network` |
| Sepolia chainKey | `1` |

Gluwa’s TypeScript examples use that proof-builder host. Some Attestcoin docs pages list `https://proof-gen-api.cc3-testnet.creditcoin.network/` instead. Use the URL in `.env.example`.

## Block Prover precompile

On Creditcoin the verifier is a precompile, not a contract you deploy:

```
0x0000000000000000000000000000000000000FD2
```

(4050 decimal. Older Gluwa text still says “Native Query Verifier”; same address.)

`ASCBase` binds `VERIFIER` to that address and calls `verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof)`.

That call checks:

- the encoded tx is in that source-chain block (Merkle proof)
- that block is on the attested chain (continuity proof)

It does **not** check whether the source tx succeeded. See [receipt status](#receipt-status) below.

`verifyAndEmit` after attest typically lands in ~1 Creditcoin block (~15s). That is separate from the **~8–10 minute** attest delay on Sepolia.

## Decoder library (testnet)

`ManateeMint` uses `EvmV1Decoder` from `@gluwa/usc-contracts` to read type, receipt, and logs out of the verified tx bytes.

On CC3 **testnet** that library is already deployed:

```
0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f
```

It is a Solidity **library**. `forge script` must **link** it:

```bash
forge script script/DeployCreditcoin.s.sol --profile creditcoin --broadcast ...
```

`[profile.creditcoin]` in `contracts/foundry.toml` links that address. Local `forge test` uses `[profile.default]` and deploys a decoder on anvil. Do not `forge create` a new decoder on CC3. Deploying it burns faucet CTC that you need for `verifyAndEmit` (~9 queries per 100 CTC / 24h).

Mainnet has a different decoder address. This repo targets CC3 testnet only.

## Proof builder: wait, then getProof

`lib/proof.ts` uses `@gluwa/usc-sdk` 0.18.0:

```ts
const proofBuilder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);
await proofBuilder.waitUntilHeightAttested(chainKey, blockNumber, 15_000, 1_200_000);
const result = await proofBuilder.getProof(txHash);
```

- `waitUntilHeightAttested(chainKey, height)` polls the proof builder until its attested-height cache is ≥ the Sepolia block that contains the lock tx. Official Gluwa text: for a slow source chain such as Sepolia this is **~8–10 minutes**, to survive source-chain reorgs. It is not “CTC is slow.”
- `getProof(txHash)` returns Merkle siblings + continuity roots + encoded tx bytes for that hash.

This repo’s wait timeout is 20 minutes (`1_200_000` ms). The SDK default is 15 minutes.

Sepolia confirm (seconds) is not attest. After lock the bot replies “submitted, waiting Attestcoin confirm” and does not mint until `getProof` succeeds.

## `ASCBase.execute` proof arguments

Do not invent a new proof ABI. The worker calls `execute` with the Gluwa `ASCBase` argument list. `action = 0` is `ManateeMint.MinterActions.Mint`.

```solidity
function execute(
    uint8 action,
    uint64 chainKey,
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    bytes32 merkleRoot,
    INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
    bytes32 lowerEndpointDigest,
    bytes32[] calldata continuityRoots
) external returns (bool success);
```

Mapping from `@gluwa/usc-sdk` `getProof` data (`lib/proof.ts`):

| `execute` arg | Proof field |
|---|---|
| `action` | `0` (Mint) |
| `chainKey` | `proof.chainKey` |
| `blockHeight` | `proof.headerNumber` |
| `encodedTransaction` | `proof.txBytes` |
| `merkleRoot` | `proof.merkleProof.root` |
| `siblings` | `proof.merkleProof.siblings` (`hash`, `isLeft`) |
| `lowerEndpointDigest` | `proof.continuityProof.lowerEndpointDigest` |
| `continuityRoots` | `proof.continuityProof.roots` |

`mintFromQuery(...)` is an alias on `ManateeMint`. It forwards to `this.execute(uint8(MinterActions.Mint), …)` with the **same** seven proof fields (no extra args). Off-chain code calls `execute` directly.

`ASCBase` order of work in that tx:

1. Replay key (below). Revert if already processed.
2. `VERIFIER.verifyAndEmit(...)`.
3. Mark `processedQueries[queryId] = true`.
4. `_processAndEmitEvent` → `ManateeMint._processMint`.

## Receipt status

The precompile only proves **inclusion** of the tx bytes in an attested block. A reverted Sepolia tx is still included (`receiptStatus == 0`).

Gluwa’s ASC docs require the dApp to check status (`0x1` = success). `ManateeMint._processMint` does:

```solidity
EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
require(receipt.receiptStatus == 1, "Transaction did not succeed");
```

Foundry test: `test_executeRevertsBadReceiptStatus`.

## Replay key

`ASCBase._computeQueryId`:

```text
queryId = keccak256(chainKey || blockHeight || txIndex)   // 72-byte packed encode
```

`txIndex` comes from `VERIFIER.calculateTxIndex(merkleProof)` (path through the Merkle siblings), not from calldata the worker can pick freely.

Same source tx cannot mint twice. Second `execute` reverts `Query already processed`.

## Event: `TokensSentForBridging` vs Gluwa `TokensBurnedForBridging`

This is the product difference versus the Gluwa minter example (and versus mint-to-self).

Gluwa `TestERC20` / `ASCMinter` (tutorials 1–3):

```text
TokensBurnedForBridging(address from, uint256 amount)
```

- Emitted by the **token**.
- Indexed `from` = burner.
- Amount in log data. Token identity = `log.address_`.
- ASC mints the wrapped token **to `from`** (mint-to-self). No recipient field.

manatee `ManateeLock`:

```text
TokensSentForBridging(address indexed from, address indexed to, address indexed token, uint256 amount)
```

- Emitted by the **lock vault**, not the ERC20.
- `to` and `token` are in the event.
- `send` does `transferFrom` into the vault (lock), not a burn.
- `ManateeMint` requires `log.address_ == lockAddress`, reads `to` from `topics[2]`, `token` from `topics[3]`, `amount` from data, maps `token` → Creditcoin ERC20, and `mint(to, amount)`.

Worker calldata cannot retarget the mint. A log from the wrong contract, a failed receipt, or an unmapped token reverts.

P0 allowlist is `mtee` on both chains. Adding a ticker later is another `allowed[token]` + `mapToken` pair; the event already has `token`.

## Faucet limits — do not spam verify

Creditcoin Discord [`/faucet`](https://discord.com/channels/762302877518528522/1463257679827828962) yields **100 test CTC / 24h**, enough for about **9** `verifyAndEmit` calls. Testnet oracle fees are high on purpose. Sepolia ETH: [Google faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia).

Do not:

- Redeploy `EvmV1Decoder`.
- Loop `execute` against the same tx (replay wastes the first query’s CTC, then reverts).
- Hammer the proof builder or minter while waiting for attest.

Sepolia ETH is only for approve + `ManateeLock.send`. CTC is not a bridge asset.

## Official tutorials

Follow these, then compare this repo’s event:

1. [Hello Bridge](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/hello-bridge/README.md) — burn on Sepolia, `getProof`, mint BTKT on CC3.
2. [Custom Contracts Bridging](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/custom-contracts-bridging/README.md) — your ASC + `EvmV1Decoder` link.
3. [Bridge Offchain Worker](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/bridge-offchain-worker/README.md) — watch source events, submit proofs.
4. [`ASCMinter.sol`](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/contracts/sol/ASCMinter.sol) — `receiptStatus`, decoder, mint-to-self burn event.

Related docs:

- [Attestcoin smart contracts](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.md) (precompile does not check receipt status).
- [CC3 environments](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments.md) (chain keys, decoder, precompile).
