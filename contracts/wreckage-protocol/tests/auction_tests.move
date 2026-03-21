// contracts/wreckage-protocol/tests/auction_tests.move
#[test_only]
module wreckage_protocol::auction_tests;

use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use wreckage_core::pool_config;
use wreckage_core::salvage_nft::{Self, SalvageNFT};
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::auction::{Self, AuctionRegistry, Auction};

// === Helpers ===

/// Setup protocol + pool + LP deposit so pool has liquidity.
/// Returns after admin's tx.
fun setup_protocol(scenario: &mut test_scenario::Scenario, admin: address) {
    // Init protocol
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    // Add pool tier + create pool
    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    let pool_cfg = pool_config::test_pool_config(); // tier 2
    config::add_pool_tier(&cap, &mut cfg, pool_cfg);
    config::admin_create_pool(&cap, &cfg, pool_cfg, scenario.ctx());
    test_scenario::return_shared(cfg);
    scenario.return_to_sender(cap);
    scenario.next_tx(admin);
}

/// Mint a test SalvageNFT directly (bypass killmail for auction tests).
fun mint_test_nft(scenario: &mut test_scenario::Scenario): SalvageNFT {
    let killmail_id = world::test_helpers::in_game_id(1001);
    let victim_id = world::test_helpers::in_game_id(42);
    let solar_id = world::test_helpers::in_game_id(100);
    salvage_nft::mint(
        killmail_id, victim_id, solar_id,
        1,       // loss_type = ship
        1000,    // kill_timestamp
        3_000_000_000, // estimated_value = 3 SUI (tier 2)
        scenario.ctx(),
    )
}

#[test]
fun test_auction_registry_created_on_init() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    // AuctionRegistry should be shared
    let registry = scenario.take_shared<AuctionRegistry>();
    assert!(auction::active_count(&registry) == 0);
    test_scenario::return_shared(registry);

    scenario.end();
}

#[test]
fun test_create_auction_and_place_bid_and_settle() {
    let admin = @0xAD;
    let bidder = @0xB1;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    // LP deposit so pool has funds
    let mut pool = scenario.take_shared<RiskPool>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    let deposit = coin::mint_for_testing<SUI>(100_000_000_000, scenario.ctx()); // 100 SUI
    let lp = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());
    transfer::public_transfer(lp, admin);
    test_scenario::return_shared(pool);
    scenario.next_tx(admin);

    // Create auction
    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    assert!(auction::active_count(&registry) == 1);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(bidder);

    // Place bid (floor_price = 3 SUI * 7000/10000 = 2.1 SUI)
    let mut auc = scenario.take_shared<Auction>();
    assert!(auction::status(&auc) == auction::status_bidding());
    let floor = auction::floor_price(&auc);
    assert!(floor == 2_100_000_000); // 2.1 SUI

    let bid = coin::mint_for_testing<SUI>(3_000_000_000, scenario.ctx()); // 3 SUI
    auction::place_bid(&mut auc, bid, &clk, scenario.ctx());
    assert!(auction::highest_bid(&auc) == 3_000_000_000);
    test_scenario::return_shared(auc);
    scenario.next_tx(admin);

    // Advance clock past ends_at (72h = 259200s → ms)
    clock::increment_for_testing(&mut clk, 259200 * 1000 + 1000);

    // Settle
    let mut auc = scenario.take_shared<Auction>();
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let mut pool = scenario.take_shared<RiskPool>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    auction::settle_auction(&mut auc, &mut registry, &mut pool, &cfg, &clk, scenario.ctx());

    assert!(auction::status(&auc) == auction::status_settled());
    assert!(auction::active_count(&registry) == 0);

    test_scenario::return_shared(auc);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    scenario.next_tx(bidder);

    // Bidder should have the NFT
    let nft = scenario.take_from_sender<SalvageNFT>();
    assert!(salvage_nft::status(&nft) == salvage_nft::status_sold());
    scenario.return_to_sender(nft);

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
#[expected_failure]
fun test_bid_too_low() {
    let admin = @0xAD;
    let bidder = @0xB1;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let clk = clock::create_for_testing(scenario.ctx());

    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(bidder);

    // Bid below floor price — should fail
    let mut auc = scenario.take_shared<Auction>();
    let low_bid = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()); // 0.1 SUI < 2.1 SUI floor
    auction::place_bid(&mut auc, low_bid, &clk, scenario.ctx());

    test_scenario::return_shared(auc);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun test_outbid_returns_previous_bid() {
    let admin = @0xAD;
    let bidder1 = @0xB1;
    let bidder2 = @0xB2;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let clk = clock::create_for_testing(scenario.ctx());

    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(bidder1);

    // Bidder1 places first bid
    let mut auc = scenario.take_shared<Auction>();
    let bid1 = coin::mint_for_testing<SUI>(3_000_000_000, scenario.ctx()); // 3 SUI
    auction::place_bid(&mut auc, bid1, &clk, scenario.ctx());
    assert!(auction::highest_bid(&auc) == 3_000_000_000);
    test_scenario::return_shared(auc);
    scenario.next_tx(bidder2);

    // Bidder2 outbids
    let mut auc = scenario.take_shared<Auction>();
    let bid2 = coin::mint_for_testing<SUI>(5_000_000_000, scenario.ctx()); // 5 SUI
    auction::place_bid(&mut auc, bid2, &clk, scenario.ctx());
    assert!(auction::highest_bid(&auc) == 5_000_000_000);
    test_scenario::return_shared(auc);
    scenario.next_tx(bidder1);

    // Bidder1 should have received refund (3 SUI)
    let refund = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(refund.value() == 3_000_000_000);
    scenario.return_to_sender(refund);

    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun test_anti_snipe_extension() {
    let admin = @0xAD;
    let bidder = @0xB1;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let mut clk = clock::create_for_testing(scenario.ctx());

    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(bidder);

    let mut auc = scenario.take_shared<Auction>();
    let original_ends_at = auction::ends_at(&auc);

    // Advance to within anti-snipe window (last 10 min = 600s)
    // ends_at = 259200, so go to 259200 - 300 = 258900 seconds → ms
    clock::increment_for_testing(&mut clk, 258900 * 1000);

    let bid = coin::mint_for_testing<SUI>(3_000_000_000, scenario.ctx());
    auction::place_bid(&mut auc, bid, &clk, scenario.ctx());

    // ends_at should be extended by 600s
    assert!(auction::ends_at(&auc) == original_ends_at + 600);

    test_scenario::return_shared(auc);
    clock::destroy_for_testing(clk);
    scenario.end();
}

#[test]
fun test_buyout_after_no_bids() {
    let admin = @0xAD;
    let buyer = @0xB1;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    // LP deposit
    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());
    let deposit = coin::mint_for_testing<SUI>(100_000_000_000, scenario.ctx());
    let lp = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());
    transfer::public_transfer(lp, admin);
    test_scenario::return_shared(pool);
    scenario.next_tx(admin);

    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(buyer);

    // Advance past bidding phase (72h)
    let mut clk2 = clock::create_for_testing(scenario.ctx());
    clock::increment_for_testing(&mut clk2, 259201 * 1000); // just past 72h

    // Buyout at floor price
    let mut auc = scenario.take_shared<Auction>();
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let mut pool = scenario.take_shared<RiskPool>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    let floor = auction::floor_price(&auc);
    let payment = coin::mint_for_testing<SUI>(floor, scenario.ctx());

    auction::buyout(&mut auc, &mut registry, &mut pool, &cfg, payment, &clk2, scenario.ctx());

    assert!(auction::status(&auc) == auction::status_settled());
    assert!(auction::active_count(&registry) == 0);

    test_scenario::return_shared(auc);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    scenario.next_tx(buyer);

    // Buyer should have the NFT
    let nft = scenario.take_from_sender<SalvageNFT>();
    assert!(salvage_nft::status(&nft) == salvage_nft::status_sold());
    scenario.return_to_sender(nft);

    clock::destroy_for_testing(clk);
    clock::destroy_for_testing(clk2);
    scenario.end();
}

#[test]
fun test_revenue_split_to_pool_and_treasury() {
    let admin = @0xAD;
    let bidder = @0xB1;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    // LP deposit
    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());
    let deposit = coin::mint_for_testing<SUI>(100_000_000_000, scenario.ctx());
    let lp = risk_pool::deposit(&mut pool, deposit, &clk, scenario.ctx());
    transfer::public_transfer(lp, admin);
    let pool_liq_before = risk_pool::raw_liquidity_value(&pool);
    test_scenario::return_shared(pool);
    scenario.next_tx(admin);

    // Create auction
    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(bidder);

    // Bid 10 SUI
    let mut auc = scenario.take_shared<Auction>();
    let bid = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    auction::place_bid(&mut auc, bid, &clk, scenario.ctx());
    test_scenario::return_shared(auc);
    scenario.next_tx(admin);

    // Advance past end
    let mut clk2 = clock::create_for_testing(scenario.ctx());
    clock::increment_for_testing(&mut clk2, 259201 * 1000);

    // Settle
    let mut auc = scenario.take_shared<Auction>();
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let mut pool = scenario.take_shared<RiskPool>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    auction::settle_auction(&mut auc, &mut registry, &mut pool, &cfg, &clk2, scenario.ctx());

    // Revenue: 10 SUI, 80% to pool = 8 SUI, 20% to treasury = 2 SUI
    let pool_liq_after = risk_pool::raw_liquidity_value(&pool);
    assert!(pool_liq_after == pool_liq_before + 8_000_000_000);

    test_scenario::return_shared(auc);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(cfg);
    scenario.next_tx(admin);

    // Treasury (admin) should have received 2 SUI
    let treasury_coin = scenario.take_from_sender<coin::Coin<SUI>>();
    assert!(treasury_coin.value() == 2_000_000_000);
    scenario.return_to_sender(treasury_coin);

    clock::destroy_for_testing(clk);
    clock::destroy_for_testing(clk2);
    scenario.end();
}

#[test]
fun test_destroy_unsold_nft() {
    let admin = @0xAD;
    let mut scenario = test_scenario::begin(admin);
    world::test_helpers::setup_world(&mut scenario);
    scenario.next_tx(admin);

    setup_protocol(&mut scenario, admin);

    let nft = mint_test_nft(&mut scenario);
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let clk = clock::create_for_testing(scenario.ctx());

    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    assert!(auction::active_count(&registry) == 1);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    scenario.next_tx(admin);

    // Advance past bidding + buyout phase (72h + 48h = 120h = 432000s)
    let mut clk2 = clock::create_for_testing(scenario.ctx());
    clock::increment_for_testing(&mut clk2, 432001 * 1000);

    let mut auc = scenario.take_shared<Auction>();
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    auction::destroy_unsold(&mut auc, &mut registry, &cfg, &clk2, scenario.ctx());

    assert!(auction::status(&auc) == auction::status_destroyed());
    assert!(auction::active_count(&registry) == 0);

    test_scenario::return_shared(auc);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(cfg);
    clock::destroy_for_testing(clk);
    clock::destroy_for_testing(clk2);
    scenario.end();
}
