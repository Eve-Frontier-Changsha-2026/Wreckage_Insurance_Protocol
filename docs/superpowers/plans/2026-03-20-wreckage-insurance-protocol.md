# Wreckage Insurance Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a decentralized combat insurance protocol on Sui for EVE Frontier — insure ships, auto-claim via Killmail, mint salvage NFTs, auction wreckage, LP risk pools.

**Architecture:** Two Move packages (`wreckage-core` for primitives, `wreckage-protocol` for business logic) + React/TypeScript frontend. Reads `&Killmail` from World Contracts for claim verification. AdminCap pattern, u64 LP shares, standalone Auction shared objects.

**Tech Stack:** Sui Move (2024 edition), React, TypeScript, @mysten/dapp-kit-react, @mysten/sui, @evefrontier/dapp-kit, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-20-wreckage-insurance-protocol-design.md`

**World Contracts Ref:** `https://github.com/evefrontier/world-contracts` (branch: main, path: `contracts/world/`)

**Global Implementation Rules:**
1. **Error codes**: ALL protocol-layer code MUST use `wreckage_core::errors::*` accessors (e.g., `errors::pool_not_active()`) instead of magic numbers.
2. **Version checks**: ALL public functions on shared objects MUST assert version at entry (e.g., `config::assert_version(config)`)
3. **Integer arithmetic**: ALL multiplications involving u64 MUST use u128 intermediate values before dividing back
4. **Events**: ALL state-changing operations MUST emit the corresponding event from spec Section 13
5. **Single init**: Only `init.move` has an `init` function. Other modules expose `public(package) fun create_*` constructors.

---

## File Structure

### Move Packages

```
contracts/
├── wreckage-core/
│   ├── Move.toml
│   ├── sources/
│   │   ├── policy.move           # InsurancePolicy struct + accessors + mutators
│   │   ├── rider.move            # Self-destruct rider logic
│   │   ├── salvage_nft.move      # SalvageNFT struct + accessors
│   │   ├── pool_config.move      # PoolConfig, AuctionConfig value types
│   │   └── errors.move           # Shared error codes
│   └── tests/
│       ├── policy_tests.move
│       ├── rider_tests.move
│       └── salvage_nft_tests.move
│
└── wreckage-protocol/
    ├── Move.toml
    ├── sources/
    │   ├── init.move              # Single init: AdminCap + ProtocolConfig + registries
    │   ├── config.move           # AdminCap + ProtocolConfig + admin functions (no init)
    │   ├── registry.move         # ClaimRegistry + PolicyRegistry (no init)
    │   ├── risk_pool.move        # RiskPool + LPPosition + LP mechanics
    │   ├── underwriting.move     # purchase_policy + renew_policy + transfer_policy
    │   ├── claims.move           # submit_claim + submit_self_destruct_claim
    │   ├── anti_fraud.move       # validate_standard_claim + validate_self_destruct_claim
    │   ├── salvage.move          # SalvageNFT minting + lifecycle bridge
    │   ├── auction.move          # AuctionRegistry + Auction + bid/settle/buyout
    │   ├── subrogation.move      # SubrogationEvent emission
    │   └── integration.move      # Mock Bounty/Fleet interfaces
    └── tests/
        ├── init_tests.move
        ├── config_tests.move
        ├── registry_tests.move
        ├── risk_pool_tests.move
        ├── underwriting_tests.move
        ├── claims_tests.move
        ├── anti_fraud_tests.move
        ├── salvage_tests.move
        ├── auction_tests.move
        └── e2e_tests.move        # Full flow integration tests
```

### Frontend

```
frontend/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── config/
│   │   └── network.ts
│   ├── lib/
│   │   ├── contracts.ts
│   │   ├── types.ts
│   │   └── ptb/
│   │       ├── insure.ts
│   │       ├── claim.ts
│   │       ├── pool.ts
│   │       └── auction.ts
│   ├── hooks/
│   │   ├── useInsurancePolicy.ts
│   │   ├── useRiskPool.ts
│   │   ├── useAuction.ts
│   │   ├── useKillmail.ts
│   │   └── useClaims.ts
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Toast.tsx
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   └── Layout.tsx
│   │   ├── policy/
│   │   │   ├── PolicyCard.tsx
│   │   │   ├── RiskTierSelector.tsx
│   │   │   └── RiderToggle.tsx
│   │   ├── pool/
│   │   │   ├── PoolStats.tsx
│   │   │   ├── LPPositionCard.tsx
│   │   │   └── ExitFeeIndicator.tsx
│   │   └── auction/
│   │       ├── AuctionCard.tsx
│   │       ├── BidForm.tsx
│   │       └── CountdownTimer.tsx
│   └── pages/
│       ├── DashboardPage.tsx
│       ├── insure/
│       │   ├── InsurePage.tsx
│       │   └── PolicyDetailPage.tsx
│       ├── claims/
│       │   ├── ClaimPage.tsx
│       │   └── ClaimHistoryPage.tsx
│       ├── pool/
│       │   ├── PoolDashboard.tsx
│       │   ├── DepositPage.tsx
│       │   └── WithdrawPage.tsx
│       ├── salvage/
│       │   ├── AuctionListPage.tsx
│       │   └── AuctionDetailPage.tsx
│       └── demo/
│           └── DemoPanel.tsx
```

---

## Phase 1: Move Contracts — Core Package

### Task 1: Project Scaffolding + World Contracts Dependency

**Files:**
- Create: `contracts/wreckage-core/Move.toml`
- Create: `contracts/wreckage-core/sources/errors.move`
- Create: `contracts/wreckage-protocol/Move.toml`

- [x]**Step 1: Create wreckage-core package**

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Wreckage_Insurance_Protocol
mkdir -p contracts/wreckage-core/sources contracts/wreckage-core/tests
```

```toml
# contracts/wreckage-core/Move.toml
[package]
name = "wreckage_core"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }
world = { git = "https://github.com/evefrontier/world-contracts.git", subdir = "contracts/world", rev = "main" }
```

- [x]**Step 2: Create errors.move**

```move
// contracts/wreckage-core/sources/errors.move
module wreckage_core::errors;

// === Policy Errors ===
#[error(code = 0)]
const EPolicyNotActive: vector<u8> = b"Policy is not active";
#[error(code = 1)]
const EPolicyExpired: vector<u8> = b"Policy has expired";
#[error(code = 2)]
const ECoverageOutOfRange: vector<u8> = b"Coverage amount out of allowed range";
#[error(code = 3)]
const EInsufficientPayment: vector<u8> = b"Insufficient payment for premium";

// === Rider Errors ===
#[error(code = 10)]
const ENoSelfDestructRider: vector<u8> = b"Policy does not have self-destruct rider";
#[error(code = 11)]
const ESelfDestructWaitingPeriod: vector<u8> = b"Self-destruct waiting period not elapsed";

// === Pool Errors ===
#[error(code = 20)]
const EPoolNotActive: vector<u8> = b"Risk pool is not active";
#[error(code = 21)]
const EPoolInsufficientLiquidity: vector<u8> = b"Pool has insufficient liquidity for payout";
#[error(code = 22)]
const EPoolUtilizationExceeded: vector<u8> = b"Pool utilization safety valve exceeded";
#[error(code = 23)]
const ELPLockPeriodNotElapsed: vector<u8> = b"LP lock period has not elapsed";
#[error(code = 24)]
const ELPWithdrawCapExceeded: vector<u8> = b"LP withdrawal cap exceeded";
#[error(code = 25)]
const EZeroSharesMinted: vector<u8> = b"Deposit would mint zero shares";
#[error(code = 26)]
const EWrongPool: vector<u8> = b"LP position does not belong to this pool";

// === Claim Errors ===
#[error(code = 30)]
const EKillmailAlreadyClaimed: vector<u8> = b"Killmail has already been claimed";
#[error(code = 31)]
const EKillmailVictimMismatch: vector<u8> = b"Killmail victim does not match insured character";
#[error(code = 32)]
const EKillmailOutOfPolicyPeriod: vector<u8> = b"Kill timestamp is outside policy period";
#[error(code = 33)]
const ECooldownNotElapsed: vector<u8> = b"Claim cooldown period has not elapsed";
#[error(code = 34)]
const EMaxClaimsReached: vector<u8> = b"Maximum claims per policy reached";
#[error(code = 35)]
const ENotSelfDestruct: vector<u8> = b"Killmail is not a self-destruct (killer != victim)";
#[error(code = 36)]
const EIsSelfDestruct: vector<u8> = b"Cannot use standard claim for self-destruct";
#[error(code = 37)]
const EPayoutBelowMinimum: vector<u8> = b"Calculated payout is below minimum threshold";
#[error(code = 38)]
const ERenewalWaitingPeriod: vector<u8> = b"Renewal waiting period not elapsed";

// === Auction Errors ===
#[error(code = 40)]
const EAuctionNotInBiddingPhase: vector<u8> = b"Auction is not in bidding phase";
#[error(code = 41)]
const EBidTooLow: vector<u8> = b"Bid is below minimum increment";
#[error(code = 42)]
const EAuctionNotEnded: vector<u8> = b"Auction has not ended yet";
#[error(code = 43)]
const EAuctionNotInBuyoutPhase: vector<u8> = b"Auction is not in buyout phase";
#[error(code = 44)]
const EBuyoutPaymentInsufficient: vector<u8> = b"Buyout payment is insufficient";

// === Registry Errors ===
#[error(code = 50)]
const ECharacterAlreadyInsured: vector<u8> = b"Character already has an active policy";

// === Config Errors ===
#[error(code = 60)]
const EVersionMismatch: vector<u8> = b"Object version mismatch";
#[error(code = 61)]
const EProtocolPaused: vector<u8> = b"Protocol is paused for this operation";
#[error(code = 62)]
const EInvalidConfig: vector<u8> = b"Invalid configuration parameter";

// === Public Accessors (used by wreckage-protocol) ===
public fun policy_not_active(): u64 { 0 }
public fun policy_expired(): u64 { 1 }
public fun coverage_out_of_range(): u64 { 2 }
public fun insufficient_payment(): u64 { 3 }
public fun no_self_destruct_rider(): u64 { 10 }
public fun self_destruct_waiting_period(): u64 { 11 }
public fun pool_not_active(): u64 { 20 }
public fun pool_insufficient_liquidity(): u64 { 21 }
public fun pool_utilization_exceeded(): u64 { 22 }
public fun lp_lock_period_not_elapsed(): u64 { 23 }
public fun lp_withdraw_cap_exceeded(): u64 { 24 }
public fun zero_shares_minted(): u64 { 25 }
public fun wrong_pool(): u64 { 26 }
public fun killmail_already_claimed(): u64 { 30 }
public fun killmail_victim_mismatch(): u64 { 31 }
public fun killmail_out_of_policy_period(): u64 { 32 }
public fun cooldown_not_elapsed(): u64 { 33 }
public fun max_claims_reached(): u64 { 34 }
public fun not_self_destruct(): u64 { 35 }
public fun is_self_destruct(): u64 { 36 }
public fun payout_below_minimum(): u64 { 37 }
public fun renewal_waiting_period(): u64 { 38 }
public fun auction_not_in_bidding(): u64 { 40 }
public fun bid_too_low(): u64 { 41 }
public fun auction_not_ended(): u64 { 42 }
public fun auction_not_in_buyout(): u64 { 43 }
public fun buyout_payment_insufficient(): u64 { 44 }
public fun character_already_insured(): u64 { 50 }
public fun version_mismatch(): u64 { 60 }
public fun protocol_paused(): u64 { 61 }
public fun invalid_config(): u64 { 62 }
```

- [x]**Step 3: Create wreckage-protocol Move.toml**

```toml
# contracts/wreckage-protocol/Move.toml
[package]
name = "wreckage_protocol"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }
world = { git = "https://github.com/evefrontier/world-contracts.git", subdir = "contracts/world", rev = "main" }
wreckage_core = { local = "../wreckage-core" }
```

```bash
mkdir -p contracts/wreckage-protocol/sources contracts/wreckage-protocol/tests
```

- [x]**Step 4: Build wreckage-core to verify dependency resolution**

Run: `cd contracts/wreckage-core && sui move build`
Expected: Build succeeds (may take a while for first dependency fetch)

- [x]**Step 5: Commit**

```bash
git add contracts/
git commit -m "feat: scaffold wreckage-core and wreckage-protocol packages with World Contracts dependency"
```

---

### Task 2: PoolConfig + AuctionConfig Value Types

**Files:**
- Create: `contracts/wreckage-core/sources/pool_config.move`
- Test: `contracts/wreckage-core/tests/pool_config_tests.move`

- [x]**Step 1: Write pool_config.move**

```move
// contracts/wreckage-core/sources/pool_config.move
module wreckage_core::pool_config;

// === Structs ===
public struct PoolConfig has store, copy, drop {
    risk_tier: u8,
    base_premium_rate: u64,
    max_coverage: u64,
    min_coverage: u64,
    cooldown_period: u64,
    claim_decay_rate: u64,
    self_destruct_premium_rate: u64,
    self_destruct_waiting_period: u64,
    self_destruct_payout_rate: u64,
    self_destruct_decay_multiplier: u64,
    deductible_bps: u64,
    ncb_discount_bps: u64,
    max_ncb_streak: u8,
    max_ncb_total_discount_bps: u64,
    subrogation_rate_bps: u64,
    renewal_waiting_period: u64,
}

public struct AuctionConfig has store, copy, drop {
    auction_duration: u64,
    buyout_duration: u64,
    min_bid_increment_bps: u64,
    buyout_discount_bps: u64,
    revenue_pool_share_bps: u64,
    anti_snipe_window: u64,
    anti_snipe_extension: u64,
    min_opening_bid: u64,
}

// === Constants ===
const MIN_DEDUCTIBLE_BPS: u64 = 100;          // 1%
const MIN_PREMIUM_RATE_BPS: u64 = 50;         // 0.5%
const MIN_SD_PREMIUM_RATE_BPS: u64 = 5000;    // 50%
const MIN_SD_WAITING_PERIOD: u64 = 604800;    // 7 days in seconds
const MAX_BPS: u64 = 10000;

// === Constructors ===
public fun new_pool_config(
    risk_tier: u8,
    base_premium_rate: u64,
    max_coverage: u64,
    min_coverage: u64,
    cooldown_period: u64,
    claim_decay_rate: u64,
    self_destruct_premium_rate: u64,
    self_destruct_waiting_period: u64,
    self_destruct_payout_rate: u64,
    self_destruct_decay_multiplier: u64,
    deductible_bps: u64,
    ncb_discount_bps: u64,
    max_ncb_streak: u8,
    max_ncb_total_discount_bps: u64,
    subrogation_rate_bps: u64,
    renewal_waiting_period: u64,
): PoolConfig {
    // Validate hard limits
    assert!(base_premium_rate >= MIN_PREMIUM_RATE_BPS, 0);
    assert!(deductible_bps >= MIN_DEDUCTIBLE_BPS, 0);
    assert!(self_destruct_premium_rate >= MIN_SD_PREMIUM_RATE_BPS, 0);
    assert!(self_destruct_waiting_period >= MIN_SD_WAITING_PERIOD, 0);
    assert!(self_destruct_payout_rate <= MAX_BPS, 0);
    assert!(claim_decay_rate < MAX_BPS, 0);
    assert!(max_coverage > min_coverage, 0);
    assert!(min_coverage > 0, 0);
    // NCB cap validation (u128 to prevent overflow)
    assert!((ncb_discount_bps as u128) * (max_ncb_streak as u128) <= (max_ncb_total_discount_bps as u128), 0);
    assert!(max_ncb_total_discount_bps < MAX_BPS, 0);

    PoolConfig {
        risk_tier,
        base_premium_rate,
        max_coverage,
        min_coverage,
        cooldown_period,
        claim_decay_rate,
        self_destruct_premium_rate,
        self_destruct_waiting_period,
        self_destruct_payout_rate,
        self_destruct_decay_multiplier,
        deductible_bps,
        ncb_discount_bps,
        max_ncb_streak,
        max_ncb_total_discount_bps,
        subrogation_rate_bps,
        renewal_waiting_period,
    }
}

public fun new_auction_config(
    auction_duration: u64,
    buyout_duration: u64,
    min_bid_increment_bps: u64,
    buyout_discount_bps: u64,
    revenue_pool_share_bps: u64,
    anti_snipe_window: u64,
    anti_snipe_extension: u64,
    min_opening_bid: u64,
): AuctionConfig {
    assert!(auction_duration > 0, 0);
    assert!(buyout_duration > 0, 0);
    assert!(min_bid_increment_bps > 0 && min_bid_increment_bps < MAX_BPS, 0);
    assert!(buyout_discount_bps > 0 && buyout_discount_bps <= MAX_BPS, 0);
    assert!(revenue_pool_share_bps <= MAX_BPS, 0);

    AuctionConfig {
        auction_duration,
        buyout_duration,
        min_bid_increment_bps,
        buyout_discount_bps,
        revenue_pool_share_bps,
        anti_snipe_window,
        anti_snipe_extension,
        min_opening_bid,
    }
}

// === Accessors ===
public fun risk_tier(c: &PoolConfig): u8 { c.risk_tier }
public fun base_premium_rate(c: &PoolConfig): u64 { c.base_premium_rate }
public fun max_coverage(c: &PoolConfig): u64 { c.max_coverage }
public fun min_coverage(c: &PoolConfig): u64 { c.min_coverage }
public fun cooldown_period(c: &PoolConfig): u64 { c.cooldown_period }
public fun claim_decay_rate(c: &PoolConfig): u64 { c.claim_decay_rate }
public fun self_destruct_premium_rate(c: &PoolConfig): u64 { c.self_destruct_premium_rate }
public fun self_destruct_waiting_period(c: &PoolConfig): u64 { c.self_destruct_waiting_period }
public fun self_destruct_payout_rate(c: &PoolConfig): u64 { c.self_destruct_payout_rate }
public fun self_destruct_decay_multiplier(c: &PoolConfig): u64 { c.self_destruct_decay_multiplier }
public fun deductible_bps(c: &PoolConfig): u64 { c.deductible_bps }
public fun ncb_discount_bps(c: &PoolConfig): u64 { c.ncb_discount_bps }
public fun max_ncb_streak(c: &PoolConfig): u8 { c.max_ncb_streak }
public fun max_ncb_total_discount_bps(c: &PoolConfig): u64 { c.max_ncb_total_discount_bps }
public fun subrogation_rate_bps(c: &PoolConfig): u64 { c.subrogation_rate_bps }
public fun renewal_waiting_period(c: &PoolConfig): u64 { c.renewal_waiting_period }

public fun auction_duration(c: &AuctionConfig): u64 { c.auction_duration }
public fun buyout_duration(c: &AuctionConfig): u64 { c.buyout_duration }
public fun min_bid_increment_bps(c: &AuctionConfig): u64 { c.min_bid_increment_bps }
public fun buyout_discount_bps(c: &AuctionConfig): u64 { c.buyout_discount_bps }
public fun revenue_pool_share_bps(c: &AuctionConfig): u64 { c.revenue_pool_share_bps }
public fun anti_snipe_window(c: &AuctionConfig): u64 { c.anti_snipe_window }
public fun anti_snipe_extension(c: &AuctionConfig): u64 { c.anti_snipe_extension }
public fun min_opening_bid(c: &AuctionConfig): u64 { c.min_opening_bid }

// === Test Helpers ===
#[test_only]
/// Default Tier 2 config for testing
public fun test_pool_config(): PoolConfig {
    new_pool_config(
        2,           // risk_tier
        500,         // base_premium_rate = 5%
        50_000_000_000, // max_coverage = 50 SUI
        1_000_000_000,  // min_coverage = 1 SUI
        172800,      // cooldown_period = 48h
        1000,        // claim_decay_rate = 10%
        7000,        // self_destruct_premium_rate = 70%
        604800,      // self_destruct_waiting_period = 7 days
        5000,        // self_destruct_payout_rate = 50%
        2,           // self_destruct_decay_multiplier = 2x
        1000,        // deductible_bps = 10%
        1000,        // ncb_discount_bps = 10% per streak
        3,           // max_ncb_streak
        3000,        // max_ncb_total_discount_bps = 30%
        2000,        // subrogation_rate_bps = 20%
        86400,       // renewal_waiting_period = 24h
    )
}

#[test_only]
public fun test_auction_config(): AuctionConfig {
    new_auction_config(
        259200,      // auction_duration = 72h
        172800,      // buyout_duration = 48h
        500,         // min_bid_increment_bps = 5%
        7000,        // buyout_discount_bps = 70%
        8000,        // revenue_pool_share_bps = 80%
        600,         // anti_snipe_window = 10 min
        600,         // anti_snipe_extension = 10 min
        100_000_000, // min_opening_bid = 0.1 SUI
    )
}
```

- [x]**Step 2: Write tests**

```move
// contracts/wreckage-core/tests/pool_config_tests.move
#[test_only]
module wreckage_core::pool_config_tests;

use wreckage_core::pool_config;

#[test]
fun test_create_valid_pool_config() {
    let config = pool_config::test_pool_config();
    assert!(pool_config::risk_tier(&config) == 2);
    assert!(pool_config::base_premium_rate(&config) == 500);
    assert!(pool_config::deductible_bps(&config) == 1000);
    assert!(pool_config::max_ncb_total_discount_bps(&config) == 3000);
}

#[test]
#[expected_failure]
fun test_premium_rate_below_minimum() {
    pool_config::new_pool_config(
        1, 10, // premium rate 10 bps < 50 minimum
        50_000_000_000, 1_000_000_000,
        172800, 1000, 7000, 604800, 5000, 2,
        1000, 1000, 3, 3000, 2000, 86400,
    );
}

#[test]
#[expected_failure]
fun test_ncb_discount_exceeds_cap() {
    // 1500 bps * 3 streak = 4500 > max 3000
    pool_config::new_pool_config(
        1, 500, 50_000_000_000, 1_000_000_000,
        172800, 1000, 7000, 604800, 5000, 2,
        1000, 1500, 3, 3000, 2000, 86400,
    );
}

#[test]
fun test_create_valid_auction_config() {
    let config = pool_config::test_auction_config();
    assert!(pool_config::auction_duration(&config) == 259200);
    assert!(pool_config::anti_snipe_window(&config) == 600);
}
```

- [x]**Step 3: Run tests**

Run: `cd contracts/wreckage-core && sui move test`
Expected: All tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-core/
git commit -m "feat(core): add PoolConfig and AuctionConfig with validation"
```

---

### Task 3: InsurancePolicy Object

**Files:**
- Create: `contracts/wreckage-core/sources/policy.move`
- Test: `contracts/wreckage-core/tests/policy_tests.move`

- [x]**Step 1: Write policy.move**

```move
// contracts/wreckage-core/sources/policy.move
module wreckage_core::policy;

use world::in_game_id::TenantItemId;

// === Constants ===
const STATUS_ACTIVE: u8 = 0;
const STATUS_CLAIMED: u8 = 1;
const STATUS_EXPIRED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// === Structs ===
public struct InsurancePolicy has key, store {
    id: UID,
    insured_character_id: TenantItemId,
    coverage_amount: u64,
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
    self_destruct_premium: u64,
    created_at: u64,
    expires_at: u64,
    status: u8,
    cooldown_until: u64,
    claim_count: u8,
    no_claim_streak: u8,
    renewal_count: u8,
    version: u64,
}

// === Events ===
public struct PolicyCreatedEvent has copy, drop {
    policy_id: ID,
    insured_character_id: TenantItemId,
    coverage_amount: u64,
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
}

public struct PolicyRenewedEvent has copy, drop {
    policy_id: ID,
    renewal_count: u8,
    no_claim_streak: u8,
    premium_paid: u64,
    ncb_discount_applied: u64,
}

public struct PolicyTransferredEvent has copy, drop {
    policy_id: ID,
    from: address,
    to: address,
}

// === Constants (public) ===
public fun status_active(): u8 { STATUS_ACTIVE }
public fun status_claimed(): u8 { STATUS_CLAIMED }
public fun status_expired(): u8 { STATUS_EXPIRED }
public fun status_cancelled(): u8 { STATUS_CANCELLED }

// === Constructor (package-visible, called by wreckage-protocol via public wrapper) ===
public fun create(
    insured_character_id: TenantItemId,
    coverage_amount: u64,
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
    self_destruct_premium: u64,
    created_at: u64,
    expires_at: u64,
    ctx: &mut TxContext,
): InsurancePolicy {
    let policy = InsurancePolicy {
        id: object::new(ctx),
        insured_character_id,
        coverage_amount,
        premium_paid,
        risk_tier,
        has_self_destruct_rider,
        self_destruct_premium,
        created_at,
        expires_at,
        status: STATUS_ACTIVE,
        cooldown_until: 0,
        claim_count: 0,
        no_claim_streak: 0,
        renewal_count: 0,
        version: 1,
    };

    sui::event::emit(PolicyCreatedEvent {
        policy_id: object::id(&policy),
        insured_character_id,
        coverage_amount,
        premium_paid,
        risk_tier,
        has_self_destruct_rider,
    });

    policy
}

// === Accessors ===
public fun id(p: &InsurancePolicy): ID { object::id(p) }
public fun insured_character_id(p: &InsurancePolicy): TenantItemId { p.insured_character_id }
public fun coverage_amount(p: &InsurancePolicy): u64 { p.coverage_amount }
public fun premium_paid(p: &InsurancePolicy): u64 { p.premium_paid }
public fun risk_tier(p: &InsurancePolicy): u8 { p.risk_tier }
public fun has_self_destruct_rider(p: &InsurancePolicy): bool { p.has_self_destruct_rider }
public fun self_destruct_premium(p: &InsurancePolicy): u64 { p.self_destruct_premium }
public fun created_at(p: &InsurancePolicy): u64 { p.created_at }
public fun expires_at(p: &InsurancePolicy): u64 { p.expires_at }
public fun status(p: &InsurancePolicy): u8 { p.status }
public fun cooldown_until(p: &InsurancePolicy): u64 { p.cooldown_until }
public fun claim_count(p: &InsurancePolicy): u8 { p.claim_count }
public fun no_claim_streak(p: &InsurancePolicy): u8 { p.no_claim_streak }
public fun renewal_count(p: &InsurancePolicy): u8 { p.renewal_count }
public fun version(p: &InsurancePolicy): u64 { p.version }

public fun is_active(p: &InsurancePolicy): bool { p.status == STATUS_ACTIVE }

// === Mutators (public, for wreckage-protocol cross-package access) ===
public fun set_status(p: &mut InsurancePolicy, status: u8) { p.status = status; }
public fun set_cooldown_until(p: &mut InsurancePolicy, until: u64) { p.cooldown_until = until; }
public fun increment_claim_count(p: &mut InsurancePolicy) { p.claim_count = p.claim_count + 1; }
public fun reset_no_claim_streak(p: &mut InsurancePolicy) { p.no_claim_streak = 0; }
public fun increment_no_claim_streak(p: &mut InsurancePolicy) { p.no_claim_streak = p.no_claim_streak + 1; }
public fun set_renewal_data(
    p: &mut InsurancePolicy,
    new_premium: u64,
    new_expires_at: u64,
    new_created_at: u64,
) {
    p.premium_paid = new_premium;
    p.expires_at = new_expires_at;
    p.created_at = new_created_at;
    p.renewal_count = p.renewal_count + 1;
}

// === Delete ===
public fun destroy(p: InsurancePolicy) {
    let InsurancePolicy { id, .. } = p;
    id.delete();
}
```

- [x]**Step 2: Write tests**

```move
// contracts/wreckage-core/tests/policy_tests.move
#[test_only]
module wreckage_core::policy_tests;

use sui::test_scenario;
use wreckage_core::policy;

#[test]
fun test_create_policy() {
    let mut scenario = test_scenario::begin(@0x1);
    let ctx = scenario.ctx();

    // We need a TenantItemId — use world::in_game_id::create_key
    // Since create_key is public(package), we'll test via integration in protocol tests
    // Here test the accessors and mutators with a mock

    scenario.end();
}

#[test]
fun test_policy_mutators() {
    // Will be tested in wreckage-protocol integration tests
    // since we need world::in_game_id to create TenantItemId
}
```

> **Note**: Full policy tests require `TenantItemId` which needs `in_game_id::create_key` (package-visible). Deep unit tests will be in `wreckage-protocol/tests/` where we can use `#[test_only]` helpers from world contracts.

- [x]**Step 3: Build to verify compilation**

Run: `cd contracts/wreckage-core && sui move build`
Expected: Build succeeds

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-core/
git commit -m "feat(core): add InsurancePolicy object with accessors and mutators"
```

---

### Task 4: SalvageNFT Object

**Files:**
- Create: `contracts/wreckage-core/sources/salvage_nft.move`

- [x]**Step 1: Write salvage_nft.move**

```move
// contracts/wreckage-core/sources/salvage_nft.move
module wreckage_core::salvage_nft;

use world::in_game_id::TenantItemId;

// === Constants ===
const STATUS_AUCTION: u8 = 0;
const STATUS_SOLD: u8 = 1;
const STATUS_DESTROYED: u8 = 2;

// === Structs ===
public struct SalvageNFT has key, store {
    id: UID,
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    loss_type: u8,
    kill_timestamp: u64,
    estimated_value: u64,
    status: u8,
}

// === Events ===
public struct SalvageMintedEvent has copy, drop {
    nft_id: ID,
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    estimated_value: u64,
}

// === Constructor ===
public fun mint(
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    loss_type: u8,
    kill_timestamp: u64,
    estimated_value: u64,
    ctx: &mut TxContext,
): SalvageNFT {
    let nft = SalvageNFT {
        id: object::new(ctx),
        killmail_id,
        victim_id,
        solar_system_id,
        loss_type,
        kill_timestamp,
        estimated_value,
        status: STATUS_AUCTION,
    };

    sui::event::emit(SalvageMintedEvent {
        nft_id: object::id(&nft),
        killmail_id,
        victim_id,
        solar_system_id,
        estimated_value,
    });

    nft
}

// === Accessors ===
public fun id(nft: &SalvageNFT): ID { object::id(nft) }
public fun killmail_id(nft: &SalvageNFT): TenantItemId { nft.killmail_id }
public fun victim_id(nft: &SalvageNFT): TenantItemId { nft.victim_id }
public fun solar_system_id(nft: &SalvageNFT): TenantItemId { nft.solar_system_id }
public fun loss_type(nft: &SalvageNFT): u8 { nft.loss_type }
public fun kill_timestamp(nft: &SalvageNFT): u64 { nft.kill_timestamp }
public fun estimated_value(nft: &SalvageNFT): u64 { nft.estimated_value }
public fun status(nft: &SalvageNFT): u8 { nft.status }

public fun status_auction(): u8 { STATUS_AUCTION }
public fun status_sold(): u8 { STATUS_SOLD }
public fun status_destroyed(): u8 { STATUS_DESTROYED }

// === Mutators ===
public fun set_status(nft: &mut SalvageNFT, status: u8) { nft.status = status; }

// === Destroy ===
public fun destroy(nft: SalvageNFT) {
    let SalvageNFT { id, .. } = nft;
    id.delete();
}
```

- [x]**Step 2: Write tests**

```move
// contracts/wreckage-core/tests/salvage_nft_tests.move
#[test_only]
module wreckage_core::salvage_nft_tests;

use wreckage_core::salvage_nft;

#[test]
fun test_status_constants() {
    assert!(salvage_nft::status_auction() == 0);
    assert!(salvage_nft::status_sold() == 1);
    assert!(salvage_nft::status_destroyed() == 2);
}
// Note: full mint tests require TenantItemId, tested in wreckage-protocol e2e tests
```

- [x]**Step 3: Build + run tests**

Run: `cd contracts/wreckage-core && sui move build && sui move test`
Expected: Build + tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-core/
git commit -m "feat(core): add SalvageNFT with mint, accessors, and destroy"
```

---

### Task 5: Rider Module

**Files:**
- Create: `contracts/wreckage-core/sources/rider.move`

- [x]**Step 1: Write rider.move**

```move
// contracts/wreckage-core/sources/rider.move
module wreckage_core::rider;

use wreckage_core::pool_config::PoolConfig;

/// Calculate self-destruct rider premium
public fun calculate_rider_premium(
    coverage_amount: u64,
    config: &PoolConfig,
): u64 {
    let rate = config.self_destruct_premium_rate();
    ((coverage_amount as u128) * (rate as u128) / 10000 as u64)
}

/// Check if self-destruct waiting period has elapsed
public fun is_waiting_period_elapsed(
    policy_created_at: u64,
    current_timestamp: u64,
    config: &PoolConfig,
): bool {
    current_timestamp >= policy_created_at + config.self_destruct_waiting_period()
}

/// Calculate self-destruct payout (reduced rate)
public fun calculate_self_destruct_payout(
    base_payout: u64,
    config: &PoolConfig,
): u64 {
    ((base_payout as u128) * (config.self_destruct_payout_rate() as u128) / 10000 as u64)
}
```

- [x]**Step 2: Write tests**

```move
// contracts/wreckage-core/tests/rider_tests.move
#[test_only]
module wreckage_core::rider_tests;

use wreckage_core::rider;
use wreckage_core::pool_config;

#[test]
fun test_rider_premium_calculation() {
    let config = pool_config::test_pool_config(); // SD rate = 7000 = 70%
    let premium = rider::calculate_rider_premium(10_000_000_000, &config); // 10 SUI
    assert!(premium == 7_000_000_000); // 70% of 10 SUI
}

#[test]
fun test_waiting_period_check() {
    let config = pool_config::test_pool_config(); // SD waiting = 604800 (7d)
    assert!(!rider::is_waiting_period_elapsed(1000, 1000 + 604799, &config));
    assert!(rider::is_waiting_period_elapsed(1000, 1000 + 604800, &config));
}

#[test]
fun test_self_destruct_payout_reduction() {
    let config = pool_config::test_pool_config(); // SD payout rate = 5000 = 50%
    let payout = rider::calculate_self_destruct_payout(10_000_000_000, &config);
    assert!(payout == 5_000_000_000); // 50% of 10 SUI
}
```

- [x]**Step 3: Run all core tests**

Run: `cd contracts/wreckage-core && sui move test`
Expected: All tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-core/
git commit -m "feat(core): add rider module for self-destruct premium and payout calculation"
```

---

## Phase 2: Move Contracts — Protocol Package

### Task 6: AdminCap + ProtocolConfig + Consolidated Init

**Files:**
- Create: `contracts/wreckage-protocol/sources/config.move`
- Create: `contracts/wreckage-protocol/sources/init.move`
- Test: `contracts/wreckage-protocol/tests/config_tests.move`

> **IMPORTANT (C3 fix):** Only ONE module per Sui Move package can have an `init` function. All shared object creation (AdminCap, ProtocolConfig, ClaimRegistry, PolicyRegistry, AuctionRegistry) goes into `init.move`. Other modules expose `create_*` functions called from init.

- [x]**Step 1: Write config.move (NO init function)**

```move
// contracts/wreckage-protocol/sources/config.move
module wreckage_protocol::config;

use wreckage_core::pool_config::{PoolConfig, AuctionConfig};

// === Structs ===
public struct AdminCap has key, store { id: UID }

public struct ProtocolConfig has key {
    id: UID,
    treasury: address,
    is_policy_paused: bool,
    is_claim_paused: bool,
    pool_configs: vector<PoolConfig>,
    auction_config: AuctionConfig,
    max_claims_per_policy: u8,
    protocol_fee_bps: u64,
    version: u64,
    min_deductible_bps: u64,
    min_premium_rate_bps: u64,
    max_coverage_limit: u64,
}

// === Package-visible Constructors (called from init.move) ===
public(package) fun create_admin_cap(ctx: &mut TxContext): AdminCap {
    AdminCap { id: object::new(ctx) }
}

public(package) fun create_protocol_config(
    treasury: address,
    auction_config: AuctionConfig,
    ctx: &mut TxContext,
): ProtocolConfig {
    ProtocolConfig {
        id: object::new(ctx),
        treasury,
        is_policy_paused: false,
        is_claim_paused: false,
        pool_configs: vector[],
        auction_config,
        max_claims_per_policy: 5,
        protocol_fee_bps: 2000,
        version: 1,
        min_deductible_bps: 100,
        min_premium_rate_bps: 50,
        max_coverage_limit: 200_000_000_000,
    }
}

// === Accessors ===
public fun treasury(c: &ProtocolConfig): address { c.treasury }
public fun is_policy_paused(c: &ProtocolConfig): bool { c.is_policy_paused }
public fun is_claim_paused(c: &ProtocolConfig): bool { c.is_claim_paused }
public fun pool_configs(c: &ProtocolConfig): &vector<PoolConfig> { &c.pool_configs }
public fun auction_config(c: &ProtocolConfig): &AuctionConfig { &c.auction_config }
public fun max_claims_per_policy(c: &ProtocolConfig): u8 { c.max_claims_per_policy }
public fun protocol_fee_bps(c: &ProtocolConfig): u64 { c.protocol_fee_bps }
public fun version(c: &ProtocolConfig): u64 { c.version }

/// Get pool config for a specific tier, aborts if not found
public fun get_pool_config(c: &ProtocolConfig, tier: u8): &PoolConfig {
    let configs = &c.pool_configs;
    let mut i = 0;
    while (i < configs.length()) {
        let cfg = &configs[i];
        if (cfg.risk_tier() == tier) {
            return cfg
        };
        i = i + 1;
    };
    abort 0 // tier not found
}

// === Admin Functions ===
public fun add_pool_tier(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    pool_config: PoolConfig,
) {
    config.pool_configs.push_back(pool_config);
}

public fun update_pool_config(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    tier: u8,
    new_config: PoolConfig,
) {
    let configs = &mut config.pool_configs;
    let mut i = 0;
    while (i < configs.length()) {
        if (configs[i].risk_tier() == tier) {
            configs[i] = new_config;
            return
        };
        i = i + 1;
    };
    abort 0
}

public fun set_policy_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool) {
    config.is_policy_paused = paused;
}

public fun set_claim_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool) {
    config.is_claim_paused = paused;
}

public fun update_auction_config(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    new_config: AuctionConfig,
) {
    config.auction_config = new_config;
}

public fun update_treasury(_: &AdminCap, config: &mut ProtocolConfig, new_treasury: address) {
    config.treasury = new_treasury;
}

// === Version Check (used by ALL shared object operations) ===
public fun assert_version(c: &ProtocolConfig) {
    assert!(c.version == 1, 60); // EVersionMismatch
}

// === Admin: Create + Share Pool (C2 fix) ===
public fun create_and_share_pool(
    _: &AdminCap,
    config: &ProtocolConfig,
    pool_config: PoolConfig,
    ctx: &mut TxContext,
) {
    assert_version(config);
    let pool = wreckage_protocol::risk_pool::create_pool(pool_config, ctx);
    wreckage_protocol::risk_pool::share_pool(pool);
}
```

- [x]**Step 1b: Write init.move (consolidated init)**

```move
// contracts/wreckage-protocol/sources/init.move
module wreckage_protocol::init;

use wreckage_protocol::config;
use wreckage_protocol::registry;
use wreckage_protocol::auction;

/// Single init for the entire wreckage_protocol package.
/// Creates all shared objects: AdminCap, ProtocolConfig, ClaimRegistry, PolicyRegistry, AuctionRegistry.
fun init(ctx: &mut TxContext) {
    // AdminCap → deployer
    let admin_cap = config::create_admin_cap(ctx);
    transfer::transfer(admin_cap, ctx.sender());

    // ProtocolConfig → shared
    let protocol_config = config::create_protocol_config(
        ctx.sender(),
        wreckage_core::pool_config::new_auction_config(
            259200, 172800, 500, 7000, 8000, 600, 600, 100_000_000,
        ),
        ctx,
    );
    transfer::share_object(protocol_config);

    // ClaimRegistry → shared
    let claim_registry = registry::create_claim_registry(ctx);
    transfer::share_object(claim_registry);

    // PolicyRegistry → shared
    let policy_registry = registry::create_policy_registry(ctx);
    transfer::share_object(policy_registry);

    // AuctionRegistry → shared
    let auction_registry = auction::create_auction_registry(ctx);
    transfer::share_object(auction_registry);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
```

- [x]**Step 2: Write tests**

```move
// contracts/wreckage-protocol/tests/config_tests.move
#[test_only]
module wreckage_protocol::config_tests;

use sui::test_scenario;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_core::pool_config;

#[test]
fun test_init_creates_admin_cap_and_config() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);

    // init (consolidated)
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    // admin should have AdminCap
    let cap = scenario.take_from_sender<AdminCap>();
    scenario.return_to_sender(cap);

    // ProtocolConfig should be shared
    let cfg = scenario.take_shared<ProtocolConfig>();
    assert!(config::version(&cfg) == 1);
    assert!(!config::is_policy_paused(&cfg));
    test_scenario::return_shared(cfg);

    scenario.end();
}

#[test]
fun test_add_and_get_pool_tier() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    config::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();

    let pool_cfg = pool_config::test_pool_config(); // tier 2
    config::add_pool_tier(&cap, &mut cfg, pool_cfg);

    let retrieved = config::get_pool_config(&cfg, 2);
    assert!(pool_config::risk_tier(retrieved) == 2);
    assert!(pool_config::base_premium_rate(retrieved) == 500);

    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.end();
}
```

- [x]**Step 3: Run tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-protocol/
git commit -m "feat(protocol): add AdminCap + ProtocolConfig with admin functions"
```

---

### Task 7: ClaimRegistry + PolicyRegistry

**Files:**
- Create: `contracts/wreckage-protocol/sources/registry.move`
- Test: `contracts/wreckage-protocol/tests/registry_tests.move`

- [x]**Step 1: Write registry.move**

```move
// contracts/wreckage-protocol/sources/registry.move
module wreckage_protocol::registry;

use sui::table::{Self, Table};
use world::in_game_id::TenantItemId;

// === ClaimRegistry ===
public struct ClaimRegistry has key {
    id: UID,
    processed_killmails: Table<TenantItemId, ID>,  // killmail_key → policy_id
    version: u64,
}

// === PolicyRegistry ===
public struct PolicyRegistry has key {
    id: UID,
    active_policies: Table<TenantItemId, ID>,  // character_id → policy_id
    version: u64,
}

// === Constructors (package-visible, called from init.move) ===
public(package) fun create_claim_registry(ctx: &mut TxContext): ClaimRegistry {
    ClaimRegistry {
        id: object::new(ctx),
        processed_killmails: table::new(ctx),
        version: 1,
    }
}

public(package) fun create_policy_registry(ctx: &mut TxContext): PolicyRegistry {
    PolicyRegistry {
        id: object::new(ctx),
        active_policies: table::new(ctx),
        version: 1,
    }
}

// === ClaimRegistry Functions ===
public fun is_killmail_claimed(registry: &ClaimRegistry, killmail_key: TenantItemId): bool {
    registry.processed_killmails.contains(killmail_key)
}

public fun record_claim(
    registry: &mut ClaimRegistry,
    killmail_key: TenantItemId,
    policy_id: ID,
) {
    assert!(!registry.processed_killmails.contains(killmail_key), 30); // EKillmailAlreadyClaimed
    registry.processed_killmails.add(killmail_key, policy_id);
}

// === PolicyRegistry Functions ===
public fun has_active_policy(registry: &PolicyRegistry, character_id: TenantItemId): bool {
    registry.active_policies.contains(character_id)
}

public fun register_policy(
    registry: &mut PolicyRegistry,
    character_id: TenantItemId,
    policy_id: ID,
) {
    assert!(!registry.active_policies.contains(character_id), 50); // ECharacterAlreadyInsured
    registry.active_policies.add(character_id, policy_id);
}

public fun unregister_policy(
    registry: &mut PolicyRegistry,
    character_id: TenantItemId,
) {
    if (registry.active_policies.contains(character_id)) {
        registry.active_policies.remove(character_id);
    };
}

// === Version Check ===
public fun assert_claim_registry_version(r: &ClaimRegistry) {
    assert!(r.version == 1, 60);
}

public fun assert_policy_registry_version(r: &PolicyRegistry) {
    assert!(r.version == 1, 60);
}
```

- [x]**Step 2: Write tests**

```move
// contracts/wreckage-protocol/tests/registry_tests.move
#[test_only]
module wreckage_protocol::registry_tests;

use sui::test_scenario;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::registry::{Self, ClaimRegistry, PolicyRegistry};
use world::in_game_id;

#[test]
fun test_claim_registry_dedup() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let key = in_game_id::create_key(1001, b"test".to_string());
    let policy_id = object::id_from_address(@0x123);

    assert!(!registry::is_killmail_claimed(&claim_reg, key));
    registry::record_claim(&mut claim_reg, key, policy_id);
    assert!(registry::is_killmail_claimed(&claim_reg, key));

    test_scenario::return_shared(claim_reg);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_claim_registry_rejects_duplicate() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let key = in_game_id::create_key(1001, b"test".to_string());
    let policy_id = object::id_from_address(@0x123);

    registry::record_claim(&mut claim_reg, key, policy_id);
    registry::record_claim(&mut claim_reg, key, policy_id); // should abort

    test_scenario::return_shared(claim_reg);
    scenario.end();
}

#[test]
fun test_policy_registry_one_per_character() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let char_id = in_game_id::create_key(42, b"test".to_string());
    let policy_id = object::id_from_address(@0x456);

    assert!(!registry::has_active_policy(&policy_reg, char_id));
    registry::register_policy(&mut policy_reg, char_id, policy_id);
    assert!(registry::has_active_policy(&policy_reg, char_id));

    registry::unregister_policy(&mut policy_reg, char_id);
    assert!(!registry::has_active_policy(&policy_reg, char_id));

    test_scenario::return_shared(policy_reg);
    scenario.end();
}
```

- [x]**Step 3: Run tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-protocol/
git commit -m "feat(protocol): add ClaimRegistry and PolicyRegistry for global dedup"
```

---

### Task 8: RiskPool + LP Mechanics

**Files:**
- Create: `contracts/wreckage-protocol/sources/risk_pool.move`
- Test: `contracts/wreckage-protocol/tests/risk_pool_tests.move`

- [x]**Step 1: Write risk_pool.move**

```move
// contracts/wreckage-protocol/sources/risk_pool.move
module wreckage_protocol::risk_pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;
use wreckage_core::pool_config::PoolConfig;

// === Constants ===
const VIRTUAL_SHARES: u64 = 1000;
const VIRTUAL_LIQUIDITY: u64 = 1000;  // 1000 MIST
const MAX_UTILIZATION_BPS: u64 = 8000; // 80%
const LP_LOCK_PERIOD: u64 = 604800;    // 7 days in seconds
const LP_WITHDRAW_CAP_BPS: u64 = 2500; // 25%
const UTILIZATION_FEE_THRESHOLD_BPS: u64 = 6000; // 60%

// === Structs ===
public struct RiskPool has key {
    id: UID,
    config: PoolConfig,
    total_liquidity: Balance<SUI>,
    reserved_amount: u64,
    total_premiums_collected: u64,
    total_claims_paid: u64,
    total_shares: u64,
    is_active: bool,
    version: u64,
}

public struct LPPosition has key, store {
    id: UID,
    pool_risk_tier: u8,
    shares: u64,
    deposited_at: u64,
    initial_deposit: u64,
}

// === Events ===
public struct LPDepositEvent has copy, drop {
    pool_tier: u8,
    depositor: address,
    amount: u64,
    shares_minted: u64,
}

public struct LPWithdrawEvent has copy, drop {
    pool_tier: u8,
    withdrawer: address,
    amount: u64,
    shares_burned: u64,
    fee: u64,
}

// === Constructor ===
public fun create_pool(
    config: PoolConfig,
    ctx: &mut TxContext,
): RiskPool {
    RiskPool {
        id: object::new(ctx),
        config,
        total_liquidity: balance::zero(),
        reserved_amount: 0,
        total_premiums_collected: 0,
        total_claims_paid: 0,
        total_shares: VIRTUAL_SHARES,  // virtual initial shares
        is_active: true,
        version: 1,
    }
}

public fun share_pool(pool: RiskPool) {
    transfer::share_object(pool);
}

// === Accessors ===
public fun config(pool: &RiskPool): &PoolConfig { &pool.config }
public fun total_liquidity_value(pool: &RiskPool): u64 { pool.total_liquidity.value() + VIRTUAL_LIQUIDITY }
public fun raw_liquidity_value(pool: &RiskPool): u64 { pool.total_liquidity.value() }
public fun reserved_amount(pool: &RiskPool): u64 { pool.reserved_amount }
public fun total_shares(pool: &RiskPool): u64 { pool.total_shares }
public fun is_active(pool: &RiskPool): bool { pool.is_active }
public fun risk_tier(pool: &RiskPool): u8 { pool.config.risk_tier() }
public fun total_premiums_collected(pool: &RiskPool): u64 { pool.total_premiums_collected }
public fun total_claims_paid(pool: &RiskPool): u64 { pool.total_claims_paid }

public fun available_liquidity(pool: &RiskPool): u64 {
    let total = total_liquidity_value(pool);
    if (total > pool.reserved_amount) {
        total - pool.reserved_amount
    } else {
        0
    }
}

public fun utilization_bps(pool: &RiskPool): u64 {
    let total = total_liquidity_value(pool);
    if (total == 0) return 10000;
    pool.reserved_amount * 10000 / total
}

// === LP Deposit ===
public fun deposit(
    pool: &mut RiskPool,
    deposit_coin: Coin<SUI>,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): LPPosition {
    assert!(pool.is_active, 20); // EPoolNotActive
    let deposit_amount = deposit_coin.value();
    assert!(deposit_amount > 0, 0);

    // Calculate shares: deposit * total_shares / total_liquidity
    let total_liq = total_liquidity_value(pool);
    let shares = (deposit_amount as u128) * (pool.total_shares as u128) / (total_liq as u128);
    let shares = (shares as u64);
    assert!(shares > 0, 25); // EZeroSharesMinted

    pool.total_shares = pool.total_shares + shares;
    pool.total_liquidity.join(deposit_coin.into_balance());

    let position = LPPosition {
        id: object::new(ctx),
        pool_risk_tier: pool.config.risk_tier(),
        shares,
        deposited_at: clock.timestamp_ms() / 1000,
        initial_deposit: deposit_amount,
    };

    event::emit(LPDepositEvent {
        pool_tier: pool.config.risk_tier(),
        depositor: ctx.sender(),
        amount: deposit_amount,
        shares_minted: shares,
    });

    position
}

// === LP Withdraw ===
public fun withdraw(
    pool: &mut RiskPool,
    position: &mut LPPosition,
    shares_to_burn: u64,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(position.pool_risk_tier == pool.config.risk_tier(), 26); // EWrongPool
    assert!(shares_to_burn > 0 && shares_to_burn <= position.shares, 0);

    // Check lock period
    let now = clock.timestamp_ms() / 1000;
    assert!(now >= position.deposited_at + LP_LOCK_PERIOD, 23); // ELPLockPeriodNotElapsed

    // Calculate withdrawal amount
    let total_liq = total_liquidity_value(pool);
    let gross_amount = (shares_to_burn as u128) * (total_liq as u128) / (pool.total_shares as u128);
    let gross_amount = (gross_amount as u64);

    // Check withdraw cap (25% of available)
    let avail = available_liquidity(pool);
    let max_withdraw = avail * LP_WITHDRAW_CAP_BPS / 10000;
    assert!(gross_amount <= max_withdraw, 24); // ELPWithdrawCapExceeded

    // Calculate dynamic withdrawal fee
    // fee_rate_bps = (utilization_bps - 6000) * 2, applied to gross_amount
    let util = utilization_bps(pool);
    let fee = if (util > UTILIZATION_FEE_THRESHOLD_BPS) {
        let fee_rate_bps = (util - UTILIZATION_FEE_THRESHOLD_BPS) * 2;
        (gross_amount as u128) * (fee_rate_bps as u128) / 10000
    } else {
        0
    };
    let fee = (fee as u64);
    let net_amount = gross_amount - fee;

    // Ensure we don't withdraw more than raw balance
    let net_amount = if (net_amount > pool.total_liquidity.value()) {
        pool.total_liquidity.value()
    } else {
        net_amount
    };

    position.shares = position.shares - shares_to_burn;
    pool.total_shares = pool.total_shares - shares_to_burn;

    // Invariant
    assert!(pool.total_liquidity.value() - net_amount >= pool.reserved_amount, 21);

    let withdraw_balance = pool.total_liquidity.split(net_amount);

    event::emit(LPWithdrawEvent {
        pool_tier: pool.config.risk_tier(),
        withdrawer: ctx.sender(),
        amount: net_amount,
        shares_burned: shares_to_burn,
        fee,
    });

    coin::from_balance(withdraw_balance, ctx)
}

// === Pool Operations (called by claims/underwriting) ===
public fun collect_premium(pool: &mut RiskPool, premium: Balance<SUI>) {
    let amount = premium.value();
    pool.total_premiums_collected = pool.total_premiums_collected + amount;
    pool.total_liquidity.join(premium);
}

public fun reserve_coverage(pool: &mut RiskPool, amount: u64) {
    let new_reserved = pool.reserved_amount + amount;
    let total = total_liquidity_value(pool);
    let max_reserved = total * MAX_UTILIZATION_BPS / 10000;
    assert!(new_reserved <= max_reserved, 22); // EPoolUtilizationExceeded
    pool.reserved_amount = new_reserved;
}

public fun release_reservation(pool: &mut RiskPool, amount: u64) {
    assert!(amount <= pool.reserved_amount, 21); // bookkeeping inconsistency = abort
    pool.reserved_amount = pool.reserved_amount - amount;
}

public fun pay_claim(
    pool: &mut RiskPool,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(pool.total_liquidity.value() >= amount, 21); // EPoolInsufficientLiquidity
    pool.total_claims_paid = pool.total_claims_paid + amount;
    // Release reservation atomically
    release_reservation(pool, amount);
    let payout = pool.total_liquidity.split(amount);
    // Invariant check
    assert!(pool.total_liquidity.value() >= pool.reserved_amount, 21);
    coin::from_balance(payout, ctx)
}

public fun receive_auction_revenue(pool: &mut RiskPool, revenue: Balance<SUI>) {
    pool.total_liquidity.join(revenue);
}

// === LPPosition Accessors ===
public fun lp_pool_tier(pos: &LPPosition): u8 { pos.pool_risk_tier }
public fun lp_shares(pos: &LPPosition): u64 { pos.shares }
public fun lp_deposited_at(pos: &LPPosition): u64 { pos.deposited_at }
public fun lp_initial_deposit(pos: &LPPosition): u64 { pos.initial_deposit }

public fun destroy_empty_position(pos: LPPosition) {
    assert!(pos.shares == 0, 0);
    let LPPosition { id, .. } = pos;
    id.delete();
}
```

- [x]**Step 2: Write tests**

Tests should cover: deposit, withdraw, virtual liquidity, zero-share check, lock period, utilization cap, dynamic fee, pay_claim + reservation release atomicity. Write these in `contracts/wreckage-protocol/tests/risk_pool_tests.move`.

Key test cases:
- `test_deposit_and_share_calculation`
- `test_first_deposit_virtual_liquidity_prevents_attack`
- `test_zero_shares_rejected`
- `test_withdraw_lock_period`
- `test_withdraw_cap`
- `test_reserve_and_release`
- `test_pay_claim_atomic`
- `test_utilization_safety_valve`

- [x]**Step 3: Run tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-protocol/
git commit -m "feat(protocol): add RiskPool with LP mechanics, virtual liquidity, and safety valves"
```

---

### Task 9: Anti-Fraud Module

**Files:**
- Create: `contracts/wreckage-protocol/sources/anti_fraud.move`
- Test: `contracts/wreckage-protocol/tests/anti_fraud_tests.move`

- [x]**Step 1: Write anti_fraud.move**

Core validation logic: checks killmail matching, cooldown, frequency, self-destruct routing. Reads `&Killmail` fields directly (Move 2024 public struct).

Key functions:
- `validate_standard_claim(policy, killmail, claim_registry, clock, config) → FraudCheckResult`
- `validate_self_destruct_claim(policy, killmail, claim_registry, clock, config) → FraudCheckResult`
- `calculate_payout(coverage, claim_count, decay_rate, deductible_bps) → u64` (u128 intermediate)

- [x]**Step 2: Write tests**

Key test cases:
- `test_valid_standard_claim_passes`
- `test_self_kill_rejected_for_standard`
- `test_cooldown_not_elapsed_rejected`
- `test_max_claims_reached_rejected`
- `test_duplicate_killmail_rejected`
- `test_valid_self_destruct_passes`
- `test_self_destruct_without_rider_rejected`
- `test_self_destruct_waiting_period`
- `test_payout_calculation_with_decay`
- `test_payout_calculation_overflow_safe`

- [x]**Step 3: Run tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-protocol/
git commit -m "feat(protocol): add anti-fraud validation with payout calculation"
```

---

### Task 10: Underwriting (Purchase + Renew + Transfer)

**Files:**
- Create: `contracts/wreckage-protocol/sources/underwriting.move`
- Test: `contracts/wreckage-protocol/tests/underwriting_tests.move`

- [x]**Step 1: Write underwriting.move**

Key functions:
- `purchase_policy(config, pool, policy_registry, character, coverage, include_sd, payment, clock, ctx) → InsurancePolicy`
- `renew_policy(policy, config, pool, payment, clock, ctx)`
- `transfer_policy(policy, recipient, clock, ctx)` — resets NCB, sets cooldown
- `expire_policy(policy, policy_registry, clock)` — public, anyone can call

Premium calculation with NCB discount and u128 arithmetic.

Required events: `PolicyExpiredEvent { policy_id }` (in expire_policy function).

**All functions MUST assert version** on every shared object parameter (ProtocolConfig, RiskPool, PolicyRegistry). Use `config::assert_version()`, `risk_pool` version check pattern, `registry::assert_policy_registry_version()`.

- [x]**Step 2: Write tests**

Key test cases:
- `test_purchase_policy_success`
- `test_purchase_rejects_duplicate_character`
- `test_purchase_with_self_destruct_rider`
- `test_renew_with_ncb_discount`
- `test_ncb_discount_capped`
- `test_renew_resets_waiting_period`
- `test_transfer_resets_ncb_and_cooldown`
- `test_expire_unregisters_from_policy_registry`

- [x]**Step 3: Run tests, commit**

---

### Task 11: Claims Engine

**Files:**
- Create: `contracts/wreckage-protocol/sources/claims.move`
- Test: `contracts/wreckage-protocol/tests/claims_tests.move`

- [x]**Step 1: Write claims.move**

Key functions:
- `submit_claim(policy, killmail, pool, claim_registry, config, clock, ctx)`
- `submit_self_destruct_claim(policy, killmail, pool, claim_registry, config, clock, ctx)`

Both: validate → calculate payout → pay_claim → update policy → record killmail → mint SalvageNFT (via salvage.move) → create Auction → emit events.

Required events (from spec Section 13):
- `ClaimSubmittedEvent { policy_id, killmail_key, claim_type }`
- `ClaimPaidEvent { policy_id, payout_amount, deductible, decay_amount }`

Version checks: assert version on ALL shared objects passed (pool, claim_registry, config).

- [x]**Step 2: Write tests**

Key test cases:
- `test_submit_claim_full_flow`
- `test_submit_claim_with_deductible_and_decay`
- `test_self_destruct_claim_reduced_payout`
- `test_claim_rejects_wrong_victim`
- `test_claim_rejects_expired_policy`
- `test_claim_rejects_duplicate_killmail`

- [x]**Step 3: Run tests, commit**

---

### Task 11b: Salvage Lifecycle Module

**Files:**
- Create: `contracts/wreckage-protocol/sources/salvage.move`
- Test: `contracts/wreckage-protocol/tests/salvage_tests.move`

> **C1 fix**: This module bridges claims.move and auction.move. It handles SalvageNFT minting from claim context and wrapping into auction creation.

- [x]**Step 1: Write salvage.move**

```move
// contracts/wreckage-protocol/sources/salvage.move
module wreckage_protocol::salvage;

use sui::clock::Clock;
use world::killmail::Killmail;
use wreckage_core::salvage_nft::{Self, SalvageNFT};
use wreckage_core::pool_config::PoolConfig;

/// Estimate salvage value from killmail + tier (NOT from coverage_amount)
/// Uses risk_tier base_premium_rate as proxy for value — higher risk = higher salvage
public fun estimate_salvage_value(
    killmail: &Killmail,
    pool_config: &PoolConfig,
): u64 {
    // Base value = tier factor * constant
    // Tier 1: 1x, Tier 2: 3x, Tier 3: 8x (reflecting risk/value)
    let tier = pool_config.risk_tier();
    let tier_multiplier = if (tier == 1) { 1 } else if (tier == 2) { 3 } else { 8 };
    let base_value = 1_000_000_000u64; // 1 SUI base
    base_value * tier_multiplier
}

/// Mint SalvageNFT from a validated killmail
public fun mint_from_killmail(
    killmail: &Killmail,
    pool_config: &PoolConfig,
    ctx: &mut TxContext,
): SalvageNFT {
    let estimated_value = estimate_salvage_value(killmail, pool_config);

    salvage_nft::mint(
        killmail.key,
        killmail.victim_id,
        killmail.solar_system_id,
        if (killmail.loss_type == world::killmail::ship()) { 1 } else { 2 },
        killmail.kill_timestamp,
        estimated_value,
        ctx,
    )
}
```

- [x]**Step 2: Write tests**

Key test cases:
- `test_estimate_salvage_value_by_tier`
- `test_mint_from_killmail`

- [x]**Step 3: Run tests, commit**

```bash
git add contracts/wreckage-protocol/sources/salvage.move contracts/wreckage-protocol/tests/salvage_tests.move
git commit -m "feat(protocol): add salvage lifecycle module bridging claims and auctions"
```

---

### Task 12: Auction System

**Files:**
- Create: `contracts/wreckage-protocol/sources/auction.move`
- Test: `contracts/wreckage-protocol/tests/auction_tests.move`

- [x]**Step 1: Write auction.move**

Key structs: `AuctionRegistry` (shared, config only) + `Auction` (standalone shared per auction).

```move
// Package-visible constructor (called from init.move)
public(package) fun create_auction_registry(ctx: &mut TxContext): AuctionRegistry {
    AuctionRegistry {
        id: object::new(ctx),
        config: wreckage_core::pool_config::new_auction_config(
            259200, 172800, 500, 7000, 8000, 600, 600, 100_000_000,
        ),
        active_count: 0,
        version: 1,
    }
}
```

Required events (from spec Section 13):
- `AuctionCreatedEvent { salvage_nft_id, floor_price, ends_at }`
- `BidPlacedEvent { salvage_nft_id, bidder, amount, extended: bool }`
- `AuctionSettledEvent { salvage_nft_id, winner, final_price, pool_revenue }`
- `AuctionDestroyedEvent { salvage_nft_id }`

Key functions:
- `create_auction(registry, nft, pool_tier, config, clock, ctx)` — creates + shares Auction
- `place_bid(auction, bid_coin, clock, ctx)` — anti-snipe logic
- `settle_auction(auction, registry, pool, config, clock, ctx)` — winner gets NFT, revenue splits
- `buyout(auction, registry, pool, config, payment, clock, ctx)` — floor price purchase
- `destroy_unsold(auction, registry, clock, ctx)` — destroy NFT if no buyers

- [x]**Step 2: Write tests**

Key test cases:
- `test_place_bid_and_settle`
- `test_bid_increment_enforcement`
- `test_anti_snipe_extension`
- `test_buyout_after_no_bids`
- `test_revenue_split_to_pool_and_treasury`
- `test_destroy_unsold_nft`
- `test_outbid_returns_previous_bid`

- [x]**Step 3: Run tests, commit**

---

### Task 13: Subrogation + Integration Mocks

**Files:**
- Create: `contracts/wreckage-protocol/sources/subrogation.move`
- Create: `contracts/wreckage-protocol/sources/integration.move`

- [x]**Step 1: Write subrogation.move** — SubrogationEvent emission
- [x]**Step 2: Write integration.move** — Mock Bounty/Fleet structs + functions
- [x]**Step 3: Build + test, commit**

---

### Task 14: End-to-End Integration Tests

**Files:**
- Create: `contracts/wreckage-protocol/tests/e2e_tests.move`

- [x]**Step 1: Write full demo script as test**

Test the complete flow from the Demo Script (spec section 17):
1. Init all shared objects
2. Create character + killmail (using world contracts test helpers)
3. Purchase policy (Tier 2 + rider)
4. LP deposit
5. Submit claim → payout + SalvageNFT + Auction created
6. Place bid → settle → revenue to pool
7. Self-destruct claim path
8. Renewal with NCB
9. Duplicate killmail rejection
10. Duplicate character policy rejection

- [x]**Step 2: Write monkey tests**

Extreme scenarios:
- Claim with MAX_U64 coverage (overflow check)
- Deposit 1 MIST (virtual liquidity prevents attack)
- 255 claims on one policy (u8 boundary)
- Zero-premium edge case
- Rapid sequential bids on same auction

- [x]**Step 3: Run all tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass (including e2e + monkey)

- [x]**Step 4: Commit**

```bash
git add contracts/wreckage-protocol/tests/
git commit -m "test(protocol): add e2e integration tests and monkey tests"
```

---

## Phase 3: Contract Deployment

### Task 15: Deploy to Testnet

- [x]**Step 1: Build both packages**

```bash
cd contracts/wreckage-core && sui move build
cd contracts/wreckage-protocol && sui move build
```

- [x]**Step 2: Deploy wreckage-core**

```bash
cd contracts/wreckage-core
sui client publish --gas-budget 500000000
```

Record: `CORE_PACKAGE_ID`

- [x]**Step 3: Update wreckage-protocol dependency to published core**

Update `contracts/wreckage-protocol/Move.toml`:
```toml
wreckage_core = { address = "<CORE_PACKAGE_ID>" }
```

- [x]**Step 4: Deploy wreckage-protocol**

```bash
cd contracts/wreckage-protocol
sui client publish --gas-budget 500000000
```

Record: `PROTOCOL_PACKAGE_ID`, `AdminCap ID`, `ProtocolConfig ID`, `ClaimRegistry ID`, `PolicyRegistry ID`

- [x]**Step 5: Initialize pools (Tier 1, 2, 3)**

Use `sui client call` to add pool tiers via `config::add_pool_tier` + create pools via `risk_pool::create_pool`.

- [x]**Step 6: Commit deployment records**

Save all IDs to `contracts/deployment.json` and commit.

---

## Phase 4: Frontend

### Task 16: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/config/network.ts`
- Create: `frontend/src/lib/contracts.ts`, `frontend/src/lib/types.ts`

- [x]**Step 1: Initialize React + Vite + TailwindCSS project**

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Wreckage_Insurance_Protocol
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @mysten/dapp-kit-react @mysten/sui @tanstack/react-query react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

- [x]**Step 2: Configure dApp Kit provider + router + TailwindCSS**
- [x]**Step 3: Create contracts.ts with package IDs + types.ts**
- [x]**Step 4: Create Layout.tsx + Navbar.tsx** (S2 fix: layout before pages)
- [x]**Step 5: Verify dev server runs**

Run: `cd frontend && npm run dev`
Expected: Opens in browser with wallet connect

- [x]**Step 5: Commit**

---

### Task 17: PTB Builders

**Files:**
- Create: `frontend/src/lib/ptb/insure.ts`
- Create: `frontend/src/lib/ptb/claim.ts`
- Create: `frontend/src/lib/ptb/pool.ts`
- Create: `frontend/src/lib/ptb/auction.ts`

Each file builds a `Transaction` for its domain operations. These are pure functions (no hooks), testable independently.

- [x]**Step 1: Write all PTB builders**
- [x]**Step 2: Commit**

---

### Task 18: Custom Hooks

**Files:**
- Create: `frontend/src/hooks/useInsurancePolicy.ts`
- Create: `frontend/src/hooks/useRiskPool.ts`
- Create: `frontend/src/hooks/useAuction.ts`
- Create: `frontend/src/hooks/useKillmail.ts`
- Create: `frontend/src/hooks/useClaims.ts`

Each hook wraps dApp Kit queries + PTB execution for its domain.

- [x]**Step 1: Write all hooks**
- [x]**Step 2: Commit**

---

### Task 19: Insurance Pages (Full)

**Files:**
- Create: `frontend/src/pages/insure/InsurePage.tsx`
- Create: `frontend/src/pages/insure/PolicyDetailPage.tsx`
- Create: `frontend/src/components/policy/RiskTierSelector.tsx`
- Create: `frontend/src/components/policy/RiderToggle.tsx`
- Create: `frontend/src/components/policy/PolicyCard.tsx`

- [x]**Step 1: Build InsurePage** — tier select → coverage slider → rider toggle → premium calc → confirm
- [x]**Step 2: Build PolicyDetailPage** — policy details, status, claim entry
- [x]**Step 3: Test with testnet wallet**
- [x]**Step 4: Commit**

---

### Task 20: Claims Pages (Full)

**Files:**
- Create: `frontend/src/pages/claims/ClaimPage.tsx`
- Create: `frontend/src/pages/claims/ClaimHistoryPage.tsx`

- [x]**Step 1: Build ClaimPage** — select policy → match killmail → payout breakdown → submit
- [x]**Step 2: Build ClaimHistoryPage** — query events
- [x]**Step 3: Test with testnet**
- [x]**Step 4: Commit**

---

### Task 21: LP Pool Pages (Full)

**Files:**
- Create: `frontend/src/pages/pool/PoolDashboard.tsx`
- Create: `frontend/src/pages/pool/DepositPage.tsx`
- Create: `frontend/src/pages/pool/WithdrawPage.tsx`
- Create: `frontend/src/components/pool/PoolStats.tsx`
- Create: `frontend/src/components/pool/LPPositionCard.tsx`
- Create: `frontend/src/components/pool/ExitFeeIndicator.tsx`

- [x]**Step 1: Build PoolDashboard** — per-tier TVL, APR, utilization, exit fee
- [x]**Step 2: Build Deposit + Withdraw flows**
- [x]**Step 3: Test with testnet**
- [x]**Step 4: Commit**

---

### Task 22: Salvage Auction Pages (Simplified)

**Files:**
- Create: `frontend/src/pages/salvage/AuctionListPage.tsx`
- Create: `frontend/src/pages/salvage/AuctionDetailPage.tsx`
- Create: `frontend/src/components/auction/AuctionCard.tsx`
- Create: `frontend/src/components/auction/BidForm.tsx`
- Create: `frontend/src/components/auction/CountdownTimer.tsx`

- [x]**Step 1: Build AuctionListPage** — list active auctions
- [x]**Step 2: Build AuctionDetailPage** — bid + countdown + settle/buyout
- [x]**Step 3: Test with testnet**
- [x]**Step 4: Commit**

---

### Task 23: Demo Panel

**Files:**
- Create: `frontend/src/pages/demo/DemoPanel.tsx`

Admin-only page for demo:
- Simulate Killmail creation (calls World Contracts admin, or displays mock data)
- Adjust pool parameters
- Trigger mock Bounty/Fleet integration
- Display full event log

- [x]**Step 1: Build DemoPanel**
- [x]**Step 2: Test full demo script flow**
- [x]**Step 3: Commit**

---

### Task 24: Dashboard + Final Integration

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/components/layout/Navbar.tsx` (add all route links)

> Note: Layout.tsx and Navbar.tsx scaffolded in Task 16. This task adds the Dashboard page and finalizes navigation.

- [x]**Step 1: Build Dashboard** — protocol stats, recent events, quick links
- [x]**Step 2: Finalize Navbar** — add links to all pages
- [x]**Step 3: Final integration test of all pages**
- [x]**Step 4: Commit**

---

## Phase 5: Polish + Documentation

### Task 25: Progress Update + Notes

- [x]**Step 1: Update `progress.md`** — mark contract ✅, frontend ✅
- [x]**Step 2: Write `move-notes.md`** — module summaries, deployment IDs, known risks
- [x]**Step 3: Update `plan.md`** — check off completed items
- [x]**Step 4: Final commit**

```bash
git add -A
git commit -m "docs: update progress, notes, and plan for Wreckage Insurance Protocol"
```
