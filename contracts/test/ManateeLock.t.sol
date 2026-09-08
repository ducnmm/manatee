// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ManateeToken} from "../src/token/ManateeToken.sol";
import {ManateeLock} from "../src/sepolia/ManateeLock.sol";

contract ManateeLockTest is Test {
    ManateeToken internal token;
    ManateeLock internal lock;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event TokensSentForBridging(address indexed from, address indexed to, address indexed token, uint256 amount);

    function setUp() public {
        token = new ManateeToken(address(this), "manatee", "mtee");
        lock = new ManateeLock(address(token));
        token.mint(alice, 100 ether);
    }

    function test_sendLocksTokensAndEmitsEvent() public {
        uint256 amount = 10 ether;

        vm.startPrank(alice);
        token.approve(address(lock), amount);

        vm.expectEmit(true, true, true, true, address(lock));
        emit TokensSentForBridging(alice, bob, address(token), amount);
        lock.send(address(token), bob, amount);
        vm.stopPrank();

        assertEq(token.balanceOf(address(lock)), amount);
        assertEq(token.balanceOf(alice), 90 ether);
    }

    function test_sendRevertsUnknownToken() public {
        ManateeToken other = new ManateeToken(address(this), "manatee", "mtee");
        other.mint(alice, 10 ether);

        vm.startPrank(alice);
        other.approve(address(lock), 10 ether);
        vm.expectRevert("token not allowed");
        lock.send(address(other), bob, 10 ether);
        vm.stopPrank();
    }

    function test_sendRevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("zero amount");
        lock.send(address(token), bob, 0);
    }

    function test_sendRevertsZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert("zero recipient");
        lock.send(address(token), address(0), 10 ether);
    }

    function test_sendRevertsNoAllowance() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(lock), uint256(0), 10 ether)
        );
        lock.send(address(token), bob, 10 ether);
    }
}
