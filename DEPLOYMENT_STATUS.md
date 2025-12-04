# Deployment Status - Hackathon

## ✅ Completed Tasks

### 1. EVVM Core Deployment on Sepolia ✅
- **Current Address**: `0xf239a3D5B22e416aF1183824c264caa25097300e`
- **Verified on Etherscan**: https://sepolia.etherscan.io/address/0xf239a3D5B22e416aF1183824c264caa25097300e#code
- **Status**: ✅ Completed and verified
- **Last update**: Contract redeployed with simplified permissions using only `FHE.allowGlobal()`

### 2. EVVMCafe Deployment on Sepolia ✅
- **Current Address**: `0x9e780309645D9898782282Fd95E64f24D7637324`
- **Verified on Etherscan**: https://sepolia.etherscan.io/address/0x9e780309645D9898782282Fd95E64f24D7637324#code
- **Status**: ✅ Completed and verified
- **Last update**: Contract redeployed to point to the new EVVMCore address with simplified permissions

### 3. Environment Variables Configuration ✅
- `.env` file created with:
  - `__RUNTIME_DEPLOYER_PRIVATE_KEY`
  - `ALCHEMY_API_KEY`
  - `ETHERSCAN_MAINNET_API_KEY`
- **Status**: ✅ Correctly configured

### 4. Frontend Created ✅
- **Route**: `/evvm-cafe`
- **Status**: ✅ Completed
- **Features**:
  - Account registration with initial encrypted balance
  - Shop registration in EVVM Core
  - Coffee orders with encrypted payments
  - Encrypted balance visualization (ctHash)
  - Balance decryption (requires CoFHE permit)

### 5. Transactions Working ✅
- **requestPay**: ✅ Works correctly
- **orderCoffee**: ✅ Works correctly
- **Status**: Encrypted transactions are processed correctly

## ⚠️ Known Issues

### 1. Balance Decryption (Pending Investigation)

**Problem**: Errors when trying to decrypt balances:
```
PermissionInvalid_RecipientSignature (0x8e143bf7)
```

**Attempted Solutions**:
1. Used `FHE.allow(balance, userAddress)` with specific addresses - Did not work
2. Used only `FHE.allowGlobal()` with frontend permits - Did not work
3. Created both "self" and "sharing" permits with contract as recipient - Did not work

**Current Status**: ⚠️ **Pending** - The decryption issue persists despite multiple attempts. The CoFHE server's permission verification mechanism needs further investigation.

**Workaround**: Encrypted balances are displayed correctly (ctHash visible), but decryption requires additional investigation into how CoFHE verifies permissions on the server side.

### 2. CoFHE SDK in Node.js Scripts

**Problem**: The CoFHE SDK (`@cofhe/hardhat-plugin`) does not work correctly on remote networks from Node.js scripts.

**Solution**: The frontend is used for all interactions that require CoFHE SDK.

## 📋 Next Steps

1. **Investigate Balance Decryption** (High Priority)
   - Research CoFHE server-side permission verification mechanism
   - Contact Fhenix team for clarification on permission requirements
   - Test with different permit configurations
   - Resolve any remaining permission issues

2. **Deploy Frontend on Vercel** (Pending)
   - Configure environment variables
   - Deploy the frontend
   - Verify it works correctly in production

3. **Record Demo for Hackathon** (Pending)
   - Record a maximum 3-minute demo
   - Show complete flow: registration → order → balance verification
   - Show privacy features (encrypted balances)

## 📝 Technical Notes

### Deployed Contracts
- **EVVMCore**: Main virtual blockchain contract with FHE
  - Current version uses simplified permissions (`allowThis`, `allowGlobal`)
  - Permissions are granted globally to allow anyone with a valid permit to decrypt
  
- **EVVMCafe**: Example contract demonstrating integration with EVVMCore
  - Allows coffee orders with encrypted payments
  - Verifies payments via `paymentTxId` from EVVMCore

### Frontend
- Implemented in Next.js with Scaffold-ETH 2
- Uses `@cofhe/sdk/web` for encryption/decryption
- Integrated with Wagmi for wallet connection
- Shows encrypted balances (ctHash) before decryption

### FHE Permissions
- **Current Implementation**: Uses `FHE.allowGlobal()` exclusively
- Initial balances use `allowThis` + `allowGlobal`
- Balances after transfers use the same pattern
- Frontend creates necessary permits (self + sharing with contract)
- **Note**: For the demo, the owner address `0x4A3f4D82a075434b24ff2920C573C704af776f6A` is used for all operations

## 🔗 Useful Links

- **EVVMCore on Sepolia**: https://sepolia.etherscan.io/address/0xf239a3D5B22e416aF1183824c264caa25097300e
- **EVVMCafe on Sepolia**: https://sepolia.etherscan.io/address/0x9e780309645D9898782282Fd95E64f24D7637324
- **Frontend Documentation**: `EVVMCafe_FRONTEND_USAGE.md`
- **Integration Documentation**: `EVVMCafe_INTEGRATION.md`

## 📊 Deployment History

### EVVMCore
- `0x02F43510755385162cD9C3b814812B879576b2De` - Initial deployment
- `0x5aA0655DA785d8d43E4A8f64e8226FDE4B20D641` - With `allowGlobal` for amountEnc
- `0x1257EDFa7F040e8D8920DFc96a1c8B1Bdaa8B2fA` - With temporary solution for requestPay
- `0xa0118Eeaa52A73Cd93A29ebFaB5F173676eCDf94` - With `allowGlobal` for balances
- `0x8CA54C36C8E016312deadbaC63f9C09fF921dab8` - With multiple permission strategies
- `0x08ABf5102ba372FcfFA698163C72b857e6E31744` - With `FHE.allow()` for specific addresses
- `0xdc01910557F8E88d5d60f5724FECcD628bd1004B` - With complete address-specific permissions solution
- `0xf239a3D5B22e416aF1183824c264caa25097300e` - **CURRENT** - With simplified permissions (only `allowGlobal`)

### EVVMCafe
- `0xf9B85ded422a2E352BC9C4aa70757e6B485f518b` - Initial deployment
- `0x2731740469769b68035EbE558aCA26A459D71111` - With new EVVMCore address
- `0x5B612a53aecd3a7E086C444348AACd75328C5f94` - With new EVVMCore address
- `0xd2C65FC9Af9F62B474E6c356B5bBB2C8771EBdf7` - With latest EVVMCore address
- `0x405Eb5A3C2Ec257B402e59C47Deb4a6eEc4E164b` - With EVVMCore with corrected permissions
- `0x9e780309645D9898782282Fd95E64f24D7637324` - **CURRENT** - With EVVMCore with simplified permissions
