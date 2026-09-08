# manatee P0 — PM brief

One function: `@manatee send 10 mtee @bob` → lock on Sepolia → Attestcoin proof → mint on Creditcoin CC3 testnet. Tweet syntax is UX. Money only moves after Attestcoin verifies the Sepolia tx.

## In scope (ship this)

- `mtee` only (18 decimals, we mint on both chains)
- Foundry contracts: `ManateeLock` (Sepolia) + `ManateeMint` (Creditcoin ASC) + `ManateeToken`
- Event `TokensSentForBridging(from, to, token, amount)` — recipient + token in the event
- File registry `registry.json` + CLI `register | send | status`
- Worker: watch lock event → wait attest ~8–10 min → `getProof` → `execute` on minter
- Shared parser for tweet-shaped commands
- README + `docs/attestcoin.md`
- `forge test` with verifier mocks: happy path, replay, `receiptStatus != 1`, wrong lock address

## Out of scope (do not build)

X bot, USDC/USDT, web UI, on-chain names, reverse bridge, native ETH/CTC send, arbitrary ERC20, prediction/TEE/Sui, copying dugong.

## Trust model

| Signal | Who is trusted |
|---|---|
| `@bob` + ticker on the command | Worker, only to *build* the Sepolia tx |
| `to`, `amount`, `token` | Sepolia event, after Attestcoin verify |
| Replay | `processedQueries` on ASC |
| Tx success | `receiptStatus == 1` (precompile does not check this) |

Worker must not choose recipient or token at mint time.

## Interfaces (do not drift)

### Parser

```
[@manatee] send <amount> <coin> @handle
[@manatee] register <0xaddress>          # tweet form; CLI also: register @handle 0xaddress
```

- `<coin>` required. P0 allowlist: `mtee` only.
- `ctc` → reject, hint "ctc is gas".
- `eth` / unknown ticker → reject.
- Amount: positive decimal string, no float math; parse with ethers `parseUnits` at 18 decimals for mtee.

### ManateeLock (Sepolia)

```solidity
event TokensSentForBridging(address indexed from, address indexed to, address indexed token, uint256 amount);
function send(address token, address to, uint256 amount) external;
function setAllowed(address token, bool allowed) external; // owner
```

`send`: `allowed[token]`, `to != 0`, `amount > 0`, `transferFrom` into the vault, emit. Do not use `Transfer` as the bridge trigger.

### ManateeMint (Creditcoin)

Keep Gluwa `ASCBase.execute` proof shape. Do not invent a new proof ABI.

In one tx:

1. Replay key = `keccak(chainKey, blockHeight, txIndex)` via `calculateTxIndex` (copy ASCBase)
2. `VERIFIER.verifyAndEmit` at `0x0FD2`
3. Decode with `EvmV1Decoder`
4. `receiptStatus == 1`
5. Log is `TokensSentForBridging` **from** the configured `ManateeLock` address
6. Map `event.token` → Creditcoin ERC20
7. Mint that token to `event.to` for `event.amount`
8. Mark `processedQueries` after verify, before mint (ASCBase already does this)

Worker calls `execute(action=0, ...proof fields...)` like the examples. Optional `mintFromQuery` alias that forwards to `execute` with action Mint is fine; do not change the proof argument list.

### Env / addresses

See `.env.example`. Sepolia `chainKey = 1`. Decoder testnet (docs): `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f`. Link `EvmV1Decoder` on deploy.

## File ownership

| Path | Owner |
|---|---|
| `contracts/**` | contracts agent |
| `lib/**`, `cli/**`, `worker/**` | offchain agent |
| `README.md`, `docs/attestcoin.md` | docs agent |
| `package.json`, `tsconfig.json`, `foundry.toml`, `.env.example`, `.gitignore` | PM (already written) |

## Stack

- Solidity `^0.8.23`, Foundry, OZ ERC20 5.4.0, `@gluwa/usc-contracts` 0.1.2
- TypeScript, ethers v6, `@gluwa/usc-sdk` 0.18.0
- Copy `ASCBase` + `VerifierInterface` from gluwa examples (attribution). New business logic only.
