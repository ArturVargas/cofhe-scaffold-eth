/**
 * @file stateCommitment.ts
 * @description Utility functions for calculating state commitments off-chain
 *
 * State commitments are cryptographic hashes that represent the entire state
 * of the virtual blockchain at a given point in time. They must be calculated
 * off-chain because:
 * 1. Encrypted balances need to be decrypted first (requires private keys)
 * 2. Building Merkle trees on-chain is gas-intensive
 * 3. Only authorized parties with decryption keys can calculate commitments
 *
 * Usage:
 * - Indexers/validators run this script periodically
 * - The calculated commitment is submitted on-chain via updateStateCommitment()
 * - The commitment serves as a cryptographic proof of system state
 */

import { Contract } from "ethers";
import { FheTypes } from "@cofhe/sdk";

/**
 * Represents the decrypted state of a virtual account
 */
export interface AccountState {
  vaddr: string;
  balance: bigint; // Decrypted balance
  nonce: number;
}

/**
 * Options for calculating state commitment
 */
export interface StateCommitmentOptions {
  /**
   * The EVVMCore contract instance
   */
  evvmCore: Contract | any; // Contract or specific contract type
  /**
   * The CoFHE SDK client (initialized with a signer)
   */
  cofheClient: any; // CofhesdkClient type from @cofhe/sdk
  /**
   * Optional: Only include accounts registered from addresses (for compatibility layer)
   * If false, will try to get all accounts from events
   */
  onlyAddressBased?: boolean;
  /**
   * Optional: Block number to query events from (default: 0)
   */
  fromBlock?: number;
  /**
   * Optional: Block number to query events to (default: latest)
   */
  toBlock?: number | "latest";
}

/**
 * Gets all virtual addresses from the EVVMCore contract
 * Uses events to find all registered accounts
 *
 * @param evvmCore The EVVMCore contract instance
 * @param fromBlock Starting block number for event query
 * @param toBlock Ending block number for event query
 * @returns Array of virtual addresses (vaddr)
 */
export async function getAllVirtualAddresses(
  evvmCore: Contract,
  fromBlock: number = 0,
  toBlock: number | "latest" = "latest",
): Promise<string[]> {
  // Query VirtualAccountRegistered events
  const filter = evvmCore.filters.VirtualAccountRegistered();
  const events = await evvmCore.queryFilter(filter, fromBlock, toBlock);

  // Extract unique vaddrs from events
  const vaddrs = new Set<string>();
  for (const event of events) {
    if ("args" in event && event.args && event.args[0]) {
      vaddrs.add(event.args[0]);
    }
  }

  return Array.from(vaddrs);
}

/**
 * Gets all Ethereum addresses that have been registered
 * Uses the addressToVaddr mapping to find registered addresses
 *
 * @param evvmCore The EVVMCore contract instance
 * @param fromBlock Starting block number for event query
 * @param toBlock Ending block number for event query
 * @returns Array of objects with address and vaddr
 */
export async function getAllAddressBasedAccounts(
  evvmCore: Contract,
  fromBlock: number = 0,
  toBlock: number | "latest" = "latest",
): Promise<Array<{ address: string; vaddr: string }>> {
  // Query AccountRegisteredFromAddress events
  const filter = evvmCore.filters.AccountRegisteredFromAddress();
  const events = await evvmCore.queryFilter(filter, fromBlock, toBlock);

  const accounts: Array<{ address: string; vaddr: string }> = [];
  for (const event of events) {
    if ("args" in event && event.args && event.args[0] && event.args[1]) {
      accounts.push({
        address: event.args[0],
        vaddr: event.args[1],
      });
    }
  }

  return accounts;
}

/**
 * Fetches and decrypts the state of all virtual accounts
 *
 * @param options Configuration options
 * @returns Array of account states with decrypted balances
 */
export async function getAllAccountStates(options: StateCommitmentOptions): Promise<AccountState[]> {
  const { evvmCore, cofheClient, onlyAddressBased = false, fromBlock = 0, toBlock = "latest" } = options;

  let vaddrs: string[] = [];
  let addressAccounts: Array<{ address: string; vaddr: string }> = [];

  if (onlyAddressBased) {
    // Get accounts registered from addresses
    addressAccounts = await getAllAddressBasedAccounts(evvmCore, fromBlock, toBlock);
    vaddrs = addressAccounts.map(acc => acc.vaddr);
  } else {
    // Get all accounts from events
    vaddrs = await getAllVirtualAddresses(evvmCore, fromBlock, toBlock);
    // Also get address-based accounts to map addresses to vaddrs
    addressAccounts = await getAllAddressBasedAccounts(evvmCore, fromBlock, toBlock);
  }

  // Create mapping of vaddr to address for using correct client
  const vaddrToAddress = new Map<string, string>();
  for (const acc of addressAccounts) {
    vaddrToAddress.set(acc.vaddr, acc.address);
  }

  // Fetch and decrypt account states
  const accountStates: AccountState[] = [];

  // In mock environment, try to use a single client with global permissions
  // or create clients for each address
  // Note: We use dynamic import to avoid issues when this utility is used outside Hardhat context
  let hre: any = null;
  let isMockEnv = false;

  try {
    if (typeof require !== "undefined") {
      hre = await import("hardhat");
      isMockEnv = !!hre.cofhesdk?.mocks;
    }
  } catch {
    // Not in Hardhat environment, skip mock checks
  }

  for (const vaddr of vaddrs) {
    try {
      // Get encrypted balance
      const encryptedBalance = await evvmCore.getEncryptedBalance(vaddr);

      // Decrypt balance using CoFHE SDK
      // Note: encryptedBalance is a bigint (ctHash)
      let balance: bigint;

      try {
        // In mock environment, try to use the client that created the account
        // or fallback to the provided client
        let clientToUse = cofheClient;

        if (isMockEnv && vaddrToAddress.has(vaddr)) {
          // Try to create a client for the account's address
          const accountAddress = vaddrToAddress.get(vaddr)!;
          try {
            // Dynamically import hardhat if not already available
            const hreModule = hre || (typeof require !== "undefined" ? await import("hardhat") : null);
            if (hreModule) {
              const signers = await hreModule.ethers.getSigners();
              const accountSigner = signers.find(s => s.address.toLowerCase() === accountAddress.toLowerCase());
              if (accountSigner) {
                clientToUse = await hreModule.cofhesdk.createBatteriesIncludedCofhesdkClient(accountSigner);
              }
            }
          } catch {
            // Fallback to provided client
          }
        }

        // Try to decrypt
        const decryptResult = await clientToUse.decryptHandle(encryptedBalance, FheTypes.Uint64).decrypt();

        if (!decryptResult.success) {
          console.warn(`Failed to decrypt balance for vaddr ${vaddr}: ${decryptResult.error}`);
          continue;
        }

        balance = decryptResult.data;
      } catch (error: any) {
        console.warn(`Failed to decrypt balance for vaddr ${vaddr}: ${error.message || error}`);
        continue;
      }

      // Get nonce
      const nonce = await evvmCore.getNonce(vaddr);

      accountStates.push({
        vaddr,
        balance,
        nonce: Number(nonce),
      });
    } catch (error) {
      console.warn(`Error processing account ${vaddr}:`, error);
      // Continue with other accounts
    }
  }

  return accountStates;
}

/**
 * Calculates a simple hash of all account states
 * This is a simpler alternative to Merkle tree (for small state sizes)
 *
 * @param accountStates Array of account states
 * @returns bytes32 hash representing the state commitment
 */
export async function calculateSimpleStateHash(accountStates: AccountState[]): Promise<string> {
  // Sort accounts by vaddr for deterministic hashing
  const sorted = [...accountStates].sort((a, b) => (a.vaddr > b.vaddr ? 1 : -1));

  // Encode all account states
  const { AbiCoder } = await import("ethers");
  const abiCoder = AbiCoder.defaultAbiCoder();
  const encoded = sorted.map(acc => {
    // Use ethers to encode: bytes32 vaddr, uint64 balance, uint64 nonce
    return abiCoder.encode(["bytes32", "uint64", "uint64"], [acc.vaddr, acc.balance, acc.nonce]);
  });

  // Hash all encoded states together
  const { keccak256, concat } = await import("ethers");
  const combined = concat(encoded);
  return keccak256(combined);
}

/**
 * Builds a Merkle tree from account states and returns the root
 * Uses a simple binary Merkle tree implementation
 *
 * @param accountStates Array of account states
 * @returns bytes32 Merkle root (state commitment)
 */
export async function calculateMerkleRoot(accountStates: AccountState[]): Promise<string> {
  const { keccak256, AbiCoder } = await import("ethers");
  const abiCoder = AbiCoder.defaultAbiCoder();

  if (accountStates.length === 0) {
    // Empty state commitment
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // Sort accounts by vaddr for deterministic tree
  const sorted = [...accountStates].sort((a, b) => (a.vaddr > b.vaddr ? 1 : -1));

  // Create leaves: hash of (vaddr, balance, nonce)
  const leaves = sorted.map(acc => {
    const encoded = abiCoder.encode(["bytes32", "uint64", "uint64"], [acc.vaddr, acc.balance, acc.nonce]);
    return keccak256(encoded);
  });

  // Build Merkle tree
  return await buildMerkleTree(leaves);
}

/**
 * Builds a binary Merkle tree from leaves
 *
 * @param leaves Array of leaf hashes
 * @returns Root hash of the Merkle tree
 */
async function buildMerkleTree(leaves: string[]): Promise<string> {
  const { keccak256, concat } = await import("ethers");

  if (leaves.length === 1) {
    return leaves[0];
  }

  // If odd number of leaves, duplicate the last one
  if (leaves.length % 2 === 1) {
    leaves.push(leaves[leaves.length - 1]);
  }

  // Build next level
  const nextLevel: string[] = [];
  for (let i = 0; i < leaves.length; i += 2) {
    // Concatenate and hash pair of leaves
    const pairHash = keccak256(concat([leaves[i], leaves[i + 1]]));
    nextLevel.push(pairHash);
  }

  // Recursively build tree
  return buildMerkleTree(nextLevel);
}

/**
 * Main function to calculate state commitment
 * This is the primary function that should be called
 *
 * @param options Configuration options
 * @param useMerkleTree Whether to use Merkle tree (true) or simple hash (false)
 * @returns bytes32 state commitment
 */
export async function calculateStateCommitment(
  options: StateCommitmentOptions,
  useMerkleTree: boolean = true,
): Promise<string> {
  console.log("📊 Calculating state commitment...");

  // Get all account states
  console.log("  → Fetching account states...");
  const accountStates = await getAllAccountStates(options);

  if (accountStates.length === 0) {
    console.log("  ⚠️  No accounts found, returning zero commitment");
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  console.log(`  ✓ Found ${accountStates.length} accounts`);

  // Calculate commitment
  console.log(`  → Calculating ${useMerkleTree ? "Merkle tree" : "simple hash"}...`);
  const commitment = useMerkleTree
    ? await calculateMerkleRoot(accountStates)
    : await calculateSimpleStateHash(accountStates);

  console.log(`  ✓ State commitment: ${commitment}`);
  console.log(`  📋 Account summary:`);
  for (const acc of accountStates.slice(0, 5)) {
    // Show first 5 accounts
    console.log(`     - ${acc.vaddr.slice(0, 10)}...: balance=${acc.balance}, nonce=${acc.nonce}`);
  }
  if (accountStates.length > 5) {
    console.log(`     ... and ${accountStates.length - 5} more accounts`);
  }

  return commitment;
}
