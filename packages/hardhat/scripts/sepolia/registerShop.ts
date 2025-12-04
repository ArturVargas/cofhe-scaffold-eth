/**
 * @file registerShop.ts
 * @description Script to register the shop in EVVM Core on Sepolia
 *
 * Usage: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/registerShop.ts --network sepolia
 */

import { Encryptable } from "@cofhe/sdk";
import { Contract } from "ethers";
import { createRemoteCofhesdkClient, expectResultSuccess } from "../../utils/cofheRemote";

async function main() {
  const hre: any = require("hardhat");
  const [deployer] = await hre.ethers.getSigners();

  console.log("🏪 Registering shop in EVVM Core...");
  console.log("Deployer address:", deployer.address);

  // Get deployed contracts
  const evvmCafeDeployment = await hre.deployments.get("EVVMCafe");
  const evvmCafe = await hre.ethers.getContractAt<Contract>("EVVMCafe", evvmCafeDeployment.address, deployer);

  console.log("EVVMCafe address:", await evvmCafe.getAddress());

  // Check if already registered
  const isRegistered = await evvmCafe.isShopRegistered();
  if (isRegistered) {
    console.log("✅ Shop is already registered in EVVM");
    return;
  }

  // Initialize CoFHE client for remote network
  console.log("\n🔐 Initializing CoFHE client for remote network...");
  const cofheClient = await createRemoteCofhesdkClient(deployer, "sepolia");
  console.log("  ✓ CoFHE client initialized");

  // Encrypt zero balance
  console.log("\n📝 Encrypting zero balance...");
  const encryptResult = await cofheClient.encryptInputs([Encryptable.uint64(0n)]).encrypt();
  const [encryptedZero] = await expectResultSuccess(encryptResult);
  console.log("  ✓ Balance encrypted");

  // Register shop
  console.log("\n📤 Registering shop in EVVM Core...");
  const tx = await evvmCafe.registerShopInEVVM(encryptedZero);
  console.log("  → Transaction hash:", tx.hash);
  await tx.wait();
  console.log("  ✓ Shop registered successfully!");

  // Verify registration
  const isNowRegistered = await evvmCafe.isShopRegistered();
  if (isNowRegistered) {
    console.log("\n✅ Verification: Shop is now registered in EVVM");
  } else {
    console.log("\n❌ Error: Shop registration failed");
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

