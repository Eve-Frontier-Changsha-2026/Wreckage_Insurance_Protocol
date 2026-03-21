// contracts/wreckage-protocol/sources/integration.move
/// Mock integration interfaces for future cross-protocol composability.
/// - SalvageBountyRequest: bounty creation from salvage NFT location
/// - FleetInsuranceRequest: batch fleet insurance
/// - ClaimCompletedHook: post-claim hook for downstream consumers
///
/// MVP: These are mock structs + functions for demo purposes.
/// Future: Replace with real calls to Bounty Escrow / Fleet Command protocols.
module wreckage_protocol::integration;

use sui::clock::Clock;
use wreckage_protocol::salvage_nft::SalvageNFT;
use world::in_game_id::TenantItemId;

// === Bounty Escrow Mock (Section 16.1) ===

public struct SalvageBountyRequest has copy, drop {
    salvage_nft_id: ID,
    solar_system_id: TenantItemId,
    reward_amount: u64,
    deadline: u64,
}

/// Mock: simulate bounty creation from a salvage NFT.
/// In production, this would call the Bounty Escrow Protocol.
public fun mock_create_salvage_bounty(
    nft: &SalvageNFT,
    reward: u64,
    clock: &Clock,
): SalvageBountyRequest {
    let deadline = clock.timestamp_ms() / 1000 + 604800; // 7 days from now
    SalvageBountyRequest {
        salvage_nft_id: nft.id(),
        solar_system_id: nft.solar_system_id(),
        reward_amount: reward,
        deadline,
    }
}

// === Bounty Request Accessors ===
public fun bounty_nft_id(req: &SalvageBountyRequest): ID { req.salvage_nft_id }
public fun bounty_solar_system(req: &SalvageBountyRequest): TenantItemId { req.solar_system_id }
public fun bounty_reward(req: &SalvageBountyRequest): u64 { req.reward_amount }
public fun bounty_deadline(req: &SalvageBountyRequest): u64 { req.deadline }

// === Fleet Command Mock (Section 16.2) ===

public struct FleetInsuranceRequest has drop {
    fleet_id: ID,
    character_ids: vector<TenantItemId>,
    risk_tier: u8,
    coverage_per_unit: u64,
    include_self_destruct: bool,
}

/// Create a fleet insurance request (mock).
/// In production, this would batch-purchase policies via underwriting module.
public fun create_fleet_request(
    fleet_id: ID,
    character_ids: vector<TenantItemId>,
    risk_tier: u8,
    coverage_per_unit: u64,
    include_self_destruct: bool,
): FleetInsuranceRequest {
    FleetInsuranceRequest {
        fleet_id,
        character_ids,
        risk_tier,
        coverage_per_unit,
        include_self_destruct,
    }
}

/// Mock: simulate fleet batch insurance. Returns empty policy ID vector.
/// In production, this would call underwriting::purchase_policy for each character.
public fun mock_fleet_insure(
    _req: FleetInsuranceRequest,
): vector<ID> {
    vector[]
}

// === Fleet Request Accessors ===
public fun fleet_id(req: &FleetInsuranceRequest): ID { req.fleet_id }
public fun fleet_character_ids(req: &FleetInsuranceRequest): &vector<TenantItemId> { &req.character_ids }
public fun fleet_risk_tier(req: &FleetInsuranceRequest): u8 { req.risk_tier }
public fun fleet_coverage_per_unit(req: &FleetInsuranceRequest): u64 { req.coverage_per_unit }
public fun fleet_include_self_destruct(req: &FleetInsuranceRequest): bool { req.include_self_destruct }

// === Claim Completed Hook (Section 16.3) ===

public struct ClaimCompletedHook has copy, drop {
    policy_id: ID,
    killmail_key: TenantItemId,
    payout_amount: u64,
    salvage_nft_id: ID,
    claim_type: u8,
}

/// Emit a claim-completed hook event for downstream consumers.
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

// === Hook Accessors ===
public fun hook_policy_id(h: &ClaimCompletedHook): ID { h.policy_id }
public fun hook_killmail_key(h: &ClaimCompletedHook): TenantItemId { h.killmail_key }
public fun hook_payout_amount(h: &ClaimCompletedHook): u64 { h.payout_amount }
public fun hook_salvage_nft_id(h: &ClaimCompletedHook): ID { h.salvage_nft_id }
public fun hook_claim_type(h: &ClaimCompletedHook): u8 { h.claim_type }
