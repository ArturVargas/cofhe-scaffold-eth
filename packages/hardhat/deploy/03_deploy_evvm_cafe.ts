import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys EVVMCafe contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployEVVMCafe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Get the deployed EVVMCore contract address
  const evvmCore = await hre.ethers.getContract<Contract>("EVVMCore", deployer);
  const evvmCoreAddress = await evvmCore.getAddress();

  // Owner of the shop (using deployer for simplicity, can be changed)
  const ownerOfShop = deployer;

  await deploy("EVVMCafe", {
    from: deployer,
    // Contract constructor arguments
    args: [evvmCoreAddress, ownerOfShop],
    log: true,
    // autoMine: can be passed to the deploy function to make the deployment process faster on local networks by
    // automatically mining the contract deployment transaction. There is no effect on live networks.
    autoMine: true,
  });

  // Get the deployed contract to interact with it after deploying.
  const evvmCafe = await hre.ethers.getContract<Contract>("EVVMCafe", deployer);
  console.log("EVVMCafe deployed at:", evvmCafe.target);
  console.log("  - EVVMCore address:", await evvmCafe.evvmCore());
  console.log("  - Shop owner:", await evvmCafe.ownerOfShop());
  console.log("  - Contract owner:", await evvmCafe.owner());
};

export default deployEVVMCafe;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags EVVMCafe
deployEVVMCafe.tags = ["EVVMCafe"];

// This deploy function depends on EVVMCore being deployed first
deployEVVMCafe.dependencies = ["EVVMCore"];
