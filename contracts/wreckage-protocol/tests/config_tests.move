// contracts/wreckage-protocol/tests/config_tests.move
#[test_only]
module wreckage_protocol::config_tests;

use sui::test_scenario;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::pool_config;

#[test]
fun test_init_creates_admin_cap_and_config() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);

    // consolidated init
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    // admin should have AdminCap
    let cap = scenario.take_from_sender<AdminCap>();
    scenario.return_to_sender(cap);

    // ProtocolConfig should be shared
    let cfg = scenario.take_shared<ProtocolConfig>();
    assert!(config::version(&cfg) == 1);
    assert!(!config::is_policy_paused(&cfg));
    assert!(!config::is_claim_paused(&cfg));
    assert!(config::protocol_fee_bps(&cfg) == 2000);
    assert!(config::max_claims_per_policy(&cfg) == 5);
    assert!(config::max_coverage_limit(&cfg) == 200_000_000_000);
    test_scenario::return_shared(cfg);

    scenario.end();
}

#[test]
fun test_add_and_get_pool_tier() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();

    let pool_cfg = pool_config::test_pool_config(); // tier 2
    config::add_pool_tier(&cap, &mut cfg, pool_cfg);

    let retrieved = config::get_pool_config(&cfg, 2);
    assert!(pool_config::risk_tier(retrieved) == 2);
    assert!(pool_config::base_premium_rate(retrieved) == 500);

    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_get_pool_config_missing_tier_aborts() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cfg = scenario.take_shared<ProtocolConfig>();
    // No tiers added, should abort
    let _retrieved = config::get_pool_config(&cfg, 99);
    test_scenario::return_shared(cfg);
    scenario.end();
}

#[test]
fun test_update_pool_config() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();

    // Add tier 2
    let pool_cfg = pool_config::test_pool_config();
    config::add_pool_tier(&cap, &mut cfg, pool_cfg);

    // Update tier 2 with different base_premium_rate
    let new_cfg = pool_config::new_pool_config(
        2, 800, 50_000_000_000, 1_000_000_000, 172800, 1000,
        7000, 604800, 5000, 2, 1000, 1000, 3, 3000, 2000, 86400,
    );
    config::update_pool_config(&cap, &mut cfg, 2, new_cfg);

    let retrieved = config::get_pool_config(&cfg, 2);
    assert!(pool_config::base_premium_rate(retrieved) == 800);

    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.end();
}

#[test]
fun test_admin_pause_and_unpause() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();

    assert!(!config::is_policy_paused(&cfg));
    config::set_policy_paused(&cap, &mut cfg, true);
    assert!(config::is_policy_paused(&cfg));

    assert!(!config::is_claim_paused(&cfg));
    config::set_claim_paused(&cap, &mut cfg, true);
    assert!(config::is_claim_paused(&cfg));

    // Unpause
    config::set_policy_paused(&cap, &mut cfg, false);
    assert!(!config::is_policy_paused(&cfg));

    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.end();
}

#[test]
fun test_update_treasury() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();

    assert!(config::treasury(&cfg) == admin);
    let new_treasury = @0xBEEF;
    config::update_treasury(&cap, &mut cfg, new_treasury);
    assert!(config::treasury(&cfg) == new_treasury);

    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.end();
}

#[test]
fun test_update_auction_config() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();

    let new_auction_cfg = pool_config::new_auction_config(
        86400, 86400, 1000, 5000, 9000, 300, 300, 200_000_000,
    );
    config::update_auction_config(&cap, &mut cfg, new_auction_cfg);
    assert!(pool_config::auction_duration(config::auction_config(&cfg)) == 86400);
    assert!(pool_config::min_bid_increment_bps(config::auction_config(&cfg)) == 1000);

    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.end();
}

#[test]
fun test_assert_version_passes() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cfg = scenario.take_shared<ProtocolConfig>();
    config::assert_version(&cfg); // should not abort
    test_scenario::return_shared(cfg);
    scenario.end();
}
