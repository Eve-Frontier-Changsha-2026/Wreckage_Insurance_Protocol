/// Post-claim hook for downstream consumers.
/// Future: bounty escrow + fleet command integration.
module wreckage_protocol::integration;

use world::in_game_id::TenantItemId;

public struct ClaimCompletedHook has copy, drop {
    policy_id: ID,
    killmail_key: TenantItemId,
    payout_amount: u64,
    salvage_nft_id: ID,
    claim_type: u8,
}

public(package) fun emit_claim_completed(
    policy_id: ID,
    killmail_key: TenantItemId,
    payout_amount: u64,
    salvage_nft_id: ID,
    claim_type: u8,
) {
    sui::event::emit(ClaimCompletedHook {
        policy_id,
        killmail_key,
        payout_amount,
        salvage_nft_id,
        claim_type,
    });
}
