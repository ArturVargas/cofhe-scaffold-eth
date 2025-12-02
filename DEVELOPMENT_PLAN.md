# Incremental Development Plan - EVVM Core

This document describes the 10 incremental steps to develop the EVVM Core contract. Each step is an independent, compilable, and functional commit.

---

## 📋 Step 1: Base Contract Structure

**Objective**: Establish the contract foundation with imports, constructor, and basic data structures.

**Files to create/modify**:
- `packages/hardhat/contracts/core/EVVM.core.sol`

**Code to include**:
- CoFHE and Ownable imports
- Basic `VirtualAccount` struct (only with `exists` flag initially)
- Essential state variables:
  - `vChainId` (immutable)
  - `vBlockNumber`
  - `evvmID`
  - `mapping(bytes32 => VirtualAccount) private accounts`
- Basic constructor
- Basic events (declarations only)

**Context**: This step establishes the minimum contract foundation without operational functionality. It's the "skeleton" we'll build upon.

**Commit message**: `feat: Add base contract structure with VirtualAccount mapping`

---

## 📋 Step 2: Virtual Account System

**Objective**: Implement virtual account registration and basic queries.

**Features to add**:

- `registerAccount(bytes32 vaddr, InEuint64 initialBalance)`
- `accountExists(bytes32 vaddr)`
- Complete `VirtualAccount` struct with `balance` and `nonce`
- `VirtualAccountRegistered` event

**Key code**:

```solidity
function registerAccount(bytes32 vaddr, InEuint64 calldata initialBalance) external {
    require(!accounts[vaddr].exists, "EVVM: account already exists");
    euint64 balance = FHE.asEuint64(initialBalance);
    accounts[vaddr] = VirtualAccount({
        balance: balance,
        nonce: 0,
        exists: true
    });
    FHE.allowThis(balance);
    FHE.allowSender(balance);
    emit VirtualAccountRegistered(vaddr, 0);
}
```

**Context**: This step enables creating virtual accounts with encrypted balances. It's the foundation for all subsequent operations.

**Commit message**: `feat: Implement virtual account registration with encrypted balances`

---

## 📋 Step 3: Basic Transfers

**Objective**: Implement transfers between virtual accounts with nonce validation.

**Features to add**:

- `applyTransfer()` - main transfer function
- Nonce validation for replay protection
- FHE operations (sub/add) on encrypted balances
- Automatic `vBlockNumber` increment
- `VirtualTransferApplied` event

**Key code**:
```solidity
function applyTransfer(
    bytes32 fromVaddr,
    bytes32 toVaddr,
    InEuint64 calldata amount,
    uint64 expectedNonce
) external returns (uint256 txId) {
    // Validations and FHE operations
    euint64 amountEnc = FHE.asEuint64(amount);
    euint64 newFromBalance = FHE.sub(fromAcc.balance, amountEnc);
    euint64 newToBalance = FHE.add(toAcc.balance, amountEnc);
    // ...
}
```

**Context**: This is the heart of the payment system. It allows transferring encrypted funds between virtual accounts while maintaining privacy.

**Commit message**: `feat: Add encrypted transfer functionality with nonce validation`

---

## 📋 Step 4: Virtual Chain Progression

**Objective**: Implement virtual block system and state commitment.

**Features to add**:

- `stateCommitment` variable
- `createVirtualBlock(bytes32 newCommitment)`
- `updateStateCommitment(bytes32 newCommitment)`
- `VirtualBlockCreated` and `StateCommitmentUpdated` events
- Improve `applyTransfer()` to emit block events

**Context**: This step transforms the system into a true virtual blockchain with block progression and state commitments.

**Commit message**: `feat: Implement virtual block progression and state commitments`

---

## 📋 Step 5: Virtual Transaction Registry

**Objective**: Store and query applied virtual transactions.

**Features to add**:

- Complete `VirtualTransaction` struct
- `mapping(uint256 => VirtualTransaction) public virtualTransactions`
- `nextTxId` variable
- Modify `applyTransfer()` to save the transaction
- `getVirtualTransaction(uint256 txId)`

**Context**: This step enables audit and historical query of transactions, essential for a complete virtual blockchain.

**Commit message**: `feat: Add virtual transaction storage and retrieval`

---

## 📋 Step 6: Batch Transfers

**Objective**: Allow processing multiple transfers in a single virtual block.

**Features to add**:

- `TransferParams` struct
- `applyTransferBatch(TransferParams[] calldata transfers)`
- Individual transaction error handling
- Grouping txs in a single block

**Key code**:

```solidity
function applyTransferBatch(TransferParams[] calldata transfers) 
    external returns (uint256 successfulTxs, uint256 failedTxs, uint256[] memory txIds) {
    // Process each transfer with try/catch
    // Group in a single virtual block
}
```

**Context**: Improves efficiency by allowing batch processing of multiple transactions, similar to blocks in real blockchains.

**Commit message**: `feat: Add batch transfer processing for multiple transactions per block`

---

## 📋 Step 7: Utility Functions

**Objective**: Add helper and query functions to improve usability.

**Features to add**:

- `generateVaddrFromAddress(address realAddress, bytes32 salt)` - helper to generate vaddr
- `getAccount(bytes32 vaddr)` - get complete account
- `getEncryptedBalance(bytes32 vaddr)` - query encrypted balance
- `getNonce(bytes32 vaddr)` - query nonce

**Context**: These functions facilitate interaction with the contract from frontend and other contracts.

**Commit message**: `feat: Add utility functions for account management and queries`

---

## 📋 Step 8: Advanced Block Management

**Objective**: Improve virtual block system with more control and flexibility.

**Features to add**:

- Improve `createVirtualBlock()` with validations
- Better integrate `stateCommitment` in transfer flow
- Optional: function to get block information

**Context**: Refines the block system for greater control and prepares the ground for future improvements (validators, consensus, etc.).

**Commit message**: `feat: Enhance virtual block management with improved state commitment handling`

---

## 📋 Step 9: Admin Functions and Testing

**Objective**: Add administrative functions and testing tools.

**Features to add**:

- `setEvvmID(uint256 newEvvmID)` - update EVVM ID
- `faucetAddBalance(bytes32 vaddr, InEuint64 amount)` - faucet for testing
- Improve FHE permissions in all functions
- Additional validations where necessary

**Context**: These functions are essential for development, testing, and contract maintenance in production.

**Commit message**: `feat: Add admin functions and testing utilities (faucet, evvmID management)`

---

## 📋 Step 10: Documentation and Complete Events

**Objective**: Complete documentation, events, and finalize the contract.

**Tasks**:

- Complete all missing events
- Add complete NatSpec to all functions
- Review and improve comments
- Add notes on limitations and future improvements
- Verify all events are emitted correctly
- Document the complete usage flow

**Context**: This step ensures the contract is well documented and production-ready, facilitating future maintenance and scaling.

**Commit message**: `docs: Complete NatSpec documentation and finalize events`

---

## 📊 Progress Summary

| Step | Main Functionality | Dependencies |
|------|-------------------|--------------|
| 1 | Base structure | None |
| 2 | Virtual accounts | Step 1 |
| 3 | Transfers | Step 2 |
| 4 | Virtual blocks | Step 3 |
| 5 | Transaction registry | Step 3 |
| 6 | Batch transfers | Step 3, 5 |
| 7 | Utilities | Step 2, 3 |
| 8 | Block management | Step 4 |
| 9 | Admin/Testing | All previous |
| 10 | Documentation | All previous |

---

## 🚀 Usage Guide

To implement each step:

1. **Create branch**: `git checkout -b step-X-feature-name`
2. **Implement code**: Follow the code described in each step
3. **Compile**: `yarn hardhat compile`
4. **Verify**: Ensure it compiles without errors
5. **Commit**: Use the suggested message
6. **Merge**: `git checkout main && git merge step-X-feature-name`

---

## 📝 Important Notes

- Each step must compile independently
- Don't add functionalities from future steps in previous steps
- Keep code simple and functional in each step
- Tests can be added after Step 10
- Signature validation can be added as a future extension

---

## 🔮 Future Extensions (Post-MVP)

- Signature validation for transactions
- Validator system
- Multiple tokens per account
- NameService integration
- Staking system
- Treasury functions
- Cross-chain bridge (Fisher Bridge)
