// contracts/wreckage-protocol/tests/ssu_extension_tests.move
/// Tests for SSU extension: purchase/claim/renew/cancel via online SSU,
/// plus offline SSU rejection.
#[test_only]
module wreckage_protocol::ssu_extension_tests;

use std::string::utf8;
use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use world::test_helpers::{Self, admin};
use world::character::{Self, Character};
use world::access::{AdminACL, OwnerCap};
use world::energy::EnergyConfig;
use world::network_node::{Self, NetworkNode};
use world::object_registry::ObjectRegistry;
use world::storage_unit::{Self, StorageUnit};
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::registry::PolicyRegistry;
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::pool_config;
use wreckage_protocol::ssu_extension;

// === Addresses ===
const PLAYER_A: address = @0xA1;
const CHAR_A_ID: u32 = 42;
const TRIBE_ID: u32 = 1;
const COVERAGE: u64 = 10_000_000_000;     // 10 SUI
const OVERPAYMENT: u64 = 20_000_000_000;  // 20 SUI
const LP_DEPOSIT: u64 = 100_000_000_000;  // 100 SUI

// SSU constants (from storage_unit_tests)
const STORAGE_A_TYPE_ID: u64 = 5555;
const STORAGE_A_ITEM_ID: u64 = 90002;
const MAX_CAPACITY: u64 = 100000;
const LOCATION_HASH: vector<u8> = x"7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b";

// NWN constants
const NWN_TYPE_ID: u64 = 111000;
const NWN_ITEM_ID: u64 = 5000;
const FUEL_MAX_CAPACITY: u64 = 1000;
const FUEL_BURN_RATE_IN_MS: u64 = 3_600_000; // 1 hour in ms
const MAX_PRODUCTION: u64 = 100;
const FUEL_TYPE_ID: u64 = 1;
const FUEL_VOLUME: u64 = 10;

// === Setup Helpers ===

/// Full setup: world + energy config + server address + protocol + pool tier + risk pool
fun full_setup(ts: &mut test_scenario::Scenario) {
    test_helpers::setup_world(ts);
    test_helpers::configure_assembly_energy(ts);
    test_helpers::register_server_address(ts);

    ts.next_tx(admin());
    protocol_init::init_for_testing(ts.ctx());
    ts.next_tx(admin());

    let cap = ts.take_from_sender<AdminCap>();
    let mut cfg = ts.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    ts.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    ts.next_tx(admin());

    let cap = ts.take_from_sender<AdminCap>();
    let cfg = ts.take_shared<ProtocolConfig>();
    config::admin_create_pool(&cap, &cfg, pool_config::test_pool_config(), ts.ctx());
    ts.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    ts.next_tx(admin());
}

/// Seed LP into pool
fun seed_pool(ts: &mut test_scenario::Scenario, depositor: address, amount: u64) {
    ts.next_tx(depositor);
    let mut pool = ts.take_shared<RiskPool>();
    let clk = clock::create_for_testing(ts.ctx());
    let deposit = coin::mint_for_testing<SUI>(amount, ts.ctx());
    let position = risk_pool::deposit(&mut pool, deposit, &clk, ts.ctx());
    transfer::public_transfer(position, depositor);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    ts.next_tx(depositor);
}

/// Create and share a character (same pattern as e2e_tests)
fun create_character(ts: &mut test_scenario::Scenario, owner: address, char_id: u32): ID {
    let world_admin = admin();
    ts.next_tx(world_admin);
    let admin_acl = ts.take_shared<AdminACL>();
    let mut registry = ts.take_shared<ObjectRegistry>();
    let character = character::create_character(
        &mut registry, &admin_acl, char_id, test_helpers::tenant(),
        TRIBE_ID, owner, utf8(b"Pilot"), ts.ctx(),
    );
    let char_id = object::id(&character);
    character.share_character(&admin_acl, ts.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(admin_acl);
    ts.next_tx(owner);
    char_id
}

/// Create NWN, anchor to character, share it. Returns nwn_id.
fun create_nwn(ts: &mut test_scenario::Scenario, char_id: ID): ID {
    ts.next_tx(admin());
    let mut registry = ts.take_shared<ObjectRegistry>();
    let character = test_scenario::take_shared_by_id<Character>(ts, char_id);
    let admin_acl = ts.take_shared<AdminACL>();
    let nwn = network_node::anchor(
        &mut registry, &character, &admin_acl,
        NWN_ITEM_ID, NWN_TYPE_ID, LOCATION_HASH,
        FUEL_MAX_CAPACITY, FUEL_BURN_RATE_IN_MS, MAX_PRODUCTION,
        ts.ctx(),
    );
    let nwn_id = object::id(&nwn);
    nwn.share_network_node(&admin_acl, ts.ctx());
    test_scenario::return_shared(character);
    test_scenario::return_shared(admin_acl);
    test_scenario::return_shared(registry);
    nwn_id
}

/// Create SSU anchored to NWN, share it. Returns ssu_id.
fun create_ssu(ts: &mut test_scenario::Scenario, char_id: ID, nwn_id: ID): ID {
    ts.next_tx(admin());
    let mut registry = ts.take_shared<ObjectRegistry>();
    let mut nwn = test_scenario::take_shared_by_id<NetworkNode>(ts, nwn_id);
    let character = test_scenario::take_shared_by_id<Character>(ts, char_id);
    let admin_acl = ts.take_shared<AdminACL>();
    let ssu = storage_unit::anchor(
        &mut registry, &mut nwn, &character, &admin_acl,
        STORAGE_A_ITEM_ID, STORAGE_A_TYPE_ID, MAX_CAPACITY, LOCATION_HASH,
        ts.ctx(),
    );
    let ssu_id = object::id(&ssu);
    ssu.share_storage_unit(&admin_acl, ts.ctx());
    test_scenario::return_shared(admin_acl);
    test_scenario::return_shared(character);
    test_scenario::return_shared(nwn);
    test_scenario::return_shared(registry);
    ssu_id
}

/// Bring NWN online: borrow owner cap → deposit fuel → online → return cap
fun online_nwn(ts: &mut test_scenario::Scenario, owner: address, char_id: ID, nwn_id: ID) {
    let clk = clock::create_for_testing(ts.ctx());

    ts.next_tx(owner);
    let mut character = test_scenario::take_shared_by_id<Character>(ts, char_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<NetworkNode>(
        test_scenario::most_recent_receiving_ticket<OwnerCap<NetworkNode>>(&char_id),
        ts.ctx(),
    );

    ts.next_tx(owner);
    {
        let mut nwn = test_scenario::take_shared_by_id<NetworkNode>(ts, nwn_id);
        nwn.deposit_fuel_test(&owner_cap, FUEL_TYPE_ID, FUEL_VOLUME, 10, &clk);
        test_scenario::return_shared(nwn);
    };

    ts.next_tx(owner);
    {
        let mut nwn = test_scenario::take_shared_by_id<NetworkNode>(ts, nwn_id);
        nwn.online(&owner_cap, &clk);
        test_scenario::return_shared(nwn);
    };

    character.return_owner_cap(owner_cap, receipt);
    test_scenario::return_shared(character);
    clk.destroy_for_testing();
}

/// Bring SSU online: borrow owner cap → online → return cap
fun online_ssu(ts: &mut test_scenario::Scenario, owner: address, char_id: ID, ssu_id: ID, nwn_id: ID) {
    ts.next_tx(owner);
    let mut character = test_scenario::take_shared_by_id<Character>(ts, char_id);
    let mut ssu = test_scenario::take_shared_by_id<StorageUnit>(ts, ssu_id);
    let mut nwn = test_scenario::take_shared_by_id<NetworkNode>(ts, nwn_id);
    let energy_config = ts.take_shared<EnergyConfig>();
    let (owner_cap, receipt) = character.borrow_owner_cap<StorageUnit>(
        test_scenario::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&char_id),
        ts.ctx(),
    );
    ssu.online(&mut nwn, &energy_config, &owner_cap);
    character.return_owner_cap(owner_cap, receipt);
    test_scenario::return_shared(energy_config);
    test_scenario::return_shared(nwn);
    test_scenario::return_shared(ssu);
    test_scenario::return_shared(character);
}

/// Full flow: create NWN + SSU + bring both online. Returns (ssu_id, nwn_id).
fun create_and_online_ssu(ts: &mut test_scenario::Scenario, owner: address, char_id: ID): (ID, ID) {
    let nwn_id = create_nwn(ts, char_id);
    let ssu_id = create_ssu(ts, char_id, nwn_id);
    online_nwn(ts, owner, char_id, nwn_id);
    online_ssu(ts, owner, char_id, ssu_id, nwn_id);
    (ssu_id, nwn_id)
}

// === Tests ===

#[test]
fun test_purchase_via_ssu_online() {
    let mut ts = test_scenario::begin(admin());
    full_setup(&mut ts);
    let char_id = create_character(&mut ts, PLAYER_A, CHAR_A_ID);
    seed_pool(&mut ts, PLAYER_A, LP_DEPOSIT);
    let (ssu_id, _nwn_id) = create_and_online_ssu(&mut ts, PLAYER_A, char_id);

    // Purchase insurance via online SSU
    ts.next_tx(PLAYER_A);
    let ssu = test_scenario::take_shared_by_id<StorageUnit>(&ts, ssu_id);
    let cfg = ts.take_shared<ProtocolConfig>();
    let mut pool = ts.take_shared<RiskPool>();
    let mut policy_reg = ts.take_shared<PolicyRegistry>();
    let character = test_scenario::take_shared_by_id<Character>(&ts, char_id);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, ts.ctx());
    let clk = clock::create_for_testing(ts.ctx());

    let policy = ssu_extension::purchase_via_ssu(
        &ssu, &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, ts.ctx(),
    );
    assert!(policy.is_active());

    transfer::public_transfer(policy, PLAYER_A);
    clk.destroy_for_testing();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    test_scenario::return_shared(ssu);
    ts.end();
}

#[test]
#[expected_failure]
fun test_purchase_via_ssu_offline_fails() {
    let mut ts = test_scenario::begin(admin());
    full_setup(&mut ts);
    let char_id = create_character(&mut ts, PLAYER_A, CHAR_A_ID);
    seed_pool(&mut ts, PLAYER_A, LP_DEPOSIT);

    // Create NWN + SSU but do NOT bring them online
    let nwn_id = create_nwn(&mut ts, char_id);
    let ssu_id = create_ssu(&mut ts, char_id, nwn_id);

    // Try purchase on OFFLINE SSU — should abort
    ts.next_tx(PLAYER_A);
    let ssu = test_scenario::take_shared_by_id<StorageUnit>(&ts, ssu_id);
    let cfg = ts.take_shared<ProtocolConfig>();
    let mut pool = ts.take_shared<RiskPool>();
    let mut policy_reg = ts.take_shared<PolicyRegistry>();
    let character = test_scenario::take_shared_by_id<Character>(&ts, char_id);
    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, ts.ctx());
    let clk = clock::create_for_testing(ts.ctx());

    let policy = ssu_extension::purchase_via_ssu(
        &ssu, &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, payment, &clk, ts.ctx(),
    );
    // Should never reach here
    transfer::public_transfer(policy, PLAYER_A);
    clk.destroy_for_testing();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    test_scenario::return_shared(ssu);
    ts.end();
}
