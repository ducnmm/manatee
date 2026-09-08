// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ManateeToken is ERC20, AccessControl, Ownable {
    bytes32 public constant ASC_MINTER = keccak256("ASC_MINTER");

    constructor(address minter, string memory name, string memory symbol) ERC20(name, symbol) Ownable(msg.sender) {
        require(minter != address(0), "zero minter");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ASC_MINTER, minter);
    }

    function mint(address to, uint256 amount) external onlyRole(ASC_MINTER) {
        _mint(to, amount);
    }
}
