# Wreckage Insurance Protocol — Move Notes

## Deployment (Testnet)

- **Network**: testnet
- **Date**: 2026-03-24 (v6)
- **PackageID**: `0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41`
- **Deployer**: `0x1509b5fdf09296b2cf749a710e36da06f5693ccd5b2144ad643b3a895abcbc4c`
- **Gas**: ~0.810 SUI
- **Deployment mode**: Single-package (world + wreckage-protocol merged via `--with-unpublished-dependencies`)
- **Modules**: 38 (20 world + 18 protocol)
- **Size note**: Package hit 100KB limit; trimmed unused error constants + integration mock code

### Key Object IDs

| Object | ID |
|--------|----|
| ProtocolConfig | `0x0e9ca9dbc87e828f907f0c8011973a9ba5ee8d3c1e0bea08b42f050a622d4523` |
| PolicyRegistry | `0x11903d4c33205930b2fd9f79cbf2899d301940a4dc79b01e76981ab3806fbef8` |
| ClaimRegistry | `0xe42f02223e9e635a2b03c9e3337fdcba0fb1a9bb7fba469df17bb70c142d8036` |
| AuctionRegistry | `0x682807b31effdf6160e296b00012331b3a58b8560b102f733dfc6919944e29f9` |
| ValuationRegistry | `0x0a617a6b38cbe66b8f0e00d9b10daf3f6383bf62c9e13ad3de6d89716f99f77a` |
| AdminCap | `0x8fe5a8540278123465958930271f79448934b31873a86225a7c02c7591fc2038` |
| UpgradeCap | `0x3739533d271b68d15bb5f1a28bc89e2f7a32d8cacf666c59c40022eb05f03179` |

## Module Summary (18 modules in wreckage-protocol)

| Module | Purpose |
|--------|---------|
| `errors` | Shared error code accessors (originally wreckage-core) |
| `policy` | InsurancePolicy struct + accessors/mutators + events (originally wreckage-core) |
| `salvage_nft` | SalvageNFT struct + mint/destroy + events (originally wreckage-core) |
| `pool_config` | PoolConfig + AuctionConfig value types with validation (originally wreckage-core) |
| `rider` | Self-destruct rider premium/payout calculations (originally wreckage-core) |
| `config` | AdminCap + ProtocolConfig + admin functions |
| `init` | Consolidated init: AdminCap + ProtocolConfig + all registries |
| `registry` | ClaimRegistry + PolicyRegistry |
| `risk_pool` | RiskPool + LPPosition + LP deposit/withdraw/premium/payout mechanics |
| `anti_fraud` | FraudCheckResult + multi-signal scoring (velocity, amount, character age, killmail) |
| `underwriting` | purchase_policy + renew_policy + transfer_policy + expire_policy |
| `claims` | submit_claim (combat + self-destruct) + approve/reject + salvage mint |
| `salvage` | SalvageNFT lifecycle management |
| `auction` | AuctionRegistry + Auction + create/bid/settle/buyout/destroy |
| `subrogation` | emit_subrogation — bounty reward calculation from subrogation_rate_bps |
| `integration` | ClaimCompletedHook event (mock bounty/fleet code removed for package size) |
| `item_valuation` | ValuationRegistry (Table-based oracle) + set_item_price + batch + LTV + estimate_value |
| `ssu_extension` | SSU extension: Auth witness + 5 entry wrappers (purchase/claim/SD/renew/cancel via SSU) |

## Tests

- **Total**: 112 tests all passing (v6)
- wreckage-core modules (merged): 10 tests (policy 3, pool_config 7, rider 3)
- config: 12, registry: 6, risk_pool: 11, anti_fraud: 12, underwriting: 11
- claims: 6, salvage: 2, auction: 8, e2e: 11 (2 integration mock tests removed)
- item_valuation: 10, ssu_extension: 2

## Security Status

- **Audit date**: 2026-03-21 (Security Guard + Red Team, 10 rounds)
- **CRITICAL (5)**: All fixed — wreckage-core `public fun` → `public(package)` via package merge
- **HIGH (6)**: All fixed (2026-03-21)
  - H-1: `place_bid` 改用 AuctionConfig（取代 hardcoded 600s）— 新增 `registry: &AuctionRegistry` 參數
  - H-2: 加 `min_bid_increment_bps` 檢查（防 1 MIST bid griefing）
  - H-3: InsurancePolicy 加 `pool_reserved: u64` 欄位，修正 per-policy reservation tracking
  - H-4: `transfer_policy` 改 by-value，內部執行 `transfer::public_transfer`
  - H-5: `expire_policy` 加 `config: &ProtocolConfig` 參數 + pause check
  - H-6: 已修復（P0 時改為 `public(package)`）
- **SUSPICIOUS (3)**: All fixed (2026-03-21)
  - S-1: `set_renewal_data` 不再重設 `created_at`
  - S-2: `settle_auction` + `buyout` 加 `assert!(pool.risk_tier() == auction.source_pool_tier)`
  - S-3: anti-snipe extension cap at `started_at + auction_duration * 3`
- **MEDIUM (7/8 fixed, 2026-03-22)**:
  - M-1: `admin_set_pool_active` admin function added (config.move + risk_pool.move)
  - M-2: `set_max_claims_per_policy` + `set_protocol_fee_bps` admin setters added (config.move)
  - M-3: `subrogation_rate_bps <= 10000` validation added (pool_config.move)
  - M-4: `anti_snipe_window <= auction_duration` + `anti_snipe_extension <= auction_duration` validation added (pool_config.move)
  - M-5: Skipped — u8 safe (max_claims_per_policy also u8, no overflow)
  - M-6: LPPosition 加 `pool_id: ID` field, withdraw 改用 pool_id check (risk_pool.move) ★ struct change
  - M-7: Renewal grace period enforced: `now <= expires_at + renewal_waiting_period` (underwriting.move)
  - M-8: AuctionRegistry 移除 config field, place_bid 改讀 ProtocolConfig (auction.move + init.move) ★ struct change
- **Full report**: `tasks/security-audit-2026-03-21.md`

### Changed Function Signatures (P1-P2 fixes)

| Function | Before | After |
|----------|--------|-------|
| `place_bid` | `(auction, bid_coin, clock, ctx)` | `(auction, **registry**, bid_coin, clock, ctx)` |
| `transfer_policy` | `(&mut policy, config, recipient, clock, ctx)` | `(**policy**, config, recipient, clock, ctx)` — by value |
| `expire_policy` | `(policy, policy_reg, pool, clock)` | `(policy, policy_reg, pool, **config**, clock)` |
| `set_renewal_data` | `(policy, premium, expires, created)` | `(policy, premium, expires)` — no created_at |

### Changed Function Signatures (MEDIUM fixes)

| Function | Before | After |
|----------|--------|-------|
| `place_bid` | `(auction, **config: &ProtocolConfig**, bid_coin, clock, ctx)` | was `registry: &AuctionRegistry` → now `config: &ProtocolConfig` |
| `create_and_share_auction_registry` | `(config: AuctionConfig, ctx)` | `(ctx)` — no config param |

### Changed Structs (MEDIUM fixes)

| Struct | Change |
|--------|--------|
| `AuctionRegistry` | Removed `config: AuctionConfig` field |
| `LPPosition` | Added `pool_id: ID` field |

### New Admin Functions (MEDIUM fixes)

| Function | Module | Purpose |
|----------|--------|---------|
| `admin_set_pool_active` | config.move | M-1: Activate/deactivate RiskPool |
| `set_max_claims_per_policy` | config.move | M-2: Update max claims |
| `set_protocol_fee_bps` | config.move | M-2: Update protocol fee |

### New Struct Fields (P1-P2 fixes)

| Struct | Field | Type | Purpose |
|--------|-------|------|---------|
| InsurancePolicy | `pool_reserved` | `u64` | Per-policy reservation tracking in RiskPool |

## Spec Compliance Fixes (2026-03-23)

### Fix 1: `emergency_withdraw` (spec §4.4 — HIGH)
- **問題**: Spec 要求 "LP withdrawals remain open even when paused"，但原始實作沒有 emergency path
- **修復**: `risk_pool.move` 新增 `emergency_withdraw` public function
- **設計**: 與 `withdraw` 完全相同邏輯，但跳過 `is_active` 檢查
- **保留防護**: lock period (7 days) + withdraw cap (25%) + dynamic fee + reservation invariant
- **Red Team**: 通過 — flash loan, drain attack 均被 lock period / invariant 阻擋

### Fix 2: Admin Config Hard Limit Validation (spec §11.3 — MEDIUM)
- **問題**: `add_pool_tier` / `update_pool_config` 沒有驗證 ProtocolConfig hard limits
- **修復**: `config.move` 新增 `validate_pool_config_limits()` private function
- **檢查**: `deductible_bps >= min_deductible_bps`, `base_premium_rate >= min_premium_rate_bps`, `max_coverage <= max_coverage_limit`
- **已知 trade-off**: 修改 ProtocolConfig limits 不會 retroactively 驗證既有 pool configs（gas 效率考量，MVP 可接受）

### Re-audit (2026-03-23)
- **Move Code Quality**: 38/50+ rules passed, 8 style improvements (non-blocking)
- **Security Guard**: Clean — no secrets, no .env exposure
- **Red Team (10 rounds)**: 0 exploits, 2 suspicious (NEGLIGIBLE/LOW), 48 defended, 70% confidence

## EVE SDK Integration (2026-03-23~24)

### Task 1: item_valuation.move (2026-03-23) ✅
- `ValuationRegistry` (Table-based admin oracle): `set_item_price`, `batch_set_item_prices`, LTV ratio
- `estimate_value(type_id, quantity)`, `collateral_value(type_id, quantity)` — reserved for future items-as-collateral
- errors.move: 4 new codes (65 SSU, 70-72 valuation) + 4 accessors
- init.move: `create_and_share_valuation_registry(ctx)` added
- 10 tests (set/get, LTV, batch, update, 3 monkey tests)

### Task 2: ssu_extension.move (2026-03-24) ✅
- **Auth witness**: `public struct Auth has drop {}` — SSU owner opts in via `storage_unit::authorize_extension<Auth>()`
- **5 entry wrappers**: `purchase_via_ssu`, `claim_via_ssu`, `self_destruct_claim_via_ssu`, `renew_via_ssu`, `cancel_via_ssu`
- **SSUInsuranceEvent**: `(ssu_id, operation, policy_id, actor)` — tracks SSU-routed operations
- **Design**: thin wrappers only — `assert_ssu_online()` + delegate to underwriting/claims + emit event
- 2 tests (online SSU purchase success, offline SSU rejection)
- **Plan vs Reality fixes**:
  - `network_node::anchor()`: `location_hash` BEFORE fuel params (plan had wrong order)
  - `borrow_owner_cap` not `receive_owner_cap` (hot-potato pattern)
  - `deposit_fuel_test()`: test-only version, no `admin_acl`/`ctx` params
  - `create_character()`: needs `registry`, `tribe_id`, `name` params (plan used old signature)
  - SSU tests need `configure_assembly_energy` + `register_server_address` in setup

### Remaining (not yet started)
- Task 3: Move build verification (done implicitly — 114 tests passing)
- Tasks 4-7: Frontend (@evefrontier/dapp-kit, PTB, hooks, pages)
- Task 8: Deploy v6 (fresh publish — new shared object ValuationRegistry)
- Task 9: Update progress.md

## Known Risks / Limitations

1. **Single-package deployment**: world + wreckage-core + wreckage-protocol merged into one package. Cannot independently upgrade world or core. Acceptable for hackathon MVP.
2. **World contracts fork**: Local fork of `evefrontier/world-contracts` with added accessor functions. If upstream changes, fork needs manual sync.
3. **NCB off-by-one**: Claim resets streak to 0, next renewal increments to 1. Minor, MVP acceptable.
4. **Retroactive config validation**: Admin 改 ProtocolConfig hard limits 後，既有 pool configs 不會自動驗證。需手動 update_pool_config 觸發。
5. **Needs redeploy**: 新增 `emergency_withdraw` 函式需重新部署到 testnet（無 struct 變更，可 upgrade）

## Architecture Decisions

- **AdminCap pattern**: Single admin capability, transferred at init. No multi-sig.
- **u64 LP shares**: OTW only allows one Supply, so LP tracking uses u64 counters instead of coin-based shares.
- **Shared objects**: ProtocolConfig, PolicyRegistry, ClaimRegistry, AuctionRegistry, RiskPool — all shared, no `store` ability.
- **`create_and_share_*` pattern**: Structs without `store` must be shared in their defining module.
- **Version field**: All shared objects have version for future upgradeability.

## Future: Generic Phantom Pool Refactor (Approach C)

**Status**: Planned, not yet implemented
**Recorded**: 2026-03-26

### Current Design
`RiskPool` is a single non-generic type. All tiers share the same on-chain type, distinguished only by internal `config.risk_tier: u8`. Pool discovery relies on `PoolCreatedEvent` indexing (Approach B).

### Proposed Design
```move
public struct TIER_LOW has drop {}
public struct TIER_MED has drop {}
public struct TIER_HIGH has drop {}

public struct RiskPool<phantom T> has key { ... }
```

Each tier becomes a distinct on-chain type → queryable by type string without event indexing.

### Benefits
- Type-level query: `suix_queryObjects({ StructType: "...::RiskPool<...::TIER_LOW>" })`
- Compile-time tier safety: cannot pass wrong pool to wrong function
- Composability: other protocols can reference `RiskPool<TIER_LOW>` specifically

### Cost
- 30+ function signatures change (`&RiskPool` → `&RiskPool<T>`)
- All tests must add type parameters
- All frontend PTB builders need type arguments
- Cannot dynamically add new tiers at runtime (each new tier = code change + redeploy)

### When to Trigger
- When needing permissionless pool creation
- When cross-protocol composability requires type-level pool distinction
- When event indexer reliability becomes a concern
