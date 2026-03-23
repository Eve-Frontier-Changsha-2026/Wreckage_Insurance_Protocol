// contracts/wreckage-protocol/sources/auction.move
module wreckage_protocol::auction;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use wreckage_protocol::salvage_nft::{Self, SalvageNFT};
use wreckage_protocol::errors;
use wreckage_protocol::config::ProtocolConfig;
use wreckage_protocol::risk_pool::RiskPool;

// === Constants ===
const STATUS_BIDDING: u8 = 0;
const STATUS_BUYOUT: u8 = 1;
const STATUS_SETTLED: u8 = 2;
const STATUS_DESTROYED: u8 = 3;

// === Structs ===
public struct AuctionRegistry has key {
    id: UID,
    active_count: u64,
    version: u64,
}

public struct Auction has key {
    id: UID,
    salvage_nft: Option<SalvageNFT>,
    source_pool_tier: u8,
    started_at: u64,
    ends_at: u64,
    highest_bid: u64,
    highest_bidder: Option<address>,
    escrowed_bid: Balance<SUI>,
    status: u8,
    floor_price: u64,
    revenue_split_snapshot: u64,
}

// === Events ===
public struct AuctionCreatedEvent has copy, drop {
    auction_id: ID,
    salvage_nft_id: ID,
    floor_price: u64,
    ends_at: u64,
}

public struct BidPlacedEvent has copy, drop {
    auction_id: ID,
    salvage_nft_id: ID,
    bidder: address,
    amount: u64,
    extended: bool,
}

public struct AuctionSettledEvent has copy, drop {
    auction_id: ID,
    salvage_nft_id: ID,
    winner: address,
    final_price: u64,
    pool_revenue: u64,
    treasury_revenue: u64,
}

public struct AuctionDestroyedEvent has copy, drop {
    auction_id: ID,
    salvage_nft_id: ID,
}

// === Constructor (package-visible, share inside this module) ===
public(package) fun create_and_share_auction_registry(
    ctx: &mut TxContext,
) {
    let registry = AuctionRegistry {
        id: object::new(ctx),
        active_count: 0,
        version: 1,
    };
    transfer::share_object(registry);
}

// === Create Auction ===
/// Create a new auction for a SalvageNFT. Called after claim processing.
public(package) fun create_auction(
    registry: &mut AuctionRegistry,
    nft: SalvageNFT,
    pool_tier: u8,
    protocol_config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_version(registry);

    let auction_cfg = protocol_config.auction_config();
    let now = clock.timestamp_ms() / 1000;
    let ends_at = now + auction_cfg.auction_duration();

    // Floor price = estimated_value * buyout_discount_bps / 10000
    let estimated = nft.estimated_value();
    let floor_price = (((estimated as u128) * (auction_cfg.buyout_discount_bps() as u128) / 10000) as u64);
    // Enforce minimum opening bid
    let floor_price = if (floor_price < auction_cfg.min_opening_bid()) {
        auction_cfg.min_opening_bid()
    } else {
        floor_price
    };

    let nft_id = salvage_nft::id(&nft);
    // Snapshot revenue split at creation time
    let revenue_split = auction_cfg.revenue_pool_share_bps();

    let auction = Auction {
        id: object::new(ctx),
        salvage_nft: option::some(nft),
        source_pool_tier: pool_tier,
        started_at: now,
        ends_at,
        highest_bid: 0,
        highest_bidder: option::none(),
        escrowed_bid: balance::zero(),
        status: STATUS_BIDDING,
        floor_price,
        revenue_split_snapshot: revenue_split,
    };

    let auction_id = object::id(&auction);
    registry.active_count = registry.active_count + 1;

    event::emit(AuctionCreatedEvent {
        auction_id,
        salvage_nft_id: nft_id,
        floor_price,
        ends_at,
    });

    transfer::share_object(auction);
}

// === Place Bid ===
/// Place a bid on an active auction. Returns previous bid to outbid bidder.
/// H-1: Uses AuctionConfig from registry (not hardcoded).
/// H-2: Enforces min_bid_increment_bps.
/// S-3: Caps total anti-snipe extension at 3x auction_duration.
public fun place_bid(
    auction: &mut Auction,
    config: &ProtocolConfig,
    bid_coin: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms() / 1000;
    // Must be in bidding phase and not expired
    assert!(auction.status == STATUS_BIDDING, errors::auction_not_in_bidding());
    assert!(now < auction.ends_at, errors::auction_not_in_bidding());

    let bid_amount = bid_coin.value();
    // M-8: Single source of truth — always read from ProtocolConfig
    let auction_cfg = config.auction_config();

    // First bid must meet floor_price (already >= min_opening_bid)
    if (auction.highest_bid == 0) {
        assert!(bid_amount >= auction.floor_price, errors::bid_too_low());
    } else {
        // H-2: Enforce min_bid_increment_bps from config
        let min_increment = (((auction.highest_bid as u128)
            * (auction_cfg.min_bid_increment_bps() as u128) / 10000) as u64);
        let min_bid = auction.highest_bid + min_increment;
        assert!(bid_amount >= min_bid, errors::bid_too_low());
    };

    // Return previous bid to outbid bidder
    if (auction.highest_bid > 0) {
        let prev_bidder = auction.highest_bidder.extract();
        let prev_amount = auction.escrowed_bid.value();
        let prev_balance = auction.escrowed_bid.split(prev_amount);
        transfer::public_transfer(coin::from_balance(prev_balance, ctx), prev_bidder);
    };

    // Escrow new bid
    auction.highest_bid = bid_amount;
    auction.highest_bidder = option::some(ctx.sender());
    auction.escrowed_bid.join(bid_coin.into_balance());

    // H-1: Anti-snipe from config (not hardcoded)
    let anti_snipe_window = auction_cfg.anti_snipe_window();
    let anti_snipe_extension = auction_cfg.anti_snipe_extension();
    // S-3: Cap total extension at 3x original auction_duration from started_at
    let max_ends_at = auction.started_at + auction_cfg.auction_duration() * 3;

    let extended = if (auction.ends_at > now && auction.ends_at - now <= anti_snipe_window) {
        let new_ends_at = auction.ends_at + anti_snipe_extension;
        if (new_ends_at <= max_ends_at) {
            auction.ends_at = new_ends_at;
            true
        } else if (auction.ends_at < max_ends_at) {
            // Partial extension up to cap
            auction.ends_at = max_ends_at;
            true
        } else {
            false // Already at cap, no more extension
        }
    } else {
        false
    };

    let nft = auction.salvage_nft.borrow();
    event::emit(BidPlacedEvent {
        auction_id: object::id(auction),
        salvage_nft_id: salvage_nft::id(nft),
        bidder: ctx.sender(),
        amount: bid_amount,
        extended,
    });
}

// === Settle Auction ===
/// Settle a completed auction. Anyone can call after ends_at.
/// Winner gets NFT, revenue split between pool and treasury.
public fun settle_auction(
    auction: &mut Auction,
    registry: &mut AuctionRegistry,
    pool: &mut RiskPool,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms() / 1000;
    assert!(auction.status == STATUS_BIDDING || auction.status == STATUS_BUYOUT,
        errors::auction_not_ended());
    assert!(now >= auction.ends_at, errors::auction_not_ended());
    assert!(auction.highest_bid > 0, errors::auction_not_ended());

    // S-2: Validate pool tier matches auction source
    assert!(pool.risk_tier() == auction.source_pool_tier, errors::auction_pool_tier_mismatch());

    // Extract NFT and transfer to winner
    let mut nft = auction.salvage_nft.extract();
    let nft_id = salvage_nft::id(&nft);
    salvage_nft::set_status(&mut nft, salvage_nft::status_sold());
    let winner = auction.highest_bidder.extract();
    transfer::public_transfer(nft, winner);

    // Split revenue
    let total_revenue = auction.escrowed_bid.value();
    let pool_share = (((total_revenue as u128) * (auction.revenue_split_snapshot as u128) / 10000) as u64);
    let treasury_share = total_revenue - pool_share;

    // Pool revenue
    if (pool_share > 0) {
        let pool_revenue = auction.escrowed_bid.split(pool_share);
        pool.receive_auction_revenue(pool_revenue);
    };

    // Treasury revenue
    if (treasury_share > 0) {
        let treasury_revenue = auction.escrowed_bid.split(treasury_share);
        transfer::public_transfer(
            coin::from_balance(treasury_revenue, ctx),
            config.treasury(),
        );
    };

    auction.status = STATUS_SETTLED;
    registry.active_count = registry.active_count - 1;

    event::emit(AuctionSettledEvent {
        auction_id: object::id(auction),
        salvage_nft_id: nft_id,
        winner,
        final_price: total_revenue,
        pool_revenue: pool_share,
        treasury_revenue: treasury_share,
    });
}

// === Buyout ===
/// Buy NFT at floor price. Only available after bidding phase ends with no bids.
public fun buyout(
    auction: &mut Auction,
    registry: &mut AuctionRegistry,
    pool: &mut RiskPool,
    config: &ProtocolConfig,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms() / 1000;

    // Transition to buyout phase if bidding ended with no bids
    if (auction.status == STATUS_BIDDING && now >= auction.ends_at && auction.highest_bid == 0) {
        auction.status = STATUS_BUYOUT;
        // Buyout phase lasts buyout_duration from original ends_at
        let auction_cfg = config.auction_config();
        auction.ends_at = auction.ends_at + auction_cfg.buyout_duration();
    };

    assert!(auction.status == STATUS_BUYOUT, errors::auction_not_in_buyout());
    assert!(now < auction.ends_at, errors::auction_not_in_buyout());
    assert!(payment.value() >= auction.floor_price, errors::buyout_payment_insufficient());

    // S-2: Validate pool tier matches auction source
    assert!(pool.risk_tier() == auction.source_pool_tier, errors::auction_pool_tier_mismatch());

    // Set bid info for settle logic
    auction.highest_bid = payment.value();
    auction.highest_bidder = option::some(ctx.sender());
    auction.escrowed_bid.join(payment.into_balance());

    // Extract NFT and transfer to buyer
    let mut nft = auction.salvage_nft.extract();
    let nft_id = salvage_nft::id(&nft);
    salvage_nft::set_status(&mut nft, salvage_nft::status_sold());
    transfer::public_transfer(nft, ctx.sender());

    // Split revenue
    let total_revenue = auction.escrowed_bid.value();
    let pool_share = (((total_revenue as u128) * (auction.revenue_split_snapshot as u128) / 10000) as u64);
    let treasury_share = total_revenue - pool_share;

    if (pool_share > 0) {
        let pool_revenue = auction.escrowed_bid.split(pool_share);
        pool.receive_auction_revenue(pool_revenue);
    };

    if (treasury_share > 0) {
        let treasury_revenue = auction.escrowed_bid.split(treasury_share);
        transfer::public_transfer(
            coin::from_balance(treasury_revenue, ctx),
            config.treasury(),
        );
    };

    auction.status = STATUS_SETTLED;
    registry.active_count = registry.active_count - 1;

    event::emit(AuctionSettledEvent {
        auction_id: object::id(auction),
        salvage_nft_id: nft_id,
        winner: ctx.sender(),
        final_price: total_revenue,
        pool_revenue: pool_share,
        treasury_revenue: treasury_share,
    });
}

// === Destroy Unsold ===
/// Destroy NFT and auction after buyout phase expires with no buyer.
public fun destroy_unsold(
    auction: &mut Auction,
    registry: &mut AuctionRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    _ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms() / 1000;

    // Transition to buyout if needed (extend ends_at by buyout_duration)
    if (auction.status == STATUS_BIDDING && now >= auction.ends_at && auction.highest_bid == 0) {
        auction.status = STATUS_BUYOUT;
        let auction_cfg = config.auction_config();
        auction.ends_at = auction.ends_at + auction_cfg.buyout_duration();
    };

    assert!(auction.status == STATUS_BUYOUT, errors::auction_not_in_buyout());
    assert!(now >= auction.ends_at, errors::auction_not_ended());

    let mut nft = auction.salvage_nft.extract();
    let nft_id = salvage_nft::id(&nft);
    salvage_nft::set_status(&mut nft, salvage_nft::status_destroyed());
    salvage_nft::destroy(nft);

    auction.status = STATUS_DESTROYED;
    registry.active_count = registry.active_count - 1;

    event::emit(AuctionDestroyedEvent {
        auction_id: object::id(auction),
        salvage_nft_id: nft_id,
    });
}

// === Accessors ===
public fun status(a: &Auction): u8 { a.status }
public fun highest_bid(a: &Auction): u64 { a.highest_bid }
public fun highest_bidder(a: &Auction): &Option<address> { &a.highest_bidder }
public fun ends_at(a: &Auction): u64 { a.ends_at }
public fun floor_price(a: &Auction): u64 { a.floor_price }
public fun source_pool_tier(a: &Auction): u8 { a.source_pool_tier }
public fun active_count(r: &AuctionRegistry): u64 { r.active_count }

public fun status_bidding(): u8 { STATUS_BIDDING }
public fun status_buyout(): u8 { STATUS_BUYOUT }
public fun status_settled(): u8 { STATUS_SETTLED }
public fun status_destroyed(): u8 { STATUS_DESTROYED }

// === Version Check ===
public fun assert_version(r: &AuctionRegistry) {
    assert!(r.version == 1, errors::version_mismatch());
}
