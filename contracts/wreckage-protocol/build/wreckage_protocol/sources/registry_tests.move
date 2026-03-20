// contracts/wreckage-protocol/tests/registry_tests.move
#[test_only]
module wreckage_protocol::registry_tests;

use sui::test_scenario;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::registry::{Self, ClaimRegistry, PolicyRegistry};
use world::test_helpers;

#[test]
fun test_claim_registry_dedup() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let key = test_helpers::in_game_id(1001);
    let policy_id = object::id_from_address(@0x123);

    assert!(!registry::is_killmail_claimed(&claim_reg, key));
    registry::record_claim(&mut claim_reg, key, policy_id);
    assert!(registry::is_killmail_claimed(&claim_reg, key));

    test_scenario::return_shared(claim_reg);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_claim_registry_rejects_duplicate() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let key = test_helpers::in_game_id(1001);
    let policy_id = object::id_from_address(@0x123);

    registry::record_claim(&mut claim_reg, key, policy_id);
    registry::record_claim(&mut claim_reg, key, policy_id); // should abort

    test_scenario::return_shared(claim_reg);
    scenario.end();
}

#[test]
fun test_policy_registry_register_and_unregister() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let char_id = test_helpers::in_game_id(42);
    let policy_id = object::id_from_address(@0x456);

    assert!(!registry::has_active_policy(&policy_reg, char_id));
    registry::register_policy(&mut policy_reg, char_id, policy_id);
    assert!(registry::has_active_policy(&policy_reg, char_id));

    registry::unregister_policy(&mut policy_reg, char_id);
    assert!(!registry::has_active_policy(&policy_reg, char_id));

    test_scenario::return_shared(policy_reg);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_policy_registry_rejects_duplicate_character() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let char_id = test_helpers::in_game_id(42);

    registry::register_policy(&mut policy_reg, char_id, object::id_from_address(@0x111));
    registry::register_policy(&mut policy_reg, char_id, object::id_from_address(@0x222)); // abort

    test_scenario::return_shared(policy_reg);
    scenario.end();
}

#[test]
fun test_unregister_nonexistent_is_noop() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let char_id = test_helpers::in_game_id(999);

    // Should not abort
    registry::unregister_policy(&mut policy_reg, char_id);
    assert!(!registry::has_active_policy(&policy_reg, char_id));

    test_scenario::return_shared(policy_reg);
    scenario.end();
}

#[test]
fun test_version_checks_pass() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let claim_reg = scenario.take_shared<ClaimRegistry>();
    let policy_reg = scenario.take_shared<PolicyRegistry>();

    registry::assert_claim_registry_version(&claim_reg);
    registry::assert_policy_registry_version(&policy_reg);

    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(policy_reg);
    scenario.end();
}
