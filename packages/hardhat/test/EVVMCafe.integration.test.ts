/* eslint-disable @typescript-eslint/no-unused-vars */
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";
import { Encryptable } from "@cofhe/sdk";
import { expect } from "chai";

/**
 * @file EVVMCafe.integration.test.ts
 * @description Integration tests for EVVMCafe with EVVMCore
 *
 * This test suite covers:
 * - Contract deployment
 * - Shop registration in EVVM
 * - Coffee ordering with encrypted payments
 * - Balance queries
 * - Fund withdrawal
 */

describe("EVVMCafe Integration", function () {
  /**
   * @dev Deploys EVVMCore and EVVMCafe contracts for each test
   */
  async function deployContractsFixture() {
    const [owner, shopOwner, client] = await hre.ethers.getSigners();

    // Deploy EVVMCore
    const EVVMCore = await hre.ethers.getContractFactory("EVVMCore");
    const vChainId = 1n;
    const evvmID = 100n;
    const evvmCore = await EVVMCore.connect(owner).deploy(vChainId, evvmID);

    // Deploy EVVMCafe
    const EVVMCafe = await hre.ethers.getContractFactory("EVVMCafe");
    const evvmCafe = await EVVMCafe.connect(owner).deploy(await evvmCore.getAddress(), shopOwner.address);

    return { evvmCore, evvmCafe, owner, shopOwner, client, vChainId, evvmID };
  }

  describe("Deployment", function () {
    it("Should deploy EVVMCafe with correct initial values", async function () {
      const { evvmCafe, evvmCore, shopOwner } = await loadFixture(deployContractsFixture);

      expect(await evvmCafe.evvmCore()).to.equal(await evvmCore.getAddress());
      expect(await evvmCafe.ownerOfShop()).to.equal(shopOwner.address);
    });

    it("Should have initial coffee prices set", async function () {
      const { evvmCafe } = await loadFixture(deployContractsFixture);

      expect(await evvmCafe.getCoffeePrice("espresso")).to.equal(2);
      expect(await evvmCafe.getCoffeePrice("latte")).to.equal(4);
      expect(await evvmCafe.getCoffeePrice("cappuccino")).to.equal(4);
      expect(await evvmCafe.getCoffeePrice("americano")).to.equal(3);
    });
  });

  describe("Shop Registration", function () {
    it("Should register shop in EVVM with zero balance", async function () {
      const { evvmCafe, evvmCore, owner } = await loadFixture(deployContractsFixture);

      const ownerClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(owner);

      // Encrypt zero balance
      const encryptResult = await ownerClient.encryptInputs([Encryptable.uint64(0n)]).encrypt();
      const [encryptedZero] = await hre.cofhesdk.expectResultSuccess(encryptResult);

      // Check shop is not registered initially
      expect(await evvmCafe.isShopRegistered()).to.equal(false);

      // Register shop
      await evvmCafe.registerShopInEVVM(encryptedZero);

      // Verify shop is now registered
      expect(await evvmCafe.isShopRegistered()).to.equal(true);

      // Verify shop has zero balance
      const shopBalance = await evvmCafe.getShopBalance();
      await hre.cofhesdk.mocks.expectPlaintext(shopBalance, 0n);
    });

    it("Should fail to register shop twice", async function () {
      const { evvmCafe, owner } = await loadFixture(deployContractsFixture);

      const ownerClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(owner);

      const encryptResult = await ownerClient.encryptInputs([Encryptable.uint64(0n)]).encrypt();
      const [encryptedZero] = await hre.cofhesdk.expectResultSuccess(encryptResult);

      await evvmCafe.registerShopInEVVM(encryptedZero);

      // Try to register again
      await expect(evvmCafe.registerShopInEVVM(encryptedZero)).to.be.revertedWith("EVVMCafe: shop already registered");
    });
  });

  describe("Coffee Ordering", function () {
    it("Should process coffee order with encrypted payment", async function () {
      const { evvmCore, evvmCafe, client, owner } = await loadFixture(deployContractsFixture);

      // Setup: Register shop
      const ownerClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(owner);
      const shopEncryptResult = await ownerClient.encryptInputs([Encryptable.uint64(0n)]).encrypt();
      const [encryptedZero] = await hre.cofhesdk.expectResultSuccess(shopEncryptResult);
      await evvmCafe.registerShopInEVVM(encryptedZero);

      // Setup: Register client with balance
      const clientClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(client);
      const clientEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(1000n)]).encrypt();
      const [clientBalance] = await hre.cofhesdk.expectResultSuccess(clientEncryptResult);
      await evvmCore.connect(client).registerAccountFromAddress(client.address, clientBalance);

      // Order coffee: 2 espressos = 4 tokens
      const price = await evvmCafe.getCoffeePrice("espresso");
      const totalPrice = price * 2n; // 2 espressos

      const priceEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(totalPrice)]).encrypt();
      const [totalPriceEnc] = await hre.cofhesdk.expectResultSuccess(priceEncryptResult);

      const evvmNonce = await evvmCore.getNonce(evvmCore.getVaddrFromAddress(client.address));

      // Place order
      await evvmCafe.connect(client).orderCoffee(
        client.address,
        "espresso",
        2,
        totalPriceEnc,
        1, // Service nonce
        evvmNonce,
      );

      // Verify client balance decreased (1000 - 4 = 996)
      const clientBalanceAfter = await evvmCafe.getClientBalance(client.address);
      await hre.cofhesdk.mocks.expectPlaintext(clientBalanceAfter, 996n);

      // Verify shop balance increased (0 + 4 = 4)
      const shopBalance = await evvmCafe.getShopBalance();
      await hre.cofhesdk.mocks.expectPlaintext(shopBalance, 4n);
    });

    it("Should fail order if shop is not registered", async function () {
      const { evvmCore, evvmCafe, client } = await loadFixture(deployContractsFixture);

      // Register client but not shop
      const clientClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(client);
      const clientEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(1000n)]).encrypt();
      const [clientBalance] = await hre.cofhesdk.expectResultSuccess(clientEncryptResult);
      await evvmCore.connect(client).registerAccountFromAddress(client.address, clientBalance);

      const priceEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(4n)]).encrypt();
      const [totalPriceEnc] = await hre.cofhesdk.expectResultSuccess(priceEncryptResult);

      await expect(
        evvmCafe.connect(client).orderCoffee(client.address, "espresso", 2, totalPriceEnc, 1, 0),
      ).to.be.revertedWith("EVVMCafe: shop must be registered in EVVM before first order");
    });

    it("Should fail order if client is not registered", async function () {
      const { evvmCafe, client } = await loadFixture(deployContractsFixture);

      const clientClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(client);
      const priceEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(4n)]).encrypt();
      const [totalPriceEnc] = await hre.cofhesdk.expectResultSuccess(priceEncryptResult);

      await expect(
        evvmCafe.connect(client).orderCoffee(client.address, "espresso", 2, totalPriceEnc, 1, 0),
      ).to.be.revertedWith("EVVMCafe: client not registered in EVVM");
    });

    it("Should prevent replay attacks with service nonce", async function () {
      const { evvmCore, evvmCafe, client, owner } = await loadFixture(deployContractsFixture);

      // Setup shop and client
      const ownerClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(owner);
      const shopEncryptResult = await ownerClient.encryptInputs([Encryptable.uint64(0n)]).encrypt();
      const [encryptedZero] = await hre.cofhesdk.expectResultSuccess(shopEncryptResult);
      await evvmCafe.registerShopInEVVM(encryptedZero);

      const clientClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(client);
      const clientEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(1000n)]).encrypt();
      const [clientBalance] = await hre.cofhesdk.expectResultSuccess(clientEncryptResult);
      await evvmCore.connect(client).registerAccountFromAddress(client.address, clientBalance);

      const priceEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(4n)]).encrypt();
      const [totalPriceEnc] = await hre.cofhesdk.expectResultSuccess(priceEncryptResult);

      const evvmNonce = await evvmCore.getNonce(evvmCore.getVaddrFromAddress(client.address));
      const serviceNonce = 1;

      // First order succeeds
      await evvmCafe.connect(client).orderCoffee(client.address, "espresso", 2, totalPriceEnc, serviceNonce, evvmNonce);

      // Second order with same service nonce should fail
      const newEvvmNonce = await evvmCore.getNonce(evvmCore.getVaddrFromAddress(client.address));
      await expect(
        evvmCafe.connect(client).orderCoffee(
          client.address,
          "espresso",
          2,
          totalPriceEnc,
          serviceNonce, // Same service nonce
          newEvvmNonce,
        ),
      ).to.be.revertedWith("EVVMCafe: nonce already used");
    });
  });

  describe("Fund Management", function () {
    it("Should allow owner to withdraw funds", async function () {
      const { evvmCore, evvmCafe, owner, shopOwner } = await loadFixture(deployContractsFixture);

      // Setup: Register shop and owner
      const ownerClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(owner);
      const shopEncryptResult = await ownerClient.encryptInputs([Encryptable.uint64(100n)]).encrypt();
      const [shopBalance] = await hre.cofhesdk.expectResultSuccess(shopEncryptResult);
      await evvmCafe.registerShopInEVVM(shopBalance);

      const ownerEncryptResult = await ownerClient.encryptInputs([Encryptable.uint64(0n)]).encrypt();
      const [ownerBalance] = await hre.cofhesdk.expectResultSuccess(ownerEncryptResult);
      await evvmCore.connect(owner).registerAccountFromAddress(shopOwner.address, ownerBalance);

      // Withdraw 50 tokens
      const withdrawEncryptResult = await ownerClient.encryptInputs([Encryptable.uint64(50n)]).encrypt();
      const [withdrawAmount] = await hre.cofhesdk.expectResultSuccess(withdrawEncryptResult);

      await evvmCafe.connect(owner).withdrawFunds(shopOwner.address, withdrawAmount);

      // Verify shop balance decreased (100 - 50 = 50)
      const shopBalanceAfter = await evvmCafe.getShopBalance();
      await hre.cofhesdk.mocks.expectPlaintext(shopBalanceAfter, 50n);

      // Verify owner balance increased (0 + 50 = 50)
      const ownerBalanceAfter = await evvmCafe.getClientBalance(shopOwner.address);
      await hre.cofhesdk.mocks.expectPlaintext(ownerBalanceAfter, 50n);
    });

    it("Should fail withdrawal from non-owner", async function () {
      const { evvmCafe, client } = await loadFixture(deployContractsFixture);

      const clientClient = await hre.cofhesdk.createBatteriesIncludedCofhesdkClient(client);
      const withdrawEncryptResult = await clientClient.encryptInputs([Encryptable.uint64(50n)]).encrypt();
      const [withdrawAmount] = await hre.cofhesdk.expectResultSuccess(withdrawEncryptResult);

      await expect(
        evvmCafe.connect(client).withdrawFunds(client.address, withdrawAmount),
      ).to.be.revertedWithCustomError(evvmCafe, "OwnableUnauthorizedAccount");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set coffee prices", async function () {
      const { evvmCafe, owner } = await loadFixture(deployContractsFixture);

      await evvmCafe.connect(owner).setCoffeePrice("mocha", 5);
      expect(await evvmCafe.getCoffeePrice("mocha")).to.equal(5);
    });

    it("Should allow owner to update shop owner", async function () {
      const { evvmCafe, owner, client } = await loadFixture(deployContractsFixture);

      await evvmCafe.connect(owner).setShopOwner(client.address);
      expect(await evvmCafe.ownerOfShop()).to.equal(client.address);
    });
  });
});
