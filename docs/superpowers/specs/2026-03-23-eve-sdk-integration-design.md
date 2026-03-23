# EVE Frontier SDK Integration — System Design Spec

> **Date**: 2026-03-23
> **Status**: Reviewed (post sui-architect audit + spec review pass 1)
> **Depends on**: Wreckage Insurance Protocol v5 (all 36 modules deployed)
> **Review Sources**: sui-architect (SSU pattern, object model, visibility, package architecture)

---

## 1. Overview

Integrate Wreckage Insurance Protocol into EVE Frontier's game world through two vectors:

1. **On-chain**: SSU (Smart Storage Unit) extension — insurance protocol has a "physical presence" inside game-world space stations
2. **Frontend**: `@evefrontier/dapp-kit` integration — UI displays real EVE game data (Characters, Assemblies, locations)

### Goals

- Players interact with insurance through in-game SSU structures
- Frontend shows EVE Character names, Assembly locations, and Smart Object states
- Reserve interface for future items-as-collateral (asset-backed insurance)
- Minimal disruption to existing 36-module working codebase

### Non-Goals

- Gate/Turret extensions (insurance ≠ travel/defense)
- Full migration to `EveFrontierProvider` (keep existing Sui wallet setup working)
- Complete items-as-payment implementation (MVP: interface only)
- DEX/oracle price feeds (MVP: admin oracle)
- SalvageNFT ↔ SSU inventory integration (see §3.1 for rationale)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (React + Vite)                        │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │ Existing Setup   │  │ @evefrontier/dapp-kit│  │
│  │ @mysten/dapp-kit │  │ EveFrontierProvider  │  │
│  │ SuiGrpcClient    │  │ useSmartObject       │  │
│  │ PTB builders     │  │ useConnection        │  │
│  │ 7 hooks, 6 pages │  │ GraphQL queries      │  │
│  └────────┬─────────┘  └──────────┬──────────┘  │
│           │  coexist              │              │
│           ▼                       ▼              │
│  ┌──────────────────────────────────────────┐   │
│  │ New Integration Layer                    │   │
│  │ - EVE Character/Assembly display         │   │
│  │ - SSU extension PTB builders             │   │
│  │ - Item valuation UI (admin panel)        │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│  On-chain (Sui Testnet)                         │
│  ┌─────────────────────────────────────────┐    │
│  │ wreckage_protocol (merged-package)      │    │
│  │  ├── Existing 36 modules (untouched)    │    │
│  │  ├── ssu_extension.move (NEW)           │    │
│  │  │   └── Auth witness + entry wrappers  │    │
│  │  └── item_valuation.move (NEW)          │    │
│  │      └── Admin oracle + LTV + interface │    │
│  └──────────────┬──────────────────────────┘    │
│                 │ same package                    │
│                 ▼                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ World Contracts (EVE Frontier)          │    │
│  │  ├── StorageUnit ← extension registered │    │
│  │  ├── Killmail (already integrated)      │    │
│  │  └── Character (already integrated)     │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 3. Move Contract: ssu_extension.move

### 3.1 Design Decision: SSU as Entry Point Only

**SalvageNFT cannot be stored in SSU inventory.** SSU's `deposit_item<Auth>()` accepts `world::inventory::Item` (game items with `type_id`, `quantity`, `volume`), not arbitrary Sui objects. `SalvageNFT` is a custom Sui object (`has key, store`) — type-incompatible.

Additionally, `game_item_to_chain_inventory` (the only way to mint `Item`) requires `AdminACL` (server-sponsored), which extensions don't have.

**Therefore:** SSU extension provides insurance operation entry points (purchase, claim, renew, cancel). SalvageNFT lifecycle remains on Sui layer (Auction wrap/unwrap → transfer to winner).

### 3.2 Witness Type

```move
module wreckage_protocol::ssu_extension;

use world::storage_unit::StorageUnit;
use world::character::Character;
// ... other imports

/// Typed witness — only this module can construct it.
/// SSU owner registers via: storage_unit::authorize_extension<ssu_extension::Auth>(ssu, owner_cap)
public struct Auth has drop {}
```

### 3.3 Entry Functions

All functions are `public` (not `entry`) thin wrappers that:
1. Verify SSU is online (`storage_unit.status().is_online()`)
2. Delegate to existing protocol functions (exact same parameters)
3. Emit `SSUInsuranceEvent` for indexing

**Visibility note:** Functions are `public` (not `entry`) because `purchase_via_ssu` returns `InsurancePolicy` (non-`drop`). PTB callers handle the returned object (e.g., `transfer::public_transfer` in same PTB).

**Signatures match underlying functions exactly** (plus `&StorageUnit`):

```move
/// Purchase insurance through an SSU (space station insurance counter)
/// Validates SSU is online, then delegates to underwriting::purchase_policy
public fun purchase_via_ssu(
    storage_unit: &StorageUnit,           // immutable ref — read status only
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

/// Submit standard claim through SSU
/// Delegates to claims::submit_claim (no AuctionRegistry — auction creation
/// happens inside claims.move via salvage + auction::create_auction)
public fun claim_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Submit self-destruct claim through SSU
/// Delegates to claims::submit_self_destruct_claim
public fun self_destruct_claim_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Renew policy through SSU
public fun renew_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Cancel policy through SSU
public fun cancel_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    clock: &Clock,
    ctx: &mut TxContext,
);
```

### 3.4 SSU Validation

Each wrapper function performs:
```move
fun assert_ssu_online(storage_unit: &StorageUnit) {
    assert!(storage_unit.status().is_online(), ESSUNotOnline);
}
```

The SSU reference is **immutable** (`&StorageUnit`) — we read status but don't mutate inventory. This means:
- No shared object write contention on SSU
- Multiple users can purchase insurance through the same SSU concurrently
- SSU owner retains full control (can take offline to disable insurance access)

### 3.5 Events

```move
/// Emitted on every SSU-mediated operation for indexing
public struct SSUInsuranceEvent has copy, drop {
    ssu_id: ID,
    operation: u8,      // 0=purchase, 1=claim, 2=renew, 3=cancel, 4=self_destruct_claim
    policy_id: ID,
    actor: address,
}
```

### 3.6 Registration Flow

SSU owner (space station operator) enables insurance:
```
1. SSU owner calls: storage_unit::authorize_extension<wreckage_protocol::ssu_extension::Auth>(
       &mut ssu,           // NOTE: &mut StorageUnit required for registration
       &owner_cap          // OwnerCap<StorageUnit>
   )
2. (Optional) SSU owner calls: storage_unit::freeze_extension_config(&mut ssu, &owner_cap)
   // freezes extension config — builds user trust, cannot swap extension after this
3. Insurance protocol is now active on this SSU
4. Players can call purchase_via_ssu, claim_via_ssu, etc.
```

**Note:** Registration is an owner-only operation (requires `OwnerCap<StorageUnit>`). The extension author (protocol deployer) does NOT need to do anything — the SSU owner opts in.

### 3.7 Future Extension: Items-as-Collateral via SSU

Reserved for future implementation. When enabled:
```move
/// (FUTURE) Deposit game items as collateral for premium credit
/// Uses SSU open_inventory for extension-controlled item custody
/// NOTE: Auth {} witness instantiated inside this function (only ssu_extension module can do this)
public fun deposit_collateral_via_ssu(
    storage_unit: &mut StorageUnit,       // mutable — writes to open_inventory
    valuation_registry: &ValuationRegistry,
    character: &Character,
    item: Item,                           // world::inventory::Item (game item)
    ctx: &mut TxContext,
) {
    // ... validation ...
    // Auth {} can only be constructed here because Auth is defined in this module
    storage_unit::deposit_to_open_inventory<Auth>(storage_unit, character, item, Auth {}, ctx);
}

/// (FUTURE) Withdraw collateral after policy expiry
public fun withdraw_collateral_via_ssu(
    storage_unit: &mut StorageUnit,
    character: &Character,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
): Item {
    // Auth {} witness instantiated internally
    storage_unit::withdraw_from_open_inventory<Auth>(storage_unit, character, Auth {}, type_id, quantity, ctx)
}
```

This is where SSU inventory (`deposit_to_open_inventory<Auth>`) becomes relevant — game items held as collateral under extension control. Not implemented in MVP.

---

## 4. Move Contract: item_valuation.move

### 4.1 Purpose

Admin-managed price oracle for game items. MVP provides the interface; future versions can plug in DEX/external oracle pricing.

### 4.2 Objects

```move
module wreckage_protocol::item_valuation;

/// Shared object — admin-managed item price oracle
public struct ValuationRegistry has key {
    id: UID,
    /// item_type_id → price_per_unit (MIST)
    prices: Table<u64, u64>,
    /// item_type_id → last update epoch timestamp
    price_updated_at: Table<u64, u64>,
    /// Default Loan-to-Value ratio (bps, e.g., 7000 = 70%)
    default_ltv_bps: u64,
    version: u64,
}
```

### 4.3 Admin Functions

Uses existing `config::AdminCap` (same capability as all other admin operations — NOT a new capability type).

```move
/// Set price for an item type (admin oracle)
/// AdminCap is wreckage_protocol::config::AdminCap (reused, not new)
public fun set_item_price(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    item_type_id: u64,
    price_per_unit: u64,       // MIST
    clock: &Clock,
);

/// Batch set prices
public fun set_item_prices_batch(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    type_ids: vector<u64>,
    prices: vector<u64>,
    clock: &Clock,
);

/// Adjust global LTV ratio
public fun set_default_ltv(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    ltv_bps: u64,              // must be <= 10000
);
```

### 4.4 Query Functions

```move
/// Estimate raw value of items (price × quantity)
/// Aborts with EItemNotPriced if type_id not in registry
public fun estimate_value(
    registry: &ValuationRegistry,
    item_type_id: u64,
    quantity: u32,
): u64;

/// Collateral value = estimate_value × LTV ratio
/// Use case: how much premium credit these items are worth
public fun collateral_value(
    registry: &ValuationRegistry,
    item_type_id: u64,
    quantity: u32,
): u64;

/// Check if an item type has a price set
public fun is_priced(registry: &ValuationRegistry, item_type_id: u64): bool;

/// Get price update timestamp (for staleness checks)
public fun price_updated_at(registry: &ValuationRegistry, item_type_id: u64): u64;
```

### 4.5 Error Codes

All new error codes added to `errors.move` (existing codes go up to 63):

```move
// ssu_extension errors (65-69)
const ESSUNotOnline: u64 = 65;

// item_valuation errors (70-79)
const EItemNotPriced: u64 = 70;
const EInvalidLTV: u64 = 71;
const EBatchLengthMismatch: u64 = 72;
```

### 4.6 Future Interface (Not Implemented)

```move
/// (FUTURE) Accept items as premium payment
/// Requires: SSU open_inventory integration + collateral tracking
public fun deposit_collateral_for_premium(...);

/// (FUTURE) Liquidate expired/defaulted collateral
public fun liquidate_collateral(...);

/// (FUTURE) Refresh price from external oracle
public fun refresh_price_from_oracle(...);
```

### 4.7 Init Integration

`ValuationRegistry` created in `init.move`, following the same pattern as other registries:

```move
// In item_valuation.move:
public(package) fun create_and_share_valuation_registry(ctx: &mut TxContext) {
    let registry = ValuationRegistry {
        id: object::new(ctx),
        prices: table::new(ctx),
        price_updated_at: table::new(ctx),
        default_ltv_bps: 7000,  // 70% default LTV
        version: 1,
    };
    transfer::share_object(registry);
}

// In init.move init() function, add:
item_valuation::create_and_share_valuation_registry(ctx);
```

**Note:** New shared object = struct change = requires fresh publish (v6).

---

## 5. Frontend: EVE dApp Kit Integration

### 5.1 Strategy: Parallel Providers (Phase 1)

```
EveFrontierProvider          DAppKitProvider (existing)
├── QueryClientProvider      ├── SuiGrpcClient
├── VaultProvider            ├── Wallet connection
├── SmartObjectProvider      ├── PTB execution
└── NotificationProvider     └── Custom hooks (7)
```

Both share the same `QueryClient` instance. Existing hooks/pages untouched.

### 5.2 New Dependencies

```json
{
  "@evefrontier/dapp-kit": "latest",
  "@radix-ui/themes": "latest"
}
```

### 5.3 New Files

```
src/
├── providers/
│   └── EveFrontierWrapper.tsx     // NEW — wraps EveFrontierProvider
├── hooks/
│   ├── useEveCharacter.ts         // NEW — character name/info from EVE GraphQL
│   ├── useEveAssembly.ts          // NEW — SSU/Assembly data + status
│   └── useSSUExtension.ts         // NEW — SSU extension PTB builders
├── lib/ptb/
│   └── ssu.ts                     // NEW — PTB: purchase_via_ssu, claim_via_ssu, etc.
├── components/eve/
│   ├── CharacterBadge.tsx          // NEW — EVE character name + avatar display
│   ├── SSUStatusCard.tsx           // NEW — SSU online/offline + extension status
│   └── GameWorldContext.tsx        // NEW — solar system, location info panel
└── pages/
    ├── insure/InsurePage.tsx       // MODIFY — add character selector + SSU context
    ├── DashboardPage.tsx           // MODIFY — add EVE world overview
    └── demo/DemoPanel.tsx          // MODIFY — add item valuation admin section
```

### 5.4 Provider Setup (main.tsx)

```tsx
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
// ... existing imports

const queryClient = new QueryClient();

// EveFrontierProvider outer → provides EVE GraphQL + vault + notifications
// DAppKitProvider inner → provides Sui wallet + gRPC client (existing)
// Both share same queryClient. All hooks (EVE + Sui) available inside <App />.
<EveFrontierProvider queryClient={queryClient}>
  <DAppKitProvider>  {/* existing Sui wallet provider */}
    <App />
  </DAppKitProvider>
</EveFrontierProvider>
```

**Nesting order matters:** `EveFrontierProvider` wraps `DAppKitProvider` so EVE context is available everywhere. Existing Sui hooks (`useCurrentAccount`, custom hooks) remain unaffected.

### 5.5 Key Hooks

**useEveCharacter:**
```tsx
// Reads EVE Character data via @evefrontier/dapp-kit GraphQL
const { character, loading, error } = useEveCharacter(characterAddress);
// Returns: { name, id, ownerCapId, address }
```

**useEveAssembly:**
```tsx
// Reads SSU/Assembly data via useSmartObject or getAssemblyWithOwner
const { assembly, character: owner, loading } = useEveAssembly(ssuObjectId);
// Returns: { name, type, state, id, location, extensionType }
```

**useSSUExtension:**
```tsx
// PTB builders for SSU-mediated insurance operations
const { purchaseViaSsu, claimViaSsu, renewViaSsu } = useSSUExtension(ssuObjectId);
```

### 5.6 UI Integration Points

| Page | EVE Integration | Data Source |
|------|----------------|-------------|
| InsurePage | Character name display, SSU location context | useEveCharacter, useEveAssembly |
| PolicyDetailPage | Character badge on policy card | useEveCharacter |
| DashboardPage | "Nearby SSUs with insurance" panel | getOwnedObjectsByType |
| AuctionListPage | Solar system name on auction cards | useEveAssembly (location) |
| DemoPanel | Item valuation admin (set prices, view LTV) | direct PTB |

### 5.7 Phase 2 (Future — Full Migration)

After MVP validated:
- Remove `DAppKitProvider`, use only `EveFrontierProvider`
- Migrate `useInsurancePolicy` etc. to use EVE GraphQL instead of SuiGrpcClient
- Use `useConnection()` for wallet instead of custom setup

---

## 6. Deployment

### 6.1 Contract Changes

| Change | Impact |
|--------|--------|
| New module: `ssu_extension.move` | New module in package |
| New module: `item_valuation.move` | New module in package |
| New shared object: `ValuationRegistry` | Struct change in init.move |
| Modified: `init.move` | Add ValuationRegistry creation |
| Modified: `errors.move` | Add SSU + valuation error codes |

**Requires fresh publish (v6)** — new shared object in init.

### 6.2 Post-Deploy Setup

```
1. Publish v6 → get new PackageID
2. Update deployment.json + contracts.ts
3. (In-game) SSU owner: authorize_extension<Auth>(ssu, owner_cap)
4. Admin: set_item_price(admin_cap, registry, type_id, price) × N items
5. Frontend: update VITE_PACKAGE_ID, install @evefrontier/dapp-kit
```

---

## 7. Testing Strategy

### 7.1 Move Tests

| Test | Scope |
|------|-------|
| `ssu_extension_tests.move` | SSU online check, wrapper delegation, event emission |
| `item_valuation_tests.move` | set/get price, LTV calc, batch, EItemNotPriced abort |
| Monkey tests | SSU offline → purchase fails, zero-price item, LTV = 0, LTV > 10000 |

### 7.2 Frontend Tests

- `EveFrontierProvider` + existing `DAppKitProvider` coexistence (no crash)
- `useEveCharacter` returns character data
- `useEveAssembly` returns SSU state
- SSU PTB builders produce valid transactions

---

## 8. Security Considerations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSU offline bypass (call purchase directly, not via SSU) | LOW | Acceptable — direct `purchase_policy` still works, SSU is UX layer not security gate |
| Admin oracle price manipulation | MEDIUM | `price_updated_at` enables staleness detection; LTV caps max collateral credit |
| ValuationRegistry contention | LOW | Admin-only writes, infrequent updates |
| Provider conflict (two wallet providers) | LOW | Share QueryClient, test coexistence |

### Not a Security Concern

- SSU extension uses `&StorageUnit` (immutable ref) — cannot mutate SSU state
- All insurance logic unchanged — SSU wrappers are pure delegation
- `Auth` witness pattern prevents unauthorized extension calls

---

## 9. Real-World Insurance Mapping (Extended)

| 現實機制 | EVE 協議實現 | EVE SDK 整合 |
|---------|-------------|-------------|
| 保險經紀人辦公室 | — | SSU = 太空站保險櫃台 |
| 資產擔保貸款 (Asset-backed) | — | item_valuation + SSU inventory (future) |
| 不動產估值 (Appraisal) | — | admin oracle → estimate_value |
| 貸款成數 (LTV ratio) | — | collateral_value = estimate × 70% |
| 定期估值更新 | — | price_updated_at + staleness check |

---

## 10. Scope Summary

### MVP (This Implementation)

- [x] `ssu_extension.move` — 5 entry functions (thin wrappers)
- [x] `item_valuation.move` — admin oracle + LTV + query functions
- [x] `init.move` update — ValuationRegistry shared object
- [x] Frontend: `@evefrontier/dapp-kit` parallel integration
- [x] Frontend: 3 new hooks, 3 new components, 1 new PTB builder
- [x] Frontend: 3 page modifications
- [x] Tests: ssu_extension + item_valuation + monkey tests
- [x] Deploy v6 + SSU authorization

### Future (Reserved Interface)

- [ ] Items-as-collateral via SSU open_inventory
- [ ] Collateral liquidation
- [ ] DEX/oracle price feed integration
- [ ] Full EveFrontierProvider migration
- [ ] Real-time auction push via EVE notifications
