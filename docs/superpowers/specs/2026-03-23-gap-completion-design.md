# Gap Completion Design — Wreckage Insurance Protocol

**Date**: 2026-03-23
**Status**: Approved
**Scope**: Complete unimplemented spec features + redeploy v5

## Context

Cross-referencing README/spec against implementation revealed 7 gaps. This spec covers all changes needed to reach full spec compliance.

## 1. cancel_policy

### Signature
```move
public fun cancel_policy(
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

### Behavior
- Checks: `status == active` (no pause check — see rationale below)
- **Pause rationale**: `cancel_policy` is allowed even during `is_policy_paused`. Unlike `expire_policy` (permissionless, could be weaponized to mass-release reservations during crisis), cancel is owner-initiated voluntary exit — the user is giving up coverage, which is safe during emergencies.
- Actions:
  1. `policy.set_status(STATUS_CANCELLED)`
  2. `policy_registry.unregister_policy(character_id)` — frees one-policy-per-character slot
  3. `risk_pool.release_reservation(coverage_amount)` — frees pool reserved capacity
  4. Emit `PolicyCancelledEvent { policy_id, character_id, timestamp }`
- **No premium refund** — premium stays in pool
- Ownership enforced by SUI runtime (`&mut` on owned object = only owner can call)

### Event
```move
public struct PolicyCancelledEvent has copy, drop {
    policy_id: ID,
    character_id: TenantItemId,
    cancelled_at: u64,
}
```

### Error Code
- `ECancellationNotAllowed` — if policy not active

## 2. Protocol Fee on Premium

### Behavior
In `purchase_policy` and `renew_policy`, before sending premium to pool:

```
fee_amount = (total_premium as u128) * (config.protocol_fee_bps() as u128) / 10000
pool_amount = total_premium - fee_amount
```

- If `fee_amount > 0`: split coin, `transfer::public_transfer(fee_coin, config.treasury())`
- Remainder goes to `risk_pool.collect_premium()`
- Default `protocol_fee_bps = 2000` (20%)

### Edge Cases
- `protocol_fee_bps = 0` → no split, entire premium to pool
- Rounding: integer division floors → pool gets rounding benefit
- u128 intermediate: no overflow risk (max premium bounded by max_coverage_limit)

### Behavioral Change
- `RiskPool.total_premiums_collected` will now track net (post-fee) amount, not gross premium
- LP share value is derived from `total_liquidity` (Balance<SUI>), not `total_premiums_collected`, so LP withdrawal math is unaffected
- Pool deposit/withdraw UI should display effective premium retention rate (80% of gross) so LPs understand yield impact
- Frontend analytics using `total_premiums_collected` should label it as "net premiums (after protocol fee)"

## 3. NCB Off-by-one Fix

### Struct Change
`InsurancePolicy` adds field:
```move
claims_at_last_renewal: u8,  // initialized to 0 at purchase
```

### Accessor
```move
public fun claims_at_last_renewal(p: &InsurancePolicy): u8 { p.claims_at_last_renewal }
```

### Mutator (package-only)
```move
public(package) fun set_claims_at_last_renewal(p: &mut InsurancePolicy, val: u8) {
    p.claims_at_last_renewal = val;
}
```

### Logic Change in renew_policy
The NCB check runs on **every renewal** (not just expired renewals), replacing the existing conditional streak increment:

```
// Replaces the old: if (now >= expires_at) { increment_no_claim_streak() }
if claim_count > claims_at_last_renewal:
    // Claim happened since last renewal — penalty: skip streak increment
    set_claims_at_last_renewal(claim_count)
else:
    // No new claims — reward: increment streak
    increment_no_claim_streak()
    set_claims_at_last_renewal(claim_count)  // sync (no-op if equal)
```

### Verification Matrix

| Scenario | claim_count | claims_at_last_renewal | streak before | Action | streak after |
|----------|------------|----------------------|---------------|--------|-------------|
| First renew, no claims | 0 | 0 | 0 | increment | 1 |
| Claim, then renew | 1 | 0 | 0 | skip + sync(1) | 0 |
| Second renew after claim | 1 | 1 | 0 | increment | 1 |
| Two claims, then renew | 2 | 0 | 0 | skip + sync(2) | 0 |
| Above, second renew | 2 | 2 | 0 | increment | 1 |
| Steady renewals, no claims | 0 | 0 | 3 | increment | 4 |
| Claim, renew(skip), claim again, renew | 2 | 1 | 0 | skip + sync(2) | 0 |
| Above, second renew | 2 | 2 | 0 | increment | 1 |

## 4. Frontend: Policy Actions

### PolicyDetailPage Action Bar
Add action buttons to existing `PolicyDetailPage.tsx`, visibility based on policy state:

| Action | Condition | UI |
|--------|-----------|-----|
| **Renew** | status=active OR (expired within grace period) | Payment confirmation dialog, shows NCB discount |
| **Transfer** | status=active, not in cooldown | Input target character ID, warning about streak reset |
| **Cancel** | status=active | Confirmation dialog with "no refund" warning |
| **Expire** | status=active, past expires_at | One-click, confirmation |

### PTB Builder
Add `buildCancelPolicy()` to `ptb/insure.ts`:
```typescript
export function buildCancelPolicy(tx: Transaction, args: {
  policy: string;
  config: string;
  pool: string;
  policyRegistry: string;
  clock?: string; // defaults to '0x6'
}): Transaction
```

### Existing Builders (confirm present)
- `buildRenewPolicy` ✅ in ptb/insure.ts
- `buildTransferPolicy` ✅ in ptb/insure.ts
- `buildExpirePolicy` ✅ in ptb/insure.ts

### Frontend Bug Fixes (found during review)
- `PolicyDetailPage.tsx`: Fix field name mapping — `start_epoch`/`end_epoch` → `created_at`/`expires_at` (matches Move struct)
- `PolicyDetailPage.tsx`: Add `cancelled` to `STATUS_BADGE` map (status=3)

## 5. Frontend: Auction Actions Confirmation

Verify `AuctionDetailPage.tsx` has:
- Settle button (bidding ended, has bids)
- Buyout button (buyout phase, no bids)
- Destroy button (buyout expired, no bids)

If missing, add corresponding buttons + PTB calls.

## 6. Tests

### New Tests (underwriting_tests.move)
- `test_cancel_policy_success` — cancel active policy, verify status + registry removal + pool reservation release
- `test_cancel_policy_not_active` — cancel expired/claimed policy → abort
- `test_protocol_fee_on_purchase` — verify fee split (treasury gets 20%, pool gets 80% of premium)
- `test_protocol_fee_on_renewal` — same for renewal
- `test_protocol_fee_zero` — fee_bps=0 → entire premium to pool
- `test_ncb_skip_after_claim` — claim → renew → streak stays 0
- `test_ncb_recover_after_penalty` — claim → renew (skip) → renew (increment) → streak=1
- `test_ncb_no_claim_normal` — no claims → renew → streak increments normally

### Updated Tests
- Existing tests that check `total_premiums_collected` may need adjustment (now tracks net, not gross)
- E2E tests should include cancel in lifecycle flow

## 7. Deployment

- **Fresh publish required** (struct change: `claims_at_last_renewal` added to `InsurancePolicy`)
- **All existing on-chain objects (policies, pools, registries) from v4 are abandoned** — fresh publish creates new shared objects via `init`. This is acceptable for hackathon; production would require migration.
- Update `deployment.json` + `frontend/src/lib/contracts.ts` with new PackageID + object IDs
- Run `tsc --noEmit` to verify frontend compiles
- Verify all shared objects on-chain

## Non-Goals (Explicitly Excluded)

- SalvageNFT redemption/burn-to-redeem (spec says "MVP disables")
- Fleet Insurance actual implementation (mock only, spec says "future")
- Bounty Escrow actual implementation (mock only, spec says "future")
- Subrogation on-chain bounty transfer (event only, spec says "future")
- Demo Panel 12-step guided mode (current 4-section sufficient for hackathon)
- Auction realtime callbacks (spec says "future")

## Change Summary

| File | Type | Changes |
|------|------|---------|
| policy.move | Struct + accessor | Add `claims_at_last_renewal: u8`, accessor, mutator |
| underwriting.move | Logic | Add `cancel_policy`, fee split in purchase/renew, NCB fix in renew |
| errors.move | Constant | Add `ECancellationNotAllowed` |
| underwriting_tests.move | Tests | 8 new tests |
| e2e_tests.move | Tests | Add cancel to lifecycle |
| PolicyDetailPage.tsx | UI | Action bar (renew/transfer/cancel/expire buttons) |
| ptb/insure.ts | PTB | Add `buildCancelPolicy` |
| AuctionDetailPage.tsx | UI | Confirm/add settle/buyout/destroy buttons |
| deployment.json | Config | New PackageID + object IDs |
| contracts.ts | Config | New PackageID + object IDs |
