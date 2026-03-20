// contracts/wreckage-protocol/tests/underwriting_tests.move
#[test_only]
module wreckage_protocol::underwriting_tests;

use std::string::utf8;
use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use world::test_helpers;
use world::character::{Self, Character};
use world::access::AdminACL;
use world::object_registry::ObjectRegistry;
use wreckage_core::policy;
use wreckage_core::pool_config;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::registry::PolicyRegistry;
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::underwriting;

// === Constants ===
const ADMIN: address = @0xAD;
const USER: address = @0xCC;
const RECIPIENT: address = @0xDD;
const GAME_CHAR_ID: u32 = 42;
const TRIBE_ID: u32 = 1;
const COVERAGE: u64 = 10_000_000_000; // 10 SUI
// base_premium_rate = 500 bps (5%) → premium = 10 SUI * 5% = 0.5 SUI = 500_000_000
const EXPECTED_BASE_PREMIUM: u64 = 500_000_000;
// SD rate = 7000 bps (70%) → rider = 10 SUI * 70% = 7 SUI = 7_000_000_000
const EXPECTED_SD_PREMIUM: u64 = 7_000_000_000;
const OVERPAYMENT: u64 = 20_000_000_000; // 20 SUI (more than enough)
const POOL_SEED: u64 = 100_000_000_000; // 100 SUI seed liquidity

// === Helpers ===

/// Full world + protocol + pool + character setup
fun setup_all(scenario: &mut test_scenario::Scenario) {
    // 1. Init world (ObjectRegistry, AdminACL, etc.)
    test_helpers::setup_world(scenario);

    // 2. Init protocol (AdminCap, ProtocolConfig, registries)
    scenario.next_tx(ADMIN);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);

    // 3. Add pool tier config
    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    scenario.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    scenario.next_tx(ADMIN);

    // 4. Create risk pool (tier 2)
    let cap = scenario.take_from_sender<AdminCap>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    config::admin_create_pool(&cap, &cfg, pool_config::test_pool_config(), scenario.ctx());
    scenario.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    scenario.next_tx(ADMIN);

    // 5. Seed the pool with liquidity so reserve_coverage doesn't fail
    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());
    let seed = coin::mint_for_testing<SUI>(POOL_SEED, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, seed, &clk, scenario.ctx());
    transfer::public_transfer(position, ADMIN);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.next_tx(ADMIN);

    // 6. Create and share character (must use world-authorized sponsor @0xB)
    let world_admin = test_helpers::admin();
    scenario.next_tx(world_admin);
    let admin_acl = scenario.take_shared<AdminACL>();
    let mut registry = scenario.take_shared<ObjectRegistry>();
    let character = character::create_character(
        &mut registry,
        &admin_acl,
        GAME_CHAR_ID,
        test_helpers::tenant(),
        TRIBE_ID,
        USER,
        utf8(b"TestPilot"),
        scenario.ctx(),
    );
    character.share_character(&admin_acl, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(admin_acl);
    scenario.next_tx(USER);
}

// ============================================================
// Purchase Tests
// ============================================================

#[test]
fun test_purchase_policy_success() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000); // 1000 seconds
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let new_policy = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Verify policy fields
    assert!(policy::coverage_amount(&new_policy) == COVERAGE);
    assert!(policy::premium_paid(&new_policy) == EXPECTED_BASE_PREMIUM);
    assert!(policy::risk_tier(&new_policy) == 2);
    assert!(!policy::has_self_destruct_rider(&new_policy));
    assert!(policy::is_active(&new_policy));
    assert!(policy::created_at(&new_policy) == 1_000_000);
    assert!(policy::expires_at(&new_policy) == 1_000_000 + 2_592_000);

    // Verify pool state: premium collected, coverage reserved
    assert!(risk_pool::total_premiums_collected(&pool) == EXPECTED_BASE_PREMIUM);
    assert!(risk_pool::reserved_amount(&pool) == COVERAGE);

    // Verify policy registered
    let char_key = character.key();
    assert!(wreckage_protocol::registry::has_active_policy(&policy_reg, char_key));

    new_policy.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_purchase_rejects_duplicate_character() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());

    // First purchase — OK
    let payment1 = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let p1 = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment1, &clk, scenario.ctx(),
    );

    // Second purchase — should abort (same character)
    let payment2 = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let p2 = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment2, &clk, scenario.ctx(),
    );

    p1.destroy();
    p2.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_purchase_with_self_destruct_rider() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let new_policy = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, true, payment, &clk, scenario.ctx(),
    );

    assert!(policy::has_self_destruct_rider(&new_policy));
    assert!(policy::self_destruct_premium(&new_policy) == EXPECTED_SD_PREMIUM);
    let total = EXPECTED_BASE_PREMIUM + EXPECTED_SD_PREMIUM;
    assert!(policy::premium_paid(&new_policy) == total);
    assert!(risk_pool::total_premiums_collected(&pool) == total);

    new_policy.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// Renew Tests
// ============================================================

#[test]
fun test_renew_with_ncb_discount() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000); // 1000 seconds (ms)
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut new_policy = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Advance past expiry to trigger claim-free streak increment
    let expiry_ms = (policy::expires_at(&new_policy) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);

    let renewal_payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(
        &mut new_policy, &cfg, &mut pool, renewal_payment, &clk, scenario.ctx(),
    );

    // Streak incremented to 1 → 10% NCB discount (1000 bps)
    assert!(policy::no_claim_streak(&new_policy) == 1);
    assert!(policy::renewal_count(&new_policy) == 1);
    // Premium: 500M * (10000 - 1000) / 10000 = 500M * 0.9 = 450M
    assert!(policy::premium_paid(&new_policy) == 450_000_000);

    new_policy.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_ncb_discount_capped() {
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

    // Renew 4 times to exceed max_ncb_streak (3) and max_ncb_total_discount (3000 bps = 30%)
    let mut i = 0;
    while (i < 4) {
        let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
        clock::set_for_testing(&mut clk, expiry_ms);
        let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
        underwriting::renew_policy(&mut p, &cfg, &mut pool, pay, &clk, scenario.ctx());
        i = i + 1u64;
    };

    // After 4 renewals: streak = 4, but discount capped at 3000 bps (30%)
    assert!(policy::no_claim_streak(&p) == 4);
    // Premium: 500M * (10000 - 3000) / 10000 = 500M * 0.7 = 350M
    assert!(policy::premium_paid(&p) == 350_000_000);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_renew_resets_waiting_period() {
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

    // Advance past expiry and renew
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    let renewal_pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut p, &cfg, &mut pool, renewal_pay, &clk, scenario.ctx());

    // created_at should be updated to now (renewal timestamp)
    let now = expiry_ms / 1000;
    assert!(policy::created_at(&p) == now);
    assert!(policy::expires_at(&p) == now + 2_592_000);
    assert!(policy::renewal_count(&p) == 1);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// Transfer Tests
// ============================================================

#[test]
fun test_transfer_resets_ncb_and_cooldown() {
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

    // Renew to build streak
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut p, &cfg, &mut pool, pay, &clk, scenario.ctx());
    assert!(policy::no_claim_streak(&p) == 1);

    // Transfer
    let now = expiry_ms / 1000;
    underwriting::transfer_policy(&mut p, &cfg, RECIPIENT, &clk, scenario.ctx());

    // NCB reset
    assert!(policy::no_claim_streak(&p) == 0);
    // Cooldown set (cooldown_period = 172800 = 48h from test_pool_config)
    assert!(policy::cooldown_until(&p) == now + 172800);

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// Expire Tests
// ============================================================

#[test]
fun test_expire_unregisters_from_policy_registry() {
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

    // Confirm registered
    let char_key = character.key();
    assert!(wreckage_protocol::registry::has_active_policy(&policy_reg, char_key));
    assert!(risk_pool::reserved_amount(&pool) == COVERAGE);

    // Advance past expiry
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);

    underwriting::expire_policy(&mut p, &mut policy_reg, &mut pool, &clk);

    // Status expired
    assert!(policy::status(&p) == policy::status_expired());
    // NCB incremented
    assert!(policy::no_claim_streak(&p) == 1);
    // Unregistered
    assert!(!wreckage_protocol::registry::has_active_policy(&policy_reg, char_key));
    // Reservation released
    assert!(risk_pool::reserved_amount(&pool) == 0);

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
fun test_purchase_rejects_coverage_too_low() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    // min_coverage = 1_000_000_000 (1 SUI), try 100 MIST
    let p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        100, false, payment, &clk, scenario.ctx(),
    );

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
fun test_purchase_rejects_insufficient_payment() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());
    // Pay only 1 MIST (not enough for 500M premium)
    let payment = coin::mint_for_testing<SUI>(1, scenario.ctx());

    let p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
