// Red Team Round 10: Combo Attack (Object Manipulation + DoS)
// Attack: Auction objects are shared and never cleaned up after settlement.
// settled/destroyed auctions persist as shared objects forever.
// Also: buyout overpayment — if payment > floor_price, excess is kept, not refunded.
#[test_only]
module wreckage_protocol::red_team_round_10;

use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::clock;
use wreckage_core::pool_config;
use wreckage_core::salvage_nft;
use wreckage_protocol::init as protocol_init;
use wreckage_protocol::config::{Self, AdminCap, ProtocolConfig};
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::auction::{Self, AuctionRegistry, Auction};

const ADMIN: address = @0xAD;
const BUYER: address = @0xBB;

fun setup(scenario: &mut test_scenario::Scenario) {
    world::test_helpers::setup_world(scenario);
    scenario.next_tx(ADMIN);
    protocol_init::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);

    let cap = scenario.take_from_sender<AdminCap>();
    let mut cfg = scenario.take_shared<ProtocolConfig>();
    config::add_pool_tier(&cap, &mut cfg, pool_config::test_pool_config());
    config::admin_create_pool(&cap, &cfg, pool_config::test_pool_config(), scenario.ctx());
    scenario.return_to_sender(cap);
    test_scenario::return_shared(cfg);
    scenario.next_tx(ADMIN);

    let mut pool = scenario.take_shared<RiskPool>();
    let clk = clock::create_for_testing(scenario.ctx());
    let seed = coin::mint_for_testing<SUI>(100_000_000_000, scenario.ctx());
    let pos = risk_pool::deposit(&mut pool, seed, &clk, scenario.ctx());
    transfer::public_transfer(pos, ADMIN);
    test_scenario::return_shared(pool);
    clk.destroy_for_testing();
    scenario.next_tx(ADMIN);
}

// ATTACK: Buyout overpayment — excess funds are NOT refunded.
// If buyer pays 10 SUI for a 2.1 SUI floor_price, the full 10 SUI is kept.
// buyer.highest_bid = payment.value() — entire payment goes to escrow and revenue split.
#[test]
fun red_team_round_10_buyout_overpayment_not_refunded() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    let mut pool = scenario.take_shared<RiskPool>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let nft = salvage_nft::mint(
        world::test_helpers::in_game_id(1001),
        world::test_helpers::in_game_id(42),
        world::test_helpers::in_game_id(100),
        1, 1000, 3_000_000_000,
        scenario.ctx(),
    );
    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(cfg);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(pool);
    scenario.next_tx(BUYER);

    let mut auction_obj = scenario.take_shared<Auction>();
    let floor = auction::floor_price(&auction_obj);
    // floor_price = 3B * 7000/10000 = 2.1B, but >= min_opening_bid(0.1B), so 2.1B

    // Advance past bidding phase (no bids placed)
    let ends_at = auction::ends_at(&auction_obj);
    clock::set_for_testing(&mut clk, (ends_at + 1) * 1000);

    // Buyout with massive overpayment (10 SUI for 2.1 SUI floor)
    let overpayment = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
    let mut registry = scenario.take_shared<AuctionRegistry>();
    let mut pool = scenario.take_shared<RiskPool>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    let pool_liq_before = risk_pool::raw_liquidity_value(&pool);

    auction::buyout(
        &mut auction_obj, &mut registry, &mut pool, &cfg, overpayment, &clk, scenario.ctx(),
    );

    // The full 10 SUI was captured, not just the 2.1 SUI floor
    // Revenue: 10B * 80% = 8B to pool, 2B to treasury
    let pool_liq_after = risk_pool::raw_liquidity_value(&pool);
    let pool_revenue = pool_liq_after - pool_liq_before;
    assert!(pool_revenue == 8_000_000_000); // 80% of FULL 10 SUI, not floor price

    // Buyer lost 7.9 SUI in excess (10 - 2.1) — no refund mechanism
    assert!(auction::highest_bid(&auction_obj) == 10_000_000_000);

    test_scenario::return_shared(cfg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(auction_obj);
    clk.destroy_for_testing();
    scenario.end();
}

// ATTACK: Settled auction objects are never destroyed — shared objects persist forever.
// After settlement, the Auction still exists as a shared object with status SETTLED.
// Over time, this creates unbounded on-chain storage bloat.
#[test]
fun red_team_round_10_settled_auction_persists() {
    let mut scenario = test_scenario::begin(ADMIN);
    setup(&mut scenario);

    let mut pool = scenario.take_shared<RiskPool>();
    let mut clk = clock::create_for_testing(scenario.ctx());
    clock::set_for_testing(&mut clk, 1_000_000_000);

    let mut registry = scenario.take_shared<AuctionRegistry>();
    let cfg = scenario.take_shared<ProtocolConfig>();
    let nft = salvage_nft::mint(
        world::test_helpers::in_game_id(2001),
        world::test_helpers::in_game_id(42),
        world::test_helpers::in_game_id(100),
        1, 1000, 3_000_000_000,
        scenario.ctx(),
    );
    auction::create_auction(&mut registry, nft, 2, &cfg, &clk, scenario.ctx());
    test_scenario::return_shared(cfg);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(pool);
    scenario.next_tx(ADMIN);

    // Place bid + settle in same take
    let mut auction_obj = scenario.take_shared<Auction>();
    let bid = coin::mint_for_testing<SUI>(3_000_000_000, scenario.ctx());
    auction::place_bid(&mut auction_obj, bid, &clk, scenario.ctx());

    // Advance past auction end and settle in same take
    let ends_at_val = auction::ends_at(&auction_obj);
    clock::set_for_testing(&mut clk, (ends_at_val + 1) * 1000);

    let mut registry = scenario.take_shared<AuctionRegistry>();
    let mut pool = scenario.take_shared<RiskPool>();
    let cfg = scenario.take_shared<ProtocolConfig>();

    auction::settle_auction(
        &mut auction_obj, &mut registry, &mut pool, &cfg, &clk, scenario.ctx(),
    );

    // Auction is settled but still exists as a shared object
    assert!(auction::status(&auction_obj) == auction::status_settled());
    // There is NO destroy/cleanup function for settled auctions

    test_scenario::return_shared(cfg);
    test_scenario::return_shared(pool);
    test_scenario::return_shared(registry);
    test_scenario::return_shared(auction_obj);
    clk.destroy_for_testing();
    scenario.end();
}
