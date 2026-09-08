// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {ASCBase} from "../attestcoin/ASCBase.sol";
import {INativeQueryVerifier} from "../attestcoin/VerifierInterface.sol";
import {ManateeToken} from "../token/ManateeToken.sol";

contract ManateeMint is ASCBase, Ownable {
    enum MinterActions {
        Mint
    }

    error InvalidAction(uint8 action);

    bytes32 public constant SENT_EVENT_SIGNATURE = keccak256("TokensSentForBridging(address,address,address,uint256)");

    address public immutable lockAddress;
    mapping(address => address) public bridgedTokens;

    event TokensMinted(address indexed token, address indexed to, uint256 amount, bytes32 indexed queryId);

    constructor(address sepoliaLock) ASCBase() Ownable(msg.sender) {
        require(sepoliaLock != address(0), "zero lock");
        lockAddress = sepoliaLock;
    }

    function mapToken(address sepoliaToken, address creditcoinToken) external onlyOwner {
        require(sepoliaToken != address(0) && creditcoinToken != address(0), "zero token");
        bytes32 minterRole = ManateeToken(creditcoinToken).ASC_MINTER();
        require(ManateeToken(creditcoinToken).hasRole(minterRole, address(this)), "missing ASC_MINTER role");
        bridgedTokens[sepoliaToken] = creditcoinToken;
    }

    function mintFromQuery(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool) {
        return this.execute(
            uint8(MinterActions.Mint),
            chainKey,
            blockHeight,
            encodedTransaction,
            merkleRoot,
            siblings,
            lowerEndpointDigest,
            continuityRoots
        );
    }

    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction) internal override {
        if (action == uint8(MinterActions.Mint)) {
            _processMint(queryId, encodedTransaction);
        } else {
            revert InvalidAction(action);
        }
    }

    function _processMint(bytes32 queryId, bytes memory encodedTransaction) internal {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Transaction did not succeed");

        EvmV1Decoder.LogEntry[] memory sentLogs = EvmV1Decoder.getLogsByEventSignature(receipt, SENT_EVENT_SIGNATURE);
        require(sentLogs.length > 0, "No bridge events found");

        EvmV1Decoder.LogEntry memory log = sentLogs[0];
        require(log.address_ == lockAddress, "Invalid lock address");
        require(log.topics.length == 4, "Invalid TokensSentForBridging topics");

        address to = address(uint160(uint256(log.topics[2])));
        address token = address(uint160(uint256(log.topics[3])));
        require(log.data.length == 32, "Invalid TokensSentForBridging data");
        uint256 amount = abi.decode(log.data, (uint256));

        require(to != address(0), "zero recipient");
        require(amount > 0, "zero amount");

        address creditToken = bridgedTokens[token];
        require(creditToken != address(0), "token not mapped");

        ManateeToken(creditToken).mint(to, amount);
        emit TokensMinted(creditToken, to, amount, queryId);
    }
}
