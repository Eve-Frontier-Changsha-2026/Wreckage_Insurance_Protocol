// contracts/wreckage-protocol/tests/anti_fraud_tests.move
#[test_only]
module wreckage_protocol::anti_fraud_tests;

use sui::test_scenario;
use sui::clock;
use world::killmail;
use world::test_helpers;
use wreckage_protocol::policy;
use wreckage_protocol::pool_config;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::registry::ClaimRegistry;
use wreckage_protocol::anti_fraud;

// === Constants ===
const ADMIN: address = @0xAD;
const VICTIM_ID: u64 = 100;
const KILLER_ID: u64 = 200;
const KILLMAIL_ID: u64 = 1001;
const COVERAGE: u64 = 10_000_000_000; // 10 SUI
const PREMIUM: u64 = 500_000_000;     // 0.5 SUI
const POLICY_CREATED: u64 = 1_000_000; // seconds
const POLICY_EXPIRES: u64 = 3_600_000; // seconds (far future)
const KILL_TIME: u64 = 1_500_000;      // within policy period

// === Helpers ===
fun tid(item_id: u64): world::in_game_id::TenantItemId {
    test_helpers::in_game_id(item_id)
}

fun make_killmail(
    killmail_id: u64,
    killer_id: u64,
    victim_id: u64,
    kill_timestamp: u64,
    ctx: &mut TxContext,
): world::killmail::Killmail {
    killmail::create_test_killmail(
        tid(killmail_id),
        tid(killer_id),
        tid(victim_id),
        kill_timestamp,
        ctx,
    )
}

fun make_policy(ctx: &mut TxContext): wreckage_protocol::policy::InsurancePolicy {
    policy::create(
        tid(VICTIM_ID), COVERAGE, PREMIUM, 2, false, 0,
        POLICY_CREATED, POLICY_EXPIRES, ctx,
    )
}

fun make_policy_with_rider(ctx: &mut TxContext): wreckage_protocol::policy::InsurancePolicy {
    policy::create(
        tid(VICTIM_ID), COVERAGE, PREMIUM, 2, true, 350_000_000,
        POLICY_CREATED, POLICY_EXPIRES, ctx,
    )
}

fun setup_protocol(scenario: &mut test_scenario::Scenario) {
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);
    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    scenario.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    scenario.next_tx(ADMIN);
}

// ============================================================
// Standard Claim Tests
// ============================================================

#[test]
fun test_valid_standard_claim_passes() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy = make_policy(scenario.ctx());
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, KILL_TIME * 1000);
    let killmail = make_killmail(KILLMAIL_ID, KILLER_ID, VICTIM_ID, KILL_TIME, scenario.ctx());

    let result = anti_fraud::validate_standard_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_pass());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_self_kill_rejected_for_standard() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy = make_policy(scenario.ctx());
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, KILL_TIME * 1000);
    // Self-kill: killer == victim
    let killmail = make_killmail(KILLMAIL_ID, VICTIM_ID, VICTIM_ID, KILL_TIME, scenario.ctx());

    let result = anti_fraud::validate_standard_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(!anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_self_kill());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_cooldown_not_elapsed_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let mut policy = make_policy(scenario.ctx());
    policy::set_cooldown_until(&mut policy, KILL_TIME + 100_000);
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, KILL_TIME * 1000);
    let killmail = make_killmail(KILLMAIL_ID, KILLER_ID, VICTIM_ID, KILL_TIME, scenario.ctx());

    let result = anti_fraud::validate_standard_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(!anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_cooldown());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_max_claims_reached_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let mut policy = make_policy(scenario.ctx());
    let mut i = 0u8;
    while (i < 5) { policy::increment_claim_count(&mut policy); i = i + 1; };
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, KILL_TIME * 1000);
    let killmail = make_killmail(KILLMAIL_ID, KILLER_ID, VICTIM_ID, KILL_TIME, scenario.ctx());

    let result = anti_fraud::validate_standard_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(!anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_frequency());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_duplicate_killmail_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy = make_policy(scenario.ctx());

    // Pre-record the killmail as already claimed
    wreckage_protocol::registry::record_claim(
        &mut claim_reg, tid(KILLMAIL_ID), object::id(&policy),
    );

    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, KILL_TIME * 1000);
    let killmail = make_killmail(KILLMAIL_ID, KILLER_ID, VICTIM_ID, KILL_TIME, scenario.ctx());

    let result = anti_fraud::validate_standard_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(!anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_duplicate());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

// ============================================================
// Self-Destruct Claim Tests
// ============================================================

#[test]
fun test_valid_self_destruct_passes() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy = make_policy_with_rider(scenario.ctx());

    // Kill after SD waiting period (7 days = 604800s from policy creation)
    let sd_kill_time = POLICY_CREATED + 604800 + 100;
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, sd_kill_time * 1000);
    // Self-kill: killer == victim
    let killmail = make_killmail(KILLMAIL_ID, VICTIM_ID, VICTIM_ID, sd_kill_time, scenario.ctx());

    let result = anti_fraud::validate_self_destruct_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_pass());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_self_destruct_without_rider_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy = make_policy(scenario.ctx()); // no rider

    let sd_kill_time = POLICY_CREATED + 604800 + 100;
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, sd_kill_time * 1000);
    let killmail = make_killmail(KILLMAIL_ID, VICTIM_ID, VICTIM_ID, sd_kill_time, scenario.ctx());

    let result = anti_fraud::validate_self_destruct_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(!anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_no_rider());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_self_destruct_waiting_period() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_protocol(&mut scenario);

    let cfg = scenario.take_shared<ProtocolConfig>();
    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy = make_policy_with_rider(scenario.ctx());

    // Kill BEFORE SD waiting period ends
    let early_kill_time = POLICY_CREATED + 100;
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clock, early_kill_time * 1000);
    let killmail = make_killmail(KILLMAIL_ID, VICTIM_ID, VICTIM_ID, early_kill_time, scenario.ctx());

    let result = anti_fraud::validate_self_destruct_claim(
        &policy, &killmail, &claim_reg, &clock, &cfg,
    );
    assert!(!anti_fraud::is_valid(&result));
    assert!(anti_fraud::reason(&result) == anti_fraud::reason_waiting_period());

    killmail.destroy_for_testing();
    policy.destroy();
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(cfg);
    scenario.end();
}

// ============================================================
// Payout Calculation Tests
// ============================================================

#[test]
fun test_payout_calculation_with_decay() {
    // 0 claims, 10% deductible → 10B * 0.9 = 9B
    let payout = anti_fraud::calculate_payout(10_000_000_000, 0, 1000, 1000);
    assert!(payout == 9_000_000_000);

    // 1 claim, 10% decay, 10% deductible → 10B * 0.9 * 0.9 = 8.1B
    let payout1 = anti_fraud::calculate_payout(10_000_000_000, 1, 1000, 1000);
    assert!(payout1 == 8_100_000_000);

    // 2 claims → 10B * 0.9^2 * 0.9 = 7.29B
    let payout2 = anti_fraud::calculate_payout(10_000_000_000, 2, 1000, 1000);
    assert!(payout2 == 7_290_000_000);
}

#[test]
fun test_payout_calculation_overflow_safe() {
    // 200 SUI, 3 claims @ 20% decay, 10% deductible
    // Decay: 200B * 0.8^3 = 102.4B
    // Deductible: 102.4B * 0.9 = 92.16B
    let payout = anti_fraud::calculate_payout(200_000_000_000, 3, 2000, 1000);
    assert!(payout == 92_160_000_000);
}

#[test]
fun test_payout_zero_claims_zero_deductible() {
    let payout = anti_fraud::calculate_payout(10_000_000_000, 0, 1000, 0);
    assert!(payout == 10_000_000_000);
}

#[test]
fun test_payout_high_decay_many_claims() {
    // 50% decay, 5 claims, 10% deductible
    // 10B * 0.5^5 * 0.9 = 281.25M
    let payout = anti_fraud::calculate_payout(10_000_000_000, 5, 5000, 1000);
    assert!(payout == 281_250_000);
}
