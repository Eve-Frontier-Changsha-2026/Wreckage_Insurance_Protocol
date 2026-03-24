// contracts/wreckage-protocol/sources/ssu_extension.move
/// SSU (Smart Storage Unit) extension for the Wreckage Insurance Protocol.
/// Provides thin wrappers around core insurance operations, gated by SSU online status.
/// SSU owners opt in via: storage_unit::authorize_extension<ssu_extension::Auth>(ssu, owner_cap)
#[allow(lint(self_transfer))]
module wreckage_protocol::ssu_extension;

use sui::coin::Coin;
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use world::storage_unit::StorageUnit;
use world::character::Character;
use world::killmail::Killmail;
use wreckage_protocol::config::ProtocolConfig;
use wreckage_protocol::risk_pool::RiskPool;
use wreckage_protocol::registry::{PolicyRegistry, ClaimRegistry};
use wreckage_protocol::policy::InsurancePolicy;
use wreckage_protocol::underwriting;
use wreckage_protocol::claims;
use wreckage_protocol::errors;

// === Typed Witness ===
/// Only this module can construct Auth.
public struct Auth has drop {}

// === Events ===
public struct SSUInsuranceEvent has copy, drop {
    ssu_id: ID,
    operation: u8,
    policy_id: ID,
    actor: address,
}

const OP_PURCHASE: u8 = 0;
const OP_CLAIM: u8 = 1;
const OP_RENEW: u8 = 2;
const OP_CANCEL: u8 = 3;
const OP_SELF_DESTRUCT_CLAIM: u8 = 4;

// === Internal ===
fun assert_ssu_online(storage_unit: &StorageUnit) {
    assert!(storage_unit.status().is_online(), errors::ssu_not_online());
}

fun emit_event(ssu_id: ID, operation: u8, policy_id: ID, ctx: &TxContext) {
    event::emit(SSUInsuranceEvent {
        ssu_id,
        operation,
        policy_id,
        actor: ctx.sender(),
    });
}

// === Entry Functions ===

/// Purchase insurance through an SSU
public fun purchase_via_ssu(
    storage_unit: &StorageUnit,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    character: &Character,
    coverage_amount: u64,
    include_self_destruct: bool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
): InsurancePolicy {
    assert_ssu_online(storage_unit);
    let policy = underwriting::purchase_policy(
        config, pool, policy_registry, character,
        coverage_amount, include_self_destruct, payment, clock, ctx,
    );
    emit_event(object::id(storage_unit), OP_PURCHASE, object::id(&policy), ctx);
    policy
}

/// Submit standard claim through SSU
public fun claim_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    claims::submit_claim(policy, killmail, pool, claim_registry, config, clock, ctx);
    emit_event(object::id(storage_unit), OP_CLAIM, policy_id, ctx);
}

/// Submit self-destruct claim through SSU
public fun self_destruct_claim_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    killmail: &Killmail,
    pool: &mut RiskPool,
    claim_registry: &mut ClaimRegistry,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    claims::submit_self_destruct_claim(policy, killmail, pool, claim_registry, config, clock, ctx);
    emit_event(object::id(storage_unit), OP_SELF_DESTRUCT_CLAIM, policy_id, ctx);
}

/// Renew policy through SSU
public fun renew_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    underwriting::renew_policy(policy, config, pool, payment, clock, ctx);
    emit_event(object::id(storage_unit), OP_RENEW, policy_id, ctx);
}

/// Cancel policy through SSU
public fun cancel_via_ssu(
    storage_unit: &StorageUnit,
    policy: &mut InsurancePolicy,
    config: &ProtocolConfig,
    pool: &mut RiskPool,
    policy_registry: &mut PolicyRegistry,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_ssu_online(storage_unit);
    let policy_id = object::id(policy);
    underwriting::cancel_policy(policy, config, pool, policy_registry, clock, ctx);
    emit_event(object::id(storage_unit), OP_CANCEL, policy_id, ctx);
}
