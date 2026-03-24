# Wreckage Insurance Protocol — Integration Testing Guide

> Testnet integration testing guide for Hackathon demo.
> Contract v6 — Package `0xbb2f...ac41` on SUI Testnet.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Key Object IDs](#3-key-object-ids)
4. [Testing Flow Overview](#4-testing-flow-overview)
5. [Phase 0: Admin Bootstrap](#5-phase-0-admin-bootstrap)
6. [Phase 1: LP Deposit](#6-phase-1-lp-deposit)
7. [Phase 2: Purchase Policy](#7-phase-2-purchase-policy)
8. [Phase 3: Submit Claim](#8-phase-3-submit-claim)
9. [Phase 4: Salvage Auction](#9-phase-4-salvage-auction)
10. [Phase 5: Policy Lifecycle](#10-phase-5-policy-lifecycle)
11. [Phase 6: SSU Extension (EVE Integration)](#11-phase-6-ssu-extension)
12. [Phase 7: Edge Cases & Negative Tests](#12-phase-7-edge-cases)
13. [Verification Checklist](#13-verification-checklist)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

| Item | Required |
|------|----------|
| SUI CLI | `sui --version` >= 1.68 |
| SUI Wallet | Sui Wallet / Suiet / Ethos (browser extension) |
| Testnet SUI | >= 5 SUI (use `sui client faucet` or Discord faucet) |
| Node.js | >= 18 |
| pnpm / npm | any |
| Admin wallet | Deployer wallet holding `AdminCap` object |

### Wallet Setup

```bash
# Check active address
sui client active-address

# Switch to testnet
sui client switch --env testnet

# Get testnet SUI
sui client faucet
```

> **Important**: The deployer wallet (`0x1509b5...bc4c`) holds the `AdminCap`. Only this wallet can execute admin operations (create pool, set item price, pause protocol, etc.).

---

## 2. Environment Setup

```bash
# Clone and install frontend
cd projects/Wreckage_Insurance_Protocol/frontend
npm install

# Start dev server
npm run dev
# → http://localhost:5173
```

### Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Overview of user's policies, LP positions |
| `/insure` | InsurePage | Purchase new insurance policy |
| `/insure/:policyId` | PolicyDetailPage | Policy details, renew/transfer/cancel |
| `/claims` | ClaimPage | Submit standard or self-destruct claim |
| `/claims/history` | ClaimHistoryPage | View past claims |
| `/pool` | PoolDashboard | Risk pool stats, TVL, utilization |
| `/pool/deposit` | DepositPage | LP deposit |
| `/pool/withdraw` | WithdrawPage | LP withdraw with exit fee preview |
| `/salvage` | AuctionListPage | Browse active salvage auctions |
| `/salvage/:auctionId` | AuctionDetailPage | Bid, buyout, settle |
| `/demo` | DemoPanel | Admin panel — raw PTB execution |

---

## 3. Key Object IDs

### Protocol Shared Objects (v6)

```
Package:             0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41
AdminCap:            0x8fe5a8540278123465958930271f79448934b31873a86225a7c02c7591fc2038
ProtocolConfig:      0x0e9ca9dbc87e828f907f0c8011973a9ba5ee8d3c1e0bea08b42f050a622d4523
PolicyRegistry:      0x11903d4c33205930b2fd9f79cbf2899d301940a4dc79b01e76981ab3806fbef8
ClaimRegistry:       0xe42f02223e9e635a2b03c9e3337fdcba0fb1a9bb7fba469df17bb70c142d8036
AuctionRegistry:     0x682807b31effdf6160e296b00012331b3a58b8560b102f733dfc6919944e29f9
ValuationRegistry:   0x0a617a6b38cbe66b8f0e00d9b10daf3f6383bf62c9e13ad3de6d89716f99f77a
```

### World Objects

```
KillmailRegistry:    0x0c54bb0a04553283554cf4add413144ba98b2476ceda75833fa2a1da8f2831ab
```

### To Be Created (Phase 0)

```
RiskPool:            (created by admin_create_pool — record the Object ID!)
```

---

## 4. Testing Flow Overview

```
Phase 0: Admin Bootstrap
  └─ admin_create_pool (tier 0) → RiskPool object created
       │
Phase 1: LP Deposit
  └─ deposit() → LPPosition object created
       │
Phase 2: Purchase Policy
  └─ purchase_policy() → InsurancePolicy object created
       │
Phase 3: Submit Claim (needs real Killmail)
  └─ submit_claim() → Payout + SalvageNFT + Auction created
       │
Phase 4: Salvage Auction
  ├─ place_bid() → Bidding
  ├─ settle_auction() → NFT to winner, SUI to pool+treasury
  └─ OR buyout() → Instant purchase at floor price
       │
Phase 5: Policy Lifecycle
  ├─ renew_policy() → NCB discount applied
  ├─ transfer_policy() → New owner, streak reset
  ├─ cancel_policy() → Policy cancelled, reservation released
  └─ expire_policy() → Policy expired after end epoch
```

> **Critical dependency**: Phase 0 must complete before all other phases. Without a RiskPool, no policy can be purchased.

---

## 5. Phase 0: Admin Bootstrap

> Requires: deployer wallet with `AdminCap`.

### Step 0.1: Create a Risk Pool (Tier 0)

Use SUI CLI (admin wallet):

```bash
sui client call \
  --package 0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41 \
  --module config \
  --function admin_create_pool \
  --args \
    0x8fe5a8540278123465958930271f79448934b31873a86225a7c02c7591fc2038 \
    0x0e9ca9dbc87e828f907f0c8011973a9ba5ee8d3c1e0bea08b42f050a622d4523 \
    '[0, 200, 1000, 1000000000, 100000000000, 604800000, 5000, 500, 100, 1000, 604800000, 7200000, 86400000, 10000, 300, 8000]' \
  --gas-budget 100000000
```

**PoolConfig array breakdown** (16 params):
| Index | Field | Value | Meaning |
|-------|-------|-------|---------|
| 0 | `risk_tier` | 0 | Tier 0 (lowest risk) |
| 1 | `base_premium_rate` | 200 | 2% annual premium (200 bps) |
| 2 | `deductible_bps` | 1000 | 10% deductible |
| 3 | `min_coverage` | 1_000_000_000 | 1 SUI minimum coverage |
| 4 | `max_coverage` | 100_000_000_000 | 100 SUI maximum coverage |
| 5 | `cooldown_period` | 604_800_000 | 7 day cooldown (ms) |
| 6 | `self_destruct_payout_rate` | 5000 | 50% payout for self-destruct |
| 7 | `self_destruct_premium_rate` | 500 | 5% extra premium for SD rider |
| 8 | `self_destruct_decay_multiplier` | 100 | 1% additional decay per claim |
| 9 | `ncb_discount_bps` | 1000 | 10% no-claim bonus per streak |
| 10 | `self_destruct_waiting_period` | 604_800_000 | 7 day waiting period (ms) |
| 11 | `auction_duration` | 7_200_000 | 2 hour auction (ms) |
| 12 | `buyout_duration` | 86_400_000 | 24 hour buyout window (ms) |
| 13 | `max_ncb_total_discount_bps` | 10000 | Cap NCB at 100% (safety) |
| 14 | `subrogation_rate_bps` | 300 | 3% bounty reward |
| 15 | `revenue_split_pool_bps` | 8000 | 80% auction revenue to pool |

**Record the `RiskPool` Object ID from the output!**

```
# Example output:
# Created Objects:
#   ObjectID: 0xABCD...1234  (this is your RiskPool)
```

### Step 0.2: Verify on Explorer

Open: `https://suiscan.xyz/testnet/object/<RiskPool_ObjectID>`

Check:
- [x] `total_liquidity: 0`
- [x] `total_shares: 1000` (virtual initial)
- [x] `is_active: true`

---

## 6. Phase 1: LP Deposit

> Requires: RiskPool Object ID from Phase 0.

### Via Frontend (`/pool/deposit`)

1. Connect wallet
2. Navigate to `/pool/deposit`
3. Enter Pool ID and deposit amount (e.g. 10 SUI)
4. Click Deposit → approve tx in wallet
5. Verify: LPPosition object created in your wallet

### Via Demo Panel (`/demo`)

1. Navigate to `/demo`
2. Section "Quick Actions" → "Deposit to Pool"
3. Fill Pool ID + Amount (SUI)
4. Click Deposit

### Via CLI

```bash
# Split coin + deposit
sui client call \
  --package 0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41 \
  --module risk_pool \
  --function deposit \
  --args \
    <POOL_ID> \
    <COIN_OBJECT_ID> \
    0x6 \
  --gas-budget 50000000
```

### Verify

```bash
# Check your new LPPosition object
sui client objects --json | jq '.[] | select(.type | contains("LPPosition"))'
```

Expected:
- `shares > 0`
- `deposited_at` = current epoch timestamp
- `pool_id` = your RiskPool ID

---

## 7. Phase 2: Purchase Policy

> Requires: RiskPool with liquidity (Phase 1 done).

### Prerequisite: EVE Character Object

The `purchase_policy` function requires a `Character` shared object (from the world contracts). On testnet, if no real Character exists, you need to either:

1. **Use a real EVE Frontier Character** — if you have one on testnet
2. **Create one via world contracts** — requires `AdminACL` (`0xbbb9...c0f7`)

```bash
# If you have AdminACL access:
sui client call \
  --package 0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41 \
  --module character \
  --function create_character \
  --args <admin_acl_id> <address> \
  --gas-budget 50000000
```

### Via Frontend (`/insure`)

1. Navigate to `/insure`
2. Select Risk Tier (Tier 0)
3. Enter coverage amount (e.g. 10 SUI = 10000000000 MIST)
4. Toggle Self-Destruct Rider if desired
5. Enter premium payment amount
6. Click "Purchase" → approve tx

### Via Demo Panel (`/demo`)

1. Section "Quick Actions" → "Purchase Policy"
2. Fill: Pool ID, Character ID, Coverage (SUI), Premium Payment (SUI)
3. Toggle Self-Destruct Rider
4. Click "Purchase Policy"

### Premium Calculation

```
base_premium = coverage × base_premium_rate / 10_000
             = 10 SUI × 200 / 10_000 = 0.2 SUI

protocol_fee = base_premium × protocol_fee_bps / 10_000
             = 0.2 × 2000 / 10_000 = 0.04 SUI (20% fee)

sd_premium (if rider) = coverage × sd_premium_rate / 10_000
                       = 10 × 500 / 10_000 = 0.5 SUI

total_payment = base_premium + sd_premium = 0.7 SUI (with rider)
              = 0.2 SUI (without rider)

→ Payment coin must be >= total_payment
→ Protocol fee (0.04 SUI) goes to treasury
→ Remainder (0.16 SUI) goes to pool
```

### Verify

```bash
# Check InsurancePolicy object
sui client objects --json | jq '.[] | select(.type | contains("InsurancePolicy"))'
```

Expected:
- `status: 0` (active)
- `coverage_amount` matches input
- `risk_tier: 0`
- `has_self_destruct_rider: true/false`
- `claim_count: 0`
- `no_claim_streak: 0`

---

## 8. Phase 3: Submit Claim

> Requires: Active InsurancePolicy + Killmail object on-chain.

### The Killmail Problem (Testnet)

On testnet, real Killmails only exist if:
- EVE Frontier game server writes them (via `killmail_registry`)
- Or you mock them with world AdminACL

**If no real Killmails are available**, this flow can only be verified at the PTB construction level. The on-chain tx will revert if the Killmail doesn't match the policy's insured character.

### Killmail Requirements

The claim validation checks:
1. `killmail.victim_id == policy.insured_character_id` (standard claim)
2. `killmail.killer_id == killmail.victim_id` (self-destruct only)
3. `killmail.kill_timestamp` within policy period
4. Not previously claimed (ClaimRegistry check)
5. Cooldown elapsed since last claim

### Via Demo Panel (`/demo`)

1. Section "Quick Actions" → "Submit Claim"
2. Fill: Policy ID, Killmail ID, Pool ID
3. Toggle "Self-Destruct Claim" if applicable
4. Click "Submit Claim"

### Payout Calculation

```
Standard Claim:
  base_payout = coverage_amount
  decay = base_payout × (claim_count × 100) / 10_000  (1% per prior claim)
  deductible = (base_payout - decay) × deductible_bps / 10_000
  final_payout = base_payout - decay - deductible

Self-Destruct Claim:
  base_payout = coverage_amount × sd_payout_rate / 10_000  (50%)
  decay = higher (sd_decay_multiplier applied)
  deductible = same formula
  waiting_period: must wait 7 days after policy creation
```

### What Happens After Claim

1. SUI payout transferred to policy owner
2. `SalvageNFT` minted (linked to killmail)
3. `Auction` created automatically (2hr bidding → 24hr buyout)
4. `SubrogationEvent` emitted (bounty signal)
5. Policy `claim_count` incremented
6. Pool `reserved_amount` updated

---

## 9. Phase 4: Salvage Auction

> Requires: Auction created from a successful claim (Phase 3).

### Auction Lifecycle

```
[Bidding Phase] ─── 2 hours ───→ [Buyout Phase] ── 24 hours ──→ [Destroy]
     │                                   │                            │
  place_bid()                      buyout() at 70%              destroy_unsold()
  (anti-snipe: +5min               floor price
   if bid in last 5min)
     │
  settle_auction()
  (after bidding ends)
```

### Step 4.1: Place Bid

Via frontend (`/salvage/:auctionId`) or Demo Panel.

```
Minimum bid: auction.min_bid (set at creation)
Must exceed: previous highest_bid
```

### Step 4.2: Settle (after bidding ends)

```bash
# Via CLI
sui client call \
  --package 0xbb2f...ac41 \
  --module auction \
  --function settle_auction \
  --args <AUCTION_ID> \
    0x682807b31effdf6160e296b00012331b3a58b8560b102f733dfc6919944e29f9 \
    <POOL_ID> \
    0x0e9ca9dbc87e828f907f0c8011973a9ba5ee8d3c1e0bea08b42f050a622d4523 \
    0x6 \
  --gas-budget 50000000
```

Revenue split:
- 80% → RiskPool
- 20% → Treasury

### Step 4.3: Buyout (alternative)

During buyout phase, anyone can buy the SalvageNFT at floor price (70% of estimated value).

### Step 4.4: Destroy Unsold

If no bids after buyout phase expires → anyone can call `destroy_unsold()`.

---

## 10. Phase 5: Policy Lifecycle

### 5.1: Renew Policy

```
Requirements:
- Policy is active
- Policy is near/past expiry
- renewal_waiting_period elapsed (if claims exist)
- Payment >= new premium (with NCB discount)
```

NCB discount: `ncb_discount_bps × no_claim_streak` (capped at `max_ncb_total_discount_bps`).

### 5.2: Transfer Policy

```
Requirements:
- Policy is active
- No active cooldown
- Transfers to new address
Side effects:
- no_claim_streak reset to 0
- cooldown_until reset
```

### 5.3: Cancel Policy

```
Requirements:
- Policy is active (can cancel even during pause)
Side effects:
- Status set to cancelled (3)
- Reserved amount released back to pool
- No refund (premium stays in pool)
- PolicyRegistry entry removed
```

### 5.4: Expire Policy

```
Requirements:
- Policy is past expires_at timestamp
- Protocol not paused (emergency check)
Side effects:
- Status set to expired (2)
- Reserved amount released
- PolicyRegistry entry removed
```

---

## 11. Phase 6: SSU Extension (EVE Integration)

> SSU = Smart Storage Unit. These are thin wrappers that gate protocol operations through an SSU's access control.

### Available SSU Functions

| Function | Description |
|----------|-------------|
| `purchase_via_ssu` | Purchase policy through SSU interface |
| `claim_via_ssu` | Submit claim through SSU |
| `self_destruct_claim_via_ssu` | Submit SD claim through SSU |
| `renew_via_ssu` | Renew policy through SSU |
| `cancel_via_ssu` | Cancel policy through SSU |

### Testing SSU Extension

1. Need a `StorageUnit` object (from world contracts)
2. The SSU must have the wreckage protocol registered as an extension
3. Call SSU-gated functions with the SSU object as first argument

```typescript
// Frontend: via ssu.ts PTB builders
import { buildPurchaseViaSsu } from './lib/ptb/ssu';

const tx = buildPurchaseViaSsu({
  ssuObjectId: '<SSU_OBJECT_ID>',
  poolObjectId: '<POOL_ID>',
  characterObjectId: '<CHARACTER_ID>',
  coverageAmount: 10_000_000_000n,
  includeSelfDestruct: false,
  paymentCoinId: '<COIN_ID>',
  senderAddress: account.address,
});
```

### Item Valuation (Admin)

Set oracle prices for EVE game items:

Via Demo Panel → "Set Item Price (EVE Valuation Oracle)":
- AdminCap Object ID
- Item Type ID (game item type number)
- Price Per Unit (SUI)

---

## 12. Phase 7: Edge Cases & Negative Tests

### Expected Failures (verify error handling)

| Test | Expected Error | How to Trigger |
|------|---------------|----------------|
| Purchase without enough SUI | `EInsufficientPayment` | Set payment < premium |
| Purchase with coverage > max | `ECoverageOutOfRange` | Coverage > 100 SUI |
| Purchase with coverage < min | `ECoverageOutOfRange` | Coverage < 1 SUI |
| Duplicate policy per character | `EPolicyAlreadyExists` | Purchase twice for same character |
| Claim on expired policy | `EPolicyNotActive` | Expire policy then claim |
| Claim during cooldown | Anti-fraud fails | Claim twice within 7 days |
| Claim > max_claims (6th claim) | `EFrequencyLimit` | Submit 6 claims on one policy |
| Withdraw during lock period | Fails | Withdraw within 7 days of deposit |
| Withdraw > 25% cap | Fails | Try withdrawing > 25% of position |
| Bid below highest | Fails | Bid less than current highest |
| Settle before auction ends | Fails | Call settle_auction early |
| Self-destruct without rider | `ENoSelfDestructRider` | SD claim on non-rider policy |
| Self-destruct before waiting period | Fails | SD claim within 7 days |
| Admin action without AdminCap | Fails | Non-deployer calls admin fn |

### Stress Tests

1. **Multiple LPs deposit/withdraw** — verify share calculation accuracy
2. **Multiple policies on different tiers** — verify premium isolation
3. **Rapid bidding near auction end** — verify anti-snipe extension (+5min)
4. **Pool near 80% utilization** — verify no more policies can be written

---

## 13. Verification Checklist

### On-Chain Verification (SuiScan)

- [ ] RiskPool exists and `is_active: true`
- [ ] ProtocolConfig `version: 1`
- [ ] LPPosition created with correct `shares` and `pool_id`
- [ ] InsurancePolicy created with correct fields
- [ ] PolicyRegistry has entry for insured character
- [ ] After claim: SalvageNFT exists, Auction exists
- [ ] After settle: SUI distributed to pool + treasury
- [ ] After cancel: Policy `status: 3`, reservation released

### Event Verification

Use SuiScan or `sui client events` to check:

```bash
# Query events by package
sui client events --query '{"MoveEventModule": {"package": "0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41", "module": "underwriting"}}' --limit 5
```

Key events to verify:
- `PolicyCreatedEvent` — after purchase
- `LPDepositEvent` — after deposit
- `ClaimSubmittedEvent` — after claim
- `SalvageMintedEvent` — after claim (same tx)
- `AuctionCreatedEvent` — after claim (same tx)
- `BidPlacedEvent` — after bid
- `AuctionSettledEvent` — after settle
- `PolicyCancelledEvent` — after cancel

### Frontend Verification

- [ ] All 11 routes render without console errors
- [ ] ConnectButton shows/hides wallet connection
- [ ] Demo Panel: all 8 actions execute and show toast + tx log
- [ ] Explorer links in tx log open correct SuiScan pages
- [ ] Policy detail page shows all fields correctly
- [ ] Pool dashboard shows TVL, utilization, exit fee indicator

---

## 14. Troubleshooting

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `MoveAbort: 1` (version_mismatch) | Wrong ProtocolConfig version | Ensure using v6 shared objects |
| `MoveAbort: 10` (not_admin) | No AdminCap | Use deployer wallet for admin ops |
| `InsufficientGas` | Gas budget too low | Use `--gas-budget 100000000` (0.1 SUI) |
| `ObjectNotFound` | Wrong object ID | Verify against `deployment.json` |
| Frontend blank page | Build error | Run `npx tsc --noEmit` to check types |
| `does not provide an export named 'ConnectButton'` | Wrong import path | Import from `@mysten/dapp-kit-react/ui` |
| Pool deposit fails | Pool not created yet | Run Phase 0 first |
| Policy purchase fails | Pool has no liquidity | Run Phase 1 first |
| Claim fails | No matching Killmail | Need real EVE Killmail on testnet |

### Useful CLI Commands

```bash
# Check object details
sui client object <OBJECT_ID> --json

# List owned objects by type
sui client objects --json | jq '.[] | select(.type | contains("InsurancePolicy"))'

# Check transaction result
sui client transaction-block <TX_DIGEST> --json

# Get testnet SUI
sui client faucet

# Check balance
sui client gas
```

### Explorer Links

- Package: `https://suiscan.xyz/testnet/object/0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41`
- Transaction: `https://suiscan.xyz/testnet/tx/<DIGEST>`
- Object: `https://suiscan.xyz/testnet/object/<OBJECT_ID>`

---

## Quick Start (TL;DR)

```bash
# 1. Setup
cd frontend && npm install && npm run dev

# 2. Connect wallet at http://localhost:5173

# 3. Go to /demo panel

# 4. Admin: Create pool (CLI — see Phase 0)

# 5. Deposit SUI to pool (/demo → Deposit)

# 6. Purchase policy (/demo → Purchase Policy)

# 7. Submit claim when you have a Killmail (/demo → Submit Claim)

# 8. Bid on auction (/demo → Place Bid)

# 9. Settle or buyout (/demo → Admin Actions)
```

> **Note**: The biggest blocker for end-to-end testing is the Killmail dependency. Without a real EVE Frontier Killmail on testnet, the claim flow will revert on-chain. All other flows (deposit, purchase, renew, transfer, cancel, expire, auction) can be tested independently.
