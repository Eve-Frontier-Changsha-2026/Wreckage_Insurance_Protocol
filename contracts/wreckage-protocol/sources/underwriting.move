// contracts/wreckage-protocol/sources/underwriting.move
#[allow(lint(self_transfer))]
module wreckage_protocol::underwriting;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use world::character::Character;
use wreckage_protocol::policy::{Self, InsurancePolicy};
use wreckage_protocol::rider;
use wreckage_protocol::errors;
use wreckage_protocol::config::{Self, ProtocolConfig};
use wreckage_protocol::registry::{Self, PolicyRegistry};
use wreckage_protocol::risk_pool::{Self, RiskPool};

// === Constants ===
const POLICY_DURATION: u64 = 2_592_000; // 30 days in seconds

// === Events ===
public struct PolicyExpiredEvent has copy, drop {
    policy_id: ID,
}

// === Purchase ===
/// Purchase a new insurance policy for a character.
/// Validates coverage, calculates premium, reserves coverage in pool,
/// registers in PolicyRegistry (prevents duplicates), and returns the policy.
public fun purchase_policy(
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    character: &Character,
    coverage_amount: u64,
    include_self_destruct: bool,
    mut payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
): InsurancePolicy {
    // Version checks on all shared objects
    config::assert_version(config);
    risk_pool::assert_version(pool);
    registry::assert_policy_registry_version(policy_registry);

    // Protocol not paused
    assert!(!config.is_policy_paused(), errors::protocol_paused());

    // Pool must be active
    assert!(pool.is_active(), errors::pool_not_active());

    // Get tier config from pool
    let tier = pool.risk_tier();
    let pool_config = config.get_pool_config(tier);

    // Validate coverage range
    assert!(
        coverage_amount >= pool_config.min_coverage()
            && coverage_amount <= pool_config.max_coverage()
            && coverage_amount <= config.max_coverage_limit(),
        errors::coverage_out_of_range(),
    );

    // Calculate premium (u128 intermediate to prevent overflow)
    let base_premium = (((coverage_amount as u128) * (pool_config.base_premium_rate() as u128) / 10000) as u64);
    let sd_premium = if (include_self_destruct) {
        rider::calculate_rider_premium(coverage_amount, pool_config)
    } else {
        0
    };
    let total_premium = base_premium + sd_premium;

    // Payment check
    assert!(payment.value() >= total_premium, errors::insufficient_payment());

    // Split exact premium and collect into pool
    let premium_coin = coin::split(&mut payment, total_premium, ctx);
    risk_pool::collect_premium(pool, premium_coin.into_balance());

    // Reserve coverage in pool (checks utilization cap)
    risk_pool::reserve_coverage(pool, coverage_amount);

    // Create policy
    let now = clock.timestamp_ms() / 1000;
    let character_id = character.key();
    let new_policy = policy::create(
        character_id,
        coverage_amount,
        total_premium,
        tier,
        include_self_destruct,
        sd_premium,
        now,
        now + POLICY_DURATION,
        ctx,
    );

    // Register in PolicyRegistry (aborts if character already insured)
    registry::register_policy(policy_registry, character_id, object::id(&new_policy));

    // Refund change
    if (payment.value() > 0) {
        transfer::public_transfer(payment, ctx.sender());
    } else {
        payment.destroy_zero();
    };

    new_policy
}

// === Renew ===
/// Renew an existing policy. If the policy period has expired (time-wise),
/// increments no_claim_streak before applying NCB discount.
/// Coverage amount and reservation remain unchanged.
public fun renew_policy(
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    mut payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    config::assert_version(config);
    risk_pool::assert_version(pool);
    assert!(!config.is_policy_paused(), errors::protocol_paused());
    assert!(policy.is_active(), errors::policy_not_active());

    let pool_config = config.get_pool_config(policy.risk_tier());
    let now = clock.timestamp_ms() / 1000;

    // If time-expired: treat as claim-free period → increment streak
    if (now >= policy.expires_at()) {
        policy.increment_no_claim_streak();
    };

    // Calculate base premium
    let coverage = policy.coverage_amount();
    let base_premium = (((coverage as u128) * (pool_config.base_premium_rate() as u128) / 10000) as u64);

    // Add rider premium if applicable
    let total_base = if (policy.has_self_destruct_rider()) {
        base_premium + rider::calculate_rider_premium(coverage, pool_config)
    } else {
        base_premium
    };

    // NCB discount: min(streak * per_streak_bps, max_total_bps)
    let streak = policy.no_claim_streak();
    let raw_discount = (streak as u64) * pool_config.ncb_discount_bps();
    let max_discount = pool_config.max_ncb_total_discount_bps();
    let capped_discount = if (raw_discount > max_discount) { max_discount } else { raw_discount };

    // Apply discount (u128 intermediate)
    let renewal_premium = (((total_base as u128) * ((10000 - capped_discount) as u128) / 10000) as u64);
    // Safety: premium must be positive
    assert!(renewal_premium > 0, errors::insufficient_payment());

    // Payment
    assert!(payment.value() >= renewal_premium, errors::insufficient_payment());
    let premium_coin = coin::split(&mut payment, renewal_premium, ctx);
    risk_pool::collect_premium(pool, premium_coin.into_balance());

    // Update policy dates (set_renewal_data increments renewal_count)
    policy.set_renewal_data(renewal_premium, now + POLICY_DURATION, now);

    // Emit event
    policy::emit_renewed_event(
        policy.id(),
        policy.renewal_count(),
        policy.no_claim_streak(),
        renewal_premium,
        capped_discount,
    );

    // Refund change
    if (payment.value() > 0) {
        transfer::public_transfer(payment, ctx.sender());
    } else {
        payment.destroy_zero();
    };
}

// === Transfer ===
/// Custom transfer with validation. Resets NCB streak, sets cooldown.
/// Caller must follow with transfer::public_transfer in the same PTB.
public fun transfer_policy(
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    recipient: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    config::assert_version(config);
    assert!(policy.is_active(), errors::policy_not_active());

    let now = clock.timestamp_ms() / 1000;

    // Cannot transfer during active cooldown
    assert!(now >= policy.cooldown_until(), errors::cooldown_not_elapsed());

    // Set cooldown from tier's cooldown_period
    let pool_config = config.get_pool_config(policy.risk_tier());
    policy.set_cooldown_until(now + pool_config.cooldown_period());

    // Reset NCB (new owner doesn't inherit discount)
    policy.reset_no_claim_streak();

    // Emit event
    policy::emit_transferred_event(policy.id(), ctx.sender(), recipient);
}

// === Expire ===
/// Anyone can call this to formally expire a time-expired policy.
/// Increments NCB streak, releases coverage reservation, unregisters from PolicyRegistry.
public fun expire_policy(
    policy: &mut InsurancePolicy,
    policy_registry: &mut PolicyRegistry,
    pool: &mut RiskPool,
    clock: &Clock,
) {
    registry::assert_policy_registry_version(policy_registry);
    risk_pool::assert_version(pool);

    // Must be active status
    assert!(policy.is_active(), errors::policy_not_active());

    // Must be past expiry time
    let now = clock.timestamp_ms() / 1000;
    assert!(now >= policy.expires_at(), errors::policy_expired());

    // Claim-free expiry → increment streak
    policy.increment_no_claim_streak();

    // Mark expired
    policy.set_status(policy::status_expired());

    // Unregister from PolicyRegistry
    registry::unregister_policy(policy_registry, policy.insured_character_id());

    // Release coverage reservation
    risk_pool::release_reservation(pool, policy.coverage_amount());

    // Emit event
    event::emit(PolicyExpiredEvent { policy_id: policy.id() });
}

// === Accessors ===
public fun policy_duration(): u64 { POLICY_DURATION }
