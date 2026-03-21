// contracts/wreckage-protocol/sources/claims.move
#[allow(lint(self_transfer))]
module wreckage_protocol::claims;

use sui::clock::Clock;
use sui::event;
use wreckage_core::policy::InsurancePolicy;
use wreckage_core::rider;
use wreckage_core::errors;
use wreckage_protocol::config::{Self, ProtocolConfig};
use wreckage_protocol::registry::{Self, ClaimRegistry};
use wreckage_protocol::risk_pool::{Self, RiskPool};
use wreckage_protocol::anti_fraud;
use wreckage_protocol::salvage;
use wreckage_protocol::subrogation;
use wreckage_protocol::integration;
use world::killmail::{Self, Killmail};
use world::in_game_id::TenantItemId;

// === Constants ===
const CLAIM_TYPE_STANDARD: u8 = 0;
const CLAIM_TYPE_SELF_DESTRUCT: u8 = 1;

// === Events ===
public struct ClaimSubmittedEvent has copy, drop {
    policy_id: ID,
    killmail_key: TenantItemId,
    claim_type: u8,
}

public struct ClaimPaidEvent has copy, drop {
    policy_id: ID,
    payout_amount: u64,
    deductible_amount: u64,
    decay_amount: u64,
}

// === Submit Standard Claim ===
public fun submit_claim(
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // Version checks on all shared objects
    config::assert_version(config);
    risk_pool::assert_version(pool);
    registry::assert_claim_registry_version(claim_registry);

    // Protocol not paused
    assert!(!config.is_claim_paused(), errors::protocol_paused());

    // Anti-fraud validation
    let fraud_check = anti_fraud::validate_standard_claim(
        policy, killmail, claim_registry, clock, config,
    );
    assert_fraud_check_passed(&fraud_check);

    // Get pool config
    let pool_config = config.get_pool_config(policy.risk_tier());

    // Calculate payout with decay + deductible
    let coverage = policy.coverage_amount();
    let claim_count = policy.claim_count();
    let decay_rate = pool_config.claim_decay_rate();
    let deductible_bps = pool_config.deductible_bps();

    let payout = anti_fraud::calculate_payout(coverage, claim_count, decay_rate, deductible_bps);

    // Calculate event breakdown
    let coverage_after_decay = anti_fraud::calculate_payout(coverage, claim_count, decay_rate, 0);
    let decay_amount = coverage - coverage_after_decay;
    let deductible_amount = coverage_after_decay - payout;

    // Manage reservation: release full coverage on first claim, then
    // temporarily reserve payout so pay_claim can release it atomically
    if (policy.claim_count() == 0) {
        risk_pool::release_reservation(pool, policy.coverage_amount());
    };
    risk_pool::reserve_coverage(pool, payout);
    let payout_coin = risk_pool::pay_claim(pool, payout, ctx);

    // Update policy state
    policy.increment_claim_count();
    policy.reset_no_claim_streak();
    let now = clock.timestamp_ms() / 1000;
    policy.set_cooldown_until(now + pool_config.cooldown_period());

    // Record killmail as claimed (prevents duplicate)
    registry::record_claim(claim_registry, killmail::key(killmail), policy.id());

    // Mint salvage NFT
    let salvage_nft = salvage::mint_from_killmail(killmail, pool_config, ctx);
    let salvage_nft_id = salvage_nft.id();

    // Emit events
    event::emit(ClaimSubmittedEvent {
        policy_id: policy.id(),
        killmail_key: killmail::key(killmail),
        claim_type: CLAIM_TYPE_STANDARD,
    });
    event::emit(ClaimPaidEvent {
        policy_id: policy.id(),
        payout_amount: payout,
        deductible_amount,
        decay_amount,
    });

    // Subrogation: emit bounty signal for killer pursuit
    subrogation::emit_subrogation(policy.id(), killmail, payout, pool_config);

    // Claim completed hook for downstream consumers
    integration::emit_claim_completed(
        policy.id(),
        killmail::key(killmail),
        payout,
        salvage_nft_id,
        CLAIM_TYPE_STANDARD,
    );

    // Transfer payout + salvage to claimant
    transfer::public_transfer(payout_coin, ctx.sender());
    transfer::public_transfer(salvage_nft, ctx.sender());
}

// === Submit Self-Destruct Claim ===
public fun submit_self_destruct_claim(
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // Version checks
    config::assert_version(config);
    risk_pool::assert_version(pool);
    registry::assert_claim_registry_version(claim_registry);

    assert!(!config.is_claim_paused(), errors::protocol_paused());

    // Anti-fraud validation (self-destruct specific)
    let fraud_check = anti_fraud::validate_self_destruct_claim(
        policy, killmail, claim_registry, clock, config,
    );
    assert_fraud_check_passed(&fraud_check);

    // Get pool config
    let pool_config = config.get_pool_config(policy.risk_tier());

    // Calculate payout: enhanced decay + deductible + SD rate
    let coverage = policy.coverage_amount();
    let claim_count = policy.claim_count();
    let base_decay = pool_config.claim_decay_rate();
    let sd_multiplier = pool_config.self_destruct_decay_multiplier();
    let mut effective_decay = base_decay * sd_multiplier;
    // Cap to prevent underflow in decay_factor calculation
    if (effective_decay >= 10000) { effective_decay = 9999 };

    let deductible_bps = pool_config.deductible_bps();

    // Payout after enhanced decay + deductible
    let base_payout = anti_fraud::calculate_payout(
        coverage, claim_count, effective_decay, deductible_bps,
    );
    // Apply self-destruct reduction rate
    let payout = rider::calculate_self_destruct_payout(base_payout, pool_config);

    // Event breakdown (pre-SD-reduction)
    let coverage_after_decay = anti_fraud::calculate_payout(
        coverage, claim_count, effective_decay, 0,
    );
    let decay_amount = coverage - coverage_after_decay;
    let deductible_amount = coverage_after_decay - base_payout;

    // Manage reservation: same pattern as standard claim
    if (policy.claim_count() == 0) {
        risk_pool::release_reservation(pool, policy.coverage_amount());
    };
    risk_pool::reserve_coverage(pool, payout);
    let payout_coin = risk_pool::pay_claim(pool, payout, ctx);

    // Update policy state
    policy.increment_claim_count();
    policy.reset_no_claim_streak();
    let now = clock.timestamp_ms() / 1000;
    policy.set_cooldown_until(now + pool_config.cooldown_period());

    // Record killmail
    registry::record_claim(claim_registry, killmail::key(killmail), policy.id());

    // Mint salvage NFT
    let salvage_nft = salvage::mint_from_killmail(killmail, pool_config, ctx);
    let salvage_nft_id = salvage_nft.id();

    // Emit events
    event::emit(ClaimSubmittedEvent {
        policy_id: policy.id(),
        killmail_key: killmail::key(killmail),
        claim_type: CLAIM_TYPE_SELF_DESTRUCT,
    });
    event::emit(ClaimPaidEvent {
        policy_id: policy.id(),
        payout_amount: payout,
        deductible_amount,
        decay_amount,
    });

    // Subrogation: for self-destruct, killer == victim but still emit
    // (protocol may still pursue recovery from the destruction event)
    subrogation::emit_subrogation(policy.id(), killmail, payout, pool_config);

    // Claim completed hook
    integration::emit_claim_completed(
        policy.id(),
        killmail::key(killmail),
        payout,
        salvage_nft_id,
        CLAIM_TYPE_SELF_DESTRUCT,
    );

    transfer::public_transfer(payout_coin, ctx.sender());
    transfer::public_transfer(salvage_nft, ctx.sender());
}

// === Accessors ===
public fun claim_type_standard(): u8 { CLAIM_TYPE_STANDARD }
public fun claim_type_self_destruct(): u8 { CLAIM_TYPE_SELF_DESTRUCT }

// === Internal ===
fun assert_fraud_check_passed(result: &anti_fraud::FraudCheckResult) {
    if (anti_fraud::is_valid(result)) return;
    let reason = anti_fraud::reason(result);
    if (reason == anti_fraud::reason_self_kill()) {
        abort errors::is_self_destruct()
    } else if (reason == anti_fraud::reason_cooldown()) {
        abort errors::cooldown_not_elapsed()
    } else if (reason == anti_fraud::reason_frequency()) {
        abort errors::max_claims_reached()
    } else if (reason == anti_fraud::reason_duplicate()) {
        abort errors::killmail_already_claimed()
    } else if (reason == anti_fraud::reason_waiting_period()) {
        abort errors::renewal_waiting_period()
    } else if (reason == anti_fraud::reason_no_rider()) {
        abort errors::no_self_destruct_rider()
    } else {
        abort errors::policy_not_active()
    }
}
