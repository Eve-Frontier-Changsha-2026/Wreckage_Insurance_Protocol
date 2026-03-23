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
