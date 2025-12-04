/**
 * @file checkBalances.ts
 * @description Script to check encrypted balances on Sepolia
 *
 * Usage: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/checkBalances.ts --network sepolia
 *
 * Environment variables:
 *   CLIENT_ADDRESS=<address>  Client address to check (optional)
 */

import { Contract } from "ethers";
import { FheTypes } from "@cofhe/sdk";

async function main() {
  const hre: any = require("hardhat");
  const [deployer] = await hre.ethers.getSigners();

  const clientAddress = process.env.CLIENT_ADDRESS || deployer.address;

  console.log("💰 Checking balances...");
  console.log("Client address:", clientAddress);

  // Get deployed contracts
  const evvmCafeDeployment = await hre.deployments.get("EVVMCafe");
  const evvmCoreDeployment = await hre.deployments.get("EVVMCore");

  const evvmCafe = await hre.ethers.getContractAt<Contract>("EVVMCafe", evvmCafeDeployment.address, deployer);
  const evvmCore = await hre.ethers.getContractAt<Contract>("EVVMCore", evvmCoreDeployment.address, deployer);

  console.log("EVVMCafe address:", await evvmCafe.getAddress());
  console.log("EVVMCore address:", await evvmCore.getAddress());

  // Initialize CoFHE client
  console.log("\n🔐 Initializing CoFHE client...");
  const cofheClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(deployer);
  console.log("  ✓ CoFHE client initialized");

  // Check shop balance
  console.log("\n🏪 Shop Balance:");
  try {
    const shopBalanceEnc = await evvmCafe.getShopBalance();
    console.log("  Encrypted balance (ctHash):", shopBalanceEnc.toString());

    // Try to decrypt (requires permissions)
    try {
      const decryptResult = await cofheClient.decryptHandle(shopBalanceEnc, FheTypes.Uint64).decrypt();
      if (decryptResult.success) {
        console.log("  Decrypted balance:", decryptResult.data.toString(), "tokens");
      } else {
        console.log("  ⚠️  Could not decrypt balance:", decryptResult.error);
        console.log("     (This is normal if you don't have decryption permissions)");
      }
    } catch (error: any) {
      console.log("  ⚠️  Could not decrypt balance:", error.message);
      console.log("     (This is normal if you don't have decryption permissions)");
    }
  } catch (error: any) {
    console.log("  ❌ Error:", error.message);
  }

  // Check client balance
  console.log("\n👤 Client Balance:");
  try {
    const clientBalanceEnc = await evvmCafe.getClientBalance(clientAddress);
    console.log("  Encrypted balance (ctHash):", clientBalanceEnc.toString());

    // Try to decrypt (requires permissions)
    try {
      const decryptResult = await cofheClient.decryptHandle(clientBalanceEnc, FheTypes.Uint64).decrypt();
      if (decryptResult.success) {
        console.log("  Decrypted balance:", decryptResult.data.toString(), "tokens");
      } else {
        console.log("  ⚠️  Could not decrypt balance:", decryptResult.error);
        console.log("     (This is normal if you don't have decryption permissions)");
      }
    } catch (error: any) {
      console.log("  ⚠️  Could not decrypt balance:", error.message);
      console.log("     (This is normal if you don't have decryption permissions)");
    }
  } catch (error: any) {
    console.log("  ❌ Error:", error.message);
  }

  // Check EVVM Core account info
  console.log("\n📊 EVVM Core Account Info:");
  try {
    const clientVaddr = await evvmCore.getVaddrFromAddress(clientAddress);
    const exists = await evvmCore.accountExists(clientVaddr);
    const nonce = await evvmCore.getNonce(clientVaddr);

    console.log("  Virtual address (vaddr):", clientVaddr);
    console.log("  Account exists:", exists);
    console.log("  Nonce:", nonce.toString());
  } catch (error: any) {
    console.log("  ❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

