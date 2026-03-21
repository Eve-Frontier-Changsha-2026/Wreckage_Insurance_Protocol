// contracts/wreckage-protocol/sources/salvage.move
module wreckage_protocol::salvage;

use world::killmail::{Self, Killmail};
use wreckage_protocol::salvage_nft::{Self, SalvageNFT};
use wreckage_protocol::pool_config::PoolConfig;

/// Estimate salvage value from killmail + tier.
/// Higher risk tier = higher salvage value.
public fun estimate_salvage_value(
    _killmail: &Killmail,
    pool_config: &PoolConfig,
): u64 {
    let tier = pool_config.risk_tier();
    let tier_multiplier = if (tier == 1) { 1 } else if (tier == 2) { 3 } else { 8 };
    let base_value = 1_000_000_000u64; // 1 SUI base
    base_value * tier_multiplier
}

/// Mint SalvageNFT from a validated killmail.
public fun mint_from_killmail(
    killmail: &Killmail,
    pool_config: &PoolConfig,
    ctx: &mut TxContext,
): SalvageNFT {
    let estimated_value = estimate_salvage_value(killmail, pool_config);
    let loss_type_u8 = if (killmail::loss_type(killmail) == killmail::ship()) { 1 } else { 2 };

    salvage_nft::mint(
        killmail::key(killmail),
        killmail::victim_id(killmail),
        killmail::solar_system_id(killmail),
        loss_type_u8,
        killmail::kill_timestamp(killmail),
        estimated_value,
        ctx,
    )
}
