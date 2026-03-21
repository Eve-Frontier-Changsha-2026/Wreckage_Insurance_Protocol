// contracts/wreckage-protocol/tests/claims_tests.move
#[test_only]
module wreckage_protocol::claims_tests;

use std::string::utf8;
use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use world::test_helpers;
use world::character::{Self, Character};
use world::access::AdminACL;
use world::object_registry::ObjectRegistry;
use world::killmail;
use wreckage_core::policy;
use wreckage_core::pool_config;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::registry::{Self, ClaimRegistry, PolicyRegistry};
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::underwriting;
use wreckage_protocol::claims;

// === Constants ===
const ADMIN: address = @0xAD;
const USER: address = @0xCC;
const GAME_CHAR_ID: u32 = 42;
const TRIBE_ID: u32 = 1;
const COVERAGE: u64 = 10_000_000_000; // 10 SUI
const OVERPAYMENT: u64 = 20_000_000_000; // 20 SUI
const POOL_SEED: u64 = 100_000_000_000; // 100 SUI

// Tier 2: decay=10%, deductible=10%, SD rate=50%, cooldown=172800s
// Standard claim 0: no decay, 10% deductible → 10B * 0.9 = 9B
const EXPECTED_PAYOUT_0: u64 = 9_000_000_000;
// Standard claim 1: 10% decay → 9B, 10% deductible → 8.1B
const EXPECTED_PAYOUT_1: u64 = 8_100_000_000;
// SD claim 0: no decay, 10% deductible → 9B, 50% SD rate → 4.5B
const EXPECTED_SD_PAYOUT_0: u64 = 4_500_000_000;

// === Setup ===
fun setup_all(scenario: &mut test_scenario::Scenario) {
    test_helpers::setup_world(scenario);

    scenario.next_tx(ADMIN);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);

    // Add pool tier config
    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    scenario.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    scenario.next_tx(ADMIN);

    // Create risk pool
    let cap = scenario.take_from_sender<AdminCap>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    config::admin_create_pool(&cap, &cfg, pool_config::test_pool_config(), scenario.ctx());
    scenario.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    scenario.next_tx(ADMIN);

    // Seed liquidity
    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());
    let seed = coin::mint_for_testing<SUI>(POOL_SEED, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, seed, &clk, scenario.ctx());
    transfer::public_transfer(position, ADMIN);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.next_tx(ADMIN);

    // Create and share character (world admin @0xB)
    let world_admin = test_helpers::admin();
    scenario.next_tx(world_admin);
    let admin_acl = scenario.take_shared<AdminACL>();
    let mut registry = scenario.take_shared<ObjectRegistry>();
    let character = character::create_character(
        &mut registry, &admin_acl, GAME_CHAR_ID, test_helpers::tenant(),
        TRIBE_ID, USER, utf8(b"TestPilot"), scenario.ctx(),
    );
    character.share_character(&admin_acl, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(admin_acl);
    scenario.next_tx(USER);
}

// ============================================================
// Standard Claim Tests
// ============================================================

#[test]
fun test_submit_claim_full_flow() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    // Purchase policy
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000); // now = 1_000_000 s
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    assert!(risk_pool::reserved_amount(&pool) == COVERAGE);

    // Create killmail (killer != victim → standard claim)
    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(999);
    let km_key = test_helpers::in_game_id(5001);
    let kill_ts = 1_500_000u64; // within policy period [1M, 3.592M)
    let km = killmail::create_test_killmail(km_key, killer_id, victim_id, kill_ts, scenario.ctx());

    // Advance clock
    clock::set_for_testing(&mut clk, 1_500_000_000); // now = 1_500_000 s

    // Submit claim
    claims::submit_claim(
        &mut p, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    // Verify policy state
    assert!(policy::claim_count(&p) == 1);
    assert!(policy::no_claim_streak(&p) == 0);
    assert!(policy::cooldown_until(&p) == 1_500_000 + 172800);

    // Verify pool state
    assert!(risk_pool::total_claims_paid(&pool) == EXPECTED_PAYOUT_0);
    assert!(risk_pool::reserved_amount(&pool) == 0); // full coverage released

    // Verify killmail recorded
    assert!(registry::is_killmail_claimed(&claim_reg, km_key));

    // Cleanup
    p.destroy();
    killmail::destroy_for_testing(km);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_submit_claim_with_deductible_and_decay() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Claim 0
    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(999);
    let km1_key = test_helpers::in_game_id(5001);
    let km1 = killmail::create_test_killmail(
        km1_key, killer_id, victim_id, 1_500_000, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_500_000_000);

    claims::submit_claim(
        &mut p, &km1, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );
    assert!(policy::claim_count(&p) == 1);
    assert!(risk_pool::total_claims_paid(&pool) == EXPECTED_PAYOUT_0);

    // Advance past cooldown for claim 1
    let cooldown_end_ms = (policy::cooldown_until(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, cooldown_end_ms);
    let kill_ts_2 = cooldown_end_ms / 1000;

    let km2_key = test_helpers::in_game_id(5002);
    let km2 = killmail::create_test_killmail(
        km2_key, killer_id, victim_id, kill_ts_2, scenario.ctx(),
    );

    // Claim 1 (decay applied: 10% decay on 10 SUI = 9 SUI, then 10% deductible = 8.1 SUI)
    claims::submit_claim(
        &mut p, &km2, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );
    assert!(policy::claim_count(&p) == 2);
    assert!(risk_pool::total_claims_paid(&pool) == EXPECTED_PAYOUT_0 + EXPECTED_PAYOUT_1);

    p.destroy();
    killmail::destroy_for_testing(km1);
    killmail::destroy_for_testing(km2);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// Self-Destruct Claim Tests
// ============================================================

#[test]
fun test_self_destruct_claim_reduced_payout() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    // Purchase with self-destruct rider
    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, true, payment, &clk, scenario.ctx(),
    );

    // Self-destruct: killer == victim
    let victim_id = character.key();
    // kill_ts must be past SD waiting period (604800s from created_at)
    // created_at = 1_000_000, so need kill_ts >= 1_604_800
    let kill_ts = 1_700_000u64;
    let km_key = test_helpers::in_game_id(6001);
    let km = killmail::create_test_killmail(
        km_key, victim_id, victim_id, kill_ts, scenario.ctx(),
    );

    clock::set_for_testing(&mut clk, 1_700_000_000);

    claims::submit_self_destruct_claim(
        &mut p, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    // Verify: SD payout = coverage * (1 - deductible) * sd_rate = 10B * 0.9 * 0.5 = 4.5B
    assert!(policy::claim_count(&p) == 1);
    assert!(risk_pool::total_claims_paid(&pool) == EXPECTED_SD_PAYOUT_0);

    p.destroy();
    killmail::destroy_for_testing(km);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// Rejection Tests
// ============================================================

#[test]
#[expected_failure]
fun test_claim_rejects_wrong_victim() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    // Wrong victim
    let wrong_victim = test_helpers::in_game_id(9999);
    let killer_id = test_helpers::in_game_id(888);
    let km_key = test_helpers::in_game_id(7001);
    let km = killmail::create_test_killmail(
        km_key, killer_id, wrong_victim, 1_500_000, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_500_000_000);

    // Should abort: killmail victim != insured character
    claims::submit_claim(
        &mut p, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    p.destroy();
    killmail::destroy_for_testing(km);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_claim_rejects_expired_policy() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(999);
    let km_key = test_helpers::in_game_id(7002);
    // kill_ts within policy period, but now past expiry
    let km = killmail::create_test_killmail(
        km_key, killer_id, victim_id, 1_500_000, scenario.ctx(),
    );

    // Advance past expiry
    let expiry_ms = (policy::expires_at(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);

    // Should abort: policy expired
    claims::submit_claim(
        &mut p, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    p.destroy();
    killmail::destroy_for_testing(km);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_claim_rejects_duplicate_killmail() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_all(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    let mut p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, scenario.ctx(),
    );

    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(999);
    let same_key = test_helpers::in_game_id(8001);

    // First claim succeeds
    let km1 = killmail::create_test_killmail(
        same_key, killer_id, victim_id, 1_500_000, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_500_000_000);
    claims::submit_claim(
        &mut p, &km1, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    // Advance past cooldown
    let cooldown_end_ms = (policy::cooldown_until(&p) + 1) * 1000;
    clock::set_for_testing(&mut clk, cooldown_end_ms);

    // Same killmail key → duplicate
    let km2 = killmail::create_test_killmail(
        same_key, killer_id, victim_id, cooldown_end_ms / 1000, scenario.ctx(),
    );

    // Should abort: killmail already claimed
    claims::submit_claim(
        &mut p, &km2, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    p.destroy();
    killmail::destroy_for_testing(km1);
    killmail::destroy_for_testing(km2);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
