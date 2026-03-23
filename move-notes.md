# Wreckage Insurance Protocol — Move Notes

## Deployment (Testnet)

- **Network**: testnet
- **Date**: 2026-03-21
- **PackageID**: `0x053c5c2ae486c33e6e91d9169ea79385211d46373224953ad752ecf576786f77`
- **Deployer**: `0x1509b5fdf09296b2cf749a710e36da06f5693ccd5b2144ad643b3a895abcbc4c`
- **Gas**: ~0.784 SUI
- **Deployment mode**: Single-package (world + wreckage-core + wreckage-protocol merged via `--with-unpublished-dependencies`)

### Key Object IDs

| Object | ID |
|--------|----|
| ProtocolConfig | `0xaf987a7f3e744ed40d3c5fa8df827d9968bc305b78137d1b805bab4c65ba28bf` |
| PolicyRegistry | `0x4b1ad0fb5d335aefaa47d46fff10e5fc30336f24138e104cb8fb26ab1f73d0bc` |
| ClaimRegistry | `0xbe6e14a5b0028c84bd2af59ff96f41a5d4878783a4592341b0711df287fcab40` |
| AuctionRegistry | `0xba5a4846807889ff322983a4008069fb417b780f4cc94ec8f44e5d5a8216697d` |
| UpgradeCap | `0xa9d9767d5f982777b08541319019e5d36e4f5e6b7f8c442a2eaa4d68a0c0c935` |

## Module Summary (16 modules in wreckage-protocol)

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
| `integration` | Mock events: SalvageBountyRequest, FleetInsuranceRequest, ClaimCompletedHook |

## Tests

- **Total**: 94 tests all passing
- wreckage-core modules (merged): 10 tests (policy 3, pool_config 7, rider 3)
- config: 12, registry: 6, risk_pool: 11, anti_fraud: 12, underwriting: 11
- claims: 6, salvage: 2, auction: 8, e2e: 13

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
