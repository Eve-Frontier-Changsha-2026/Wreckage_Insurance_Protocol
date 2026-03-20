// contracts/wreckage-core/sources/policy.move
module wreckage_core::policy;

use world::in_game_id::TenantItemId;

// === Constants ===
const STATUS_ACTIVE: u8 = 0;
const STATUS_CLAIMED: u8 = 1;
const STATUS_EXPIRED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// === Structs ===
public struct InsurancePolicy has key, store {
    id: UID,
    insured_character_id: TenantItemId,
    coverage_amount: u64,
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
    self_destruct_premium: u64,
    created_at: u64,
    expires_at: u64,
    status: u8,
    cooldown_until: u64,
    claim_count: u8,
    no_claim_streak: u8,
    renewal_count: u8,
    version: u64,
}

// === Events ===
public struct PolicyCreatedEvent has copy, drop {
    policy_id: ID,
    insured_character_id: TenantItemId,
    coverage_amount: u64,
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
}

public struct PolicyRenewedEvent has copy, drop {
    policy_id: ID,
    renewal_count: u8,
    no_claim_streak: u8,
    premium_paid: u64,
    ncb_discount_applied: u64,
}

public struct PolicyTransferredEvent has copy, drop {
    policy_id: ID,
    from: address,
    to: address,
}

// === Constants (public) ===
public fun status_active(): u8 { STATUS_ACTIVE }
public fun status_claimed(): u8 { STATUS_CLAIMED }
public fun status_expired(): u8 { STATUS_EXPIRED }
public fun status_cancelled(): u8 { STATUS_CANCELLED }

// === Constructor (package-visible, called by wreckage-protocol via public wrapper) ===
public fun create(
    insured_character_id: TenantItemId,
    coverage_amount: u64,
    premium_paid: u64,
    risk_tier: u8,
    has_self_destruct_rider: bool,
    self_destruct_premium: u64,
    created_at: u64,
    expires_at: u64,
    ctx: &mut TxContext,
): InsurancePolicy {
    let policy = InsurancePolicy {
        id: object::new(ctx),
        insured_character_id,
        coverage_amount,
        premium_paid,
        risk_tier,
        has_self_destruct_rider,
        self_destruct_premium,
        created_at,
        expires_at,
        status: STATUS_ACTIVE,
        cooldown_until: 0,
        claim_count: 0,
        no_claim_streak: 0,
        renewal_count: 0,
        version: 1,
    };

    sui::event::emit(PolicyCreatedEvent {
        policy_id: object::id(&policy),
        insured_character_id,
        coverage_amount,
        premium_paid,
        risk_tier,
        has_self_destruct_rider,
    });

    policy
}

// === Accessors ===
public fun id(p: &InsurancePolicy): ID { object::id(p) }
public fun insured_character_id(p: &InsurancePolicy): TenantItemId { p.insured_character_id }
public fun coverage_amount(p: &InsurancePolicy): u64 { p.coverage_amount }
public fun premium_paid(p: &InsurancePolicy): u64 { p.premium_paid }
public fun risk_tier(p: &InsurancePolicy): u8 { p.risk_tier }
public fun has_self_destruct_rider(p: &InsurancePolicy): bool { p.has_self_destruct_rider }
public fun self_destruct_premium(p: &InsurancePolicy): u64 { p.self_destruct_premium }
public fun created_at(p: &InsurancePolicy): u64 { p.created_at }
public fun expires_at(p: &InsurancePolicy): u64 { p.expires_at }
public fun status(p: &InsurancePolicy): u8 { p.status }
public fun cooldown_until(p: &InsurancePolicy): u64 { p.cooldown_until }
public fun claim_count(p: &InsurancePolicy): u8 { p.claim_count }
public fun no_claim_streak(p: &InsurancePolicy): u8 { p.no_claim_streak }
public fun renewal_count(p: &InsurancePolicy): u8 { p.renewal_count }
public fun version(p: &InsurancePolicy): u64 { p.version }

public fun is_active(p: &InsurancePolicy): bool { p.status == STATUS_ACTIVE }

// === Mutators (public, for wreckage-protocol cross-package access) ===
public fun set_status(p: &mut InsurancePolicy, status: u8) { p.status = status; }
public fun set_cooldown_until(p: &mut InsurancePolicy, until: u64) { p.cooldown_until = until; }
public fun increment_claim_count(p: &mut InsurancePolicy) { p.claim_count = p.claim_count + 1; }
public fun reset_no_claim_streak(p: &mut InsurancePolicy) { p.no_claim_streak = 0; }
public fun increment_no_claim_streak(p: &mut InsurancePolicy) { p.no_claim_streak = p.no_claim_streak + 1; }
public fun set_renewal_data(
    p: &mut InsurancePolicy,
    new_premium: u64,
    new_expires_at: u64,
    new_created_at: u64,
) {
    p.premium_paid = new_premium;
    p.expires_at = new_expires_at;
    p.created_at = new_created_at;
    p.renewal_count = p.renewal_count + 1;
}

// === Event Emitters (for cross-package use) ===
public fun emit_renewed_event(
    policy_id: ID,
    renewal_count: u8,
    no_claim_streak: u8,
    premium_paid: u64,
    ncb_discount_applied: u64,
) {
    sui::event::emit(PolicyRenewedEvent {
        policy_id, renewal_count, no_claim_streak, premium_paid, ncb_discount_applied,
    });
}

public fun emit_transferred_event(policy_id: ID, from: address, to: address) {
    sui::event::emit(PolicyTransferredEvent { policy_id, from, to });
}

// === Delete ===
public fun destroy(p: InsurancePolicy) {
    let InsurancePolicy { id, .. } = p;
    id.delete();
}
