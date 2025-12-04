/**
 * @file orderCoffee.ts
 * @description Script to place a coffee order on Sepolia
 *
 * Usage: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/orderCoffee.ts --network sepolia
 *
 * Environment variables:
 *   CLIENT_ADDRESS=<address>  Client address (default: deployer)
 *   COFFEE_TYPE=<string>      Coffee type: espresso, latte, cappuccino, americano (default: espresso)
 *   QUANTITY=<number>         Quantity (default: 1)
 */

import { Encryptable } from "@cofhe/sdk";
import { Contract } from "ethers";

async function main() {
  const hre: any = require("hardhat");
  const [deployer] = await hre.ethers.getSigners();

  // Get parameters from env or use defaults
  const clientAddress = process.env.CLIENT_ADDRESS || deployer.address;
  const coffeeType = process.env.COFFEE_TYPE || "espresso";
  const quantity = parseInt(process.env.QUANTITY || "1");

  console.log("☕ Placing coffee order...");
  console.log("Client address:", clientAddress);
  console.log("Coffee type:", coffeeType);
  console.log("Quantity:", quantity);

  // Get deployed contracts
  const evvmCafeDeployment = await hre.deployments.get("EVVMCafe");
  const evvmCoreDeployment = await hre.deployments.get("EVVMCore");

  const evvmCafe = await hre.ethers.getContractAt<Contract>("EVVMCafe", evvmCafeDeployment.address, deployer);
  const evvmCore = await hre.ethers.getContractAt<Contract>("EVVMCore", evvmCoreDeployment.address, deployer);

  console.log("EVVMCafe address:", await evvmCafe.getAddress());
  console.log("EVVMCore address:", await evvmCore.getAddress());

  // Check if shop is registered
  const isShopRegistered = await evvmCafe.isShopRegistered();
  if (!isShopRegistered) {
    console.log("❌ Error: Shop is not registered in EVVM");
    console.log("   Please run: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/registerShop.ts --network sepolia");
    process.exit(1);
  }

  // Check if client is registered
  const clientVaddr = await evvmCore.getVaddrFromAddress(clientAddress);
  const clientExists = await evvmCore.accountExists(clientVaddr);
  if (!clientExists) {
    console.log("❌ Error: Client account is not registered in EVVM");
    console.log("   Please run: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/registerClient.ts --network sepolia");
    process.exit(1);
  }

  // Get coffee price
  const price = await evvmCafe.getCoffeePrice(coffeeType);
  const totalPrice = price * BigInt(quantity);

  console.log("\n💰 Price information:");
  console.log("  Price per unit:", price.toString(), "tokens");
  console.log("  Total price:", totalPrice.toString(), "tokens");

  // Get EVVM nonce
  const evvmNonce = await evvmCore.getNonce(clientVaddr);
  console.log("  EVVM nonce:", evvmNonce.toString());

  // Initialize CoFHE client
  console.log("\n🔐 Initializing CoFHE client...");
  const cofheClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(deployer);
  console.log("  ✓ CoFHE client initialized");

  // Encrypt total price
  console.log("\n📝 Encrypting total price...");
  const encryptResult = await cofheClient.encryptInputs([Encryptable.uint64(totalPrice)]).encrypt();
  const [encryptedPrice] = await hre.cofhesdk.expectResultSuccess(encryptResult);
  console.log("  ✓ Price encrypted");

  // Place order
  console.log("\n📤 Placing order...");
  const serviceNonce = Date.now(); // Use timestamp as service nonce
  const tx = await evvmCafe.connect(deployer).orderCoffee(
    clientAddress,
    coffeeType,
    quantity,
    encryptedPrice,
    serviceNonce,
    evvmNonce,
  );
  console.log("  → Transaction hash:", tx.hash);
  await tx.wait();
  console.log("  ✓ Order placed successfully!");

  console.log("\n✅ Order completed!");
  console.log("   Transaction hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

