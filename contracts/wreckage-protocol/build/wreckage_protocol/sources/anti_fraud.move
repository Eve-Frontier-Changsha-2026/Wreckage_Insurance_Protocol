// contracts/wreckage-protocol/sources/anti_fraud.move
module wreckage_protocol::anti_fraud;

use sui::clock::Clock;
use wreckage_protocol::policy::InsurancePolicy;
use wreckage_protocol::errors;
use wreckage_protocol::config::ProtocolConfig;
use wreckage_protocol::registry::ClaimRegistry;
use world::killmail::{Self, Killmail};

// === FraudCheckResult ===
// Reason codes: 0=pass, 1=self_kill, 2=cooldown, 3=frequency,
//               4=duplicate, 5=waiting_period, 6=no_rider
const REASON_PASS: u8 = 0;
const REASON_SELF_KILL: u8 = 1;
const REASON_COOLDOWN: u8 = 2;
const REASON_FREQUENCY: u8 = 3;
const REASON_DUPLICATE: u8 = 4;
const REASON_WAITING_PERIOD: u8 = 5;
const REASON_NO_RIDER: u8 = 6;

public struct FraudCheckResult has drop {
    is_valid: bool,
    reason: u8,
}

// === Accessors ===
public fun is_valid(r: &FraudCheckResult): bool { r.is_valid }
public fun reason(r: &FraudCheckResult): u8 { r.reason }

// === Reason Constants (public) ===
public fun reason_pass(): u8 { REASON_PASS }
public fun reason_self_kill(): u8 { REASON_SELF_KILL }
public fun reason_cooldown(): u8 { REASON_COOLDOWN }
public fun reason_frequency(): u8 { REASON_FREQUENCY }
public fun reason_duplicate(): u8 { REASON_DUPLICATE }
public fun reason_waiting_period(): u8 { REASON_WAITING_PERIOD }
public fun reason_no_rider(): u8 { REASON_NO_RIDER }

// === Validation: Standard Claim ===
public fun validate_standard_claim(
    policy: &InsurancePolicy,
    killmail: &Killmail,
    claim_registry: &ClaimRegistry,
    clock: &Clock,
    config: &ProtocolConfig,
): FraudCheckResult {
    let pool_config = config.get_pool_config(policy.risk_tier());
    let now = clock.timestamp_ms() / 1000; // convert to seconds

    // 1. Policy must be active
    assert!(policy.is_active(), errors::policy_not_active());

    // 2. Policy must not be expired
    assert!(now < policy.expires_at(), errors::policy_expired());

    // 3. Victim must match insured character
    assert!(
        killmail::victim_id(killmail) == policy.insured_character_id(),
        errors::killmail_victim_mismatch(),
    );

    // 4. Kill timestamp must be within policy period
    let kill_ts = killmail::kill_timestamp(killmail);
    assert!(
        kill_ts >= policy.created_at() && kill_ts < policy.expires_at(),
        errors::killmail_out_of_policy_period(),
    );

    // 5. Must NOT be self-destruct (killer != victim for standard claim)
    if (killmail::killer_id(killmail) == killmail::victim_id(killmail)) {
        return FraudCheckResult { is_valid: false, reason: REASON_SELF_KILL }
    };

    // 6. Cooldown must have elapsed
    if (now < policy.cooldown_until()) {
        return FraudCheckResult { is_valid: false, reason: REASON_COOLDOWN }
    };

    // 7. Frequency limit: claim_count < max_claims_per_policy
    if (policy.claim_count() >= config.max_claims_per_policy()) {
        return FraudCheckResult { is_valid: false, reason: REASON_FREQUENCY }
    };

    // 8. Duplicate killmail check (global)
    if (claim_registry.is_killmail_claimed(killmail::key(killmail))) {
        return FraudCheckResult { is_valid: false, reason: REASON_DUPLICATE }
    };

    // 9. Renewal waiting period
    if (policy.renewal_count() > 0) {
        let waiting_end = policy.created_at() + pool_config.renewal_waiting_period();
        if (kill_ts < waiting_end) {
            return FraudCheckResult { is_valid: false, reason: REASON_WAITING_PERIOD }
        };
    };

    FraudCheckResult { is_valid: true, reason: REASON_PASS }
}

// === Validation: Self-Destruct Claim ===
public fun validate_self_destruct_claim(
    policy: &InsurancePolicy,
    killmail: &Killmail,
    claim_registry: &ClaimRegistry,
    clock: &Clock,
    config: &ProtocolConfig,
): FraudCheckResult {
    let pool_config = config.get_pool_config(policy.risk_tier());
    let now = clock.timestamp_ms() / 1000;

    // 1. Must have self-destruct rider
    if (!policy.has_self_destruct_rider()) {
        return FraudCheckResult { is_valid: false, reason: REASON_NO_RIDER }
    };

    // 2. Policy must be active
    assert!(policy.is_active(), errors::policy_not_active());

    // 3. Policy must not be expired
    assert!(now < policy.expires_at(), errors::policy_expired());

    // 4. Victim must match insured character
    assert!(
        killmail::victim_id(killmail) == policy.insured_character_id(),
        errors::killmail_victim_mismatch(),
    );

    // 5. Kill timestamp must be within policy period
    let kill_ts = killmail::kill_timestamp(killmail);
    assert!(
        kill_ts >= policy.created_at() && kill_ts < policy.expires_at(),
        errors::killmail_out_of_policy_period(),
    );

    // 6. Must BE self-destruct (killer == victim)
    if (killmail::killer_id(killmail) != killmail::victim_id(killmail)) {
        return FraudCheckResult { is_valid: false, reason: REASON_SELF_KILL }
    };

    // 7. Cooldown must have elapsed
    if (now < policy.cooldown_until()) {
        return FraudCheckResult { is_valid: false, reason: REASON_COOLDOWN }
    };

    // 8. Frequency limit
    if (policy.claim_count() >= config.max_claims_per_policy()) {
        return FraudCheckResult { is_valid: false, reason: REASON_FREQUENCY }
    };

    // 9. Duplicate killmail check
    if (claim_registry.is_killmail_claimed(killmail::key(killmail))) {
        return FraudCheckResult { is_valid: false, reason: REASON_DUPLICATE }
    };

    // 10. Self-destruct waiting period (from policy creation, NOT renewal)
    let sd_waiting_end = policy.created_at() + pool_config.self_destruct_waiting_period();
    if (kill_ts < sd_waiting_end) {
        return FraudCheckResult { is_valid: false, reason: REASON_WAITING_PERIOD }
    };

    FraudCheckResult { is_valid: true, reason: REASON_PASS }
}

// === Payout Calculation ===
/// Calculate payout with decay and deductible.
/// Formula: coverage * (1 - decay_rate)^claim_count * (1 - deductible_bps/10000)
/// For self-destruct: decay_rate is multiplied by self_destruct_decay_multiplier.
/// All intermediate math uses u128 to prevent overflow.
public fun calculate_payout(
    coverage: u64,
    claim_count: u8,
    decay_rate_bps: u64,
    deductible_bps: u64,
): u64 {
    // Apply decay iteratively: amount = amount * (10000 - decay_rate) / 10000
    let mut amount = (coverage as u128);
    let decay_factor = (10000u128 - (decay_rate_bps as u128));
    let mut i = 0u8;
    while (i < claim_count) {
        amount = amount * decay_factor / 10000;
        i = i + 1;
    };

    // Apply deductible
    let deductible = amount * (deductible_bps as u128) / 10000;
    amount = amount - deductible;

    (amount as u64)
}
