// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/EVVM.core.sol";

/// @title EVVMCafe - Coffee Shop Example on EVVM with FHE
/// @notice Example contract demonstrating integration with EVVM Core using encrypted payments
/// @dev This contract uses address-based compatibility functions from EVVMCore
/// @dev All payment amounts are encrypted using FHE (Fully Homomorphic Encryption)
contract EVVMCafe is Ownable {
    // ============ State Variables ============
    
    /// @notice Reference to the EVVM Core contract
    EVVMCore public evvmCore;
    
    /// @notice Owner of the coffee shop (can withdraw funds)
    address public ownerOfShop;
    
    /// @notice Tracks used service nonces per client
    /// @dev Prevents replay attacks on service-level operations
    mapping(address => mapping(uint256 => bool)) private usedNonces;
    
    /// @notice Coffee prices (in plaintext for simplicity, could be encrypted)
    /// @dev In a production system, prices could also be encrypted
    mapping(string => uint256) public coffeePrices;
    
    // ============ Events ============
    
    /// @notice Emitted when a coffee order is placed
    /// @param client Address of the client who ordered
    /// @param coffeeType Type of coffee ordered
    /// @param quantity Quantity of coffee ordered
    /// @param evvmNonce Nonce used in the EVVM transaction
    event CoffeeOrdered(
        address indexed client,
        string coffeeType,
        uint256 quantity,
        uint64 evvmNonce
    );
    
    /// @notice Emitted when funds are withdrawn from the shop
    /// @param to Address receiving the funds
    /// @param amountEnc Encrypted amount withdrawn
    event FundsWithdrawn(
        address indexed to,
        euint64 amountEnc
    );

    // ============ Constructor ============
    
    /// @notice Deploys EVVMCafe contract
    /// @param _evvmAddress Address of the deployed EVVMCore contract
    /// @param _ownerOfShop Address of the shop owner (can withdraw funds)
    constructor(
        address _evvmAddress,
        address _ownerOfShop
    ) Ownable(msg.sender) {
        evvmCore = EVVMCore(_evvmAddress);
        ownerOfShop = _ownerOfShop;
        
        // Initialize coffee prices (in a real system, these could be encrypted)
        coffeePrices["espresso"] = 2; // 2 tokens
        coffeePrices["latte"] = 4;    // 4 tokens
        coffeePrices["cappuccino"] = 4; // 4 tokens
        coffeePrices["americano"] = 3;  // 3 tokens
    }

    // ============ Coffee Ordering ============
    
    /// @notice Places a coffee order and processes encrypted payment
    /// @param clientAddress Address of the client ordering coffee
    /// @param coffeeType Type of coffee to order
    /// @param quantity Number of coffees to order
    /// @param totalPriceEnc Encrypted total price (must match coffeeType * quantity)
    /// @param nonce Service-level nonce to prevent replay attacks
    /// @param evvmNonce EVVM nonce for the client's account
    /// @dev The client must have registered their account in EVVM Core first
    /// @dev The totalPriceEnc should be calculated off-chain: encrypt(coffeePrices[coffeeType] * quantity)
    function orderCoffee(
        address clientAddress,
        string memory coffeeType,
        uint256 quantity,
        InEuint64 calldata totalPriceEnc,
        uint256 nonce,
        uint64 evvmNonce
    ) external {
        // 1. Validate input
        require(quantity > 0, "EVVMCafe: quantity must be greater than 0");
        require(bytes(coffeeType).length > 0, "EVVMCafe: coffee type required");
        require(coffeePrices[coffeeType] > 0, "EVVMCafe: invalid coffee type");
        
        // 2. Check service nonce (prevent replay)
        require(!usedNonces[clientAddress][nonce], "EVVMCafe: nonce already used");
        
        // 3. Verify client is registered in EVVM
        bytes32 clientVaddr = evvmCore.getVaddrFromAddress(clientAddress);
        require(clientVaddr != bytes32(0), "EVVMCafe: client not registered in EVVM");
        
        // 4. Verify shop is registered in EVVM (auto-register if not)
        bytes32 shopVaddr = evvmCore.getVaddrFromAddress(address(this));
        if (shopVaddr == bytes32(0)) {
            // Auto-register shop with zero balance if not registered
            // Note: This requires the shop to have an encrypted zero balance
            // In production, this should be done during contract setup
            revert("EVVMCafe: shop must be registered in EVVM before first order");
        }
        
        // 5. Process payment via EVVM (using address-based compatibility function)
        evvmCore.requestPay(
            clientAddress,
            address(this),
            totalPriceEnc,
            evvmNonce
        );
        
        // 6. Mark service nonce as used
        usedNonces[clientAddress][nonce] = true;
        
        // 7. Emit event
        emit CoffeeOrdered(clientAddress, coffeeType, quantity, evvmNonce);
    }

    // ============ Fund Management ============
    
    /// @notice Withdraws encrypted funds from the shop to the owner
    /// @param to Address to receive the funds (must be registered in EVVM)
    /// @param amountEnc Encrypted amount to withdraw
    /// @dev Only the shop owner can call this function
    function withdrawFunds(
        address to,
        InEuint64 calldata amountEnc
    ) external onlyOwner {
        require(to != address(0), "EVVMCafe: invalid recipient address");
        
        // Get shop and recipient vaddr
        bytes32 shopVaddr = evvmCore.getVaddrFromAddress(address(this));
        bytes32 toVaddr = evvmCore.getVaddrFromAddress(to);
        
        require(shopVaddr != bytes32(0), "EVVMCafe: shop not registered");
        require(toVaddr != bytes32(0), "EVVMCafe: recipient not registered");
        
        // Get current nonce for the shop
        uint64 nonce = evvmCore.getNonce(shopVaddr);
        
        // Transfer encrypted funds
        evvmCore.applyTransfer(shopVaddr, toVaddr, amountEnc, nonce);
        
        // Get encrypted amount for event (convert InEuint64 to euint64)
        euint64 amountEncEuint = FHE.asEuint64(amountEnc);
        
        emit FundsWithdrawn(to, amountEncEuint);
    }

    // ============ Query Functions ============
    
    /// @notice Returns the encrypted balance of the coffee shop
    /// @return balance Encrypted balance (euint64)
    /// @dev Frontend must decrypt this using cofhesdkClient.decryptHandle()
    function getShopBalance() external view returns (euint64) {
        bytes32 shopVaddr = evvmCore.getVaddrFromAddress(address(this));
        require(shopVaddr != bytes32(0), "EVVMCafe: shop not registered");
        return evvmCore.getEncryptedBalance(shopVaddr);
    }
    
    /// @notice Returns the encrypted balance of a client
    /// @param client Address of the client
    /// @return balance Encrypted balance (euint64)
    /// @dev Frontend must decrypt this using cofhesdkClient.decryptHandle()
    function getClientBalance(address client) external view returns (euint64) {
        bytes32 clientVaddr = evvmCore.getVaddrFromAddress(client);
        require(clientVaddr != bytes32(0), "EVVMCafe: client not registered");
        return evvmCore.getEncryptedBalance(clientVaddr);
    }
    
    /// @notice Checks if a service nonce has been used
    /// @param client Address of the client
    /// @param nonce Service nonce to check
    /// @return used True if the nonce has been used
    function isNonceUsed(address client, uint256 nonce) external view returns (bool) {
        return usedNonces[client][nonce];
    }
    
    /// @notice Gets the price of a coffee type
    /// @param coffeeType Type of coffee
    /// @return price Price in tokens (plaintext)
    function getCoffeePrice(string memory coffeeType) external view returns (uint256) {
        return coffeePrices[coffeeType];
    }

    // ============ Setup Functions ============
    
    /// @notice Registers the shop in EVVM Core (must be called before first order)
    /// @param initialBalance Encrypted initial balance for the shop (usually zero)
    /// @dev This function should be called during setup to register the shop's address in EVVM
    /// @dev The shop address will be automatically mapped to a vaddr
    function registerShopInEVVM(InEuint64 calldata initialBalance) external {
        bytes32 shopVaddr = evvmCore.getVaddrFromAddress(address(this));
        require(shopVaddr == bytes32(0), "EVVMCafe: shop already registered");
        
        // Register shop using address-based function
        evvmCore.registerAccountFromAddress(address(this), initialBalance);
    }
    
    /// @notice Checks if the shop is registered in EVVM
    /// @return registered True if the shop is registered
    function isShopRegistered() external view returns (bool) {
        bytes32 shopVaddr = evvmCore.getVaddrFromAddress(address(this));
        return shopVaddr != bytes32(0);
    }

    // ============ Admin Functions ============
    
    /// @notice Sets the price of a coffee type (owner only)
    /// @param coffeeType Type of coffee
    /// @param price New price in tokens
    function setCoffeePrice(string memory coffeeType, uint256 price) external onlyOwner {
        require(bytes(coffeeType).length > 0, "EVVMCafe: coffee type required");
        coffeePrices[coffeeType] = price;
    }
    
    /// @notice Updates the shop owner address (owner only)
    /// @param newOwner New owner address
    function setShopOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "EVVMCafe: invalid owner address");
        ownerOfShop = newOwner;
    }
}

