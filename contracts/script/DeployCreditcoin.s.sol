// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ManateeToken} from "../src/token/ManateeToken.sol";
import {ManateeMint} from "../src/creditcoin/ManateeMint.sol";

contract DeployCreditcoin is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address sepoliaLock = vm.envAddress("SEPOLIA_LOCK");
        address sepoliaMtee = vm.envAddress("SEPOLIA_MTEE");

        vm.startBroadcast(pk);

        ManateeMint minter = new ManateeMint(sepoliaLock);
        ManateeToken token = new ManateeToken(address(minter), "manatee", "mtee");
        minter.mapToken(sepoliaMtee, address(token));

        vm.stopBroadcast();

        console.log("ManateeMint", address(minter));
        console.log("ManateeToken", address(token));
        console.log("mapped sepolia mtee", sepoliaMtee);
        console.log("lock", sepoliaLock);
    }
}
