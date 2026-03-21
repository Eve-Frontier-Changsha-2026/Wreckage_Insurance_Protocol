// contracts/wreckage-core/sources/rider.move
module wreckage_protocol::rider;

use wreckage_protocol::pool_config::PoolConfig;

/// Calculate self-destruct rider premium
public fun calculate_rider_premium(
    coverage_amount: u64,
    config: &PoolConfig,
): u64 {
    let rate = config.self_destruct_premium_rate();
    (((coverage_amount as u128) * (rate as u128) / 10000) as u64)
}

/// Check if self-destruct waiting period has elapsed
public fun is_waiting_period_elapsed(
    policy_created_at: u64,
    current_timestamp: u64,
    config: &PoolConfig,
): bool {
    current_timestamp >= policy_created_at + config.self_destruct_waiting_period()
}

/// Calculate self-destruct payout (reduced rate)
public fun calculate_self_destruct_payout(
    base_payout: u64,
    config: &PoolConfig,
): u64 {
    (((base_payout as u128) * (config.self_destruct_payout_rate() as u128) / 10000) as u64)
}
