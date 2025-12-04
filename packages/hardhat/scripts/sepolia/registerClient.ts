/**
 * @file registerClient.ts
 * @description Script to register a client account in EVVM Core on Sepolia
 *
 * Usage: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/registerClient.ts --network sepolia
 *
 * Environment variables:
 *   CLIENT_ADDRESS=<address>  Address to register (default: deployer)
 *   INITIAL_BALANCE=<number>  Initial balance in tokens (default: 1000)
 */

import { Encryptable } from "@cofhe/sdk";
import { Contract } from "ethers";

async function main() {
  const hre: any = require("hardhat");
  const [deployer] = await hre.ethers.getSigners();

  // Get client address from env or use deployer
  const clientAddress = process.env.CLIENT_ADDRESS || deployer.address;
  const initialBalance = BigInt(process.env.INITIAL_BALANCE || "1000");

  console.log("👤 Registering client account in EVVM Core...");
  console.log("Client address:", clientAddress);
  console.log("Initial balance:", initialBalance.toString(), "tokens");

  // Get deployed contract
  const evvmCoreDeployment = await hre.deployments.get("EVVMCore");
  const evvmCore = await hre.ethers.getContractAt<Contract>("EVVMCore", evvmCoreDeployment.address, deployer);

  console.log("EVVMCore address:", await evvmCore.getAddress());

  // Check if already registered
  const clientVaddr = await evvmCore.getVaddrFromAddress(clientAddress);
  const accountExists = await evvmCore.accountExists(clientVaddr);
  if (accountExists) {
    console.log("✅ Account already exists for this address");
    console.log("  Virtual address (vaddr):", clientVaddr);
    return;
  }

  // Get signer for client (if different from deployer)
  let clientSigner = deployer;
  if (clientAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    // In a real scenario, you'd need the private key for this address
    console.log("⚠️  Note: Using deployer to register client account");
    console.log("   In production, the client should register their own account");
  }

  // Initialize CoFHE client
  console.log("\n🔐 Initializing CoFHE client...");
  const cofheClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(clientSigner);
  console.log("  ✓ CoFHE client initialized");

  // Encrypt initial balance
  console.log("\n📝 Encrypting initial balance...");
  const encryptResult = await cofheClient.encryptInputs([Encryptable.uint64(initialBalance)]).encrypt();
  const [encryptedBalance] = await hre.cofhesdk.expectResultSuccess(encryptResult);
  console.log("  ✓ Balance encrypted");

  // Register account
  console.log("\n📤 Registering account in EVVM Core...");
  const tx = await evvmCore.connect(clientSigner).registerAccountFromAddress(clientAddress, encryptedBalance);
  console.log("  → Transaction hash:", tx.hash);
  await tx.wait();
  console.log("  ✓ Account registered successfully!");

  // Verify registration
  const vaddr = await evvmCore.getVaddrFromAddress(clientAddress);
  const exists = await evvmCore.accountExists(vaddr);
  const nonce = await evvmCore.getNonce(vaddr);

  if (exists) {
    console.log("\n✅ Verification: Account is now registered");
    console.log("  Virtual address (vaddr):", vaddr);
    console.log("  Nonce:", nonce.toString());
  } else {
    console.log("\n❌ Error: Account registration failed");
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

