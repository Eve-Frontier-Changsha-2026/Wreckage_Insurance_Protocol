// contracts/wreckage-core/sources/pool_config.move
module wreckage_protocol::pool_config;

// === Structs ===
public struct PoolConfig has store, copy, drop {
    risk_tier: u8,
    base_premium_rate: u64,
    max_coverage: u64,
    min_coverage: u64,
    cooldown_period: u64,
    claim_decay_rate: u64,
    self_destruct_premium_rate: u64,
    self_destruct_waiting_period: u64,
    self_destruct_payout_rate: u64,
    self_destruct_decay_multiplier: u64,
    deductible_bps: u64,
    ncb_discount_bps: u64,
    max_ncb_streak: u8,
    max_ncb_total_discount_bps: u64,
    subrogation_rate_bps: u64,
    renewal_waiting_period: u64,
}

public struct AuctionConfig has store, copy, drop {
    auction_duration: u64,
    buyout_duration: u64,
    min_bid_increment_bps: u64,
    buyout_discount_bps: u64,
    revenue_pool_share_bps: u64,
    anti_snipe_window: u64,
    anti_snipe_extension: u64,
    min_opening_bid: u64,
}

// === Constants ===
const MIN_DEDUCTIBLE_BPS: u64 = 100;          // 1%
const MIN_PREMIUM_RATE_BPS: u64 = 50;         // 0.5%
const MIN_SD_PREMIUM_RATE_BPS: u64 = 5000;    // 50%
const MIN_SD_WAITING_PERIOD: u64 = 604800;    // 7 days in seconds
const MAX_BPS: u64 = 10000;

// === Constructors ===
public fun new_pool_config(
    risk_tier: u8,
    base_premium_rate: u64,
    max_coverage: u64,
    min_coverage: u64,
    cooldown_period: u64,
    claim_decay_rate: u64,
    self_destruct_premium_rate: u64,
    self_destruct_waiting_period: u64,
    self_destruct_payout_rate: u64,
    self_destruct_decay_multiplier: u64,
    deductible_bps: u64,
    ncb_discount_bps: u64,
    max_ncb_streak: u8,
    max_ncb_total_discount_bps: u64,
    subrogation_rate_bps: u64,
    renewal_waiting_period: u64,
): PoolConfig {
    // Validate hard limits
    assert!(base_premium_rate >= MIN_PREMIUM_RATE_BPS, 0);
    assert!(deductible_bps >= MIN_DEDUCTIBLE_BPS, 0);
    assert!(self_destruct_premium_rate >= MIN_SD_PREMIUM_RATE_BPS, 0);
    assert!(self_destruct_waiting_period >= MIN_SD_WAITING_PERIOD, 0);
    assert!(self_destruct_payout_rate <= MAX_BPS, 0);
    assert!(claim_decay_rate < MAX_BPS, 0);
    assert!(max_coverage > min_coverage, 0);
    assert!(min_coverage > 0, 0);
    // NCB cap validation (u128 to prevent overflow)
    assert!((ncb_discount_bps as u128) * (max_ncb_streak as u128) <= (max_ncb_total_discount_bps as u128), 0);
    assert!(max_ncb_total_discount_bps < MAX_BPS, 0);

    PoolConfig {
        risk_tier,
        base_premium_rate,
        max_coverage,
        min_coverage,
        cooldown_period,
        claim_decay_rate,
        self_destruct_premium_rate,
        self_destruct_waiting_period,
        self_destruct_payout_rate,
        self_destruct_decay_multiplier,
        deductible_bps,
        ncb_discount_bps,
        max_ncb_streak,
        max_ncb_total_discount_bps,
        subrogation_rate_bps,
        renewal_waiting_period,
    }
}

public fun new_auction_config(
    auction_duration: u64,
    buyout_duration: u64,
    min_bid_increment_bps: u64,
    buyout_discount_bps: u64,
    revenue_pool_share_bps: u64,
    anti_snipe_window: u64,
    anti_snipe_extension: u64,
    min_opening_bid: u64,
): AuctionConfig {
    assert!(auction_duration > 0, 0);
    assert!(buyout_duration > 0, 0);
    assert!(min_bid_increment_bps > 0 && min_bid_increment_bps < MAX_BPS, 0);
    assert!(buyout_discount_bps > 0 && buyout_discount_bps <= MAX_BPS, 0);
    assert!(revenue_pool_share_bps <= MAX_BPS, 0);

    AuctionConfig {
        auction_duration,
        buyout_duration,
        min_bid_increment_bps,
        buyout_discount_bps,
        revenue_pool_share_bps,
        anti_snipe_window,
        anti_snipe_extension,
        min_opening_bid,
    }
}

// === Accessors ===
public fun risk_tier(c: &PoolConfig): u8 { c.risk_tier }
public fun base_premium_rate(c: &PoolConfig): u64 { c.base_premium_rate }
public fun max_coverage(c: &PoolConfig): u64 { c.max_coverage }
public fun min_coverage(c: &PoolConfig): u64 { c.min_coverage }
public fun cooldown_period(c: &PoolConfig): u64 { c.cooldown_period }
public fun claim_decay_rate(c: &PoolConfig): u64 { c.claim_decay_rate }
public fun self_destruct_premium_rate(c: &PoolConfig): u64 { c.self_destruct_premium_rate }
public fun self_destruct_waiting_period(c: &PoolConfig): u64 { c.self_destruct_waiting_period }
public fun self_destruct_payout_rate(c: &PoolConfig): u64 { c.self_destruct_payout_rate }
public fun self_destruct_decay_multiplier(c: &PoolConfig): u64 { c.self_destruct_decay_multiplier }
public fun deductible_bps(c: &PoolConfig): u64 { c.deductible_bps }
public fun ncb_discount_bps(c: &PoolConfig): u64 { c.ncb_discount_bps }
public fun max_ncb_streak(c: &PoolConfig): u8 { c.max_ncb_streak }
public fun max_ncb_total_discount_bps(c: &PoolConfig): u64 { c.max_ncb_total_discount_bps }
public fun subrogation_rate_bps(c: &PoolConfig): u64 { c.subrogation_rate_bps }
public fun renewal_waiting_period(c: &PoolConfig): u64 { c.renewal_waiting_period }

public fun auction_duration(c: &AuctionConfig): u64 { c.auction_duration }
public fun buyout_duration(c: &AuctionConfig): u64 { c.buyout_duration }
public fun min_bid_increment_bps(c: &AuctionConfig): u64 { c.min_bid_increment_bps }
public fun buyout_discount_bps(c: &AuctionConfig): u64 { c.buyout_discount_bps }
public fun revenue_pool_share_bps(c: &AuctionConfig): u64 { c.revenue_pool_share_bps }
public fun anti_snipe_window(c: &AuctionConfig): u64 { c.anti_snipe_window }
public fun anti_snipe_extension(c: &AuctionConfig): u64 { c.anti_snipe_extension }
public fun min_opening_bid(c: &AuctionConfig): u64 { c.min_opening_bid }

// === Test Helpers ===
#[test_only]
/// Default Tier 2 config for testing
public fun test_pool_config(): PoolConfig {
    new_pool_config(
        2,           // risk_tier
        500,         // base_premium_rate = 5%
        50_000_000_000, // max_coverage = 50 SUI
        1_000_000_000,  // min_coverage = 1 SUI
        172800,      // cooldown_period = 48h
        1000,        // claim_decay_rate = 10%
        7000,        // self_destruct_premium_rate = 70%
        604800,      // self_destruct_waiting_period = 7 days
        5000,        // self_destruct_payout_rate = 50%
        2,           // self_destruct_decay_multiplier = 2x
        1000,        // deductible_bps = 10%
        1000,        // ncb_discount_bps = 10% per streak
        3,           // max_ncb_streak
        3000,        // max_ncb_total_discount_bps = 30%
        2000,        // subrogation_rate_bps = 20%
        86400,       // renewal_waiting_period = 24h
    )
}

#[test_only]
public fun test_auction_config(): AuctionConfig {
    new_auction_config(
        259200,      // auction_duration = 72h
        172800,      // buyout_duration = 48h
        500,         // min_bid_increment_bps = 5%
        7000,        // buyout_discount_bps = 70%
        8000,        // revenue_pool_share_bps = 80%
        600,         // anti_snipe_window = 10 min
        600,         // anti_snipe_extension = 10 min
        100_000_000, // min_opening_bid = 0.1 SUI
    )
}
