// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {INativeQueryVerifier} from "../src/attestcoin/VerifierInterface.sol";
import {ManateeToken} from "../src/token/ManateeToken.sol";
import {ManateeMint} from "../src/creditcoin/ManateeMint.sol";

contract ManateeMintTest is Test {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;
    address internal constant LOCK = address(0x1111);
    address internal constant SEPOLIA_MTEE = address(0x2222);

    uint64 internal constant CHAIN_KEY = 1;
    uint64 internal constant BLOCK_HEIGHT = 100;
    uint64 internal constant TX_INDEX = 1;

    ManateeMint internal minter;
    ManateeToken internal ccToken;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal amount = 10 ether;

    event TokensMinted(address indexed token, address indexed to, uint256 amount, bytes32 indexed queryId);

    struct LogEnc {
        address address_;
        bytes32[] topics;
        bytes data;
    }

    struct AccessListEnc {
        address account;
        bytes32[] storageKeys;
    }

    function setUp() public {
        minter = new ManateeMint(LOCK);
        ccToken = new ManateeToken(address(minter), "manatee", "mtee");
        minter.mapToken(SEPOLIA_MTEE, address(ccToken));
        _mockVerifier(true, TX_INDEX);
    }

    function test_mintFromQueryHappyPath() public {
        bytes memory encodedTx = _encodeSentTx(LOCK, alice, bob, SEPOLIA_MTEE, amount, 1);
        bytes32 queryId = _queryId(CHAIN_KEY, BLOCK_HEIGHT, TX_INDEX);

        vm.expectEmit(true, true, true, true, address(minter));
        emit TokensMinted(address(ccToken), bob, amount, queryId);

        bool ok = _mintFromQuery(encodedTx);
        assertTrue(ok);
        assertEq(ccToken.balanceOf(bob), amount);
        assertEq(ccToken.balanceOf(alice), 0);
        assertEq(ccToken.balanceOf(address(this)), 0);
    }

    function test_executeRevertsOnReplay() public {
        bytes memory encodedTx = _encodeSentTx(LOCK, alice, bob, SEPOLIA_MTEE, amount, 1);
        _execute(encodedTx);
        assertEq(ccToken.balanceOf(bob), amount);

        vm.expectRevert("Query already processed");
        _execute(encodedTx);
        assertEq(ccToken.balanceOf(bob), amount);
    }

    function test_executeRevertsBadReceiptStatus() public {
        bytes memory encodedTx = _encodeSentTx(LOCK, alice, bob, SEPOLIA_MTEE, amount, 0);
        vm.expectRevert("Transaction did not succeed");
        _execute(encodedTx);
        assertEq(ccToken.balanceOf(bob), 0);
    }

    function test_executeRevertsWrongLock() public {
        bytes memory encodedTx = _encodeSentTx(address(0xBAD), alice, bob, SEPOLIA_MTEE, amount, 1);
        vm.expectRevert("Invalid lock address");
        _execute(encodedTx);
        assertEq(ccToken.balanceOf(bob), 0);
    }

    function test_executeRevertsUnmappedToken() public {
        bytes memory encodedTx = _encodeSentTx(LOCK, alice, bob, address(0xDEAD), amount, 1);
        vm.expectRevert("token not mapped");
        _execute(encodedTx);
        assertEq(ccToken.balanceOf(bob), 0);
    }

    function test_executeRevertsWhenVerifyFails() public {
        _mockVerifier(false, TX_INDEX);
        bytes memory encodedTx = _encodeSentTx(LOCK, alice, bob, SEPOLIA_MTEE, amount, 1);
        vm.expectRevert("Proof of inclusion verification failed");
        _execute(encodedTx);
        assertEq(ccToken.balanceOf(bob), 0);
    }

    function _mockVerifier(bool verified, uint64 txIndex) internal {
        vm.mockCall(
            PRECOMPILE, abi.encodeWithSelector(INativeQueryVerifier.verifyAndEmit.selector), abi.encode(verified)
        );
        vm.mockCall(
            PRECOMPILE, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(txIndex)
        );
    }

    function _dummyProof()
        internal
        pure
        returns (
            bytes32 merkleRoot,
            INativeQueryVerifier.MerkleProofEntry[] memory siblings,
            bytes32 lowerEndpointDigest,
            bytes32[] memory continuityRoots
        )
    {
        merkleRoot = bytes32(uint256(1));
        siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(2)), isLeft: true});
        lowerEndpointDigest = bytes32(0);
        continuityRoots = new bytes32[](1);
        continuityRoots[0] = bytes32(uint256(1));
    }

    function _execute(bytes memory encodedTx) internal returns (bool) {
        (bytes32 merkleRoot, INativeQueryVerifier.MerkleProofEntry[] memory siblings, bytes32 digest, bytes32[] memory roots)
        = _dummyProof();
        return minter.execute(uint8(ManateeMint.MinterActions.Mint), CHAIN_KEY, BLOCK_HEIGHT, encodedTx, merkleRoot, siblings, digest, roots);
    }

    function _mintFromQuery(bytes memory encodedTx) internal returns (bool) {
        (bytes32 merkleRoot, INativeQueryVerifier.MerkleProofEntry[] memory siblings, bytes32 digest, bytes32[] memory roots)
        = _dummyProof();
        return minter.mintFromQuery(CHAIN_KEY, BLOCK_HEIGHT, encodedTx, merkleRoot, siblings, digest, roots);
    }

    function _queryId(uint64 chainKey, uint64 blockHeight, uint256 txIndex) internal pure returns (bytes32 queryId) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, chainKey)
            mstore(add(ptr, 32), shl(192, blockHeight))
            mstore(add(ptr, 40), txIndex)
            queryId := keccak256(ptr, 72)
        }
    }

    function _encodeSentTx(
        address emitter,
        address from,
        address to,
        address token,
        uint256 value,
        uint8 receiptStatus
    ) internal view returns (bytes memory) {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = minter.SENT_EVENT_SIGNATURE();
        topics[1] = bytes32(uint256(uint160(from)));
        topics[2] = bytes32(uint256(uint160(to)));
        topics[3] = bytes32(uint256(uint160(token)));

        LogEnc[] memory logs = new LogEnc[](1);
        logs[0] = LogEnc({address_: emitter, topics: topics, data: abi.encode(value)});

        bytes memory common = abi.encode(uint64(0), uint64(21_000), from, false, emitter, uint256(0), bytes(""));

        AccessListEnc[] memory accessList = new AccessListEnc[](0);
        bytes memory type2 = abi.encode(
            uint64(11_155_111), uint128(1), uint128(1), accessList, uint8(0), bytes32(uint256(1)), bytes32(uint256(2))
        );

        bytes memory receipt = abi.encode(receiptStatus, uint64(21_000), logs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = common;
        chunks[1] = type2;
        chunks[2] = receipt;
        return abi.encode(uint8(2), chunks);
    }
}
