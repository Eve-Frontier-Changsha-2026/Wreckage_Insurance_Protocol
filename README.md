# 專案名稱：Wreckage_Insurance_Protocol (鏈上星際保險與殘骸回收協議)

> 📜 **[EVE Frontier 專案憲法與開發準則](https://github.com/Eve-Frontier-Changsha-2026/Constitution/blob/master/EVE_Frontier_Project_Constitution.md)**
> 本專案的世界觀設定與底層相依資源，均遵從此憲法文檔之規範。


## 📌 概念簡介
「生於高風險，死於高收益」是 EVE 的代名詞。本協議是一套去中心化的戰場資產對沖機制，結合 Smart Object，讓玩家的艦艦或模組能買「戰損保險」，並在船隻摧毀時觸發自動理賠。同時，被擊毀的船隻可自動鑄造出具有所有權的「打撈憑證」，形成一門全新的殘骸回收生意。

## 🎯 解決痛點與核心循環
- **被動自動化理賠**：當戰鬥發生時，透過判斷鏈上的 Killmail 事件（物件被抹除），向受益人一鍵發放 Sui 代幣理賠。
- **殘骸所有權與拍賣市場**：系統在戰隕座標生成打撈 NFT 憑證。非交戰方的拾荒玩家 / 打撈公會可以在情報平台上認購打撈權，轉賣或進行廢品提煉（結合工廠系統）。
- **流動性資金池生態**：一般 DeFi 玩家可做 LP (流動性提供者)，為賠付資金池注入金流，並躺賺所有宇宙冒險家繳納的保費抽成。

## 🔗 與 Sui / World Contracts 的結合
- 每份保單都是一個 Sui 物件，詳列保額、條件及期限，甚至可以在二級市場流轉（如變賣高價值運輸保險憑證）。
- 運用 World Contracts 驗證「有效毀損事件」的實時 Killmail，防禦自爆洗保險的防弊條件（如必須交由敵對狀態聯盟擊殺等過濾篩選）。
- 把鏈上的金融原語（保險、流動池、票據、NFT 打撈憑證）自然地貫穿遊戲物理經濟。

## 🏆 得獎潛力
- **深刻理解硬核本質**：深知遊戲核心哲學「沒有風險就沒有意義」，但同時打造減輕「歸零挫折感」的軟著陸金融措施，是非常成熟的玩家思維設計。
- **優越敘事**：金融與遊戲機制的完美契合。一方面產生理賠金，一方面將垃圾轉為工業體系新素材，實現真正的 Web3 循環經濟遊戲。


## Specifications

### 2026 03 20 Wreckage Insurance Protocol Design

# Wreckage Insurance Protocol — System Design Spec

> **Date**: 2026-03-20
> **Status**: Reviewed & Revised (post security/architecture/red-team audit)
> **Layer**: Economic / Extension
> **Real-world Analogy**: Lloyd's of London maritime insurance market in space
> **Review Sources**: sui-architect, sui-security-guard, sui-red-team, sui-development-agent

---

## 1. Overview

A decentralized combat asset hedging protocol for EVE Frontier. Players insure ships against combat loss, receive automatic payouts verified via on-chain Killmail, and generate Salvage NFTs from wreckage. LP providers fund the payout pools and earn premiums.

### Core Loop

```
投保 → 戰損/自爆 → Killmail 驗證 → 理賠 (扣免賠額)
  → 代位求償追殺 killer → mint 打撈 NFT → 拍賣
  → 收益回流池 → LP 賺取收益 → 續保 (NCB 折扣)
```

### Real-world Insurance Mapping

| 現實機制 | 協議實現 |
|---------|---------|
| Lloyd's 承保辛迪加 | LP 分級風險池 |
| 海事保險 (Marine Insurance) | 艦船戰損保險 |
| 船舶打撈權 (Salvage Rights) | SalvageNFT 拍賣 |
| 戰爭險附加條款 (War Risk) | 高危星系 Tier 加費 |
| 免賠額 (Deductible) | 理賠時自負比例 |
| 無理賠優惠 (No-Claims Bonus) | 續保保費折扣 (capped) |
| 代位求償 (Subrogation) | 理賠後自動追殺 killer (→ Bounty Escrow) |
| 鑿沉保險 (Scuttling) | 自爆附加險 (rider, with waiting period + reduced payout) |

---

## 2. Architecture: Layered Package

Two Move packages with clear separation of concerns.

### Package Dependency

```
World Contracts (外部, 只讀)
  ├── killmail.move
  ├── killmail_registry.move
  ├── character.move
  └── in_game_id.move
         │
         ▼
wreckage-core (原語層)
  ├── policy.move           # 保單物件 + public accessors/mutators
  ├── rider.move            # 附加險條款
  ├── salvage_nft.move      # 打撈憑證 NFT + public accessors
  ├── pool_config.move      # 池配置 + 拍賣配置原語
  └── errors.move           # 統一錯誤碼
         │
         ▼
wreckage-protocol (業務層)
  ├── underwriting.move     # 投保 + 續保 + NCB
  ├── claims.move           # 理賠引擎 (標準/自爆)
  ├── anti_fraud.move       # 反詐欺驗證
  ├── risk_pool.move        # 分級風險池 + LP (u64 shares)
  ├── salvage.move          # 打撈 NFT 生命週期
  ├── auction.move          # 拍賣 (獨立 shared objects)
  ├── subrogation.move      # 代位求償
  ├── integration.move      # 外部接口 (Bounty/Fleet mock)
  ├── config.move           # 全局配置 + AdminCap
  └── registry.move         # ClaimRegistry + PolicyRegistry
```

### Rationale

- **core** defines immutable primitives (object shapes, configs) — rarely needs upgrade
- **protocol** implements business logic — can be upgraded independently
- **core** exposes all field accessors and mutators as `public` functions (no `public(friend)` cross-package)
- Both packages support `dynamic_field` extensibility on key objects (InsurancePolicy, SalvageNFT) for future field additions without struct changes

### Cross-Package Design Rules

1. `wreckage-core` MUST expose `public` getter/setter for every struct field that `wreckage-protocol` needs
2. No `public(friend)` for cross-package access (won't compile)
3. `wreckage-core` structs with `key` use `dynamic_field` as escape hatch for future extensibility
4. Version field on all shared objects, gated with `assert!(obj.version == CURRENT_VERSION)`

---

## 3. Core Objects (`wreckage-core`)

### 3.1 InsurancePolicy

```move
public struct InsurancePolicy has key, store {
    id: UID,
    // NOTE: no `owner` field — Sui object ownership model is the source of truth.
    // Passing `&mut InsurancePolicy` to a function already proves caller owns it.
    insured_character_id: TenantItemId,
    coverage_amount: u64,              // MIST
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
    self_destruct_premium: u64,
    created_at: u64,
    expires_at: u64,
    status: u8,                        // 0=active, 1=claimed, 2=expired, 3=cancelled
    cooldown_until: u64,
    claim_count: u8,
    no_claim_streak: u8,
    renewal_count: u8,
    version: u64,
    // dynamic_field escape hatch: future fields via sui::dynamic_field::add(&mut self.id, key, value)
}
```

**Changes from v1**:
- **Removed `owner: address`** (CRITICAL fix) — rely on Sui ownership model. `&mut InsurancePolicy` in function params proves ownership.
- Added `version: u64` for upgrade safety
- `has key, store`: transferable via custom `transfer_policy` function (not raw transfer) to reset NCB streak and enforce cooldown

### 3.2 SalvageNFT

```move
public struct SalvageNFT has key, store {
    id: UID,
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    loss_type: u8,                     // 1=SHIP, 2=STRUCTURE
    kill_timestamp: u64,
    estimated_value: u64,              // Derived from killmail + tier, NOT from coverage_amount
    status: u8,                        // 0=auction, 1=sold, 2=destroyed
    // NOTE: status 2=redeemed removed for MVP. Redemption disabled.
    // dynamic_field escape hatch for future extensibility
}
```

**Changes from v1**:
- `estimated_value` derived from killmail data + risk tier, NOT from policy coverage (prevents manipulation)
- Removed `redeemed` status — **MVP disables burn-to-redeem** (red team: pool drain vector)
- Future redemption will be re-added with proper economic modeling

### 3.3 PoolConfig

```move
public struct PoolConfig has store, copy, drop {
    risk_tier: u8,
    base_premium_rate: u64,            // basis points
    max_coverage: u64,
    min_coverage: u64,
    cooldown_period: u64,              // seconds
    claim_decay_rate: u64,             // per-claim coverage reduction (bps)
    self_destruct_premium_rate: u64,   // MUST be >= 5000 bps (50%) for actuarial soundness
    self_destruct_waiting_period: u64, // seconds, minimum 7 days before self-destruct claims valid
    self_destruct_payout_rate: u64,    // bps, self-destruct pays reduced rate (default 5000 = 50%)
    self_destruct_decay_multiplier: u64, // 2-3x standard decay for self-destruct claims
    deductible_bps: u64,               // deductible percentage
    ncb_discount_bps: u64,             // no-claims bonus discount per streak
    max_ncb_streak: u8,
    max_ncb_total_discount_bps: u64,   // hard cap on total NCB discount (e.g., 3000 = 30%)
    subrogation_rate_bps: u64,         // subrogation recovery percentage
    renewal_waiting_period: u64,       // seconds after renewal before claims valid (e.g., 24h)
}
```

**Changes from v1**:
- Added `self_destruct_waiting_period` (7 days minimum)
- Added `self_destruct_payout_rate` (50% reduced payout)
- Added `self_destruct_decay_multiplier` (2-3x decay)
- Added `max_ncb_total_discount_bps` (hard cap prevents >100% discount)
- Added `renewal_waiting_period` (prevents renew-and-immediately-claim)
- Config validation: `max_ncb_streak * ncb_discount_bps <= max_ncb_total_discount_bps`

### 3.4 AuctionConfig

```move
public struct AuctionConfig has store, copy, drop {
    auction_duration: u64,             // default 72h
    buyout_duration: u64,              // default 48h
    min_bid_increment_bps: u64,        // default 500 = 5%
    buyout_discount_bps: u64,          // default 7000 = 70%
    revenue_pool_share_bps: u64,       // default 8000 = 80%
    anti_snipe_window: u64,            // default 600 = 10 minutes
    anti_snipe_extension: u64,         // default 600 = 10 minutes
    min_opening_bid: u64,              // floor price during bidding phase
}
```

**Changes from v1**:
- Added `anti_snipe_window` + `anti_snipe_extension` (bid in last 10 min extends by 10 min)
- Added `min_opening_bid` (prevents penny auctions)

---

## 4. Risk Pool (`wreckage-protocol/risk_pool.move`)

### 4.1 Pool Object

```move
public struct RiskPool has key {
    id: UID,
    config: PoolConfig,
    total_liquidity: Balance<SUI>,
    reserved_amount: u64,
    total_premiums_collected: u64,
    total_claims_paid: u64,
    total_shares: u64,                 // LP share counter (NOT Supply<T>)
    is_active: bool,
    version: u64,
}

public struct LPPosition has key, store {
    id: UID,
    pool_risk_tier: u8,
    shares: u64,                       // share count (NOT Balance<T>)
    deposited_at: u64,
    initial_deposit: u64,
}
```

**Changes from v1**:
- **Replaced `Supply<LP_SHARE>` with `total_shares: u64`** (CRITICAL fix) — OTW can only create one Supply, but we need per-pool independent share tracking. Simple u64 counters avoid the constraint entirely.
- **Replaced `Balance<LP_SHARE>` with `shares: u64`** in LPPosition
- Added `version: u64` to RiskPool

### 4.2 Fund Flow

```
投保人繳保費 (扣 NCB) ──┐
                        ▼
     LP 注資 ──→ ┌─────────────┐ ←── 拍賣收益 80%
                 │  RiskPool   │
                 │  (per tier) │
                 └──────┬──────┘
                        │
           ┌────────────┼──────────────┐
           ▼            ▼              ▼
      理賠賠付     LP 提領收益    協議金庫 20%
           │
           ▼
  扣除免賠額 → 賠付餘額 → 玩家
           │
           ▼
  代位求償 → 追殺 Bounty
  mint SalvageNFT → 拍賣
```

### 4.3 LP Mechanics

- **Virtual initial liquidity**: Pool initialized with `total_shares = 1000`, `total_liquidity = 1000 MIST` (prevents first-depositor attack)
- **Deposit**: `shares = deposit * total_shares / total_liquidity` with `assert!(shares > 0)`
- **Withdraw**: `amount = shares * total_liquidity / total_shares`
- **Lock period**: 7 days minimum after deposit
- **Withdraw cap**: max 25% of `available_liquidity` per withdrawal
- **Safety valve**: `reserved_amount` cannot exceed 80% of `total_liquidity`; exceeding pauses new policies
- **Dynamic withdrawal fee**: when utilization > 60%, fee = `(utilization - 60%) * 2` bps (discourages bank run)
- **Invariant**: every pool-mutating function ends with `assert!(total_liquidity.value() >= reserved_amount)`
- **Atomic reserved_amount update**: claim payout MUST decrement `reserved_amount` atomically in the same function call

### 4.4 Emergency LP Withdrawal

- `is_paused` is **granular**: pause new policies + claims, but LP withdrawals remain open
- `emergency_withdraw` function available even when paused (with dynamic fee applied)

### 4.5 Tier Configuration (MVP: 3 tiers)

| Tier | Scenario | Premium Rate | Max Coverage | Cooldown | Deductible | Self-Destruct Rate | SD Waiting |
|------|----------|-------------|-------------|----------|------------|-------------------|-----------|
| 1 (Low) | Safe systems | 2% | 10 SUI | 24h | 5% | 60% | 7d |
| 2 (Medium) | Border systems | 5% | 50 SUI | 48h | 10% | 70% | 7d |
| 3 (High) | War zones | 12% | 200 SUI | 72h | 15% | 80% | 7d |

### 4.6 Payout Calculation (Integer Arithmetic)

All calculations use u128 intermediate values to prevent overflow:

```move
// Payout with decay (iterative basis-point multiplication)
let mut payout: u128 = (coverage_amount as u128);
let mut i = 0u8;
while (i < policy.claim_count) {
    payout = payout * ((10000 - config.claim_decay_rate) as u128) / 10000;
    i = i + 1;
};

// Apply deductible
let deductible = payout * (config.deductible_bps as u128) / 10000;
assert!(payout > deductible, EPayoutBelowMinimum);
let final_payout = ((payout - deductible) as u64);

// Self-destruct reduced payout
if (is_self_destruct) {
    final_payout = final_payout * config.self_destruct_payout_rate / 10000;
};

// Minimum payout threshold
assert!(final_payout >= MIN_PAYOUT_THRESHOLD, EPayoutBelowMinimum);
```

---

## 5. Claims Engine (`wreckage-protocol/claims.move`)

### 5.1 Claim Flow

```
玩家提交理賠
    │
    ▼
傳入 &Killmail + &mut InsurancePolicy
    │
    ├── Step 1: 版本檢查 (policy.version, pool.version, config.version)
    ├── Step 2: 保單狀態 (active, not expired via clock check)
    ├── Step 3: 等待期 (renewal_waiting_period elapsed since created_at/renewed_at)
    ├── Step 4: Killmail 匹配 (victim_id == insured_character_id)
    │           NOTE: check killmail.kill_timestamp vs policy period, NOT tx timestamp
    ├── Step 5: 全局去重 (ClaimRegistry: killmail_key not processed)
    ├── Step 6: 路由
    │   ├── killer_id == victim_id → 自爆路徑
    │   │   └── 檢查: has_rider + self_destruct_waiting_period elapsed
    │   └── killer_id != victim_id → 標準戰損路徑
    ├── Step 7: 反詐欺驗證 (anti_fraud.move)
    ├── Step 8: 計算賠付 (u128 intermediate, see Section 4.6)
    ├── Step 9: 池餘額即時檢查 (pool.liquidity >= payout)
    ├── Step 10: 執行賠付 (RiskPool → 玩家) + 原子更新 reserved_amount
    ├── Step 11: 更新保單 (cooldown, claim_count, streak=0)
    ├── Step 12: 記錄 ClaimRegistry (killmail_key → policy_id)
    ├── Step 13: mint SalvageNFT → 建立 Auction shared object
    └── Step 14: emit SubrogationEvent + ClaimPaidEvent
```

### 5.2 Function Signatures

```move
/// Standard combat loss claim
public fun submit_claim(
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Self-destruct claim (requires rider)
public fun submit_self_destruct_claim(
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
);
```

**Changes from v1**:
- Removed `&mut AuctionHouse` — Auction is now a standalone shared object, created directly
- Added `&mut ClaimRegistry` for global killmail dedup
- Added version checks, waiting period checks, pool balance checks

### 5.3 Killmail Verification (World Contracts)

The `Killmail` is a **Shared Object** created by AdminACL (game server). Fields used:

```
Killmail {
    key: TenantItemId,          // unique killmail ID
    killer_id: TenantItemId,    // who did the killing
    victim_id: TenantItemId,    // who died
    kill_timestamp: u64,        // when (check against policy.created_at..policy.expires_at)
    loss_type: LossType,        // SHIP or STRUCTURE
    solar_system_id: TenantItemId,
}
```

No oracle needed — contract reads `&Killmail` directly as immutable shared object reference (no contention).

---

## 6. Anti-Fraud (`wreckage-protocol/anti_fraud.move`)

### Rules

| Rule | Standard Claim | Self-Destruct Claim |
|------|---------------|-------------------|
| killer ≠ victim | Required | Inverse (killer == victim required) |
| Cooldown period | Must have elapsed | Same |
| Frequency limit | claim_count < max_claims_per_policy | Same |
| Payout decay | coverage * (1 - decay_rate)^N | Same (with higher multiplier) |
| Deductible | Applied | Applied |
| Duplicate killmail | ClaimRegistry global check | Same |
| Waiting period | renewal_waiting_period | self_destruct_waiting_period (7d) |
| One policy per character | PolicyRegistry global check | Same |
| Self-destruct payout | 100% (minus deductible + decay) | 50% reduced rate |

### Function

```move
public struct FraudCheckResult has drop {
    is_valid: bool,
    reason: u8,  // 0=pass, 1=self_kill, 2=cooldown, 3=frequency, 4=duplicate,
                 // 5=waiting_period, 6=no_rider, 7=pool_insufficient
}

public fun validate_standard_claim(
    policy: &InsurancePolicy,
    killmail: &Killmail,
    claim_registry: &ClaimRegistry,
    clock: &Clock,
    config: &ProtocolConfig,
): FraudCheckResult;

public fun validate_self_destruct_claim(
    policy: &InsurancePolicy,
    killmail: &Killmail,
    claim_registry: &ClaimRegistry,
    clock: &Clock,
    config: &ProtocolConfig,
): FraudCheckResult;
```

---

## 7. Registries (`wreckage-protocol/registry.move`)

### 7.1 ClaimRegistry — Global Killmail Dedup

```move
public struct ClaimRegistry has key {
    id: UID,
    processed_killmails: Table<TenantItemId, ID>,  // killmail_key → policy_id
    version: u64,
}
```

- **Global**, not per-pool — prevents same killmail claimed across different risk tiers
- Atomic check-and-insert within `submit_claim`

### 7.2 PolicyRegistry — One Policy Per Character

```move
public struct PolicyRegistry has key {
    id: UID,
    active_policies: Table<TenantItemId, ID>,  // character_id → policy_id
    version: u64,
}
```

- Enforces one active policy per `insured_character_id` globally
- Entry added on `purchase_policy`, removed on policy expiry/cancellation
- Prevents accomplice kill farming via multi-policy (CRITICAL red team fix)

---

## 8. Salvage Auction (`wreckage-protocol/auction.move`)

### 8.1 Architecture Change: Standalone Auction Objects

Each Auction is an **independent shared object** (not nested in AuctionHouse Table).

```move
public struct AuctionRegistry has key {
    id: UID,
    config: AuctionConfig,
    active_count: u64,
    version: u64,
}

public struct Auction has key {
    id: UID,
    salvage_nft: Option<SalvageNFT>,   // wrapped, extracted on settle
    source_pool_tier: u8,
    started_at: u64,
    ends_at: u64,                       // may extend due to anti-snipe
    highest_bid: u64,
    highest_bidder: Option<address>,
    escrowed_bid: Balance<SUI>,
    status: u8,                         // 0=bidding, 1=buyout, 2=settled, 3=destroyed
    floor_price: u64,
    revenue_split_snapshot: u64,        // snapshot of revenue_pool_share_bps at creation
}
```

**Changes from v1**:
- **Replaced `AuctionHouse { Table<ID, Auction> }`** with `AuctionRegistry` (config only) + standalone `Auction` shared objects (CRITICAL scalability fix)
- Bids on Auction A don't contend with Auction B
- `AuctionRegistry` only mutated on create/settle (low frequency)
- Added `revenue_split_snapshot` — auction settles with the split ratio at creation time, not current config
- Added `Option<SalvageNFT>` wrapping for clean extraction on settle

### 8.2 Lifecycle

```
mint SalvageNFT → create Auction (shared object)
    │
    ├── Bidding phase (72h, with anti-snipe extension)
    │   └── Bid in last 10 min → extend ends_at by 10 min
    │
    ├── Has bids → highest bidder wins → settle
    └── No bids  → Buyout phase (48h, floor price at 70% estimated value)
                      ├── Purchased → settle
                      └── No buyer  → destroy NFT + Auction
```

### 8.3 Functions

```move
/// Place a bid (anti-snipe: extends if within window)
public fun place_bid(
    auction: &mut Auction,
    bid: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Settle auction (anyone can call after expiry)
public fun settle_auction(
    auction: &mut Auction,
    registry: &mut AuctionRegistry,
    pool: &mut RiskPool,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Buyout at floor price (after bidding phase with no bids)
public fun buyout(
    auction: &mut Auction,
    registry: &mut AuctionRegistry,
    pool: &mut RiskPool,
    config: &ProtocolConfig,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
);
```

### 8.4 Revenue Split

- **80%** → back to source RiskPool (replenish liquidity)
- **20%** → protocol treasury
- Split ratio **snapshotted at auction creation** — config changes don't affect in-progress auctions

### 8.5 NFT Post-Auction (MVP)

- **Trade**: holder can transfer/sell on secondary market
- **Redeem**: **DISABLED in MVP** — burn-to-redeem creates pool drain vectors (red team finding)
- **Future**: re-enable with proper economic modeling (redemption value tied to auction price paid, not estimated value)

---

## 9. Subrogation (`wreckage-protocol/subrogation.move`)

After paying a claim, the protocol gains the right to pursue the killer for recovery.

```move
public struct SubrogationEvent has copy, drop {
    policy_id: ID,
    killer_id: TenantItemId,
    claim_amount: u64,
    bounty_reward: u64,    // claim_amount * subrogation_rate
}
```

- MVP: emit event + mock Bounty creation via `integration.move`
- Future: direct call to Bounty Escrow Protocol to create on-chain bounty

---

## 10. Underwriting & Renewal (`wreckage-protocol/underwriting.move`)

### 10.1 Purchase

```move
public fun purchase_policy(
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    character: &Character,
    coverage_amount: u64,
    include_self_destruct: bool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
): InsurancePolicy;
```

**Added `&mut PolicyRegistry`** — enforces one active policy per character.

Premium calculation (u128 intermediate):
```
base_premium = coverage_amount * base_premium_rate / 10000
rider_premium = coverage_amount * self_destruct_premium_rate / 10000 (if selected)
total_premium = base_premium + rider_premium
```

### 10.2 Renewal with NCB

```move
public fun renew_policy(
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
);
```

Renewal premium calculation:
```
raw_discount = min(no_claim_streak, max_ncb_streak) * ncb_discount_bps
capped_discount = min(raw_discount, max_ncb_total_discount_bps)  // hard cap
renewal_premium = base_premium * (10000 - capped_discount) / 10000
assert!(renewal_premium > 0)  // safety check
```

- Claim-free expiry → `no_claim_streak += 1`
- Any claim during period → `no_claim_streak = 0`
- After renewal: `renewal_waiting_period` must elapse before claims are valid

### 10.3 Policy Transfer (Custom)

```move
/// Custom transfer with validation (replaces raw sui::transfer)
public fun transfer_policy(
    policy: &mut InsurancePolicy,
    recipient: address,
    clock: &Clock,
    ctx: &mut TxContext,
);
```

- Resets `no_claim_streak = 0`
- Sets `cooldown_until = now + cooldown_period` (prevents post-kill-pre-claim arbitrage)
- Emits `PolicyTransferredEvent`
- Cannot transfer during active cooldown period

---

## 11. Global Config (`wreckage-protocol/config.move`)

### 11.1 AdminCap Pattern

```move
/// Capability object — NOT address-based admin check
public struct AdminCap has key, store { id: UID }

public struct ProtocolConfig has key {
    id: UID,
    treasury: address,
    is_policy_paused: bool,            // pauses new policies + claims
    is_claim_paused: bool,             // pauses claims only
    // NOTE: LP withdraw is NEVER paused (emergency exit always available)
    pool_configs: vector<PoolConfig>,
    auction_config: AuctionConfig,
    max_claims_per_policy: u8,         // must be < 255
    protocol_fee_bps: u64,
    version: u64,
    // Parameter hard limits (cannot be exceeded by admin)
    min_deductible_bps: u64,           // e.g., 100 = 1% minimum
    min_premium_rate_bps: u64,         // e.g., 50 = 0.5% minimum
    max_coverage_limit: u64,           // absolute ceiling
}
```

**Changes from v1**:
- **Replaced `admin: address` with `AdminCap` capability pattern** (CRITICAL security fix)
- Admin functions require `_: &AdminCap` parameter
- `AdminCap` can be transferred, wrapped in multisig, or destroyed
- Granular pause: `is_policy_paused` + `is_claim_paused` (LP withdrawals never paused)
- Parameter hard limits: admin can adjust within bounds but cannot set degenerate values

### 11.2 Admin Functions

```move
public fun update_pool_config(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    risk_tier: u8,
    new_config: PoolConfig,
);

public fun set_policy_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool);
public fun set_claim_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool);
public fun add_pool_tier(_: &AdminCap, config: &mut ProtocolConfig, new_config: PoolConfig);
public fun update_auction_config(_: &AdminCap, config: &mut ProtocolConfig, new_config: AuctionConfig);
public fun update_treasury(_: &AdminCap, config: &mut ProtocolConfig, new_treasury: address);
```

### 11.3 Config Validation

All config updates enforce:
- `deductible_bps >= min_deductible_bps`
- `base_premium_rate >= min_premium_rate_bps`
- `max_coverage <= max_coverage_limit`
- `max_ncb_streak * ncb_discount_bps <= max_ncb_total_discount_bps`
- `self_destruct_premium_rate >= 5000` (50% minimum for actuarial soundness)
- `self_destruct_waiting_period >= 7 days`

---

## 12. Object Ownership Model

| Object | Type | Ownership |
|--------|------|-----------|
| `AdminCap` | Owned | Protocol deployer, transferable |
| `ProtocolConfig` | Shared | Protocol global, AdminCap-gated |
| `RiskPool` (per tier) | Shared | Protocol-held, LP/claim operations |
| `ClaimRegistry` | Shared | Global killmail dedup |
| `PolicyRegistry` | Shared | Global one-policy-per-character |
| `AuctionRegistry` | Shared | Auction config + counter (low contention) |
| `InsurancePolicy` | Owned | Policyholder, custom transfer only |
| `LPPosition` | Owned | LP holder |
| `SalvageNFT` | Owned → Wrapped in Auction | Minted → Auction custody → buyer |
| `Auction` | Shared | Per-auction (high parallelism) |
| `Killmail` | Shared (World Contracts) | Read-only, immutable ref |
| `KillmailRegistry` | Shared (World Contracts) | Read-only |

---

## 13. Events

| Event | Trigger |
|-------|---------|
| `PolicyCreatedEvent` | Policy purchased |
| `PolicyRenewedEvent` | Renewal with NCB info |
| `PolicyTransferredEvent` | Policy custom transfer |
| `PolicyExpiredEvent` | Policy expired (optional, via expire function) |
| `ClaimSubmittedEvent` | Claim submitted (with type) |
| `ClaimPaidEvent` | Payout executed (with deductible + decay breakdown) |
| `SubrogationEvent` | Subrogation triggered |
| `SalvageMintedEvent` | SalvageNFT minted |
| `AuctionCreatedEvent` | Auction started |
| `BidPlacedEvent` | Bid placed (with anti-snipe extension info) |
| `AuctionSettledEvent` | Auction settled |
| `AuctionDestroyedEvent` | NFT destroyed after no buyers |
| `LPDepositEvent` | LP deposit |
| `LPWithdrawEvent` | LP withdrawal (with fee info) |

---

## 14. Frontend Architecture

### Tech Stack

- React + TypeScript
- `@mysten/dapp-kit-react` (wallet + Sui hooks)
- `@mysten/sui` (PTB + queries)
- `@evefrontier/dapp-kit` (EVE data)
- TailwindCSS

### Pages & Completeness

| Page | Completeness | Description |
|------|-------------|-------------|
| Insurance (insure/) | ★★★ Full | Tier selection → coverage → rider toggle → premium calc → confirm |
| Policy Management | ★★★ Full | My policies, status, expiry countdown, claim entry, transfer |
| Claims (claims/) | ★★★ Full | Select policy → match Killmail → show payout breakdown → submit → result |
| LP Pool (pool/) | ★★★ Full | Pool overview (TVL/APR/utilization/exit fee) → deposit → positions → withdraw |
| Salvage Auction (salvage/) | ★★☆ Simplified | Auction list + bid + settle. No real-time push, no advanced filters |
| Demo Panel (demo/) | ★★☆ Internal | Admin ops: simulate Killmail, adjust params, mock integrations |

### Simplified Parts — Reserved Interfaces

```typescript
// Auction filter (future)
interface AuctionFilterOptions {
  solarSystem?: string;
  minValue?: number;
  maxValue?: number;
  lossType?: 'SHIP' | 'STRUCTURE';
  status?: 'bidding' | 'buyout';
}

// Real-time push (future)
interface AuctionRealtimeCallbacks {
  onNewBid?: (auctionId: string, bid: BidInfo) => void;
  onAuctionEnded?: (auctionId: string, result: AuctionResult) => void;
  onNewAuction?: (auction: AuctionInfo) => void;
}

// NFT redemption with factory system (future, disabled in MVP)
interface RedemptionOptions {
  materialType?: string;
  factoryAddress?: string;
}
```

### Directory Structure

```
src/
├── pages/
│   ├── insure/           # Insurance purchase + policy detail + transfer
│   ├── claims/           # Claim submission + history
│   ├── pool/             # LP dashboard + deposit + withdraw (with exit fee display)
│   ├── salvage/          # Auction list + detail (simplified)
│   └── demo/             # Admin demo panel
├── components/
│   ├── common/           # Button, Modal, Card, Toast
│   ├── policy/           # PolicyCard, RiskTierSelector, RiderToggle
│   ├── pool/             # PoolStats, APRChart, LPPositionCard, ExitFeeIndicator
│   └── auction/          # AuctionCard, BidForm, CountdownTimer
├── hooks/                # useInsurancePolicy, useRiskPool, useAuction, useKillmail, useClaims
├── lib/
│   ├── contracts.ts      # Package IDs, module names, function names
│   ├── ptb/              # PTB builders (insure, claim, pool, auction)
│   └── types.ts          # On-chain object TS types
└── config/
    └── network.ts        # testnet/mainnet switch
```

---

## 15. Security Considerations (Post-Audit)

### CRITICAL — Addressed in this revision

| Issue | Source | Fix |
|-------|--------|-----|
| Admin address-based access | Architect + Security + RedTeam | AdminCap capability pattern |
| LP_SHARE OTW single supply | Architect + Dev | u64 share counters |
| InsurancePolicy.owner desync | Security | Removed; rely on Sui ownership |
| Killmail dedup unspecified | Security + RedTeam | Global ClaimRegistry shared object |
| First depositor LP attack | All 4 agents | Virtual initial liquidity (1000/1000) |
| Multi-policy kill farming | RedTeam | PolicyRegistry one-per-character |

### HIGH — Addressed in this revision

| Issue | Source | Fix |
|-------|--------|-----|
| NCB discount > 100% | Security | max_ncb_total_discount_bps hard cap + config validation |
| Auction sniping | Security + RedTeam | Anti-snipe window + extension |
| Pool drain via mass claims | Security + RedTeam | Real-time pool balance check at claim time |
| Self-destruct guaranteed profit | RedTeam | 7-day waiting period + 50% reduced payout + higher decay |
| AuctionHouse hot shared object | Architect + Dev | Standalone Auction shared objects |
| Payout integer overflow | Security + Dev | u128 intermediate values |
| Cross-package friend visibility | Dev | Public accessor/mutator pattern |
| Policy transfer arbitrage | Security + RedTeam | Custom transfer with NCB reset + cooldown |

### MEDIUM — Addressed in this revision

| Issue | Source | Fix |
|-------|--------|-----|
| SalvageNFT value manipulation | Security + RedTeam | Derived from killmail, not coverage |
| LP emergency withdrawal | Security | Granular pause; LP withdraw never paused |
| Bank run death spiral | RedTeam | Dynamic withdrawal fee when utilization > 60% |
| NFT redemption pool drain | RedTeam | Disabled in MVP |
| Config change affects in-progress auctions | Security | Revenue split snapshotted at auction creation |
| RiskPool version gating | Dev | version field + assert on all functions |

### Remaining Risks (Accepted for MVP)

| Risk | Severity | Rationale |
|------|----------|-----------|
| RiskPool shared object contention | LOW | Acceptable for hackathon; document for production sharding |
| `pool_configs: vector<PoolConfig>` O(n) | LOW | 3 tiers, trivially fine; switch to Table if scaled |
| `claim_count: u8` max 255 | LOW | Enforced by `max_claims_per_policy` in config |
| No automatic policy expiry | LOW | Checked at claim/renewal time; optional `expire_policy` function |

---

## 16. Integration Interfaces (`wreckage-protocol/integration.move`)

### 16.1 Bounty Escrow (預留)

```move
public struct SalvageBountyRequest has copy, drop {
    salvage_nft_id: ID,
    solar_system_id: TenantItemId,
    reward_amount: u64,
    deadline: u64,
}

/// Mock: simulate bounty creation for demo
public fun mock_create_salvage_bounty(
    nft: &SalvageNFT,
    reward: u64,
    clock: &Clock,
): SalvageBountyRequest;
```

### 16.2 Fleet Command (預留)

```move
public struct FleetInsuranceRequest has drop {  // NOTE: removed `store`, only `drop` needed
    fleet_id: ID,
    character_ids: vector<TenantItemId>,
    risk_tier: u8,
    coverage_per_unit: u64,
    include_self_destruct: bool,
}

/// Mock: simulate fleet batch insurance for demo
public fun mock_fleet_insure(
    req: FleetInsuranceRequest,
): vector<ID>;
```

### 16.3 Claim Completed Hook

```move
public struct ClaimCompletedHook has copy, drop {
    policy_id: ID,
    killmail_key: TenantItemId,
    payout_amount: u64,
    salvage_nft_id: ID,
    claim_type: u8,
}
```

---

## 17. Demo Script

```
 1. [投保] Player A insures character, Tier 2 + self-destruct rider
 2. [LP]   Player B deposits 100 SUI into Tier 2 pool
 3. [戰損] Admin creates Killmail (Player X kills Player A)
 4. [理賠] Player A submits claim → deducts 10% deductible → payout + mint SalvageNFT
 5. [追殺] Claim triggers SubrogationEvent → mock bounty on Player X
 6. [拍賣] Player C bids on SalvageNFT → wins → revenue flows back to pool
 7. [整合] Show Bounty Escrow interface + Fleet Command batch insure
 8. [自爆] Player D self-destructs (no fuel, after 7d waiting period) → self-destruct claim (50% payout)
 9. [續保] Player A renews → NCB streak = 0 (just claimed), full premium
10. [對比] Player E renews → NCB streak = 3 → 30% premium discount (capped)
11. [防詐] Show: same character can't buy second policy (PolicyRegistry rejection)
12. [防詐] Show: same killmail can't claim twice (ClaimRegistry rejection)
```

**Narrative**: "This is Lloyd's of London reimagined in space — the complete insurance economic cycle from underwriting to subrogation, running autonomously on Sui. Every mechanism maps to a real-world insurance primitive: deductibles, no-claims bonuses, salvage rights, and subrogation."

---

## 18. Integration Points Summary

| Protocol | Integration Type | MVP Status |
|----------|-----------------|------------|
| World Contracts (Killmail) | Direct read (`&Killmail`) | ✅ Implemented |
| Bounty Escrow Protocol | Subrogation bounty + salvage bounty | ⚠️ Mock + interface |
| Fleet Command Doctrine | Batch insurance | ⚠️ Mock + interface |
| Factory System (future) | SalvageNFT → materials redemption | ⚠️ Interface only (disabled in MVP) |

---

## Appendix A: Audit Trail

| Agent | Focus | Key Findings |
|-------|-------|-------------|
| sui-architect | Architecture + object model | LP_SHARE OTW constraint, AuctionHouse hot object, AdminCap |
| sui-security-guard | Access control + economic attacks | Owner field desync, NCB overflow, first depositor, pool drain |
| sui-red-team | Adversarial attack scenarios | Multi-policy farming, self-destruct pricing, killmail replay, bank run |
| sui-development-agent | Move code patterns + gas | Cross-package friend, Table vs dynamic field, integer arithmetic |

