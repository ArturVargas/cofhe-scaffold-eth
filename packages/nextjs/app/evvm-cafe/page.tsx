"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract, useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useEncryptInput } from "~~/app/useEncryptInput";
import { useDecryptValue } from "~~/app/useDecrypt";
import { useCofheConnected, useCofheCreatePermit, useCofheIsActivePermitValid } from "~~/app/useCofhe";
import { FheTypes } from "@cofhe/sdk";
import { Address } from "~~/components/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const COFFEE_TYPES = ["espresso", "latte", "cappuccino", "americano"] as const;

export default function EVVMCafePage() {
  const { address } = useAccount();
  const cofheConnected = useCofheConnected();
  const hasActivePermit = useCofheIsActivePermitValid();
  const createPermit = useCofheCreatePermit();
  const [initialBalance, setInitialBalance] = useState<string>("1000");
  const [coffeeType, setCoffeeType] = useState<string>("espresso");
  const [quantity, setQuantity] = useState<string>("1");
  const [serviceNonce, setServiceNonce] = useState<number>(1);
  const [isCreatingPermit, setIsCreatingPermit] = useState<boolean>(false);

  const { onEncryptInput, isEncryptingInput, inputEncryptionDisabled } = useEncryptInput();
  const { writeContractAsync: writeEVVMCore, isPending: isPendingCore } = useScaffoldWriteContract({
    contractName: "EVVMCore",
  });
  const { writeContractAsync: writeEVVMCafe, isPending: isPendingCafe } = useScaffoldWriteContract({
    contractName: "EVVMCafe",
  });

  // Check if client is registered
  const { data: clientVaddr } = useScaffoldReadContract({
    contractName: "EVVMCore",
    functionName: "getVaddrFromAddress",
    args: address ? ([address] as const) : undefined,
  });

  const isClientRegistered = clientVaddr && clientVaddr !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Get EVVM nonce
  const { data: evvmNonce } = useScaffoldReadContract({
    contractName: "EVVMCore",
    functionName: "getNonce",
    args: clientVaddr && isClientRegistered ? ([clientVaddr] as const) : undefined,
  });

  // Get nextTxId to calculate payment txId after payment
  const { data: nextTxId } = useScaffoldReadContract({
    contractName: "EVVMCore",
    functionName: "nextTxId",
  });

  // Check if shop is registered
  const { data: isShopRegistered, refetch: refetchShopStatus, isLoading: isLoadingShopStatus } = useScaffoldReadContract({
    contractName: "EVVMCafe",
    functionName: "isShopRegistered",
  });
  
  // Convert to boolean to handle undefined case
  // Also handle the case where the value might be a BigInt (from contract)
  const shopIsRegistered = Boolean(isShopRegistered) || (typeof isShopRegistered === "bigint" && isShopRegistered === 1n) || (typeof isShopRegistered === "number" && isShopRegistered === 1);
  
  // Debug: Log shop registration status
  useEffect(() => {
    if (isShopRegistered !== undefined) {
      console.log("Shop registration status:", {
        raw: isShopRegistered,
        type: typeof isShopRegistered,
        boolean: Boolean(isShopRegistered),
        shopIsRegistered,
      });
    }
  }, [isShopRegistered, shopIsRegistered]);

  // Get coffee price
  const { data: coffeePrice } = useScaffoldReadContract({
    contractName: "EVVMCafe",
    functionName: "getCoffeePrice",
    args: [coffeeType],
  });

  // Get client balance
  const { data: clientBalanceEnc } = useScaffoldReadContract({
    contractName: "EVVMCafe",
    functionName: "getClientBalance",
    args: address ? ([address] as const) : undefined,
  });

  const { onDecrypt: onDecryptClientBalance, result: clientBalanceResult } = useDecryptValue(
    FheTypes.Uint64,
    clientBalanceEnc as bigint | null | undefined,
  );

  // Get shop balance
  const { data: shopBalanceEnc } = useScaffoldReadContract({
    contractName: "EVVMCafe",
    functionName: "getShopBalance",
  });

  const { onDecrypt: onDecryptShopBalance, result: shopBalanceResult } = useDecryptValue(
    FheTypes.Uint64,
    shopBalanceEnc as bigint | null | undefined,
  );

  // Register client account
  const handleRegisterClient = useCallback(async () => {
    if (!address || !cofheConnected) {
      notification.error("Please connect wallet and CoFHE");
      return;
    }

    try {
      const balance = BigInt(initialBalance);
      
      // Validation: Limit initial balance to prevent abuse (max 1,000,000 tokens)
      const MAX_INITIAL_BALANCE = 1000000n;
      if (balance > MAX_INITIAL_BALANCE) {
        notification.error(`Initial balance cannot exceed ${MAX_INITIAL_BALANCE.toLocaleString()} tokens`);
        return;
      }
      
      if (balance <= 0n) {
        notification.error("Initial balance must be greater than 0");
        return;
      }

      const encryptedBalance = await onEncryptInput(FheTypes.Uint64, balance);

      if (!encryptedBalance) {
        notification.error("Failed to encrypt balance");
        return;
      }

      await writeEVVMCore({
        functionName: "registerAccountFromAddress",
        args: [address, encryptedBalance],
      });

      notification.success("Account registered successfully!");
    } catch (error: any) {
      notification.error(error.message || "Failed to register account");
    }
  }, [address, cofheConnected, initialBalance, onEncryptInput, writeEVVMCore]);

  // Get contract addresses for permit creation
  const { data: evvmCafeContract } = useDeployedContractInfo({
    contractName: "EVVMCafe",
  });
  const { data: evvmCoreContract } = useDeployedContractInfo({
    contractName: "EVVMCore",
  });

  // Register shop
  const handleRegisterShop = useCallback(async () => {
    if (!cofheConnected) {
      notification.error("Please connect CoFHE");
      return;
    }

    if (shopIsRegistered) {
      notification.info("Shop is already registered");
      return;
    }

    if (!evvmCafeContract?.address) {
      notification.error("EVVMCafe contract address not found");
      return;
    }

    try {
      // Instead of creating a permit, we'll call registerAccountFromAddress directly on EVVMCore
      // This bypasses the EVVMCafe contract and registers the shop directly
      // The shop address (EVVMCafe contract) will be registered in EVVMCore
      const encryptedZero = await onEncryptInput(FheTypes.Uint64, 0n);

      if (!encryptedZero) {
        notification.error("Failed to encrypt balance");
        return;
      }

      // Register the shop directly in EVVMCore using the EVVMCafe contract address
      // This avoids the permission issue with passing encrypted values between contracts
      await writeEVVMCore({
        functionName: "registerAccountFromAddress",
        args: [evvmCafeContract.address, encryptedZero],
      });

      // Refetch shop status after successful registration
      // writeContractAsync already waits for confirmation
      setTimeout(() => {
        refetchShopStatus();
      }, 2000);

      notification.success("Shop registered successfully in EVVMCore!");
      // Refetch to update UI
      setTimeout(() => {
        refetchShopStatus();
      }, 2000);
    } catch (error: any) {
      console.error("Register shop error:", error);
      
      // Check if error is "shop already registered" or "address already registered"
      const errorMessage = error.message || error.toString() || "";
      const errorData = error.data || error.error?.data || "";
      const errorName = error.name || error.error?.name || "";
      const errorShortMessage = error.shortMessage || "";
      
      // Check for ShopAlreadyRegistered error (custom error) or EVVM Core errors
      const isShopAlreadyRegistered = 
        errorName === "ShopAlreadyRegistered" ||
        errorMessage.includes("ShopAlreadyRegistered") ||
        errorMessage.includes("shop already registered") ||
        errorMessage.includes("address already registered") ||
        errorMessage.includes("account already exists") ||
        errorMessage.includes("EVVM: account already exists") ||
        errorMessage.includes("EVVM: address already registered") ||
        errorMessage.includes("0x7ba5ffb5") ||
        errorShortMessage.includes("ShopAlreadyRegistered") ||
        errorShortMessage.includes("account already exists") ||
        errorShortMessage.includes("address already registered") ||
        errorData.includes("0x7ba5ffb5");
      
      if (isShopAlreadyRegistered) {
        notification.info("Shop is already registered in EVVM. Refreshing status...");
        // Force refetch multiple times to ensure UI updates
        setTimeout(() => {
          refetchShopStatus();
        }, 500);
        setTimeout(() => {
          refetchShopStatus();
        }, 2000);
        setTimeout(() => {
          refetchShopStatus();
        }, 5000);
      } else {
        notification.error(errorMessage || errorShortMessage || "Failed to register shop");
      }
    }
  }, [cofheConnected, shopIsRegistered, evvmCafeContract, onEncryptInput, writeEVVMCore, refetchShopStatus]);

  // Order coffee
  const handleOrderCoffee = useCallback(async () => {
    if (!address || !cofheConnected || !coffeePrice || evvmNonce === undefined) {
      notification.error("Please connect wallet, CoFHE, and ensure shop is registered");
      return;
    }

    if (!evvmCafeContract?.address || !evvmCoreContract?.address) {
      notification.error("Contract addresses not found");
      return;
    }

    try {
      const qty = BigInt(quantity);
      const totalPrice = coffeePrice * qty;

      // Step 1: Create sharing permit for EVVMCore BEFORE encrypting
      // This is critical: the permit must exist before the encrypted value is used
      if (address && evvmCoreContract?.address) {
        notification.info("Creating permit for payment...");
        const permitResult = await createPermit({
          type: "sharing",
          issuer: address,
          recipient: evvmCoreContract.address as `0x${string}`,
        });
        
        if (!permitResult?.success) {
          notification.error("Failed to create permit for EVVMCore. Please try again.");
          return;
        }
        
        // Wait a bit to ensure the permit is processed
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 2: Encrypt the price AFTER the permit is created
      const encryptedPrice = await onEncryptInput(FheTypes.Uint64, totalPrice);

      if (!encryptedPrice) {
        notification.error("Failed to encrypt price");
        return;
      }

      // Step 3: Get the current nextTxId before payment
      // This will be used to calculate the payment txId after the payment is processed
      const currentNextTxId = nextTxId ? BigInt(nextTxId.toString()) : 0n;
      
      // Step 4: Call EVVMCore.requestPay() directly from frontend
      // This avoids FHE permission issues when passing encrypted values through multiple contracts
      notification.info("Processing payment...");
      await writeEVVMCore({
        functionName: "requestPay",
        args: [address, evvmCafeContract.address, encryptedPrice, evvmNonce],
      });

      // Step 5: Calculate the payment txId
      // The payment transaction will have txId = currentNextTxId (before increment)
      // After the payment, nextTxId will be currentNextTxId + 1
      const paymentTxId = currentNextTxId;

      // Step 6: Call EVVMCafe.orderCoffee() with the payment transaction ID
      notification.info("Registering order...");
      await writeEVVMCafe({
        functionName: "orderCoffee",
        args: [address, coffeeType, qty, paymentTxId, BigInt(serviceNonce), evvmNonce] as const,
      });

      notification.success("Coffee ordered successfully!");
      setServiceNonce(prev => prev + 1);
    } catch (error: any) {
      console.error("Order coffee error:", error);
      notification.error(error.message || "Failed to order coffee");
    }
  }, [
    address,
    cofheConnected,
    coffeePrice,
    quantity,
    coffeeType,
    serviceNonce,
    evvmNonce,
    nextTxId,
    evvmCafeContract,
    evvmCoreContract,
    createPermit,
    onEncryptInput,
    writeEVVMCore,
    writeEVVMCafe,
  ]);

  const isLoading = isEncryptingInput || isPendingCore || isPendingCafe;

  return (
    <div className="flex flex-col items-center py-10 px-4">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-8">☕ EVVM Cafe</h1>
        <p className="text-center text-gray-500 mb-8">
          Private coffee shop powered by FHE-enabled EVVM Virtual Blockchain
        </p>

        {!address && (
          <div className="alert alert-warning mb-4">
            <span>Please connect your wallet to continue</span>
          </div>
        )}

        {address && !cofheConnected && (
          <div className="alert alert-warning mb-4">
            <span>Please connect CoFHE to use encrypted features</span>
          </div>
        )}

        {/* Account Registration */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title">1. Register Your Account</h2>
            <p className="text-sm text-gray-500 mb-4">
              Register your account in EVVM Core with an initial encrypted balance
            </p>
            <p className="text-xs text-gray-400 mb-4">
              💡 Note: Balance is in <strong>tokens</strong> (not wei). Example: 1000 tokens = 1000 (not 1000000000000000000000)
              <br />
              ⚠️ For demo purposes, you can set any balance up to 1,000,000 tokens. This is a &quot;self-faucet&quot; for testing.
            </p>

            {isClientRegistered ? (
              <div className="alert alert-success">
                <span>✅ Account registered! Virtual Address: </span>
                <span className="font-mono text-xs">{clientVaddr?.slice(0, 20)}...</span>
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Initial balance (tokens)"
                    className="input input-bordered w-full"
                    value={initialBalance}
                    onChange={e => setInitialBalance(e.target.value)}
                  />
                  <label className="label">
                    <span className="label-text-alt text-gray-500">Enter amount in tokens (e.g., 1000)</span>
                  </label>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleRegisterClient}
                  disabled={isLoading || !address || !cofheConnected || inputEncryptionDisabled}
                >
                  {isLoading ? "Loading..." : "Register Account"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Shop Registration */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title">2. Register Shop (Owner Only)</h2>
            <p className="text-sm text-gray-500 mb-4">
              Register the coffee shop in EVVM Core (must be done before first order)
            </p>

            {isLoadingShopStatus ? (
              <div className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                <span>Checking shop status...</span>
              </div>
            ) : shopIsRegistered ? (
              <div className="alert alert-success">
                <span>✅ Shop is registered in EVVM</span>
                <button
                  className="btn btn-sm btn-outline ml-2"
                  onClick={() => refetchShopStatus()}
                  disabled={isLoading}
                >
                  🔄 Refresh
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={handleRegisterShop}
                    disabled={isLoading || !cofheConnected || inputEncryptionDisabled || shopIsRegistered}
                  >
                    {isLoading ? "Loading..." : "Register Shop"}
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => refetchShopStatus()}
                    disabled={isLoading}
                  >
                    🔄 Check Status
                  </button>
                </div>
                <div className="text-xs text-gray-400">
                  Status: {isShopRegistered === undefined ? "Unknown" : Boolean(isShopRegistered) ? "Registered" : "Not registered"}
                  {isShopRegistered !== undefined && ` (raw: ${String(isShopRegistered)}, type: ${typeof isShopRegistered})`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Coffee */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title">3. Order Coffee</h2>
            <p className="text-sm text-gray-500 mb-4">
              Place an order with encrypted payment via EVVM Core
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <select
                  className="select select-bordered flex-1"
                  value={coffeeType}
                  onChange={e => setCoffeeType(e.target.value)}
                >
                  {COFFEE_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Quantity"
                  className="input input-bordered w-32"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  min="1"
                />
              </div>

              {coffeePrice && (
                <div className="text-sm text-gray-500">
                  Price per unit: <strong>{coffeePrice.toString()} tokens</strong> | Total:{" "}
                  <strong>{(coffeePrice * BigInt(quantity || 1)).toString()} tokens</strong>
                </div>
              )}

              {!hasActivePermit && cofheConnected && address && (
                <div className="alert alert-warning">
                  <span>⚠️ You need a CoFHE permit to decrypt balances. </span>
                  <button
                    className="btn btn-sm btn-outline ml-2"
                    onClick={async () => {
                      setIsCreatingPermit(true);
                      try {
                        await createPermit({ type: "self", issuer: address });
                      } catch (error) {
                        console.error("Failed to create permit:", error);
                      } finally {
                        setIsCreatingPermit(false);
                      }
                    }}
                    disabled={isCreatingPermit}
                  >
                    {isCreatingPermit ? "Creating..." : "Create Permit"}
                  </button>
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleOrderCoffee}
                disabled={
                  isLoading ||
                  !address ||
                  !cofheConnected ||
                  !isClientRegistered ||
                  !shopIsRegistered ||
                  !coffeePrice ||
                  evvmNonce === undefined ||
                  inputEncryptionDisabled
                }
              >
                {isLoading ? "Processing..." : "Order Coffee"}
              </button>
              
              {(!address || !cofheConnected || !isClientRegistered || !shopIsRegistered || !coffeePrice || evvmNonce === undefined) && (
                <div className="text-xs text-gray-400 mt-2">
                  {!address && "⚠️ Connect wallet | "}
                  {!cofheConnected && "⚠️ Connect CoFHE | "}
                  {!isClientRegistered && "⚠️ Register account | "}
                  {!shopIsRegistered && (
                    <>
                      ⚠️ Shop not registered{" "}
                      <button
                        className="link link-primary text-xs"
                        onClick={() => refetchShopStatus()}
                      >
                        (refresh)
                      </button>{" "}
                      |{" "}
                    </>
                  )}
                  {!coffeePrice && "⚠️ Loading price | "}
                  {evvmNonce === undefined && "⚠️ Loading nonce"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Balances */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">4. Check Balances</h2>
            <p className="text-sm text-gray-500 mb-4">View encrypted balances (decrypt to see values)</p>

            <div className="flex flex-col gap-4">
              {/* Client Balance */}
              <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                <div>
                  <div className="font-semibold">Your Balance</div>
                  <div className="text-sm text-gray-500">
                    <Address address={address} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {clientBalanceResult.state === "success" && (
                    <span className="text-lg font-bold">{clientBalanceResult.value?.toString() || "0"} tokens</span>
                  )}
                  {(clientBalanceResult.state === "encrypted" || clientBalanceResult.state === "no-data") && (
                    <>
                      {clientBalanceResult.ctHash && clientBalanceResult.ctHash !== 0n && (
                        <div className="text-xs text-gray-400 font-mono">
                          Encrypted: {clientBalanceResult.ctHash.toString().slice(0, 20)}...
                        </div>
                      )}
                      {(!clientBalanceResult.ctHash || clientBalanceResult.ctHash === 0n) && (
                        <div className="text-xs text-gray-400">No balance data</div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={async () => {
                            if (!address || !evvmCoreContract?.address) return;
                            setIsCreatingPermit(true);
                            try {
                              // Create both self and sharing permits
                              // Self permit for general decryption
                              await createPermit({ type: "self", issuer: address });
                              // Sharing permit with contract as recipient (required for CoFHE decryption)
                              await createPermit({
                                type: "sharing",
                                issuer: address,
                                recipient: evvmCoreContract.address as `0x${string}`,
                              });
                              // Wait a bit to ensure permits are processed
                              await new Promise(resolve => setTimeout(resolve, 1000));
                              // Try to decrypt after creating permits
                              setTimeout(() => onDecryptClientBalance(), 500);
                            } catch (error) {
                              console.error("Failed to create permit:", error);
                            } finally {
                              setIsCreatingPermit(false);
                            }
                          }}
                          disabled={isCreatingPermit}
                        >
                          {isCreatingPermit ? "Creating Permit..." : "Create Permit & Decrypt"}
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={onDecryptClientBalance}>
                          Decrypt
                        </button>
                      </div>
                    </>
                  )}
                  {clientBalanceResult.state === "pending" && <span className="loading loading-spinner"></span>}
                  {clientBalanceResult.state === "error" && (
                    <span className="text-error text-sm">{clientBalanceResult.error}</span>
                  )}
                </div>
              </div>

              {/* Shop Balance */}
              <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                <div>
                  <div className="font-semibold">Shop Balance</div>
                  <div className="text-sm text-gray-500">Coffee Shop</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {shopBalanceResult.state === "success" && (
                    <span className="text-lg font-bold">{shopBalanceResult.value?.toString() || "0"} tokens</span>
                  )}
                  {(shopBalanceResult.state === "encrypted" || shopBalanceResult.state === "no-data") && (
                    <>
                      {shopBalanceResult.ctHash && shopBalanceResult.ctHash !== 0n && (
                        <div className="text-xs text-gray-400 font-mono">
                          Encrypted: {shopBalanceResult.ctHash.toString().slice(0, 20)}...
                        </div>
                      )}
                      {(!shopBalanceResult.ctHash || shopBalanceResult.ctHash === 0n) && (
                        <div className="text-xs text-gray-400">No balance data</div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={async () => {
                            if (!address || !evvmCoreContract?.address) return;
                            setIsCreatingPermit(true);
                            try {
                              // Create both self and sharing permits
                              // Self permit for general decryption
                              await createPermit({ type: "self", issuer: address });
                              // Sharing permit with contract as recipient (required for CoFHE decryption)
                              await createPermit({
                                type: "sharing",
                                issuer: address,
                                recipient: evvmCoreContract.address as `0x${string}`,
                              });
                              // Wait a bit to ensure permits are processed
                              await new Promise(resolve => setTimeout(resolve, 1000));
                              // Try to decrypt after creating permits
                              setTimeout(() => onDecryptShopBalance(), 500);
                            } catch (error) {
                              console.error("Failed to create permit:", error);
                            } finally {
                              setIsCreatingPermit(false);
                            }
                          }}
                          disabled={isCreatingPermit}
                        >
                          {isCreatingPermit ? "Creating Permit..." : "Create Permit & Decrypt"}
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={onDecryptShopBalance}>
                          Decrypt
                        </button>
                      </div>
                    </>
                  )}
                  {shopBalanceResult.state === "pending" && <span className="loading loading-spinner"></span>}
                  {shopBalanceResult.state === "error" && (
                    <span className="text-error text-sm">{shopBalanceResult.error}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contract Addresses */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            EVVMCore: <Address address={evvmCoreContract?.address || "0x02F43510755385162cD9C3b814812B879576b2De"} />
          </p>
          <p>
            EVVMCafe: <Address address={evvmCafeContract?.address || "0x906c237310C0d3bf9172fA56082C3EEBfb99F4a7"} />
          </p>
          <p className="mt-2">Network: Sepolia Testnet</p>
        </div>
      </div>
    </div>
  );
}

