import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys EVVMCore contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployEVVMCore: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // EVVM Core constructor parameters
  const vChainId = 1n; // Virtual chain ID
  const evvmID = 100n; // EVVM ID for signature verification

  await deploy("EVVMCore", {
    from: deployer,
    // Contract constructor arguments
    args: [vChainId, evvmID],
    log: true,
    // autoMine: can be passed to the deploy function to make the deployment process faster on local networks by
    // automatically mining the contract deployment transaction. There is no effect on live networks.
    autoMine: true,
  });

  // Get the deployed contract to interact with it after deploying.
  const evvmCore = await hre.ethers.getContract<Contract>("EVVMCore", deployer);
  console.log("EVVMCore deployed at:", evvmCore.target);
  console.log("  - vChainId:", await evvmCore.vChainId());
  console.log("  - evvmID:", await evvmCore.evvmID());
  console.log("  - Owner:", await evvmCore.owner());
};

export default deployEVVMCore;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags EVVMCore
deployEVVMCore.tags = ["EVVMCore"];
