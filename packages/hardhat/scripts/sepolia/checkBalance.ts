/**
 * @file checkBalance.ts
 * @description Script to check ETH balance on Sepolia
 *
 * Usage: yarn workspace @se-2/hardhat hardhat run scripts/sepolia/checkBalance.ts --network sepolia
 */

async function main() {
  const hre: any = require("hardhat");
  const [deployer] = await hre.ethers.getSigners();

  console.log("💰 Checking ETH balance on Sepolia...");
  console.log("Account address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceInEth = hre.ethers.formatEther(balance);

  console.log("\n📊 Balance Information:");
  console.log("  Balance (Wei):", balance.toString());
  console.log("  Balance (ETH):", balanceInEth, "ETH");

  // Estimate gas cost for deployment
  console.log("\n⛽ Estimated Gas Costs:");
  console.log("  EVVMCore deployment: ~2,500,000 gas");
  console.log("  EVVMCafe deployment: ~1,500,000 gas");
  console.log("  Total estimated: ~4,000,000 gas");

  // Get gas price
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const gasPriceInGwei = hre.ethers.formatUnits(gasPrice, "gwei");

  console.log("\n💸 Current Gas Price:", gasPriceInGwei, "gwei");

  // Estimate total cost
  const estimatedCost = (gasPrice * 4000000n);
  const estimatedCostInEth = hre.ethers.formatEther(estimatedCost);

  console.log("\n📈 Estimated Total Cost:");
  console.log("  Estimated cost:", estimatedCostInEth, "ETH");

  if (balance < estimatedCost) {
    const needed = estimatedCost - balance;
    const neededInEth = hre.ethers.formatEther(needed);
    console.log("\n❌ Insufficient funds!");
    console.log("  You need:", neededInEth, "ETH more");
  } else {
    console.log("\n✅ Sufficient funds for deployment!");
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

