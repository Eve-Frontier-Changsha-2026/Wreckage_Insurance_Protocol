// contracts/wreckage-protocol/sources/config.move
module wreckage_protocol::config;

use wreckage_core::pool_config::{PoolConfig, AuctionConfig};

// === Structs ===
public struct AdminCap has key, store { id: UID }

public struct ProtocolConfig has key {
    id: UID,
    treasury: address,
    is_policy_paused: bool,
    is_claim_paused: bool,
    pool_configs: vector<PoolConfig>,
    auction_config: AuctionConfig,
    max_claims_per_policy: u8,
    protocol_fee_bps: u64,
    version: u64,
    min_deductible_bps: u64,
    min_premium_rate_bps: u64,
    max_coverage_limit: u64,
}

// === Package-visible Constructors (called from init.move) ===
// AdminCap has `store`, so we can return it and let init.move use public_transfer.
public(package) fun create_admin_cap(ctx: &mut TxContext): AdminCap {
    AdminCap { id: object::new(ctx) }
}

// ProtocolConfig has NO `store`, so share must happen in this module.
public(package) fun create_and_share_protocol_config(
    treasury: address,
    auction_config: AuctionConfig,
    ctx: &mut TxContext,
) {
    let config = ProtocolConfig {
        id: object::new(ctx),
        treasury,
        is_policy_paused: false,
        is_claim_paused: false,
        pool_configs: vector[],
        auction_config,
        max_claims_per_policy: 5,
        protocol_fee_bps: 2000,
        version: 1,
        min_deductible_bps: 100,
        min_premium_rate_bps: 50,
        max_coverage_limit: 200_000_000_000,
    };
    transfer::share_object(config);
}

// === Accessors ===
public fun treasury(c: &ProtocolConfig): address { c.treasury }
public fun is_policy_paused(c: &ProtocolConfig): bool { c.is_policy_paused }
public fun is_claim_paused(c: &ProtocolConfig): bool { c.is_claim_paused }
public fun pool_configs(c: &ProtocolConfig): &vector<PoolConfig> { &c.pool_configs }
public fun auction_config(c: &ProtocolConfig): &AuctionConfig { &c.auction_config }
public fun max_claims_per_policy(c: &ProtocolConfig): u8 { c.max_claims_per_policy }
public fun protocol_fee_bps(c: &ProtocolConfig): u64 { c.protocol_fee_bps }
public fun version(c: &ProtocolConfig): u64 { c.version }
public fun min_deductible_bps(c: &ProtocolConfig): u64 { c.min_deductible_bps }
public fun min_premium_rate_bps(c: &ProtocolConfig): u64 { c.min_premium_rate_bps }
public fun max_coverage_limit(c: &ProtocolConfig): u64 { c.max_coverage_limit }

/// Get pool config for a specific tier, aborts if not found
public fun get_pool_config(c: &ProtocolConfig, tier: u8): &PoolConfig {
    let configs = &c.pool_configs;
    let mut i = 0;
    while (i < configs.length()) {
        let cfg = &configs[i];
        if (cfg.risk_tier() == tier) {
            return cfg
        };
        i = i + 1;
    };
    abort wreckage_core::errors::invalid_config()
}

// === Admin Functions ===
public fun add_pool_tier(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    pool_config: PoolConfig,
) {
    config.pool_configs.push_back(pool_config);
}

public fun update_pool_config(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    tier: u8,
    new_config: PoolConfig,
) {
    let configs = &mut config.pool_configs;
    let len = configs.length();
    let mut i = 0;
    while (i < len) {
        if (configs[i].risk_tier() == tier) {
            // swap_remove + push_back (index assignment not supported in Move)
            configs.swap_remove(i);
            configs.push_back(new_config);
            return
        };
        i = i + 1;
    };
    abort wreckage_core::errors::invalid_config()
}

public fun set_policy_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool) {
    config.is_policy_paused = paused;
}

public fun set_claim_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool) {
    config.is_claim_paused = paused;
}

public fun update_auction_config(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    new_config: AuctionConfig,
) {
    config.auction_config = new_config;
}

public fun update_treasury(_: &AdminCap, config: &mut ProtocolConfig, new_treasury: address) {
    config.treasury = new_treasury;
}

// === Admin: Create + Share Pool ===
public fun admin_create_pool(
    _: &AdminCap,
    config: &ProtocolConfig,
    pool_config: PoolConfig,
    ctx: &mut TxContext,
) {
    assert_version(config);
    wreckage_protocol::risk_pool::create_and_share_pool(pool_config, ctx);
}

// === Version Check (used by ALL shared object operations) ===
public fun assert_version(c: &ProtocolConfig) {
    assert!(c.version == 1, wreckage_core::errors::version_mismatch());
}
