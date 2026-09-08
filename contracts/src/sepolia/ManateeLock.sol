// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ManateeLock is Ownable {
    mapping(address => bool) public allowed;

    event TokensSentForBridging(address indexed from, address indexed to, address indexed token, uint256 amount);

    constructor(address initialToken) Ownable(msg.sender) {
        if (initialToken != address(0)) {
            allowed[initialToken] = true;
        }
    }

    function setAllowed(address token, bool isAllowed) external onlyOwner {
        require(token != address(0), "zero token");
        allowed[token] = isAllowed;
    }

    function send(address token, address to, uint256 amount) external {
        require(allowed[token], "token not allowed");
        require(to != address(0), "zero recipient");
        require(amount > 0, "zero amount");
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        emit TokensSentForBridging(msg.sender, to, token, amount);
    }
}
