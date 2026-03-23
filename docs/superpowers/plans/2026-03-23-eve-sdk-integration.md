# EVE Frontier SDK Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Wreckage Insurance Protocol into EVE Frontier's game world via SSU extension (on-chain) and @evefrontier/dapp-kit (frontend).

**Architecture:** Two new Move modules (`ssu_extension.move`, `item_valuation.move`) added to existing merged-package. Frontend adds `@evefrontier/dapp-kit` in parallel with existing `@mysten/dapp-kit-react`. SSU extension is a thin wrapper — delegates to existing protocol functions.

**Tech Stack:** Sui Move 2024 edition, `@evefrontier/dapp-kit`, `@mysten/dapp-kit-react` (existing), React 19, Vite, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-23-eve-sdk-integration-design.md`

---

## File Map

### Move — New Files
| File | Responsibility |
|------|---------------|
| `contracts/wreckage-protocol/sources/ssu_extension.move` | Auth witness + 5 SSU entry wrappers + SSUInsuranceEvent |
| `contracts/wreckage-protocol/sources/item_valuation.move` | ValuationRegistry + admin oracle + estimate_value + LTV |
| `contracts/wreckage-protocol/tests/ssu_extension_tests.move` | SSU online/offline checks, wrapper delegation, events |
| `contracts/wreckage-protocol/tests/item_valuation_tests.move` | set/get price, LTV calc, batch, abort on unpriced |

### Move — Modified Files
| File | Change |
|------|--------|
| `contracts/wreckage-protocol/sources/errors.move` | Add error codes 65 (SSU) + 70-72 (valuation) |
| `contracts/wreckage-protocol/sources/init.move` | Add `item_valuation::create_and_share_valuation_registry(ctx)` |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/providers/EveFrontierWrapper.tsx` | EveFrontierProvider wrapper (parallel with existing DAppKitProvider) |
| `frontend/src/hooks/useEveCharacter.ts` | Fetch EVE Character name/info via GraphQL |
| `frontend/src/hooks/useEveAssembly.ts` | Fetch SSU/Assembly data + status |
| `frontend/src/hooks/useSSUExtension.ts` | SSU extension PTB builders (purchase/claim/renew/cancel via SSU) |
| `frontend/src/lib/ptb/ssu.ts` | Raw PTB builder functions for SSU extension calls |
| `frontend/src/components/eve/CharacterBadge.tsx` | EVE character name + address display |
| `frontend/src/components/eve/SSUStatusCard.tsx` | SSU online/offline + extension authorization status |
| `frontend/src/components/eve/GameWorldContext.tsx` | Solar system / location info panel |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/package.json` | Add `@evefrontier/dapp-kit`, `@radix-ui/themes` |
| `frontend/src/main.tsx` | Wrap with EveFrontierProvider (outer) |
| `frontend/src/lib/contracts.ts` | Add ssuExtension + itemValuation modules, valuationRegistry shared object |
| `frontend/src/pages/insure/InsurePage.tsx` | Add CharacterBadge + SSU context |
| `frontend/src/pages/DashboardPage.tsx` | Add EVE world overview panel |
| `frontend/src/pages/demo/DemoPanel.tsx` | Add item valuation admin section |

---

## Task 1: Error Codes + item_valuation.move

**Files:**
- Modify: `contracts/wreckage-protocol/sources/errors.move`
- Create: `contracts/wreckage-protocol/sources/item_valuation.move`
- Create: `contracts/wreckage-protocol/tests/item_valuation_tests.move`

- [ ] **Step 1: Add error codes to errors.move**

Add after line 84 (`ECancellationNotAllowed`):

```move
// === SSU Extension Errors ===
#[error(code = 65)]
const ESSUNotOnline: vector<u8> = b"Smart Storage Unit is not online";

// === Item Valuation Errors ===
#[error(code = 70)]
const EItemNotPriced: vector<u8> = b"Item type has no price set in valuation registry";
#[error(code = 71)]
const EInvalidLTV: vector<u8> = b"LTV ratio must be <= 10000 bps";
#[error(code = 72)]
const EBatchLengthMismatch: vector<u8> = b"Type IDs and prices vectors must have same length";
```

Add public accessors after line 120:

```move
public fun ssu_not_online(): u64 { 65 }
public fun item_not_priced(): u64 { 70 }
public fun invalid_ltv(): u64 { 71 }
public fun batch_length_mismatch(): u64 { 72 }
```

- [ ] **Step 2: Create item_valuation.move**

Create `contracts/wreckage-protocol/sources/item_valuation.move`:

```move
module wreckage_protocol::item_valuation;

use sui::table::{Self, Table};
use sui::clock::Clock;
use wreckage_protocol::config::AdminCap;
use wreckage_protocol::errors;

// === Structs ===
public struct ValuationRegistry has key {
    id: UID,
    prices: Table<u64, u64>,
    price_updated_at: Table<u64, u64>,
    default_ltv_bps: u64,
    version: u64,
}

// === Events ===
public struct ItemPriceSetEvent has copy, drop {
    item_type_id: u64,
    price_per_unit: u64,
    updated_at: u64,
}

public struct LTVUpdatedEvent has copy, drop {
    old_ltv_bps: u64,
    new_ltv_bps: u64,
}

// === Package Init ===
public(package) fun create_and_share_valuation_registry(ctx: &mut TxContext) {
    let registry = ValuationRegistry {
        id: object::new(ctx),
        prices: table::new(ctx),
        price_updated_at: table::new(ctx),
        default_ltv_bps: 7000,
        version: 1,
    };
    transfer::share_object(registry);
}

// === Admin Functions ===
public fun set_item_price(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    item_type_id: u64,
    price_per_unit: u64,
    clock: &Clock,
) {
    let now = clock.timestamp_ms();
    if (registry.prices.contains(item_type_id)) {
        *registry.prices.borrow_mut(item_type_id) = price_per_unit;
        *registry.price_updated_at.borrow_mut(item_type_id) = now;
    } else {
        registry.prices.add(item_type_id, price_per_unit);
        registry.price_updated_at.add(item_type_id, now);
    };
    sui::event::emit(ItemPriceSetEvent { item_type_id, price_per_unit, updated_at: now });
}

public fun set_item_prices_batch(
    admin: &AdminCap,
    registry: &mut ValuationRegistry,
    type_ids: vector<u64>,
    prices: vector<u64>,
    clock: &Clock,
) {
    assert!(type_ids.length() == prices.length(), errors::batch_length_mismatch());
    let mut i = 0;
    while (i < type_ids.length()) {
        set_item_price(admin, registry, type_ids[i], prices[i], clock);
        i = i + 1;
    };
}

public fun set_default_ltv(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    ltv_bps: u64,
) {
    assert!(ltv_bps <= 10000, errors::invalid_ltv());
    let old = registry.default_ltv_bps;
    registry.default_ltv_bps = ltv_bps;
    sui::event::emit(LTVUpdatedEvent { old_ltv_bps: old, new_ltv_bps: ltv_bps });
}

// === Query Functions ===
public fun estimate_value(
    registry: &ValuationRegistry,
    item_type_id: u64,
    quantity: u32,
): u64 {
    assert!(registry.prices.contains(item_type_id), errors::item_not_priced());
    let price = *registry.prices.borrow(item_type_id);
    (((price as u128) * (quantity as u128)) as u64)
}

public fun collateral_value(
    registry: &ValuationRegistry,
    item_type_id: u64,
    quantity: u32,
): u64 {
    let value = estimate_value(registry, item_type_id, quantity);
    (((value as u128) * (registry.default_ltv_bps as u128) / 10000) as u64)
}

public fun is_priced(registry: &ValuationRegistry, item_type_id: u64): bool {
    registry.prices.contains(item_type_id)
}

public fun get_price(registry: &ValuationRegistry, item_type_id: u64): u64 {
    assert!(registry.prices.contains(item_type_id), errors::item_not_priced());
    *registry.prices.borrow(item_type_id)
}

public fun get_price_updated_at(registry: &ValuationRegistry, item_type_id: u64): u64 {
    assert!(registry.price_updated_at.contains(item_type_id), errors::item_not_priced());
    *registry.price_updated_at.borrow(item_type_id)
}

public fun default_ltv_bps(registry: &ValuationRegistry): u64 {
    registry.default_ltv_bps
}

public fun version(registry: &ValuationRegistry): u64 {
    registry.version
}
```

- [ ] **Step 3: Write item_valuation_tests.move**

Create `contracts/wreckage-protocol/tests/item_valuation_tests.move`:

```move
#[test_only]
module wreckage_protocol::item_valuation_tests;

use sui::test_scenario;
use sui::clock;
use wreckage_protocol::item_valuation::{Self, ValuationRegistry};
use wreckage_protocol::config::AdminCap;
use wreckage_protocol::init;

const ADMIN: address = @0xAD;

fun setup(scenario: &mut test_scenario::Scenario) {
    scenario.next_tx(ADMIN);
    init::init_for_testing(scenario.ctx());
}

#[test]
fun test_set_and_get_price() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    item_valuation::set_item_price(&admin_cap, &mut registry, 1001, 500_000_000, &clock);
    assert!(item_valuation::is_priced(&registry, 1001));
    assert!(item_valuation::get_price(&registry, 1001) == 500_000_000);
    assert!(item_valuation::estimate_value(&registry, 1001, 3) == 1_500_000_000);

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
fun test_collateral_value_with_ltv() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    item_valuation::set_item_price(&admin_cap, &mut registry, 2001, 1_000_000_000, &clock);
    // Default LTV = 7000 bps = 70%
    let cv = item_valuation::collateral_value(&registry, 2001, 1);
    assert!(cv == 700_000_000); // 1 SUI * 70%

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
fun test_set_ltv() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();

    item_valuation::set_default_ltv(&admin_cap, &mut registry, 5000);
    assert!(item_valuation::default_ltv_bps(&registry) == 5000);

    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_estimate_value_unpriced_aborts() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let registry = scenario.take_shared<ValuationRegistry>();

    // Should abort — item 9999 not priced
    item_valuation::estimate_value(&registry, 9999, 1);

    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_invalid_ltv_aborts() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();

    // LTV > 10000 should abort
    item_valuation::set_default_ltv(&admin_cap, &mut registry, 10001);

    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
fun test_batch_set_prices() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    let type_ids = vector[100, 200, 300];
    let prices = vector[1_000_000, 2_000_000, 3_000_000];
    item_valuation::set_item_prices_batch(&admin_cap, &mut registry, type_ids, prices, &clock);

    assert!(item_valuation::get_price(&registry, 100) == 1_000_000);
    assert!(item_valuation::get_price(&registry, 200) == 2_000_000);
    assert!(item_valuation::get_price(&registry, 300) == 3_000_000);

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
fun test_update_existing_price() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    item_valuation::set_item_price(&admin_cap, &mut registry, 500, 1_000_000, &clock);
    assert!(item_valuation::get_price(&registry, 500) == 1_000_000);

    // Update price
    item_valuation::set_item_price(&admin_cap, &mut registry, 500, 2_000_000, &clock);
    assert!(item_valuation::get_price(&registry, 500) == 2_000_000);

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

// === Monkey Tests ===
#[test]
fun test_zero_price_is_valid() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    item_valuation::set_item_price(&admin_cap, &mut registry, 999, 0, &clock);
    assert!(item_valuation::estimate_value(&registry, 999, 100) == 0);
    assert!(item_valuation::collateral_value(&registry, 999, 100) == 0);

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
fun test_zero_quantity() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    item_valuation::set_item_price(&admin_cap, &mut registry, 888, 1_000_000_000, &clock);
    assert!(item_valuation::estimate_value(&registry, 888, 0) == 0);

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}

#[test]
fun test_ltv_zero() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<ValuationRegistry>();
    let clock = clock::create_for_testing(scenario.ctx());

    item_valuation::set_default_ltv(&admin_cap, &mut registry, 0);
    item_valuation::set_item_price(&admin_cap, &mut registry, 777, 1_000_000_000, &clock);
    assert!(item_valuation::collateral_value(&registry, 777, 10) == 0); // 0% LTV

    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario.return_to_sender(admin_cap);
    scenario.end();
}
```

- [ ] **Step 4: Update init.move**

Add import and call in `init.move`:

```move
// Add import at top:
use wreckage_protocol::item_valuation;

// Add at end of init() function, before closing brace:
item_valuation::create_and_share_valuation_registry(ctx);
```

Also update `init_for_testing` if it's separate from `init`.

- [ ] **Step 5: Run tests**

Run: `cd contracts/wreckage-protocol && sui move test`

Expected: All existing 102 tests pass + new item_valuation tests pass.

- [ ] **Step 6: Commit**

```
git add contracts/wreckage-protocol/sources/errors.move \
       contracts/wreckage-protocol/sources/item_valuation.move \
       contracts/wreckage-protocol/sources/init.move \
       contracts/wreckage-protocol/tests/item_valuation_tests.move
git commit -m "feat: add item_valuation module with admin oracle + LTV"
```

---

## Task 2: ssu_extension.move

**Files:**
- Create: `contracts/wreckage-protocol/sources/ssu_extension.move`
- Create: `contracts/wreckage-protocol/tests/ssu_extension_tests.move`

- [ ] **Step 1: Create ssu_extension.move**

Create `contracts/wreckage-protocol/sources/ssu_extension.move`:

```move
#[allow(lint(self_transfer))]
module wreckage_protocol::ssu_extension;

use sui::coin::Coin;
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use world::storage_unit::StorageUnit;
use world::character::Character;
use world::killmail::Killmail;
use wreckage_protocol::config::ProtocolConfig;
use wreckage_protocol::risk_pool::RiskPool;
use wreckage_protocol::registry::{PolicyRegistry, ClaimRegistry};
use wreckage_protocol::policy::InsurancePolicy;
use wreckage_protocol::underwriting;
use wreckage_protocol::claims;
use wreckage_protocol::errors;

// === Typed Witness ===
/// Only this module can construct Auth.
/// SSU owner registers via: storage_unit::authorize_extension<ssu_extension::Auth>(ssu, owner_cap)
public struct Auth has drop {}

// === Events ===
public struct SSUInsuranceEvent has copy, drop {
    ssu_id: ID,
    operation: u8,
    policy_id: ID,
    actor: address,
}

const OP_PURCHASE: u8 = 0;
const OP_CLAIM: u8 = 1;
const OP_RENEW: u8 = 2;
const OP_CANCEL: u8 = 3;
const OP_SELF_DESTRUCT_CLAIM: u8 = 4;

// === Internal ===
fun assert_ssu_online(storage_unit: &StorageUnit) {
    assert!(storage_unit.status().is_online(), errors::ssu_not_online());
}

fun emit_event(ssu_id: ID, operation: u8, policy_id: ID, ctx: &TxContext) {
    event::emit(SSUInsuranceEvent {
        ssu_id,
        operation,
        policy_id,
        actor: ctx.sender(),
    });
}

// === Entry Functions ===

/// Purchase insurance through an SSU
public fun purchase_via_ssu(
    storage_unit: &StorageUnit,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    character: &Character,
    coverage_amount: u64,
    include_self_destruct: bool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
): InsurancePolicy {
    assert_ssu_online(storage_unit);
    let policy = underwriting::purchase_policy(
        config, pool, policy_registry, character,
        coverage_amount, include_self_destruct, payment, clock, ctx,
    );
    emit_event(object::id(storage_unit), OP_PURCHASE, object::id(&policy), ctx);
    policy
}

/// Submit standard claim through SSU
public fun claim_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    claims::submit_claim(policy, killmail, pool, claim_registry, config, clock, ctx);
    emit_event(object::id(storage_unit), OP_CLAIM, policy_id, ctx);
}

/// Submit self-destruct claim through SSU
public fun self_destruct_claim_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    claims::submit_self_destruct_claim(policy, killmail, pool, claim_registry, config, clock, ctx);
    emit_event(object::id(storage_unit), OP_SELF_DESTRUCT_CLAIM, policy_id, ctx);
}

/// Renew policy through SSU
public fun renew_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    underwriting::renew_policy(policy, config, pool, payment, clock, ctx);
    emit_event(object::id(storage_unit), OP_RENEW, policy_id, ctx);
}

/// Cancel policy through SSU
public fun cancel_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    underwriting::cancel_policy(policy, config, pool, policy_registry, clock, ctx);
    emit_event(object::id(storage_unit), OP_CANCEL, policy_id, ctx);
}
```

- [ ] **Step 2: Write ssu_extension_tests.move**

Create `contracts/wreckage-protocol/tests/ssu_extension_tests.move`.

**SSU test setup is complex** — requires NWN (network node), fuel config, energy config, anchor, then online flow. The pattern is taken from `world::storage_unit_tests` (see `contracts/world-contracts/contracts/world/tests/assemblies/storage_unit_tests.move` for full reference). Key helpers: `test_helpers::setup_world`, `test_helpers::configure_assembly_energy`, `network_node::anchor`/`online`, `storage_unit::anchor`/`share_storage_unit`/`online`.

```move
#[test_only]
module wreckage_protocol::ssu_extension_tests;

use sui::test_scenario as ts;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use world::test_helpers::{Self, admin, user_a};
use world::character::{Self, Character};
use world::access::{Self, AdminACL, OwnerCap};
use world::energy::EnergyConfig;
use world::network_node::{Self, NetworkNode};
use world::object_registry::ObjectRegistry;
use world::storage_unit::{Self, StorageUnit};
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::registry::{PolicyRegistry, ClaimRegistry};
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::pool_config;
use wreckage_protocol::underwriting;
use wreckage_protocol::ssu_extension;

const PLAYER_A: address = @0xA1;
const CHAR_A_ID: u32 = 42;
const COVERAGE: u64 = 10_000_000_000;
const OVERPAYMENT: u64 = 20_000_000_000;
const LP_DEPOSIT: u64 = 100_000_000_000;

// SSU constants (from storage_unit_tests)
const STORAGE_A_TYPE_ID: u64 = 5555;
const STORAGE_A_ITEM_ID: u64 = 90002;
const MAX_CAPACITY: u64 = 100000;
const LOCATION_HASH: vector<u8> = x"7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b";

// NWN constants
const NWN_TYPE_ID: u64 = 111000;
const NWN_ITEM_ID: u64 = 5000;
const FUEL_MAX_CAPACITY: u64 = 1000;
const MS_PER_SECOND: u64 = 1000;
const FUEL_BURN_RATE_IN_MS: u64 = 3600 * MS_PER_SECOND;
const MAX_PRODUCTION: u64 = 100;
const FUEL_TYPE_ID: u64 = 1;
const FUEL_VOLUME: u64 = 10;

/// Setup world + protocol + pool (reuses e2e pattern + adds NWN/energy config)
fun full_setup(ts: &mut ts::Scenario) {
    test_helpers::setup_world(ts);
    test_helpers::configure_assembly_energy(ts);

    ts.next_tx(admin());
    protocol_init::init_for_testing(ts.ctx());
    ts.next_tx(admin());

    let cap = ts.take_from_sender<AdminCap>();
    let mut cfg = ts.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    ts.return_to_sender(cap);
    ts::return_shared(cfg);
    ts.next_tx(admin());

    let cap = ts.take_from_sender<AdminCap>();
    let cfg = ts.take_shared<ProtocolConfig>();
    config::admin_create_pool(&cap, &cfg, pool_config::test_pool_config(), ts.ctx());
    ts.return_to_sender(cap);
    ts::return_shared(cfg);
    ts.next_tx(admin());
}

/// Seed LP into pool
fun seed_pool(ts: &mut ts::Scenario, depositor: address, amount: u64) {
    ts.next_tx(depositor);
    let mut pool = ts.take_shared<RiskPool>();
    let deposit = coin::mint_for_testing<SUI>(amount, ts.ctx());
    let clock = clock::create_for_testing(ts.ctx());
    risk_pool::deposit(&mut pool, deposit, &clock, ts.ctx());
    clock.destroy_for_testing();
    ts::return_shared(pool);
}

/// Create character (reuses e2e pattern)
fun create_character(ts: &mut ts::Scenario, owner: address, item_id: u32): ID {
    ts.next_tx(admin());
    let admin_acl = ts.take_shared<AdminACL>();
    let char = character::create_character(
        &admin_acl,
        (item_id as u64),
        test_helpers::tenant(),
        owner,
        ts.ctx(),
    );
    let char_id = object::id(&char);
    character::share_character(char, &admin_acl, ts.ctx());
    ts::return_shared(admin_acl);
    char_id
}

/// Create NWN + StorageUnit and bring online. Returns (storage_id, nwn_id).
/// Based on storage_unit_tests::create_storage_unit + online_storage_unit.
fun create_and_online_ssu(ts: &mut ts::Scenario, owner: address, char_id: ID): (ID, ID) {
    // Create NWN
    ts.next_tx(admin());
    let mut registry = ts.take_shared<ObjectRegistry>();
    let admin_acl = ts.take_shared<AdminACL>();
    let character = ts.take_shared_by_id<Character>(ts, char_id);
    let nwn = network_node::anchor(
        &mut registry, &character, &admin_acl,
        NWN_ITEM_ID, NWN_TYPE_ID, FUEL_MAX_CAPACITY,
        FUEL_BURN_RATE_IN_MS, MAX_PRODUCTION, LOCATION_HASH, ts.ctx(),
    );
    let nwn_id = object::id(&nwn);
    network_node::share_network_node(nwn, &admin_acl, ts.ctx());
    ts::return_shared(character);
    ts::return_shared(admin_acl);
    ts::return_shared(registry);

    // Create StorageUnit
    ts.next_tx(admin());
    let mut registry = ts.take_shared<ObjectRegistry>();
    let mut nwn = ts.take_shared_by_id<NetworkNode>(ts, nwn_id);
    let character = ts.take_shared_by_id<Character>(ts, char_id);
    let admin_acl = ts.take_shared<AdminACL>();
    let ssu = storage_unit::anchor(
        &mut registry, &mut nwn, &character, &admin_acl,
        STORAGE_A_ITEM_ID, STORAGE_A_TYPE_ID, MAX_CAPACITY, LOCATION_HASH, ts.ctx(),
    );
    let ssu_id = object::id(&ssu);
    ssu.share_storage_unit(&admin_acl, ts.ctx());
    ts::return_shared(admin_acl);
    ts::return_shared(character);
    ts::return_shared(nwn);
    ts::return_shared(registry);

    // Deposit fuel + bring NWN online
    ts.next_tx(owner);
    let mut character = ts.take_shared_by_id<Character>(ts, char_id);
    let (owner_cap, receipt) = character.receive_owner_cap<NetworkNode>(
        ts::most_recent_receiving_ticket<OwnerCap<NetworkNode>>(&char_id), ts.ctx(),
    );
    let mut nwn = ts.take_shared_by_id<NetworkNode>(ts, nwn_id);
    let fuel_config = ts.take_shared<world::fuel::FuelConfig>();
    let clock = clock::create_for_testing(ts.ctx());
    nwn.deposit_fuel(&owner_cap, &fuel_config, FUEL_TYPE_ID, 100, FUEL_VOLUME, &clock);
    nwn.online(&owner_cap, &clock);
    ts::return_shared(fuel_config);
    ts::return_shared(nwn);
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(character);
    clock.destroy_for_testing();

    // Bring SSU online
    ts.next_tx(owner);
    let mut character = ts.take_shared_by_id<Character>(ts, char_id);
    let mut ssu = ts.take_shared_by_id<StorageUnit>(ts, ssu_id);
    let mut nwn = ts.take_shared_by_id<NetworkNode>(ts, nwn_id);
    let energy_config = ts.take_shared<EnergyConfig>();
    let (owner_cap, receipt) = character.receive_owner_cap<StorageUnit>(
        ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&char_id), ts.ctx(),
    );
    ssu.online(&mut nwn, &energy_config, &owner_cap);
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(energy_config);
    ts::return_shared(nwn);
    ts::return_shared(ssu);
    ts::return_shared(character);

    (ssu_id, nwn_id)
}

#[test]
fun test_purchase_via_ssu_online() {
    let mut ts = ts::begin(admin());
    full_setup(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHAR_A_ID);
    seed_pool(&mut ts, user_a(), LP_DEPOSIT);
    let (ssu_id, _nwn_id) = create_and_online_ssu(&mut ts, user_a(), char_id);

    // Purchase insurance via SSU
    ts.next_tx(user_a());
    let ssu = ts.take_shared_by_id<StorageUnit>(&ts, ssu_id);
    let cfg = ts.take_shared<ProtocolConfig>();
    let mut pool = ts.take_shared<RiskPool>();
    let mut policy_reg = ts.take_shared<PolicyRegistry>();
    let character = ts.take_shared_by_id<Character>(&ts, char_id);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, ts.ctx());
    let clock = clock::create_for_testing(ts.ctx());

    let policy = ssu_extension::purchase_via_ssu(
        &ssu, &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clock, ts.ctx(),
    );
    // Verify policy created
    assert!(policy.is_active());

    transfer::public_transfer(policy, user_a());
    clock.destroy_for_testing();
    ts::return_shared(character);
    ts::return_shared(policy_reg);
    ts::return_shared(pool);
    ts::return_shared(cfg);
    ts::return_shared(ssu);
    ts.end();
}

#[test]
#[expected_failure]
fun test_purchase_via_ssu_offline_fails() {
    let mut ts = ts::begin(admin());
    full_setup(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHAR_A_ID);
    seed_pool(&mut ts, user_a(), LP_DEPOSIT);

    // Create SSU but do NOT bring it online
    ts.next_tx(admin());
    let mut registry = ts.take_shared<ObjectRegistry>();
    let admin_acl = ts.take_shared<AdminACL>();
    let character = ts.take_shared_by_id<Character>(&ts, char_id);
    // Create NWN first (needed for anchor)
    let nwn = network_node::anchor(
        &mut registry, &character, &admin_acl,
        NWN_ITEM_ID, NWN_TYPE_ID, FUEL_MAX_CAPACITY,
        FUEL_BURN_RATE_IN_MS, MAX_PRODUCTION, LOCATION_HASH, ts.ctx(),
    );
    let nwn_id = object::id(&nwn);
    network_node::share_network_node(nwn, &admin_acl, ts.ctx());
    ts::return_shared(character);
    ts::return_shared(admin_acl);
    ts::return_shared(registry);

    ts.next_tx(admin());
    let mut registry = ts.take_shared<ObjectRegistry>();
    let mut nwn = ts.take_shared_by_id<NetworkNode>(&ts, nwn_id);
    let character = ts.take_shared_by_id<Character>(&ts, char_id);
    let admin_acl = ts.take_shared<AdminACL>();
    let ssu = storage_unit::anchor(
        &mut registry, &mut nwn, &character, &admin_acl,
        STORAGE_A_ITEM_ID, STORAGE_A_TYPE_ID, MAX_CAPACITY, LOCATION_HASH, ts.ctx(),
    );
    let ssu_id = object::id(&ssu);
    ssu.share_storage_unit(&admin_acl, ts.ctx());
    ts::return_shared(admin_acl);
    ts::return_shared(character);
    ts::return_shared(nwn);
    ts::return_shared(registry);

    // Try purchase on OFFLINE SSU — should abort
    ts.next_tx(user_a());
    let ssu = ts.take_shared_by_id<StorageUnit>(&ts, ssu_id);
    let cfg = ts.take_shared<ProtocolConfig>();
    let mut pool = ts.take_shared<RiskPool>();
    let mut policy_reg = ts.take_shared<PolicyRegistry>();
    let character = ts.take_shared_by_id<Character>(&ts, char_id);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, ts.ctx());
    let clock = clock::create_for_testing(ts.ctx());

    let policy = ssu_extension::purchase_via_ssu(
        &ssu, &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clock, ts.ctx(),
    );
    // Should never reach here
    transfer::public_transfer(policy, user_a());
    clock.destroy_for_testing();
    ts::return_shared(character);
    ts::return_shared(policy_reg);
    ts::return_shared(pool);
    ts::return_shared(cfg);
    ts::return_shared(ssu);
    ts.end();
}
```

**Note:** The test setup for `create_and_online_ssu` is heavy (NWN anchor, fuel deposit, NWN online, SSU anchor, SSU online). This follows the exact same pattern as `world::storage_unit_tests`. The `receive_owner_cap` / `return_owner_cap` pattern is how world tests handle OwnerCap that's transferred to Character objects.

If this setup fails to compile due to missing imports or API differences in the world fork, **check `contracts/world-contracts/contracts/world/tests/assemblies/storage_unit_tests.move`** for the exact function signatures and adapt accordingly. The key functions are:
- `network_node::anchor()` + `share_network_node()`
- `nwn.deposit_fuel()` + `nwn.online()`
- `storage_unit::anchor()` + `share_storage_unit()`
- `storage_unit.online()`
- `character.receive_owner_cap<T>()` / `character.return_owner_cap()`

- [ ] **Step 3: Run tests**

Run: `cd contracts/wreckage-protocol && sui move test`

Expected: All existing tests pass + new ssu_extension tests pass.

- [ ] **Step 4: Commit**

```
git add contracts/wreckage-protocol/sources/ssu_extension.move \
       contracts/wreckage-protocol/tests/ssu_extension_tests.move
git commit -m "feat: add SSU extension with Auth witness + 5 entry wrappers"
```

---

## Task 3: Move Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `cd contracts/wreckage-protocol && sui move build`

Expected: Build succeeds with 38 modules (36 existing + ssu_extension + item_valuation).

- [ ] **Step 2: Full test suite**

Run: `cd contracts/wreckage-protocol && sui move test`

Expected: All tests pass (102 existing + new tests).

- [ ] **Step 3: Commit if any fixes were needed**

---

## Task 4: Frontend — Install EVE dApp Kit + Provider Setup

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/providers/EveFrontierWrapper.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install @evefrontier/dapp-kit**

Run: `cd frontend && pnpm add @evefrontier/dapp-kit @radix-ui/themes`

If `@evefrontier/dapp-kit` has peer dependency conflicts, check its npm page for compatible versions. It expects `@mysten/dapp-kit-react` and `@tanstack/react-query`.

- [ ] **Step 2: Create EveFrontierWrapper.tsx**

Create `frontend/src/providers/EveFrontierWrapper.tsx`:

```tsx
import { EveFrontierProvider } from '@evefrontier/dapp-kit';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

interface Props {
  queryClient: QueryClient;
  children: ReactNode;
}

export function EveFrontierWrapper({ queryClient, children }: Props) {
  return (
    <EveFrontierProvider queryClient={queryClient}>
      {children}
    </EveFrontierProvider>
  );
}
```

- [ ] **Step 3: Update main.tsx**

Wrap existing provider tree with `EveFrontierWrapper`:

```tsx
import { EveFrontierWrapper } from './providers/EveFrontierWrapper';

// ... existing code ...

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <EveFrontierWrapper queryClient={queryClient}>
        <DAppKitProvider dAppKit={dAppKit}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DAppKitProvider>
      </EveFrontierWrapper>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Verify dev server starts**

Run: `cd frontend && pnpm dev`

Expected: Dev server starts, no runtime errors in console. All existing pages render.

- [ ] **Step 5: Type check**

Run: `cd frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 6: Commit**

```
git add frontend/package.json frontend/pnpm-lock.yaml \
       frontend/src/providers/EveFrontierWrapper.tsx \
       frontend/src/main.tsx
git commit -m "feat: add @evefrontier/dapp-kit with parallel provider setup"
```

---

## Task 5: Frontend — Update contracts.ts + SSU PTB Builders

**Files:**
- Modify: `frontend/src/lib/contracts.ts`
- Create: `frontend/src/lib/ptb/ssu.ts`

- [ ] **Step 1: Update contracts.ts**

Add new module references and shared objects (placeholder IDs — updated after deploy):

```ts
// Add to MODULE:
ssuExtension: `${PACKAGE_ID}::ssu_extension`,
itemValuation: `${PACKAGE_ID}::item_valuation`,

// Add to SHARED_OBJECTS:
valuationRegistry: '0x_PLACEHOLDER_VALUATION_REGISTRY',
```

- [ ] **Step 2: Create ssu.ts PTB builders**

Create `frontend/src/lib/ptb/ssu.ts`:

```ts
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../contracts';

export function buildPurchaseViaSsu(params: {
  ssuObjectId: string;
  poolObjectId: string;
  characterObjectId: string;
  coverageAmount: bigint;
  includeSelfDestruct: boolean;
  paymentCoinId: string;
  senderAddress: string;  // wallet address for transfer target
}) {
  const tx = new Transaction();
  const [policy] = tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::purchase_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object(params.characterObjectId),
      tx.pure.u64(params.coverageAmount),
      tx.pure.bool(params.includeSelfDestruct),
      tx.object(params.paymentCoinId),
      tx.object('0x6'), // Clock
    ],
  });
  tx.transferObjects([policy], tx.pure.address(params.senderAddress));
  return tx;
}

export function buildClaimViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  killmailObjectId: string;
  poolObjectId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::claim_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(params.killmailObjectId),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.claimRegistry),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildRenewViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  poolObjectId: string;
  paymentCoinId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::renew_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(params.poolObjectId),
      tx.object(params.paymentCoinId),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildCancelViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  poolObjectId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::cancel_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildSetItemPrice(params: {
  adminCapId: string;
  itemTypeId: number;
  pricePerUnit: bigint;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::item_valuation::set_item_price`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(SHARED_OBJECTS.valuationRegistry),
      tx.pure.u64(params.itemTypeId),
      tx.pure.u64(params.pricePerUnit),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}
```

- [ ] **Step 3: Type check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```
git add frontend/src/lib/contracts.ts frontend/src/lib/ptb/ssu.ts
git commit -m "feat: add SSU extension + item valuation PTB builders"
```

---

## Task 6: Frontend — EVE Hooks + Components

**Files:**
- Create: `frontend/src/hooks/useEveCharacter.ts`
- Create: `frontend/src/hooks/useEveAssembly.ts`
- Create: `frontend/src/hooks/useSSUExtension.ts`
- Create: `frontend/src/components/eve/CharacterBadge.tsx`
- Create: `frontend/src/components/eve/SSUStatusCard.tsx`
- Create: `frontend/src/components/eve/GameWorldContext.tsx`

- [ ] **Step 1: Create useEveCharacter.ts**

```ts
import { useQuery } from '@tanstack/react-query';
import { getObjectWithJson } from '@evefrontier/dapp-kit';

export interface EveCharacter {
  name: string;
  id: string;
  address: string;
}

export function useEveCharacter(characterObjectId: string | undefined) {
  return useQuery({
    queryKey: ['eve-character', characterObjectId],
    queryFn: async (): Promise<EveCharacter | null> => {
      if (!characterObjectId) return null;
      const result = await getObjectWithJson(characterObjectId);
      const json = result.data?.object?.asMoveObject?.contents?.json as Record<string, unknown> | undefined;
      if (!json) return null;
      return {
        name: (json.name as string) || 'Unknown',
        id: characterObjectId,
        address: (json.character_address as string) || '',
      };
    },
    enabled: !!characterObjectId,
  });
}
```

- [ ] **Step 2: Create useEveAssembly.ts**

```ts
import { useQuery } from '@tanstack/react-query';
import { getAssemblyWithOwner, transformToAssembly } from '@evefrontier/dapp-kit';

export function useEveAssembly(assemblyObjectId: string | undefined) {
  return useQuery({
    queryKey: ['eve-assembly', assemblyObjectId],
    queryFn: async () => {
      if (!assemblyObjectId) return null;
      const { moveObject, character } = await getAssemblyWithOwner(assemblyObjectId);
      if (!moveObject) return null;
      const assembly = await transformToAssembly(assemblyObjectId, moveObject, { character });
      return { assembly, character };
    },
    enabled: !!assemblyObjectId,
  });
}
```

- [ ] **Step 3: Create useSSUExtension.ts**

```ts
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit-react';
import { buildPurchaseViaSsu, buildClaimViaSsu, buildRenewViaSsu, buildCancelViaSsu } from '../lib/ptb/ssu';

export function useSSUExtension(ssuObjectId: string | undefined) {
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const account = useCurrentAccount();

  const purchaseViaSsu = async (params: {
    poolObjectId: string;
    characterObjectId: string;
    coverageAmount: bigint;
    includeSelfDestruct: boolean;
    paymentCoinId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    if (!account?.address) throw new Error('Wallet not connected');
    const tx = buildPurchaseViaSsu({ ssuObjectId, senderAddress: account.address, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const claimViaSsu = async (params: {
    policyObjectId: string;
    killmailObjectId: string;
    poolObjectId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildClaimViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const renewViaSsu = async (params: {
    policyObjectId: string;
    poolObjectId: string;
    paymentCoinId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildRenewViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const cancelViaSsu = async (params: {
    policyObjectId: string;
    poolObjectId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildCancelViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  return { purchaseViaSsu, claimViaSsu, renewViaSsu, cancelViaSsu };
}
```

- [ ] **Step 4: Create CharacterBadge.tsx**

```tsx
import { useEveCharacter } from '../../hooks/useEveCharacter';

export function CharacterBadge({ characterObjectId }: { characterObjectId?: string }) {
  const { data: character, isLoading } = useEveCharacter(characterObjectId);

  if (!characterObjectId) return null;
  if (isLoading) return <span className="text-gray-400 text-sm">Loading...</span>;
  if (!character) return <span className="text-gray-500 text-sm">Unknown Character</span>;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-700 rounded-full">
      <div className="w-2 h-2 rounded-full bg-green-400" />
      <span className="text-sm font-medium text-indigo-200">{character.name}</span>
    </div>
  );
}
```

- [ ] **Step 5: Create SSUStatusCard.tsx**

```tsx
import { useEveAssembly } from '../../hooks/useEveAssembly';

export function SSUStatusCard({ ssuObjectId }: { ssuObjectId?: string }) {
  const { data, isLoading } = useEveAssembly(ssuObjectId);

  if (!ssuObjectId) {
    return (
      <div className="p-4 border border-dashed border-gray-600 rounded-lg text-gray-500 text-center">
        No SSU selected — insurance available via direct contract calls
      </div>
    );
  }

  if (isLoading) return <div className="p-4 text-gray-400">Loading SSU...</div>;

  const assembly = data?.assembly;
  const isOnline = assembly?.state === 'online';

  return (
    <div className={`p-4 rounded-lg border ${isOnline ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">{assembly?.name || 'Smart Storage Unit'}</h3>
          <p className="text-sm text-gray-400">Type: {assembly?.type || 'SSU'}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-bold ${isOnline ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      {isOnline && (
        <p className="mt-2 text-xs text-green-300">Insurance services active at this station</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create GameWorldContext.tsx**

```tsx
import { useEveAssembly } from '../../hooks/useEveAssembly';

export function GameWorldContext({ ssuObjectId }: { ssuObjectId?: string }) {
  const { data } = useEveAssembly(ssuObjectId);
  const owner = data?.character;

  if (!ssuObjectId || !data) return null;

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-sm">
      <h4 className="text-gray-400 font-medium mb-1">EVE Frontier Context</h4>
      <div className="space-y-1 text-gray-300">
        <p>Station: <span className="text-white">{data.assembly?.name || 'Unknown'}</span></p>
        <p>ID: <span className="font-mono text-xs text-gray-400">{ssuObjectId.slice(0, 10)}...</span></p>
        {owner && <p>Owner: <span className="text-indigo-300">{owner.name}</span></p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Type check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 8: Commit**

```
git add frontend/src/hooks/useEveCharacter.ts \
       frontend/src/hooks/useEveAssembly.ts \
       frontend/src/hooks/useSSUExtension.ts \
       frontend/src/components/eve/CharacterBadge.tsx \
       frontend/src/components/eve/SSUStatusCard.tsx \
       frontend/src/components/eve/GameWorldContext.tsx
git commit -m "feat: add EVE hooks (character, assembly, SSU) + components"
```

---

## Task 7: Frontend — Page Modifications

**Files:**
- Modify: `frontend/src/pages/insure/InsurePage.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/demo/DemoPanel.tsx`

- [ ] **Step 1: Add EVE context to InsurePage**

Read `frontend/src/pages/insure/InsurePage.tsx` first. Then add:
- Import `SSUStatusCard` and `CharacterBadge`
- Add an optional SSU object ID input field (text input)
- Render `SSUStatusCard` at top of page
- Render `CharacterBadge` next to character selection

This is a UI addition, not a logic change. The existing purchase flow still works without SSU.

- [ ] **Step 2: Add EVE world overview to DashboardPage**

Read `frontend/src/pages/DashboardPage.tsx` first. Then add:
- Import `GameWorldContext`
- Add "EVE Frontier Integration" section with `GameWorldContext` component
- Add a text input for SSU object ID to explore

- [ ] **Step 3: Add item valuation admin to DemoPanel**

Read `frontend/src/pages/demo/DemoPanel.tsx` first. Then add:
- "Item Valuation" section with:
  - Input: item_type_id (number)
  - Input: price_per_unit (number, in SUI)
  - Button: "Set Price" → calls `buildSetItemPrice` PTB
  - Display: current prices for demo items

- [ ] **Step 4: Type check + dev server test**

Run: `cd frontend && npx tsc --noEmit && pnpm dev`

Expected: No type errors, all pages render.

- [ ] **Step 5: Commit**

```
git add frontend/src/pages/insure/InsurePage.tsx \
       frontend/src/pages/DashboardPage.tsx \
       frontend/src/pages/demo/DemoPanel.tsx
git commit -m "feat: integrate EVE context into InsurePage, Dashboard, DemoPanel"
```

---

## Task 8: Deploy v6 + Post-Deploy Setup

**Files:**
- Modify: `contracts/deployment.json`
- Modify: `frontend/src/lib/contracts.ts`

- [ ] **Step 1: Build before deploy**

Run: `cd contracts/wreckage-protocol && sui move build`

Expected: Clean build, 38 modules.

- [ ] **Step 2: Deploy to testnet**

Run: `cd contracts/wreckage-protocol && sui client publish --gas-budget 1000000000 --with-unpublished-dependencies`

Record: PackageID, Tx Digest, Gas used, all shared object IDs (including new ValuationRegistry).

- [ ] **Step 3: Update deployment.json**

Update `contracts/deployment.json` with new PackageID and all shared object IDs.

- [ ] **Step 4: Update contracts.ts**

Update `frontend/src/lib/contracts.ts`:
- `PACKAGE_ID` → new package ID
- `SHARED_OBJECTS.valuationRegistry` → new ValuationRegistry object ID
- Add `ssuExtension` and `itemValuation` to `MODULE`

- [ ] **Step 5: Type check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```
git add contracts/deployment.json frontend/src/lib/contracts.ts
git commit -m "feat: deploy v6 to testnet with SSU extension + item valuation"
```

---

## Task 9: Update progress.md

**Files:**
- Modify: `tasks/progress.md`

- [ ] **Step 1: Update progress**

Add to progress.md:
- EVE SDK Integration task completed
- New modules: ssu_extension, item_valuation
- Deploy v6 details (PackageID, Gas, module count)
- Frontend: @evefrontier/dapp-kit integrated

- [ ] **Step 2: Commit**

```
git add tasks/progress.md
git commit -m "docs: update progress with EVE SDK integration"
```
