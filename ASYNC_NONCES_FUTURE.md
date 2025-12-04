# Async Nonces Support - Future Enhancement

This document describes a future enhancement to support asynchronous (out-of-order) nonces in the EVVM Core contract. This feature is **not currently implemented** but is documented here for future reference.

## Table of Contents

- [Overview](#overview)
- [Why Async Nonces?](#why-async-nonces)
- [Implementation Plan](#implementation-plan)
- [Trade-offs](#trade-offs)
- [Migration Strategy](#migration-strategy)

## Overview

Currently, EVVM Core uses **synchronous nonces** where transactions must be submitted in sequential order (nonce 0, then 1, then 2, etc.). This document outlines how to implement **asynchronous nonces** that allow transactions to be processed out of order while maintaining backward compatibility.

### Current Behavior (Synchronous Nonces)

```solidity
// Current implementation in applyTransfer()
require(fromAcc.nonce == expectedNonce, "EVVM: bad nonce");
fromAcc.nonce += 1;
```

- Transactions must be submitted in order
- If nonce 5 arrives before nonce 4, it will fail
- Simple and gas-efficient
- Prevents replay attacks

### Proposed Behavior (Async Nonces)

```solidity
// Proposed implementation
if (asyncNoncesEnabled && accountAsyncNoncesEnabled[fromVaddr]) {
    // Async: check if nonce already used
    require(!usedNonces[fromVaddr][expectedNonce], "EVVM: nonce already used");
    usedNonces[fromVaddr][expectedNonce] = true;
} else {
    // Sync: sequential validation (current behavior)
    require(fromAcc.nonce == expectedNonce, "EVVM: bad nonce");
    fromAcc.nonce += 1;
}
```

- Transactions can be submitted in any order
- Nonce 5 can arrive before nonce 4 and still be processed
- Requires additional storage to track used nonces
- More flexible but higher gas costs

## Why Async Nonces?

### 1. Parallel Transaction Processing

**Use Case**: High-frequency trading or batch operations

```typescript
// User wants to submit 10 transactions simultaneously
// With sync nonces: Must wait for each to confirm before submitting next
// With async nonces: Can submit all 10 at once with nonces 0-9

const transactions = [];
for (let i = 0; i < 10; i++) {
  transactions.push({
    nonce: i,
    // ... other params
  });
}

// Submit all at once
await Promise.all(transactions.map(tx => submitTransaction(tx)));
```

**Benefits**:
- Faster execution for batch operations
- Better user experience
- Reduced waiting time

### 2. Network Congestion Handling

**Problem**: In high-traffic scenarios, transactions may arrive out of order due to network delays.

**Example**:
```
User submits:
- Transaction A with nonce 4
- Transaction B with nonce 5

Network delivers:
- Transaction B arrives first
- Transaction A arrives later

With sync nonces: Transaction B fails (nonce 5 > current nonce 4)
With async nonces: Both transactions succeed
```

**Benefits**:
- Fewer failed transactions
- Better resilience to network issues
- Improved user experience

### 3. Flexibility for Complex Use Cases

**Use Cases**:
- Multi-signature wallets where different signers submit transactions independently
- Off-chain order matching systems
- Complex DeFi protocols with parallel operations

## Implementation Plan

### Step 1: Add State Variables

```solidity
// Track which nonces have been used per account
mapping(bytes32 => mapping(uint64 => bool)) private usedNonces;

// Global flag to enable/disable async nonces
bool public asyncNoncesEnabled;

// Per-account flag to enable async nonces
mapping(bytes32 => bool) public accountAsyncNoncesEnabled;
```

### Step 2: Modify Nonce Validation in `applyTransfer()`

```solidity
function _applyTransferInternal(
    bytes32 fromVaddr,
    bytes32 toVaddr,
    InEuint64 calldata amount,
    uint64 expectedNonce,
    bool incrementBlock
) internal returns (uint256 txId) {
    // ... existing code ...
    
    VirtualAccount storage fromAcc = accounts[fromVaddr];
    
    // Nonce validation: support both sync and async modes
    if (asyncNoncesEnabled && accountAsyncNoncesEnabled[fromVaddr]) {
        // Async nonce mode: check if nonce already used
        require(!usedNonces[fromVaddr][expectedNonce], "EVVM: nonce already used");
        usedNonces[fromVaddr][expectedNonce] = true;
        
        // Update highest nonce used (for reference, optional)
        if (expectedNonce > fromAcc.nonce) {
            fromAcc.nonce = expectedNonce;
        }
    } else {
        // Sync nonce mode: must be sequential (current behavior)
        require(fromAcc.nonce == expectedNonce, "EVVM: bad nonce");
        fromAcc.nonce += 1;
    }
    
    // ... rest of function ...
}
```

### Step 3: Add Function to Enable Async Nonces

```solidity
/// @notice Enables async nonces for a specific account
/// @param vaddr Virtual address of the account
/// @dev Only the account owner (via signature) or contract owner can enable
/// @dev Requires asyncNoncesEnabled to be true globally
function enableAsyncNonces(bytes32 vaddr) external {
    require(asyncNoncesEnabled, "EVVM: async nonces not enabled globally");
    require(accounts[vaddr].exists, "EVVM: account does not exist");
    
    // TODO: Add signature validation to verify account ownership
    // For now, only contract owner can enable (can be changed later)
    require(msg.sender == owner(), "EVVM: only owner can enable async nonces");
    
    accountAsyncNoncesEnabled[vaddr] = true;
    emit AsyncNoncesEnabled(vaddr);
}
```

### Step 4: Add Admin Functions

```solidity
/// @notice Enables/disables async nonces globally
/// @param enabled True to enable async nonces globally
/// @dev Only contract owner can call this
function setAsyncNoncesEnabled(bool enabled) external onlyOwner {
    asyncNoncesEnabled = enabled;
    emit AsyncNoncesEnabledGlobally(enabled);
}

/// @notice Disables async nonces for a specific account
/// @param vaddr Virtual address of the account
/// @dev Only contract owner can call this
function disableAsyncNonces(bytes32 vaddr) external onlyOwner {
    accountAsyncNoncesEnabled[vaddr] = false;
    emit AsyncNoncesDisabled(vaddr);
}
```

### Step 5: Add Events

```solidity
/// @notice Emitted when async nonces are enabled globally
event AsyncNoncesEnabledGlobally(bool enabled);

/// @notice Emitted when async nonces are enabled for an account
event AsyncNoncesEnabled(bytes32 indexed vaddr);

/// @notice Emitted when async nonces are disabled for an account
event AsyncNoncesDisabled(bytes32 indexed vaddr);
```

### Step 6: Update `VirtualAccount` Struct (Optional)

```solidity
struct VirtualAccount {
    euint64 balance;
    uint64 nonce;         // Current nonce (sync) or highest nonce used (async)
    bool exists;
    // Optional: track if account uses async nonces
    // bool usesAsyncNonces; // Can be derived from accountAsyncNoncesEnabled mapping
}
```

## Trade-offs

### Advantages

1. **Flexibility**: Allows parallel transaction submission
2. **Resilience**: Handles network congestion better
3. **User Experience**: Faster batch operations
4. **Backward Compatibility**: Sync nonces remain default

### Disadvantages

1. **Storage Cost**: 
   - Additional mapping: `mapping(bytes32 => mapping(uint64 => bool))`
   - Each used nonce requires storage
   - For accounts with many transactions, storage grows

2. **Gas Cost**:
   - Slightly higher per transaction (mapping lookup)
   - Storage writes are expensive
   - Estimated: +5,000-10,000 gas per transaction

3. **Complexity**:
   - More complex validation logic
   - Need to handle both sync and async modes
   - Potential for bugs in edge cases

4. **Nonce Management**:
   - Users must track which nonces they've used
   - Risk of nonce gaps if transactions fail
   - More complex frontend logic

## Migration Strategy

### Phase 1: Preparation (Current State)

- ✅ Document the enhancement (this document)
- ✅ Keep sync nonces as default
- ✅ No breaking changes

### Phase 2: Implementation (Future)

1. **Add state variables** without breaking existing functionality
2. **Implement dual-mode validation** in `applyTransfer()`
3. **Add admin functions** to enable/disable async nonces
4. **Add events** for tracking
5. **Write comprehensive tests** for both modes

### Phase 3: Testing

1. **Unit tests** for both sync and async modes
2. **Integration tests** for parallel transaction submission
3. **Gas cost analysis** to measure overhead
4. **Edge case testing** (nonce gaps, out-of-order arrival, etc.)

### Phase 4: Deployment

1. **Deploy with async nonces disabled by default**
2. **Enable for specific accounts** that need it
3. **Monitor gas costs and performance**
4. **Gradually enable for more accounts** if successful

### Phase 5: Optional: Make Async Default

If async nonces prove successful:
1. **Make async nonces default** for new accounts
2. **Allow opt-out** for accounts that prefer sync
3. **Deprecate sync nonces** (optional, long-term)

## Code Example: Complete Implementation

```solidity
// ============ State Variables ============

/// @notice Tracks which nonces have been used per account (for async mode)
mapping(bytes32 => mapping(uint64 => bool)) private usedNonces;

/// @notice Global flag to enable/disable async nonces
bool public asyncNoncesEnabled;

/// @notice Per-account flag to enable async nonces
mapping(bytes32 => bool) public accountAsyncNoncesEnabled;

// ============ Events ============

event AsyncNoncesEnabledGlobally(bool enabled);
event AsyncNoncesEnabled(bytes32 indexed vaddr);
event AsyncNoncesDisabled(bytes32 indexed vaddr);

// ============ Modified applyTransfer() ============

function _applyTransferInternal(
    bytes32 fromVaddr,
    bytes32 toVaddr,
    InEuint64 calldata amount,
    uint64 expectedNonce,
    bool incrementBlock
) internal returns (uint256 txId) {
    // ... existing validation code ...
    
    VirtualAccount storage fromAcc = accounts[fromVaddr];
    
    // Nonce validation: support both sync and async modes
    uint64 usedNonce = expectedNonce;
    
    if (asyncNoncesEnabled && accountAsyncNoncesEnabled[fromVaddr]) {
        // Async nonce mode
        require(!usedNonces[fromVaddr][expectedNonce], "EVVM: nonce already used");
        usedNonces[fromVaddr][expectedNonce] = true;
        
        // Update highest nonce used (for reference)
        if (expectedNonce > fromAcc.nonce) {
            fromAcc.nonce = expectedNonce;
        }
    } else {
        // Sync nonce mode (current behavior)
        require(fromAcc.nonce == expectedNonce, "EVVM: bad nonce");
        fromAcc.nonce += 1;
    }
    
    // ... rest of function using usedNonce ...
}

// ============ Admin Functions ============

function setAsyncNoncesEnabled(bool enabled) external onlyOwner {
    asyncNoncesEnabled = enabled;
    emit AsyncNoncesEnabledGlobally(enabled);
}

function enableAsyncNonces(bytes32 vaddr) external {
    require(asyncNoncesEnabled, "EVVM: async nonces not enabled globally");
    require(accounts[vaddr].exists, "EVVM: account does not exist");
    // TODO: Add signature validation for account ownership
    require(msg.sender == owner(), "EVVM: only owner can enable");
    
    accountAsyncNoncesEnabled[vaddr] = true;
    emit AsyncNoncesEnabled(vaddr);
}

function disableAsyncNonces(bytes32 vaddr) external onlyOwner {
    accountAsyncNoncesEnabled[vaddr] = false;
    emit AsyncNoncesDisabled(vaddr);
}

// ============ Query Functions ============

function isNonceUsed(bytes32 vaddr, uint64 nonce) external view returns (bool) {
    return usedNonces[vaddr][nonce];
}

function isAsyncNoncesEnabled(bytes32 vaddr) external view returns (bool) {
    return asyncNoncesEnabled && accountAsyncNoncesEnabled[vaddr];
}
```

## Testing Strategy

### Test Cases

1. **Sync Mode (Default)**:
   - Sequential nonces work correctly
   - Out-of-order nonces fail
   - Nonce increments correctly

2. **Async Mode**:
   - Out-of-order nonces work correctly
   - Duplicate nonces fail
   - Nonce gaps are allowed
   - Highest nonce tracking works

3. **Mode Switching**:
   - Account can switch from sync to async
   - Switching doesn't break existing transactions
   - Can't use sync nonces after enabling async

4. **Edge Cases**:
   - Very large nonce values
   - Nonce gaps (e.g., use 0, 2, 5, skipping 1, 3, 4)
   - Concurrent transactions with same nonce
   - Switching modes mid-transaction

## Gas Cost Analysis

### Estimated Costs

**Sync Nonces (Current)**:
- Nonce validation: ~2,100 gas
- Nonce increment: ~5,000 gas (SSTORE)
- **Total**: ~7,100 gas

**Async Nonces (Proposed)**:
- Mapping lookup: ~2,100 gas
- Mapping write: ~20,000 gas (SSTORE for new slot)
- Nonce update (if higher): ~5,000 gas
- **Total**: ~27,100 gas (first use) or ~2,100 gas (subsequent)

**Overhead**: ~20,000 gas per unique nonce used

## Security Considerations

1. **Replay Protection**: Async nonces still prevent replay attacks (each nonce can only be used once)

2. **Nonce Exhaustion**: Users must manage nonce space carefully
   - With uint64, there are 2^64 possible nonces
   - Practical limit is much lower due to gas costs

3. **Account Ownership**: Need to verify account ownership before enabling async nonces
   - Could use EIP-712 signatures
   - Or require contract owner approval

4. **Frontend Complexity**: Frontends must track which nonces have been used
   - Need to query `isNonceUsed()` before submitting
   - Handle nonce gaps gracefully

## Alternative Approaches

### Option 1: Per-Account Opt-In (Recommended)

- Default: Sync nonces
- Accounts opt-in to async nonces
- Backward compatible
- Lower risk

### Option 2: Global Switch

- Single flag for all accounts
- Simpler implementation
- All-or-nothing approach
- Higher risk

### Option 3: Hybrid Approach

- Sync for low-value transactions
- Async for high-value or batch transactions
- More complex but flexible

## References

- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md#step-5b-async-nonces-support-future-enhancement)
- [Ethereum Nonces Documentation](https://ethereum.org/en/developers/docs/transactions/#nonce)
- [EIP-712: Typed Structured Data Hashing and Signing](https://eips.ethereum.org/EIPS/eip-712)

## Status

**Current Status**: ❌ Not Implemented

**Priority**: Low (Future Enhancement)

**Estimated Implementation Time**: 2-3 days

**Breaking Changes**: None (backward compatible)

**Dependencies**: None (can be added independently)

---

**Note**: This enhancement is documented for future reference. The current implementation uses synchronous nonces which are sufficient for the MVP. Async nonces can be added later if needed without breaking existing functionality.

