// contracts/wreckage-protocol/tests/e2e_tests.move
/// End-to-End integration tests and monkey tests.
/// Covers the full Demo Script (spec section 17) and extreme edge cases.
#[test_only]
module wreckage_protocol::e2e_tests;

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
use wreckage_protocol::policy;
use wreckage_protocol::pool_config;
use wreckage_protocol::salvage_nft::{Self, SalvageNFT};
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::registry::{Self, ClaimRegistry, PolicyRegistry};
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::underwriting;
use wreckage_protocol::claims;
use wreckage_protocol::auction::{Self, AuctionRegistry, Auction};
use wreckage_protocol::integration;

// === Addresses ===
const ADMIN: address = @0xAD;
const PLAYER_A: address = @0xA1;
const PLAYER_B: address = @0xBB;
const PLAYER_C: address = @0xC1;
const PLAYER_D: address = @0xD1;
const PLAYER_E: address = @0xE1;
const KILLER_X: u64 = 999;

// === Character IDs ===
const CHAR_A_ID: u32 = 42;
const CHAR_D_ID: u32 = 44;
const CHAR_E_ID: u32 = 45;
const TRIBE_ID: u32 = 1;

// === Constants ===
const COVERAGE: u64 = 10_000_000_000;     // 10 SUI
const OVERPAYMENT: u64 = 20_000_000_000;  // 20 SUI
const LP_DEPOSIT: u64 = 100_000_000_000;  // 100 SUI

// Tier 2 test config payouts (deductible 10%, decay 10%, SD rate 50%)
const EXPECTED_PAYOUT_0: u64 = 9_000_000_000;   // first claim, no decay
const EXPECTED_SD_PAYOUT_0: u64 = 4_500_000_000; // SD: 9B * 50%

// === Setup Helpers ===
fun setup_world_and_protocol(scenario: &mut test_scenario::Scenario) {
    test_helpers::setup_world(scenario);

    scenario.next_tx(ADMIN);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);

    // Add pool tier config (tier 2)
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
}

fun seed_pool(scenario: &mut test_scenario::Scenario, depositor: address, amount: u64) {
    scenario.next_tx(depositor);
    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());
    let deposit = coin::mint_for_testing<SUI>(amount, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());
    transfer::public_transfer(position, depositor);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.next_tx(depositor);
}

fun create_and_share_character(
    scenario: &mut test_scenario::Scenario,
    char_id: u32,
    owner: address,
    name: vector<u8>,
) {
    let world_admin = test_helpers::admin();
    scenario.next_tx(world_admin);
    let admin_acl = scenario.take_shared<AdminACL>();
    let mut registry = scenario.take_shared<ObjectRegistry>();
    let character = character::create_character(
        &mut registry, &admin_acl, char_id, test_helpers::tenant(),
        TRIBE_ID, owner, utf8(name), scenario.ctx(),
    );
    character.share_character(&admin_acl, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(admin_acl);
    scenario.next_tx(owner);
}

// ============================================================
// E2E Test 1: Full Insurance Lifecycle (Demo Script Steps 1-6)
// Insure → LP deposit → Kill → Claim → Auction bid → Settle
// ============================================================

#[test]
fun test_e2e_full_lifecycle() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");

    // [LP] Player B deposits 100 SUI
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    // [投保] Player A insures character, Tier 2 + SD rider
    scenario.next_tx(PLAYER_A);
    {
        let cfg = scenario.take_shared<ProtocolConfig>();
        let mut pool = scenario.take_shared<RiskPool>();
        let mut policy_reg = scenario.take_shared<PolicyRegistry>();
        let mut claim_reg = scenario.take_shared<ClaimRegistry>();
        let character = scenario.take_shared<Character>();
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1_000_000_000);
        let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

        let mut policy_a = underwriting::purchase_policy(
            &cfg, &mut pool, &mut policy_reg, &character,
            COVERAGE, true, payment, &clk, scenario.ctx(),
        );

        assert!(policy::is_active(&policy_a));
        assert!(policy::has_self_destruct_rider(&policy_a));
        assert!(risk_pool::reserved_amount(&pool) == COVERAGE);

        // [戰損] Killmail: Player X kills Player A
        let victim_id = character.key();
        let killer_id = test_helpers::in_game_id(KILLER_X);
        let km_key = test_helpers::in_game_id(5001);
        let km = killmail::create_test_killmail(
            km_key, killer_id, victim_id, 1_500_000, scenario.ctx(),
        );
        clock::set_for_testing(&mut clk, 1_500_000_000);

        // [理賠] Submit claim → payout + SalvageNFT + SubrogationEvent
        claims::submit_claim(
            &mut policy_a, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
        );

        // Verify payout (10% deductible → 9 SUI)
        assert!(policy::claim_count(&policy_a) == 1);
        assert!(risk_pool::total_claims_paid(&pool) == EXPECTED_PAYOUT_0);
        assert!(risk_pool::reserved_amount(&pool) == 0);
        assert!(registry::is_killmail_claimed(&claim_reg, km_key));

        policy_a.destroy();
        killmail::destroy_for_testing(km);
        test_scenario::return_shared(claim_reg);
        test_scenario::return_shared(character);
        test_scenario::return_shared(policy_reg);
        test_scenario::return_shared(pool);
        test_scenario::return_shared(cfg);
        clk.destroy_for_testing();
    };

    // Player A should have payout coin + SalvageNFT
    scenario.next_tx(PLAYER_A);
    {
        let payout_coin = scenario.take_from_sender<coin::Coin<SUI>>();
        assert!(payout_coin.value() == EXPECTED_PAYOUT_0);
        scenario.return_to_sender(payout_coin);

        let salvage = scenario.take_from_sender<SalvageNFT>();
        assert!(salvage_nft::status(&salvage) == salvage_nft::status_auction());
        scenario.return_to_sender(salvage);
    };

    // [拍賣] Create auction from salvage NFT, then Player C bids
    scenario.next_tx(PLAYER_A);
    {
        let nft = scenario.take_from_sender<SalvageNFT>();
        let mut registry = scenario.take_shared<AuctionRegistry>();
        let cfg = scenario.take_shared<ProtocolConfig>();
        let clk = clock::create_for_testing(scenario.ctx());

        auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
        assert!(auction::active_count(&registry) == 1);

        test_scenario::return_shared(registry);
        test_scenario::return_shared(cfg);
        clk.destroy_for_testing();
    };

    // Player C bids 5 SUI
    scenario.next_tx(PLAYER_C);
    {
        let mut auc = scenario.take_shared<Auction>();
        let clk = clock::create_for_testing(scenario.ctx());
        let bid = coin::mint_for_testing<SUI>(5_000_000_000, scenario.ctx());
        auction::place_bid(&mut auc, bid, &clk, scenario.ctx());
        assert!(auction::highest_bid(&auc) == 5_000_000_000);
        test_scenario::return_shared(auc);
        clk.destroy_for_testing();
    };

    // Advance past auction end, settle
    scenario.next_tx(ADMIN);
    {
        let mut auc = scenario.take_shared<Auction>();
        let mut registry = scenario.take_shared<AuctionRegistry>();
        let mut pool = scenario.take_shared<RiskPool>();
        let cfg = scenario.take_shared<ProtocolConfig>();
        let pool_liq_before = risk_pool::raw_liquidity_value(&pool);

        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::increment_for_testing(&mut clk, 259201 * 1000); // past 72h

        auction::settle_auction(
            &mut auc, &mut registry, &mut pool, &cfg, &clk, scenario.ctx(),
        );

        assert!(auction::status(&auc) == auction::status_settled());
        assert!(auction::active_count(&registry) == 0);

        // Revenue split: 5 SUI * 80% = 4 SUI to pool, 20% = 1 SUI to treasury
        let pool_liq_after = risk_pool::raw_liquidity_value(&pool);
        assert!(pool_liq_after == pool_liq_before + 4_000_000_000);

        test_scenario::return_shared(auc);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(pool);
        test_scenario::return_shared(cfg);
        clk.destroy_for_testing();
    };

    // Player C should have the NFT
    scenario.next_tx(PLAYER_C);
    {
        let nft = scenario.take_from_sender<SalvageNFT>();
        assert!(salvage_nft::status(&nft) == salvage_nft::status_sold());
        scenario.return_to_sender(nft);
    };

    scenario.end();
}

// ============================================================
// E2E Test 2: Self-Destruct Claim Path (Demo Step 8)
// ============================================================

#[test]
fun test_e2e_self_destruct_claim() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_D_ID, PLAYER_D, b"PilotD");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_D);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    let payment = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let mut policy_d = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, true, payment, &clk, scenario.ctx(),
    );

    // Self-destruct: killer == victim, after 7d waiting period
    let victim_id = character.key();
    let kill_ts = 1_700_000u64; // past 1M + 604800 = 1604800
    let km_key = test_helpers::in_game_id(6001);
    let km = killmail::create_test_killmail(
        km_key, victim_id, victim_id, kill_ts, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_700_000_000);

    claims::submit_self_destruct_claim(
        &mut policy_d, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    // SD payout: 10 SUI * 0.9 (deductible) * 0.5 (SD rate) = 4.5 SUI
    assert!(risk_pool::total_claims_paid(&pool) == EXPECTED_SD_PAYOUT_0);
    assert!(policy::claim_count(&policy_d) == 1);

    policy_d.destroy();
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
// E2E Test 3a: Renewal after claim (streak reset) (Demo Step 9)
// ============================================================

#[test]
fun test_e2e_renewal_after_claim() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_A);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let mut pa = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay, &clk, scenario.ctx(),
    );

    // Claim to reset streak
    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(KILLER_X);
    let km_key = test_helpers::in_game_id(7001);
    let km = killmail::create_test_killmail(
        km_key, killer_id, victim_id, 1_500_000, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_500_000_000);
    claims::submit_claim(
        &mut pa, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );
    assert!(policy::no_claim_streak(&pa) == 0);

    // Advance past expiry and renew
    let expiry_ms = (policy::expires_at(&pa) + 1) * 1000;
    clock::set_for_testing(&mut clk, expiry_ms);
    let renew_pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    underwriting::renew_policy(&mut pa, &cfg, &mut pool, renew_pay, &clk, scenario.ctx());

    // Streak was 0 (claimed) → renew increments to 1 → NCB = 10%
    // Premium = 500M * (10000 - 1000) / 10000 = 450M
    assert!(policy::no_claim_streak(&pa) == 1);
    assert!(policy::premium_paid(&pa) == 450_000_000);

    pa.destroy();
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
// E2E Test 3b: NCB capped at 30% after 3+ claim-free renewals (Demo Step 10)
// ============================================================

#[test]
fun test_e2e_ncb_capped_discount() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_E_ID, PLAYER_E, b"PilotE");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_E);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);

    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let mut pe = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay, &clk, scenario.ctx(),
    );

    // Renew 3 times (claim-free) → streak = 3, NCB capped at 30%
    let mut i = 0u64;
    while (i < 3) {
        let expiry_ms = (policy::expires_at(&pe) + 1) * 1000;
        clock::set_for_testing(&mut clk, expiry_ms);
        let rpay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
        underwriting::renew_policy(&mut pe, &cfg, &mut pool, rpay, &clk, scenario.ctx());
        i = i + 1;
    };

    assert!(policy::no_claim_streak(&pe) == 3);
    // Premium = 500M * (10000 - 3000) / 10000 = 350M
    assert!(policy::premium_paid(&pe) == 350_000_000);

    pe.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// E2E Test 4: Duplicate Killmail Rejection (Demo Step 12)
// ============================================================

#[test]
#[expected_failure]
fun test_e2e_duplicate_killmail_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_A);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let mut pa = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay, &clk, scenario.ctx(),
    );

    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(KILLER_X);
    let same_km_key = test_helpers::in_game_id(8001);

    // First claim OK
    let km1 = killmail::create_test_killmail(
        same_km_key, killer_id, victim_id, 1_500_000, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_500_000_000);
    claims::submit_claim(&mut pa, &km1, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx());

    // Advance past cooldown
    let cd_ms = (policy::cooldown_until(&pa) + 1) * 1000;
    clock::set_for_testing(&mut clk, cd_ms);

    // Same killmail key → should abort
    let km2 = killmail::create_test_killmail(
        same_km_key, killer_id, victim_id, cd_ms / 1000, scenario.ctx(),
    );
    claims::submit_claim(&mut pa, &km2, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx());

    pa.destroy();
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
// E2E Test 5: Duplicate Character Policy Rejection (Demo Step 11)
// ============================================================

#[test]
#[expected_failure]
fun test_e2e_duplicate_character_policy_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_A);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());

    let pay1 = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let p1 = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay1, &clk, scenario.ctx(),
    );

    // Second purchase same character → abort
    let pay2 = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let p2 = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay2, &clk, scenario.ctx(),
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

// ============================================================
// E2E Test 6: Integration Mock — Salvage Bounty
// ============================================================

#[test]
fun test_e2e_mock_salvage_bounty() {
    let mut scenario = test_scenario::begin(ADMIN);

    let nft = salvage_nft::mint(
        test_helpers::in_game_id(1001),
        test_helpers::in_game_id(42),
        test_helpers::in_game_id(100),
        1, 1000, 3_000_000_000,
        scenario.ctx(),
    );

    let clk = clock::create_for_testing(scenario.ctx());
    let bounty_req = integration::mock_create_salvage_bounty(&nft, 1_000_000_000, &clk);

    assert!(integration::bounty_nft_id(&bounty_req) == salvage_nft::id(&nft));
    assert!(integration::bounty_reward(&bounty_req) == 1_000_000_000);
    // Deadline = 0 + 604800 (7 days)
    assert!(integration::bounty_deadline(&bounty_req) == 604800);

    salvage_nft::destroy(nft);
    clk.destroy_for_testing();
    scenario.end();
}

// ============================================================
// E2E Test 7: Integration Mock — Fleet Insurance
// ============================================================

#[test]
fun test_e2e_mock_fleet_insure() {
    let scenario = test_scenario::begin(ADMIN);

    let char_ids = vector[
        test_helpers::in_game_id(1),
        test_helpers::in_game_id(2),
        test_helpers::in_game_id(3),
    ];

    let fleet_id = object::id_from_address(@0xF1);
    let req = integration::create_fleet_request(
        fleet_id, char_ids, 2, COVERAGE, true,
    );

    assert!(integration::fleet_id(&req) == fleet_id);
    assert!(integration::fleet_risk_tier(&req) == 2);
    assert!(integration::fleet_coverage_per_unit(&req) == COVERAGE);
    assert!(integration::fleet_include_self_destruct(&req));
    assert!(integration::fleet_character_ids(&req).length() == 3);

    // Mock returns empty vector
    let policy_ids = integration::mock_fleet_insure(req);
    assert!(policy_ids.length() == 0);

    scenario.end();
}

// ============================================================
// MONKEY TESTS — Extreme Edge Cases
// ============================================================

// Monkey 1: Deposit 1 MIST — virtual liquidity prevents attack
#[test]
fun test_monkey_deposit_1_mist() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);

    scenario.next_tx(PLAYER_B);
    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());

    // Deposit 1 MIST
    let tiny = coin::mint_for_testing<SUI>(1, scenario.ctx());
    let position = risk_pool::deposit(&mut pool, tiny, &clk, scenario.ctx());

    // Virtual liquidity (1000 MIST) prevents the first depositor from getting
    // disproportionate share. Shares should be ~1 (not 0).
    // The deposit should succeed without abort.
    transfer::public_transfer(position, PLAYER_B);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.end();
}

// Monkey 2: Rapid sequential bids on same auction
#[test]
fun test_monkey_rapid_sequential_bids() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    config::admin_create_pool(&cap, &cfg, pool_config::test_pool_config(), scenario.ctx());
    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.next_tx(admin);

    let nft = salvage_nft::mint(
        test_helpers::in_game_id(2001),
        test_helpers::in_game_id(42),
        test_helpers::in_game_id(100),
        1, 1000, 3_000_000_000,
        scenario.ctx(),
    );
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let clk = clock::create_for_testing(scenario.ctx());
    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();

    // 5 rapid bids from alternating bidders
    let bidders = vector[@0xB1, @0xB2, @0xB3, @0xB4, @0xB5];
    let mut bid_amount = 3_000_000_000u64; // start above floor (2.1 SUI)
    let mut i = 0u64;
    while (i < 5) {
        let bidder = bidders[i];
        scenario.next_tx(bidder);
        let mut auc = scenario.take_shared<Auction>();
        let clk = clock::create_for_testing(scenario.ctx());
        let bid = coin::mint_for_testing<SUI>(bid_amount, scenario.ctx());
        auction::place_bid(&mut auc, bid, &clk, scenario.ctx());
        assert!(auction::highest_bid(&auc) == bid_amount);
        test_scenario::return_shared(auc);
        clk.destroy_for_testing();

        bid_amount = bid_amount + 1_000_000_000; // +1 SUI each time
        i = i + 1;
    };

    // Final highest bid should be 7 SUI
    scenario.next_tx(admin);
    let auc = scenario.take_shared<Auction>();
    assert!(auction::highest_bid(&auc) == 7_000_000_000);
    test_scenario::return_shared(auc);

    // Previous bidders should have refunds
    scenario.next_tx(@0xB1);
    let refund = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(refund.value() == 3_000_000_000);
    scenario.return_to_sender(refund);

    scenario.end();
}

// Monkey 3: Max claims per policy boundary (max = 5 from ProtocolConfig default)
#[test]
#[expected_failure]
fun test_monkey_max_claims_boundary() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");
    seed_pool(&mut scenario, PLAYER_B, 500_000_000_000); // 500 SUI to cover multiple claims

    scenario.next_tx(PLAYER_A);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let mut pa = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay, &clk, scenario.ctx(),
    );

    let victim_id = character.key();
    let killer_id = test_helpers::in_game_id(KILLER_X);

    // Submit max_claims_per_policy (5) claims successfully
    let mut claim_idx = 0u64;
    while (claim_idx < 5) {
        let km_key = test_helpers::in_game_id(9000 + claim_idx);
        let now_s = clk.timestamp_ms() / 1000;
        let km = killmail::create_test_killmail(
            km_key, killer_id, victim_id, now_s, scenario.ctx(),
        );
        claims::submit_claim(
            &mut pa, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
        );
        killmail::destroy_for_testing(km);

        // Advance past cooldown
        let cd_ms = (policy::cooldown_until(&pa) + 1) * 1000;
        clock::set_for_testing(&mut clk, cd_ms);
        claim_idx = claim_idx + 1;
    };

    assert!(policy::claim_count(&pa) == 5);

    // 6th claim should fail (max_claims_reached)
    let km_key = test_helpers::in_game_id(9999);
    let now_s = clk.timestamp_ms() / 1000;
    let km = killmail::create_test_killmail(
        km_key, killer_id, victim_id, now_s, scenario.ctx(),
    );
    claims::submit_claim(
        &mut pa, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    pa.destroy();
    killmail::destroy_for_testing(km);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// Monkey 4: Zero coverage edge case (below minimum → reject)
#[test]
#[expected_failure]
fun test_monkey_zero_coverage() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_A);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let character = scenario.take_shared<Character>();
    let clk = clock::create_for_testing(scenario.ctx());
    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());

    // Coverage = 0 → should abort
    let p = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        0, false, pay, &clk, scenario.ctx(),
    );

    p.destroy();
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}

// Monkey 5: Self-destruct without rider → reject
#[test]
#[expected_failure]
fun test_monkey_self_destruct_without_rider() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup_world_and_protocol(&mut scenario);
    create_and_share_character(&mut scenario, CHAR_A_ID, PLAYER_A, b"PilotA");
    seed_pool(&mut scenario, PLAYER_B, LP_DEPOSIT);

    scenario.next_tx(PLAYER_A);
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut pool = scenario.take_shared<RiskPool>();
    let mut policy_reg = scenario.take_shared<PolicyRegistry>();
    let mut claim_reg = scenario.take_shared<ClaimRegistry>();
    let character = scenario.take_shared<Character>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    // Purchase WITHOUT self-destruct rider
    let pay = coin::mint_for_testing<SUI>(OVERPAYMENT, scenario.ctx());
    let mut pa = underwriting::purchase_policy(
        &cfg, &mut pool, &mut policy_reg, &character,
        COVERAGE, false, pay, &clk, scenario.ctx(),
    );

    // Self-destruct claim without rider → should abort
    let victim_id = character.key();
    let km_key = test_helpers::in_game_id(7777);
    let km = killmail::create_test_killmail(
        km_key, victim_id, victim_id, 1_700_000, scenario.ctx(),
    );
    clock::set_for_testing(&mut clk, 1_700_000_000);

    claims::submit_self_destruct_claim(
        &mut pa, &km, &mut pool, &mut claim_reg, &cfg, &clk, scenario.ctx(),
    );

    pa.destroy();
    killmail::destroy_for_testing(km);
    test_scenario::return_shared(claim_reg);
    test_scenario::return_shared(character);
    test_scenario::return_shared(policy_reg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    clk.destroy_for_testing();
    scenario.end();
}
