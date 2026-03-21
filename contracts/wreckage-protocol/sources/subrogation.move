// contracts/wreckage-protocol/sources/subrogation.move
/// Subrogation: after paying a claim, the protocol gains the right
/// to pursue the killer for recovery. MVP emits an event; future
/// versions will call Bounty Escrow Protocol directly.
module wreckage_protocol::subrogation;

use sui::event;
use wreckage_core::pool_config::PoolConfig;
use world::killmail::{Self, Killmail};
use world::in_game_id::TenantItemId;

// === Events ===
public struct SubrogationEvent has copy, drop {
    policy_id: ID,
    killer_id: TenantItemId,
    claim_amount: u64,
    bounty_reward: u64,
}

/// Emit subrogation event after a claim is paid.
/// bounty_reward = claim_amount * subrogation_rate_bps / 10000
public(package) fun emit_subrogation(
    policy_id: ID,
    killmail: &Killmail,
    claim_amount: u64,
    pool_config: &PoolConfig,
) {
    let rate = pool_config.subrogation_rate_bps();
    let bounty_reward = (((claim_amount as u128) * (rate as u128) / 10000) as u64);

    event::emit(SubrogationEvent {
        policy_id,
        killer_id: killmail::killer_id(killmail),
        claim_amount,
        bounty_reward,
    });
}
