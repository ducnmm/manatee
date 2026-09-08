// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ManateeToken} from "../src/token/ManateeToken.sol";
import {ManateeLock} from "../src/sepolia/ManateeLock.sol";

contract DeploySepolia is Script {
    uint256 internal constant DEMO_SUPPLY = 1_000_000 ether;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        ManateeToken token = new ManateeToken(deployer, "manatee", "mtee");
        ManateeLock lock = new ManateeLock(address(token));
        token.mint(deployer, DEMO_SUPPLY);

        vm.stopBroadcast();

        console.log("ManateeToken", address(token));
        console.log("ManateeLock", address(lock));
        console.log("demo minted to", deployer);
        console.log("demo supply", DEMO_SUPPLY);
    }
}
