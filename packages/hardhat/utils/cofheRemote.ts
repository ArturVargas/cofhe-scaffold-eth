/**
 * @file cofheRemote.ts
 * @description Helper utilities for creating CoFHE clients on remote networks (Sepolia, etc.)
 * 
 * This module provides alternatives to createBatteriesIncludedCofhesdkClient that work
 * on remote networks where hardhat_impersonateAccount is not available.
 */

import { createCofhesdkClient, createCofhesdkConfig, Result } from "@cofhe/sdk/node";
import { sepolia } from "@cofhe/sdk/chains";
import { HardhatSignerAdapter } from "@cofhe/sdk/adapters";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Creates a CoFHE client for remote networks (Sepolia, etc.)
 * This uses HardhatSignerAdapter which should work on remote networks
 * 
 * @param signer Hardhat signer to use
 * @param network Network name (default: "sepolia")
 * @returns CoFHE client configured for remote network
 */
export async function createRemoteCofhesdkClient(
  signer: HardhatEthersSigner,
) {
  // Get signer address
  const address = await signer.getAddress();

  // Create CoFHE config (without mocks for remote networks)
  const config = createCofhesdkConfig({
    supportedChains: [sepolia],
  });

  // Create CoFHE client
  const client = createCofhesdkClient(config);

  // Use HardhatSignerAdapter to connect the signer
  const { publicClient, walletClient } = await HardhatSignerAdapter(signer);

  // Connect client with public and wallet clients
  const connectResult = await client.connect(publicClient, walletClient);
  if (!connectResult.success) {
    throw new Error(`Failed to connect CoFHE client: ${connectResult.error}`);
  }

  // Create self-usage permit
  const permitResult = await client.permits.createSelf({
    issuer: address,
  });
  
  if (!permitResult.success) {
    throw new Error(`Failed to create self permit: ${permitResult.error}`);
  }

  return client;
}

/**
 * Helper function to extract data from CoFHE Result, similar to expectResultSuccess
 * Note: encryptInputs returns Result<InEuint64[]>, so we need to handle arrays
 * @param result Result from CoFHE operation
 * @returns Array of data values (for encryptInputs, this is InEuint64[])
 */
export async function expectResultSuccess<T>(result: Result<T> | Promise<Result<T>>): Promise<T[]> {
  const res = await Promise.resolve(result);
  if (!res.success) {
    throw new Error(`CoFHE operation failed: ${res.error}`);
  }
  // Handle both single value and array results
  if (Array.isArray(res.data)) {
    return res.data as T[];
  }
  return [res.data];
}

