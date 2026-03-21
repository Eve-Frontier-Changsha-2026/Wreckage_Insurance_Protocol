// contracts/wreckage-protocol/sources/init.move
module wreckage_protocol::init;

use wreckage_protocol::config;
use wreckage_protocol::registry;
use wreckage_protocol::auction;

/// Single init for the entire wreckage_protocol package.
/// Creates all shared objects. Will be extended as modules are added.
fun init(ctx: &mut TxContext) {
    // AdminCap → deployer (has `store`, so use public_transfer)
    let admin_cap = config::create_admin_cap(ctx);
    transfer::public_transfer(admin_cap, ctx.sender());

    // ProtocolConfig → shared (no `store`, share inside config module)
    config::create_and_share_protocol_config(
        ctx.sender(),
        wreckage_protocol::pool_config::new_auction_config(
            259200,      // auction_duration = 72h
            172800,      // buyout_duration = 48h
            500,         // min_bid_increment_bps = 5%
            7000,        // buyout_discount_bps = 70%
            8000,        // revenue_pool_share_bps = 80%
            600,         // anti_snipe_window = 10 min
            600,         // anti_snipe_extension = 10 min
            100_000_000, // min_opening_bid = 0.1 SUI
        ),
        ctx,
    );

    // ClaimRegistry + PolicyRegistry → shared
    registry::create_and_share_claim_registry(ctx);
    registry::create_and_share_policy_registry(ctx);

    // AuctionRegistry → shared
    auction::create_and_share_auction_registry(
        wreckage_protocol::pool_config::new_auction_config(
            259200,      // auction_duration = 72h
            172800,      // buyout_duration = 48h
            500,         // min_bid_increment_bps = 5%
            7000,        // buyout_discount_bps = 70%
            8000,        // revenue_pool_share_bps = 80%
            600,         // anti_snipe_window = 10 min
            600,         // anti_snipe_extension = 10 min
            100_000_000, // min_opening_bid = 0.1 SUI
        ),
        ctx,
    );
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
