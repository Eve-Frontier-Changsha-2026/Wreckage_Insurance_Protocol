// contracts/wreckage-core/tests/policy_tests.move
#[test_only]
module wreckage_protocol::policy_tests;

use sui::test_scenario;
use wreckage_protocol::policy;

#[test]
fun test_create_policy() {
    let mut scenario = test_scenario::begin(@0x1);
    let ctx = scenario.ctx();

    // We need a TenantItemId — use world::in_game_id::create_key
    // Since create_key is public(package), we'll test via integration in protocol tests
    // Here test the accessors and mutators with a mock

    scenario.end();
}

#[test]
fun test_policy_mutators() {
    // Will be tested in wreckage-protocol integration tests
    // since we need world::in_game_id to create TenantItemId
}
