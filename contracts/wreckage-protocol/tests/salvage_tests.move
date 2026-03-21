// contracts/wreckage-protocol/tests/salvage_tests.move
#[test_only]
module wreckage_protocol::salvage_tests;

use sui::test_scenario;
use world::killmail;
use world::test_helpers;
use wreckage_core::pool_config;
use wreckage_core::salvage_nft;
use wreckage_protocol::salvage;

#[test]
fun test_estimate_salvage_value_by_tier() {
    let mut scenario = test_scenario::begin(@0x1);
    test_helpers::setup_world(&mut scenario);
    scenario.next_tx(@0x1);

    let killmail_key = test_helpers::in_game_id(1001);
    let victim_id = test_helpers::in_game_id(42);
    let killer_id = test_helpers::in_game_id(99);

    let km = killmail::create_test_killmail(
        killmail_key, killer_id, victim_id, 1000, scenario.ctx(),
    );

    // Tier 2 → multiplier 3 → 3 SUI
    let tier2_config = pool_config::test_pool_config();
    assert!(salvage::estimate_salvage_value(&km, &tier2_config) == 3_000_000_000);

    // Tier 1 → multiplier 1 → 1 SUI
    let tier1_config = pool_config::new_pool_config(
        1, 500, 50_000_000_000, 1_000_000_000, 172800, 1000,
        7000, 604800, 5000, 2, 1000, 1000, 3, 3000, 2000, 86400,
    );
    assert!(salvage::estimate_salvage_value(&km, &tier1_config) == 1_000_000_000);

    // Tier 3 → multiplier 8 → 8 SUI
    let tier3_config = pool_config::new_pool_config(
        3, 500, 50_000_000_000, 1_000_000_000, 172800, 1000,
        7000, 604800, 5000, 2, 1000, 1000, 3, 3000, 2000, 86400,
    );
    assert!(salvage::estimate_salvage_value(&km, &tier3_config) == 8_000_000_000);

    killmail::destroy_for_testing(km);
    scenario.end();
}

#[test]
fun test_mint_from_killmail() {
    let mut scenario = test_scenario::begin(@0x1);
    test_helpers::setup_world(&mut scenario);
    scenario.next_tx(@0x1);

    let killmail_key = test_helpers::in_game_id(2001);
    let victim_id = test_helpers::in_game_id(42);
    let killer_id = test_helpers::in_game_id(99);

    let km = killmail::create_test_killmail(
        killmail_key, killer_id, victim_id, 5000, scenario.ctx(),
    );
    let pool_cfg = pool_config::test_pool_config(); // tier 2

    let nft = salvage::mint_from_killmail(&km, &pool_cfg, scenario.ctx());

    assert!(salvage_nft::killmail_id(&nft) == killmail_key);
    assert!(salvage_nft::victim_id(&nft) == victim_id);
    assert!(salvage_nft::kill_timestamp(&nft) == 5000);
    assert!(salvage_nft::estimated_value(&nft) == 3_000_000_000); // tier 2 → 3 SUI
    assert!(salvage_nft::loss_type(&nft) == 1); // SHIP
    assert!(salvage_nft::status(&nft) == salvage_nft::status_auction());

    salvage_nft::destroy(nft);
    killmail::destroy_for_testing(km);
    scenario.end();
}
