# Gap Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all unimplemented spec features: cancel_policy, protocol fee on premium, NCB off-by-one fix, frontend policy actions, auction destroy button, and frontend bug fixes.

**Architecture:** Changes span 3 Move source files + 1 Move test file + 3 frontend files. All contract changes are function-level except one struct field addition (`claims_at_last_renewal: u8` on InsurancePolicy). Fresh publish required.

**Tech Stack:** Sui Move 2024, React + TypeScript, @mysten/dapp-kit-react, @mysten/sui

**Spec:** `docs/superpowers/specs/2026-03-23-gap-completion-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `contracts/wreckage-protocol/sources/errors.move` | Modify | Add `ECancellationNotAllowed` error |
| `contracts/wreckage-protocol/sources/policy.move` | Modify | Add `claims_at_last_renewal` field + accessor + mutator + `PolicyCancelledEvent` |
| `contracts/wreckage-protocol/sources/underwriting.move` | Modify | Add `cancel_policy`, fee split in purchase/renew, NCB fix in renew |
| `contracts/wreckage-protocol/tests/underwriting_tests.move` | Modify | 8 new tests + update existing premium assertions |
| `frontend/src/lib/ptb/insure.ts` | Modify | Add `buildCancelPolicy` |
| `frontend/src/hooks/useInsurancePolicy.ts` | Modify | Add `useCancelPolicy`, `useTransferPolicy`, `useExpirePolicy` hooks |
| `frontend/src/pages/insure/PolicyDetailPage.tsx` | Modify | Action bar + field name fixes + cancelled badge |
| `frontend/src/pages/salvage/AuctionDetailPage.tsx` | Modify | Add destroy button for unsold auctions |

---

### Task 1: Add error code + policy struct changes

**Files:**
- Modify: `contracts/wreckage-protocol/sources/errors.move:117` (after last accessor)
- Modify: `contracts/wreckage-protocol/sources/policy.move:28-29` (struct), `:120-121` (accessors), `:131` (mutators), `:32-41` (events)

- [ ] **Step 1: Add ECancellationNotAllowed to errors.move**

After line 82 (`EInvalidConfig`), add:
```move
#[error(code = 63)]
const ECancellationNotAllowed: vector<u8> = b"Policy cannot be cancelled";
```

After line 117 (`invalid_config`), add:
```move
public fun cancellation_not_allowed(): u64 { 63 }
```

- [ ] **Step 2: Add `claims_at_last_renewal` field to InsurancePolicy struct**

In `policy.move`, add field after `pool_reserved: u64,` (line 28):
```move
    claims_at_last_renewal: u8,
```

- [ ] **Step 3: Initialize field in constructor**

In `policy.move` `create()` function (line 74-91), add after `pool_reserved: coverage_amount,`:
```move
        claims_at_last_renewal: 0,
```

- [ ] **Step 4: Add accessor and mutator**

After `public fun pool_reserved(...)` (line 120), add:
```move
public fun claims_at_last_renewal(p: &InsurancePolicy): u8 { p.claims_at_last_renewal }
```

After `public(package) fun set_pool_reserved(...)` (line 131), add:
```move
public(package) fun set_claims_at_last_renewal(p: &mut InsurancePolicy, val: u8) { p.claims_at_last_renewal = val; }
```

- [ ] **Step 5: Add PolicyCancelledEvent**

After `PolicyTransferredEvent` (line 54), add:
```move
public struct PolicyCancelledEvent has copy, drop {
    policy_id: ID,
    character_id: TenantItemId,
    cancelled_at: u64,
}
```

Add emitter after `emit_transferred_event` (line 158):
```move
public(package) fun emit_cancelled_event(policy_id: ID, character_id: TenantItemId, cancelled_at: u64) {
    sui::event::emit(PolicyCancelledEvent { policy_id, character_id, cancelled_at });
}
```

- [ ] **Step 6: Update destroy() to handle new field**

The existing destructure `let InsurancePolicy { id, .. } = p;` (line 162) already uses `..` so no change needed. Verify it compiles.

- [ ] **Step 7: Build to verify**

Run: `cd contracts/wreckage-protocol && sui move build`
Expected: Build succeeds (tests may fail until Task 2 updates them)

- [ ] **Step 8: Commit**

```bash
git add contracts/wreckage-protocol/sources/errors.move contracts/wreckage-protocol/sources/policy.move
git commit -m "feat: add claims_at_last_renewal field, PolicyCancelledEvent, ECancellationNotAllowed error"
```

---

### Task 2: Implement cancel_policy + protocol fee + NCB fix in underwriting.move

**Files:**
- Modify: `contracts/wreckage-protocol/sources/underwriting.move`

- [ ] **Step 1: Add cancel_policy function**

After `expire_policy` (after line 260), add:

```move
// === Cancel ===
/// Owner cancels active policy. No refund. Releases reservation, unregisters from registry.
/// Allowed even during pause (owner-initiated voluntary exit).
public fun cancel_policy(
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    clock: &Clock,
    _ctx: &mut TxContext,
) {
    config::assert_version(config);
    registry::assert_policy_registry_version(policy_registry);
    risk_pool::assert_version(pool);

    // Must be active (not expired/claimed/cancelled)
    assert!(policy.is_active(), errors::cancellation_not_allowed());

    let now = clock.timestamp_ms() / 1000;

    // Mark cancelled
    policy.set_status(policy::status_cancelled());

    // Unregister from PolicyRegistry
    registry::unregister_policy(policy_registry, policy.insured_character_id());

    // Release remaining coverage reservation
    let remaining = policy.pool_reserved();
    if (remaining > 0) {
        risk_pool::release_reservation(pool, remaining);
        policy.set_pool_reserved(0);
    };

    // Emit event
    policy::emit_cancelled_event(policy.id(), policy.insured_character_id(), now);
}
```

- [ ] **Step 2: Add protocol fee split to purchase_policy**

In `purchase_policy`, replace lines 75-77:
```move
    // Split exact premium and collect into pool
    let premium_coin = coin::split(&mut payment, total_premium, ctx);
    risk_pool::collect_premium(pool, premium_coin.into_balance());
```

With:
```move
    // Split exact premium
    let mut premium_coin = coin::split(&mut payment, total_premium, ctx);

    // Protocol fee split: fee to treasury, remainder to pool
    let fee_bps = config.protocol_fee_bps();
    if (fee_bps > 0) {
        let fee_amount = (((total_premium as u128) * (fee_bps as u128) / 10000) as u64);
        if (fee_amount > 0) {
            let fee_coin = coin::split(&mut premium_coin, fee_amount, ctx);
            transfer::public_transfer(fee_coin, config.treasury());
        };
    };
    risk_pool::collect_premium(pool, premium_coin.into_balance());
```

- [ ] **Step 3: Add protocol fee split to renew_policy**

In `renew_policy`, replace lines 162-163:
```move
    let premium_coin = coin::split(&mut payment, renewal_premium, ctx);
    risk_pool::collect_premium(pool, premium_coin.into_balance());
```

With:
```move
    let mut premium_coin = coin::split(&mut payment, renewal_premium, ctx);

    // Protocol fee split
    let fee_bps = config.protocol_fee_bps();
    if (fee_bps > 0) {
        let fee_amount = (((renewal_premium as u128) * (fee_bps as u128) / 10000) as u64);
        if (fee_amount > 0) {
            let fee_coin = coin::split(&mut premium_coin, fee_amount, ctx);
            transfer::public_transfer(fee_coin, config.treasury());
        };
    };
    risk_pool::collect_premium(pool, premium_coin.into_balance());
```

- [ ] **Step 4: Implement NCB fix in renew_policy**

Replace lines 130-136 (the streak increment block):
```move
    // M-7: If time-expired, enforce renewal window (cannot renew indefinitely after expiry)
    if (now >= policy.expires_at()) {
        let grace = pool_config.renewal_waiting_period();
        assert!(now <= policy.expires_at() + grace, errors::renewal_waiting_period());
        // Claim-free expiry → increment streak
        policy.increment_no_claim_streak();
    };
```

With:
```move
    // M-7: If time-expired, enforce renewal window (cannot renew indefinitely after expiry)
    if (now >= policy.expires_at()) {
        let grace = pool_config.renewal_waiting_period();
        assert!(now <= policy.expires_at() + grace, errors::renewal_waiting_period());
    };

    // NCB fix: skip streak increment if claims occurred since last renewal
    if (policy.claim_count() > policy.claims_at_last_renewal()) {
        // Penalty served: claims happened since last renewal, no streak increment
        policy.set_claims_at_last_renewal(policy.claim_count());
    } else {
        // No new claims: reward with streak increment
        policy.increment_no_claim_streak();
        policy.set_claims_at_last_renewal(policy.claim_count());
    };
```

- [ ] **Step 5: Also fix expire_policy NCB logic**

In `expire_policy`, the streak increment at line 243 should also use the new NCB logic. Replace:
```move
    // Claim-free expiry → increment streak
    policy.increment_no_claim_streak();
```

With:
```move
    // NCB fix: skip streak increment if claims occurred since last renewal
    if (policy.claim_count() > policy.claims_at_last_renewal()) {
        policy.set_claims_at_last_renewal(policy.claim_count());
    } else {
        policy.increment_no_claim_streak();
        policy.set_claims_at_last_renewal(policy.claim_count());
    };
```

- [ ] **Step 6: Build to verify**

Run: `cd contracts/wreckage-protocol && sui move build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add contracts/wreckage-protocol/sources/underwriting.move
git commit -m "feat: add cancel_policy, protocol fee split, NCB off-by-one fix"
```

---

### Task 3: Update tests + add new tests

**Files:**
- Modify: `contracts/wreckage-protocol/tests/underwriting_tests.move`

- [ ] **Step 1: Update existing tests for protocol fee**

The protocol fee (default 2000 bps = 20%) changes what `total_premiums_collected` records. In `test_purchase_policy_success` (line 127), the pool now receives 80% of premium:

Replace:
```move
    assert!(risk_pool::total_premiums_collected(&pool) == EXPECTED_BASE_PREMIUM);
```

With:
```move
    // Protocol fee: 20% to treasury, 80% to pool
    let expected_pool_premium = EXPECTED_BASE_PREMIUM - (EXPECTED_BASE_PREMIUM * 2000 / 10000);
    assert!(risk_pool::total_premiums_collected(&pool) == expected_pool_premium);
```

Similarly in `test_purchase_with_self_destruct_rider` (line 200), replace:
```move
    assert!(risk_pool::total_premiums_collected(&pool) == total);
```

With:
```move
    let expected_pool = total - (total * 2000 / 10000);
    assert!(risk_pool::total_premiums_collected(&pool) == expected_pool);
```

- [ ] **Step 2: Update NCB renewal test**

In `test_renew_with_ncb_discount` (line 243-246): the renewed premium also has fee deducted from what goes to pool, but `premium_paid` on the policy still tracks the gross premium. The assertion `policy::premium_paid(&new_policy) == 450_000_000` should still hold since `set_renewal_data` stores the renewal_premium (gross). No change needed for policy assertions.

However, the NCB behavior changes. With the fix, the first renewal after purchase (no claims, claims_at_last_renewal=0, claim_count=0) should still increment streak because `claim_count == claims_at_last_renewal`. Verify: `0 > 0` is false → else branch → increment. Streak = 1. OK, no change needed.

- [ ] **Step 3: Add cancel_policy tests**

Append after the last test in `underwriting_tests.move`:

```move
// ============================================================
// Cancel Tests
// ============================================================

#[test]
fun test_cancel_policy_success() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Verify initial state
    let char_key = character.key();
    assert!(wreckage_protocol::registry::has_active_policy(&policy_reg, char_key));
    assert!(risk_pool::reserved_amount(&pool) == COVERAGE);

    // Cancel
    underwriting::cancel_policy(&mut p, &cfg, &mut pool, &mut policy_reg, &clk, scenario.ctx());

    // Verify cancelled state
    assert!(policy::status(&p) == policy::status_cancelled());
    assert!(!wreckage_protocol::registry::has_active_policy(&policy_reg, char_key));
    assert!(risk_pool::reserved_amount(&pool) == 0);
    assert!(policy::pool_reserved(&p) == 0);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_cancel_policy_not_active() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Expire first
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    underwriting::expire_policy(&mut p, &mut policy_reg, &mut pool, &cfg, &clk);

    // Try to cancel expired policy → should abort
    underwriting::cancel_policy(&mut p, &cfg, &mut pool, &mut policy_reg, &clk, scenario.ctx());

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
```

- [ ] **Step 4: Add protocol fee tests**

```move
// ============================================================
// Protocol Fee Tests
// ============================================================

#[test]
fun test_protocol_fee_on_purchase() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Default protocol_fee_bps = 2000 (20%)
    // Premium = 500_000_000 (500M MIST = 0.5 SUI)
    // Fee = 500M * 2000 / 10000 = 100_000_000 (100M MIST)
    // Pool gets = 400_000_000 (400M MIST)
    assert!(risk_pool::total_premiums_collected(&pool) == 400_000_000);

    // Treasury received fee via transfer (checked by pool not having it)
    // Policy still records gross premium
    assert!(policy::premium_paid(&p) == EXPECTED_BASE_PREMIUM);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_protocol_fee_zero() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    // Set fee to 0
    scenario.next_tx(ADMIN);
    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    config::set_protocol_fee_bps(&cap, &mut cfg, 0);
    scenario.return_to_sender(cap);

    scenario.next_tx(USER);
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // No fee: pool gets entire premium
    assert!(risk_pool::total_premiums_collected(&pool) == EXPECTED_BASE_PREMIUM);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
```

- [ ] **Step 5: Add NCB fix tests**

```move
// ============================================================
// NCB Fix Tests
// ============================================================

#[test]
fun test_ncb_skip_after_claim() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let mut cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Simulate a claim: increment claim_count, reset streak
    p.increment_claim_count();
    p.reset_no_claim_streak();
    assert!(policy::claim_count(&p) == 1);
    assert!(policy::no_claim_streak(&p) == 0);
    assert!(policy::claims_at_last_renewal(&p) == 0);

    // Renew — should skip streak increment (claim_count 1 > claims_at_last_renewal 0)
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut p, &cfg, &mut pool, pay, &clk, scenario.ctx());

    assert!(policy::no_claim_streak(&p) == 0); // NOT incremented
    assert!(policy::claims_at_last_renewal(&p) == 1); // synced

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_ncb_recover_after_penalty() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Simulate claim
    p.increment_claim_count();
    p.reset_no_claim_streak();

    // First renewal: penalty (skip)
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    let pay1 = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut p, &cfg, &mut pool, pay1, &clk, scenario.ctx());
    assert!(policy::no_claim_streak(&p) == 0);
    assert!(policy::claims_at_last_renewal(&p) == 1);

    // Second renewal: no new claims → recover, streak = 1
    let expiry_ms2 = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms2);
    let pay2 = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut p, &cfg, &mut pool, pay2, &clk, scenario.ctx());
    assert!(policy::no_claim_streak(&p) == 1); // recovered!
    assert!(policy::claims_at_last_renewal(&p) == 1);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
```

- [ ] **Step 6: Add test_protocol_fee_on_renewal**

```move
#[test]
fun test_protocol_fee_on_renewal() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    let pool_after_purchase = risk_pool::total_premiums_collected(&pool);

    // Advance past expiry and renew
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    let renewal_pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut p, &cfg, &mut pool, renewal_pay, &clk, scenario.ctx());

    // Renewal premium (with NCB streak=1 → 10% discount): 500M * 0.9 = 450M
    // Protocol fee: 450M * 20% = 90M → pool gets 360M
    let renewal_pool_amount = 450_000_000 - (450_000_000 * 2000 / 10000);
    assert!(risk_pool::total_premiums_collected(&pool) == pool_after_purchase + renewal_pool_amount);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
```

- [ ] **Step 7: Add test_ncb_no_claim_normal**

```move
#[test]
fun test_ncb_no_claim_normal() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // No claims, renew 3 times → streak should increment each time
    let mut i = 0;
    while (i < 3) {
        let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
        clock::set_for_testing(&mut clk, expiry_ms);
        let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
        underwriting::renew_policy(&mut p, &cfg, &mut pool, pay, &clk, scenario.ctx());
        i = i + 1u64;
    };

    assert!(policy::no_claim_streak(&p) == 3);
    assert!(policy::claims_at_last_renewal(&p) == 0);
    assert!(policy::claim_count(&p) == 0);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
```

- [ ] **Step 8: Run all tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass (existing + 8 new)

- [ ] **Step 9: Commit**

```bash
git add contracts/wreckage-protocol/tests/underwriting_tests.move
git commit -m "test: add cancel_policy, protocol fee, NCB fix tests"
```

---

### Task 4: Frontend — PTB builder + hooks

**Files:**
- Modify: `frontend/src/lib/ptb/insure.ts`
- Modify: `frontend/src/hooks/useInsurancePolicy.ts`

- [ ] **Step 1: Add buildCancelPolicy to ptb/insure.ts**

After `buildExpirePolicy` (line 97), add:

```typescript
export function buildCancelPolicy(args: {
  policyId: string;
  poolId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::underwriting::cancel_policy`,
    arguments: [
      tx.object(args.policyId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object(CLOCK),
    ],
  });

  return tx;
}
```

- [ ] **Step 2: Add hooks to useInsurancePolicy.ts**

Add imports at top (line 8-11):
```typescript
import {
  buildPurchasePolicy,
  buildRenewPolicy,
  buildTransferPolicy,
  buildExpirePolicy,
  buildCancelPolicy,
} from '../lib/ptb/insure';
```

After `useRenewPolicy` (after line 128), add three hooks:

```typescript
export function useCancelPolicy() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { policyId: string; poolId: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildCancelPolicy(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        await queryClient.invalidateQueries({ queryKey: ['policyDetail'] });
        return result.Transaction.digest;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}

export function useTransferPolicy() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { policyId: string; recipient: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildTransferPolicy(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        await queryClient.invalidateQueries({ queryKey: ['policyDetail'] });
        return result.Transaction.digest;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}

export function useExpirePolicy() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { policyId: string; poolId: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildExpirePolicy(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        await queryClient.invalidateQueries({ queryKey: ['policyDetail'] });
        return result.Transaction.digest;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}
```

- [ ] **Step 3: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/ptb/insure.ts frontend/src/hooks/useInsurancePolicy.ts
git commit -m "feat: add cancel/transfer/expire PTB builder and hooks"
```

---

### Task 5: Frontend — PolicyDetailPage action bar + bug fixes

**Files:**
- Modify: `frontend/src/pages/insure/PolicyDetailPage.tsx`

- [ ] **Step 1: Fix STATUS_BADGE — add cancelled**

Replace lines 20-24:
```typescript
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  expired: 'bg-gray-500/20 text-gray-400',
  claimed: 'bg-blue-500/20 text-blue-400',
};
```

With:
```typescript
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  expired: 'bg-gray-500/20 text-gray-400',
  claimed: 'bg-blue-500/20 text-blue-400',
  cancelled: 'bg-orange-500/20 text-orange-400',
};
```

- [ ] **Step 2: Fix field name mapping**

Replace lines 84-85:
```typescript
  const startEpoch = Number(fields?.start_epoch ?? fields?.startEpoch ?? 0);
  const endEpoch = Number(fields?.end_epoch ?? fields?.endEpoch ?? 0);
```

With:
```typescript
  const createdAt = Number(fields?.created_at ?? fields?.createdAt ?? 0);
  const expiresAt = Number(fields?.expires_at ?? fields?.expiresAt ?? 0);
```

Also fix other wrong field names (lines 81, 86, 89, 90):

Replace:
```typescript
  const tier = Number(fields?.tier ?? 0) as RiskTier;
```
With:
```typescript
  const tier = Number(fields?.risk_tier ?? fields?.tier ?? 0) as RiskTier;
```

Replace:
```typescript
  const ncbStreak = Number(fields?.ncb_streak ?? fields?.ncbStreak ?? 0);
```
With:
```typescript
  const ncbStreak = Number(fields?.no_claim_streak ?? fields?.ncb_streak ?? 0);
```

Replace:
```typescript
  const owner: string = fields?.owner ?? '';
  const characterId: string = fields?.character_id ?? fields?.characterId ?? '';
```
With:
```typescript
  const characterId: string = fields?.insured_character_id ?? fields?.character_id ?? '';
```

(Remove `owner` — `InsurancePolicy` has no `owner` field; SUI ownership is implicit.)

Remove the Field rendering for `owner` (line 185):
```typescript
          {owner && <Field label="Owner" value={owner} mono />}
```

Update the Field labels in the grid (lines 171-172):
```typescript
          <Field label="Created At" value={createdAt ? new Date(createdAt * 1000).toLocaleString() : '—'} />
          <Field label="Expires At" value={expiresAt ? new Date(expiresAt * 1000).toLocaleString() : '—'} />
```

- [ ] **Step 3: Fix status derivation to handle numeric status**

Replace line 91-92:
```typescript
  const rawStatus = String(fields?.status ?? 'active').toLowerCase();
  const status = rawStatus.includes('active') ? 'active' : rawStatus.includes('claim') ? 'claimed' : 'expired';
```

With:
```typescript
  const rawStatus = fields?.status;
  const statusNum = typeof rawStatus === 'number' ? rawStatus : parseInt(String(rawStatus ?? '0'), 10);
  const status = statusNum === 0 ? 'active' : statusNum === 1 ? 'claimed' : statusNum === 2 ? 'expired' : statusNum === 3 ? 'cancelled' : 'expired';
```

- [ ] **Step 4: Add imports for new hooks**

Replace line 3:
```typescript
import { usePolicyDetail, useRenewPolicy } from '../../hooks/useInsurancePolicy';
```

With:
```typescript
import { usePolicyDetail, useRenewPolicy, useCancelPolicy, useTransferPolicy, useExpirePolicy } from '../../hooks/useInsurancePolicy';
```

- [ ] **Step 5: Add hook state + action handlers in component body**

After the existing `useRenewPolicy` hook call (line 48), add:

```typescript
  const { execute: cancel, isPending: cancelPending, error: cancelError } = useCancelPolicy();
  const { execute: transferPolicy, isPending: transferPending, error: transferError } = useTransferPolicy();
  const { execute: expire, isPending: expirePending, error: expireError } = useExpirePolicy();

  const [actionPoolId, setActionPoolId] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
```

Add handlers after `handleRenew`:

```typescript
  async function handleCancel() {
    if (!actionPoolId.trim()) { setToast({ type: 'error', msg: 'Pool ID required for cancel.' }); return; }
    setToast(null);
    try {
      const digest = await cancel({ policyId: objectId, poolId: actionPoolId.trim() });
      setToast({ type: 'success', msg: `Policy cancelled! Tx: ${digest}` });
    } catch { /* error from hook */ }
  }

  async function handleTransfer() {
    if (!transferRecipient.trim()) { setToast({ type: 'error', msg: 'Recipient address required.' }); return; }
    setToast(null);
    try {
      const digest = await transferPolicy({ policyId: objectId, recipient: transferRecipient.trim() });
      setToast({ type: 'success', msg: `Policy transferred! Tx: ${digest}` });
      setTransferRecipient('');
    } catch { /* error from hook */ }
  }

  async function handleExpire() {
    if (!actionPoolId.trim()) { setToast({ type: 'error', msg: 'Pool ID required for expire.' }); return; }
    setToast(null);
    try {
      const digest = await expire({ policyId: objectId, poolId: actionPoolId.trim() });
      setToast({ type: 'success', msg: `Policy expired! Tx: ${digest}` });
    } catch { /* error from hook */ }
  }
```

- [ ] **Step 6: Add action bar UI**

After the existing Renew form section (before the closing `</div>` of Actions around line 270), add:

```tsx
        {/* Pool ID for cancel/expire actions */}
        {status === 'active' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-200">Policy Actions</h2>

            {/* Shared Pool ID input */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Risk Pool Object ID</label>
              <input
                type="text"
                value={actionPoolId}
                onChange={(e) => setActionPoolId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="0x..."
              />
            </div>

            {/* Transfer */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Transfer to</label>
              <input
                type="text"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="Recipient address (0x...)"
              />
              <p className="text-xs text-gray-600">Warning: NCB streak will be reset and cooldown applied.</p>
              <button
                onClick={handleTransfer}
                disabled={transferPending}
                className="w-full py-2 rounded-lg text-sm font-semibold border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
              >
                {transferPending ? 'Transferring...' : 'Transfer Policy'}
              </button>
              {transferError && <p className="text-red-400 text-xs">{transferError}</p>}
            </div>

            {/* Cancel */}
            <div className="pt-3 border-t border-gray-800 space-y-2">
              <p className="text-xs text-red-400/80">Cancel is irreversible. Premium is NOT refunded.</p>
              <button
                onClick={handleCancel}
                disabled={cancelPending}
                className="w-full py-2 rounded-lg text-sm font-semibold border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {cancelPending ? 'Cancelling...' : 'Cancel Policy'}
              </button>
              {cancelError && <p className="text-red-400 text-xs">{cancelError}</p>}
            </div>
          </div>
        )}

        {/* Expire button — only if active and past expiry */}
        {status === 'active' && expiresAt > 0 && Date.now() / 1000 > expiresAt && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-gray-200">Expire Policy</h2>
            <p className="text-xs text-gray-500">This policy has passed its expiry date and can be formally expired.</p>
            {!actionPoolId.trim() && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Risk Pool Object ID</label>
                <input
                  type="text"
                  value={actionPoolId}
                  onChange={(e) => setActionPoolId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500"
                  placeholder="0x..."
                />
              </div>
            )}
            <button
              onClick={handleExpire}
              disabled={expirePending}
              className="w-full py-2 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 transition-colors"
            >
              {expirePending ? 'Expiring...' : 'Expire Policy'}
            </button>
            {expireError && <p className="text-red-400 text-xs">{expireError}</p>}
          </div>
        )}
```

- [ ] **Step 7: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/insure/PolicyDetailPage.tsx
git commit -m "feat: add cancel/transfer/expire actions + fix field names + cancelled badge"
```

---

### Task 6: Frontend — AuctionDetailPage destroy button

**Files:**
- Modify: `frontend/src/pages/salvage/AuctionDetailPage.tsx`

- [ ] **Step 1: Import buildDestroyUnsold and add hook**

Add to imports (line 7):
```typescript
import { buildDestroyUnsold } from '../../lib/ptb/auction';
```

The page currently doesn't have a `useDestroyUnsold` hook. Add inline handler pattern. After the existing `useBuyout` hook (line 38), add:

```typescript
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isDestroying, setIsDestroying] = useState(false);
```

Wait — `useDAppKit` etc. are already available via `useSettleAuction`/`useBuyout` hooks. To keep it DRY, add a dedicated hook import. Actually, looking at the hooks file, there's no `useDestroyUnsold`. Let's add it inline.

Add imports at top:
```typescript
import { useDAppKit, useCurrentClient } from '@mysten/dapp-kit-react';
import { useQueryClient } from '@tanstack/react-query';
```

Wait — `useDAppKit` is not imported yet. Actually `useCurrentAccount` is already imported. Let me check what's needed. The existing hooks (`useSettleAuction`, `useBuyout`) encapsulate the dAppKit calls. For destroy, we need a new hook.

Better approach: add `useDestroyUnsold` to `useAuction.ts` hooks file.

- [ ] **Step 1 (revised): Add useDestroyUnsold hook to useAuction.ts**

In `frontend/src/hooks/useAuction.ts`, add import for `buildDestroyUnsold`:
```typescript
import { buildPlaceBid, buildSettleAuction, buildBuyout, buildDestroyUnsold } from '../lib/ptb/auction';
```

After `useBuyout` (after line 144), add:
```typescript
export function useDestroyUnsold() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { auctionId: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildDestroyUnsold(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['auction'] });
        await queryClient.invalidateQueries({ queryKey: ['auctionRegistry'] });
        return result.Transaction.digest;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}
```

- [ ] **Step 2: Add destroy button to AuctionDetailPage**

Import the new hook in AuctionDetailPage.tsx (line 4):
```typescript
import { useAuctionDetail, useSettleAuction, useBuyout, useDestroyUnsold } from '../../hooks/useAuction';
```

Add hook call after existing hooks (line 38):
```typescript
  const { execute: destroy, isPending: isDestroying, error: destroyError } = useDestroyUnsold();
```

Add handler after `handleBuyout`:
```typescript
  async function handleDestroy() {
    setTxError(null);
    try {
      const digest = await destroy({ auctionId: auction.id });
      setTxHash(digest ?? null);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : 'Destroy failed');
    }
  }
```

Replace lines 245-253 (the static settled/unsold text):
```tsx
      {auction.status === 'settled' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-gray-400">
            Auction settled. Winner: {auction.highestBidder ? truncate(auction.highestBidder) : 'N/A'}
          </p>
        </div>
      )}

      {auction.status === 'unsold' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-gray-400 text-center">Auction ended with no bids.</p>
          <button
            onClick={handleDestroy}
            disabled={isDestroying}
            className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
          >
            {isDestroying ? 'Destroying...' : 'Destroy Unsold NFT'}
          </button>
          {destroyError && <p className="text-red-400 text-sm text-center">{destroyError}</p>}
        </div>
      )}
```

- [ ] **Step 3: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useAuction.ts frontend/src/pages/salvage/AuctionDetailPage.tsx
git commit -m "feat: add destroy unsold auction button"
```

---

### Task 7: Build + test full suite

- [ ] **Step 1: Run Move tests**

Run: `cd contracts/wreckage-protocol && sui move test`
Expected: All tests pass (previous 94 + 6 new = ~100 tests)

- [ ] **Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run Move build (pre-deploy check)**

Run: `cd contracts/wreckage-protocol && sui move build`
Expected: Build succeeds

- [ ] **Step 4: Commit any final fixes if needed**

---

### Task 8: Deploy v5 to Testnet

**Files:**
- Modify: `contracts/deployment.json`
- Modify: `frontend/src/lib/contracts.ts`

- [ ] **Step 1: Deploy**

Run: `cd contracts/wreckage-protocol && sui client publish --with-unpublished-dependencies --gas-budget 1000000000`

Record: PackageID, Tx Digest, shared object IDs from output.

- [ ] **Step 2: Update deployment.json**

Update `contracts/deployment.json` with new PackageID, shared object IDs (ProtocolConfig, RiskPool tiers, ClaimRegistry, PolicyRegistry, AuctionRegistry, AdminCap).

- [ ] **Step 3: Update contracts.ts**

Update `frontend/src/lib/contracts.ts` with matching PackageID and SHARED_OBJECTS.

- [ ] **Step 4: Verify frontend compiles with new IDs**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Verify shared objects on-chain**

Run: `sui client object <PackageID>` and spot-check each shared object.

- [ ] **Step 6: Commit**

```bash
git add contracts/deployment.json frontend/src/lib/contracts.ts contracts/wreckage-protocol/Published.toml
git commit -m "deploy: v5 testnet — cancel_policy, protocol fee, NCB fix"
```

---

### Task 9: Update progress.md

- [ ] **Step 1: Update tasks/progress.md**

Add entry under TODO and Recently Completed sections documenting all changes.

- [ ] **Step 2: Commit**

```bash
git add tasks/progress.md
git commit -m "docs: update progress for gap completion"
```
