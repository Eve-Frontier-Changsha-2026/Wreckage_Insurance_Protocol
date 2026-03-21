// contracts/wreckage-protocol/tests/risk_pool_tests.move
#[test_only]
module wreckage_protocol::risk_pool_tests;

use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::pool_config;

// Helper: create a pool via package-visible constructor (using test scenario)
fun setup_pool(scenario: &mut test_scenario::Scenario) {
    let cfg = pool_config::test_pool_config(); // tier 2
    risk_pool::create_and_share_pool(cfg, scenario.ctx());
}

#[test]
fun test_deposit_and_share_calculation() {
    let lp = @0xBB;
    let mut scenario = test_scenario::begin(lp);

    setup_pool(&mut scenario);
    scenario.next_tx(lp);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    // Initial: 1000 virtual shares, 1000 virtual MIST
    assert!(risk_pool::total_shares(&pool) == 1000);
    assert!(risk_pool::total_liquidity_value(&pool) == 1000);

    // Deposit 10 SUI = 10_000_000_000 MIST
    let deposit = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // shares = 10_000_000_000 * 1000 / 1000 = 10_000_000_000
    assert!(risk_pool::lp_shares(&position) == 10_000_000_000);
    assert!(risk_pool::total_shares(&pool) == 10_000_000_000 + 1000);
    assert!(risk_pool::raw_liquidity_value(&pool) == 10_000_000_000);
    assert!(risk_pool::lp_initial_deposit(&position) == 10_000_000_000);
    assert!(risk_pool::lp_pool_tier(&position) == 2);

    transfer::public_transfer(position, lp);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_first_deposit_virtual_liquidity_prevents_attack() {
    let attacker = @0xA1;
    let mut scenario = test_scenario::begin(attacker);

    setup_pool(&mut scenario);
    scenario.next_tx(attacker);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    // Attacker deposits 1 MIST — virtual liquidity prevents share inflation attack
    let tiny = coin::mint_for_testing<SUI>(1, scenario.ctx());
    let pos1 = risk_pool::deposit(&mut pool, tiny, &clk, scenario.ctx());
    // shares = 1 * 1000 / 1000 = 1 (not 0 due to virtual liquidity)
    assert!(risk_pool::lp_shares(&pos1) == 1);

    transfer::public_transfer(pos1, attacker);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_zero_shares_rejected() {
    // This would require deposit amount so small that shares round to 0
    // With virtual liquidity of 1000 MIST and 1000 shares, even 1 MIST → 1 share
    // To get 0 shares we need: amount * 1000 / total_liq < 1
    // After first large deposit: e.g., total_liq = 100_000_000_001, total_shares ~= 100_000_001_000
    // deposit of 0 would fail (assert deposit > 0)
    let lp = @0xBB;
    let mut scenario = test_scenario::begin(lp);
    setup_pool(&mut scenario);
    scenario.next_tx(lp);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    let zero = coin::mint_for_testing<SUI>(0, scenario.ctx());
    let pos = risk_pool::deposit(&mut pool, zero, &clk, scenario.ctx());

    transfer::public_transfer(pos, lp);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_withdraw_lock_period() {
    let lp = @0xBB;
    let mut scenario = test_scenario::begin(lp);
    setup_pool(&mut scenario);
    scenario.next_tx(lp);

    let mut pool = scenario.take_shared<RiskPool>();
    // Clock at t=0
    let clk = clock::create_for_testing(scenario.ctx());

    let deposit = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let mut position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // Try withdraw immediately (lock = 7 days = 604800s, clock is at 0)
    let withdrawn = risk_pool::withdraw(&mut pool, &mut position, 100, &clk, scenario.ctx());

    coin::burn_for_testing(withdrawn);
    transfer::public_transfer(position, lp);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_withdraw_after_lock_period() {
    let lp = @0xBB;
    let mut scenario = test_scenario::begin(lp);
    setup_pool(&mut scenario);
    scenario.next_tx(lp);

    let mut pool = scenario.take_shared<RiskPool>();
    let mut clk = clock::create_for_testing(scenario.ctx());

    let deposit = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let mut position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // Advance clock past lock period (7 days + 1 second = 604801s)
    clk.set_for_testing(604801 * 1000); // milliseconds

    // Withdraw small portion — must be within 25% of available
    // available = total_liq - reserved = ~10_000_001_000 - 0 = ~10_000_001_000
    // max_withdraw = 10_000_001_000 * 2500 / 10000 = 2_500_000_250
    let shares_to_burn = 100;
    let withdrawn = risk_pool::withdraw(&mut pool, &mut position, shares_to_burn, &clk, scenario.ctx());

    assert!(withdrawn.value() > 0);
    coin::burn_for_testing(withdrawn);
    transfer::public_transfer(position, lp);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_reserve_and_release() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    setup_pool(&mut scenario);
    scenario.next_tx(admin);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    // Deposit liquidity first
    let deposit = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // Reserve some coverage
    let total_liq = risk_pool::total_liquidity_value(&pool);
    let max_reserve = total_liq * 8000 / 10000; // 80%
    risk_pool::reserve_coverage(&mut pool, max_reserve);
    assert!(risk_pool::reserved_amount(&pool) == max_reserve);

    // Release
    risk_pool::release_reservation(&mut pool, max_reserve);
    assert!(risk_pool::reserved_amount(&pool) == 0);

    transfer::public_transfer(position, admin);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_utilization_safety_valve() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    setup_pool(&mut scenario);
    scenario.next_tx(admin);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    let deposit = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // Try to reserve more than 80% — should abort
    let total_liq = risk_pool::total_liquidity_value(&pool);
    let too_much = total_liq * 8000 / 10000 + 1;
    risk_pool::reserve_coverage(&mut pool, too_much);

    transfer::public_transfer(position, admin);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_pay_claim_atomic() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    setup_pool(&mut scenario);
    scenario.next_tx(admin);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    // Deposit
    let deposit = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // Reserve
    let claim_amount = 1_000_000_000; // 1 SUI
    risk_pool::reserve_coverage(&mut pool, claim_amount);
    assert!(risk_pool::reserved_amount(&pool) == claim_amount);

    // Pay claim (releases reservation atomically)
    let payout = risk_pool::pay_claim(&mut pool, claim_amount, scenario.ctx());
    assert!(payout.value() == claim_amount);
    assert!(risk_pool::reserved_amount(&pool) == 0);
    assert!(risk_pool::total_claims_paid(&pool) == claim_amount);

    coin::burn_for_testing(payout);
    transfer::public_transfer(position, admin);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
fun test_collect_premium() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    setup_pool(&mut scenario);
    scenario.next_tx(admin);

    let mut pool = scenario.take_shared<RiskPool>();

    let premium_amount = 500_000_000; // 0.5 SUI
    let premium_coin = coin::mint_for_testing<SUI>(premium_amount, scenario.ctx());
    risk_pool::collect_premium(&mut pool, premium_coin.into_balance());

    assert!(risk_pool::total_premiums_collected(&pool) == premium_amount);
    assert!(risk_pool::raw_liquidity_value(&pool) == premium_amount);

    test_scenario::return_shared(pool);
    scenario.end();
}

#[test]
fun test_destroy_empty_position() {
    let lp = @0xBB;
    let mut scenario = test_scenario::begin(lp);
    setup_pool(&mut scenario);
    scenario.next_tx(lp);

    let mut pool = scenario.take_shared<RiskPool>();
    let mut clk = clock::create_for_testing(scenario.ctx());

    let deposit = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
    let mut position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());

    // Advance past lock
    clk.set_for_testing(604801 * 1000);

    // Withdraw in batches due to 25% cap
    // Each batch: withdraw up to 25% of available liquidity worth of shares
    while (risk_pool::lp_shares(&position) > 0) {
        let remaining = risk_pool::lp_shares(&position);
        // Try withdrawing remaining, but cap to what's allowed
        // 25% of available in share terms: avail * 2500/10000 * total_shares / total_liq
        let avail = risk_pool::available_liquidity(&pool);
        let max_withdraw_amount = avail * 2500 / 10000;
        let total_liq = risk_pool::total_liquidity_value(&pool);
        let total_shares = risk_pool::total_shares(&pool);
        let max_shares = (((max_withdraw_amount as u128) * (total_shares as u128) / (total_liq as u128)) as u64);
        let burn = if (remaining < max_shares) { remaining } else { max_shares };
        if (burn == 0) break;
        let withdrawn = risk_pool::withdraw(&mut pool, &mut position, burn, &clk, scenario.ctx());
        coin::burn_for_testing(withdrawn);
    };
    assert!(risk_pool::lp_shares(&position) == 0);

    // Destroy empty position
    risk_pool::destroy_empty_position(position);

    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

#[test]
#[expected_failure]
fun test_release_reservation_overflow_aborts() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    setup_pool(&mut scenario);
    scenario.next_tx(admin);

    let mut pool = scenario.take_shared<RiskPool>();
    // Try to release more than reserved (0) — should abort
    risk_pool::release_reservation(&mut pool, 1);

    test_scenario::return_shared(pool);
    scenario.end();
}
