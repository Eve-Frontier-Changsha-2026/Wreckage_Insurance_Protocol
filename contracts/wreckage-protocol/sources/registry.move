// contracts/wreckage-protocol/sources/registry.move
module wreckage_protocol::registry;

use sui::table::{Self, Table};
use world::in_game_id::TenantItemId;

// === ClaimRegistry ===
public struct ClaimRegistry has key {
    id: UID,
    processed_killmails: Table<TenantItemId, ID>, // killmail_key → policy_id
    version: u64,
}

// === PolicyRegistry ===
public struct PolicyRegistry has key {
    id: UID,
    active_policies: Table<TenantItemId, ID>, // character_id → policy_id
    version: u64,
}

// === Constructors (package-visible, share inside this module) ===
public(package) fun create_and_share_claim_registry(ctx: &mut TxContext) {
    let registry = ClaimRegistry {
        id: object::new(ctx),
        processed_killmails: table::new(ctx),
        version: 1,
    };
    transfer::share_object(registry);
}

public(package) fun create_and_share_policy_registry(ctx: &mut TxContext) {
    let registry = PolicyRegistry {
        id: object::new(ctx),
        active_policies: table::new(ctx),
        version: 1,
    };
    transfer::share_object(registry);
}

// === ClaimRegistry Functions ===
public fun is_killmail_claimed(registry: &ClaimRegistry, killmail_key: TenantItemId): bool {
    registry.processed_killmails.contains(killmail_key)
}

public(package) fun record_claim(
    registry: &mut ClaimRegistry,
    killmail_key: TenantItemId,
    policy_id: ID,
) {
    assert!(
        !registry.processed_killmails.contains(killmail_key),
        wreckage_protocol::errors::killmail_already_claimed(),
    );
    registry.processed_killmails.add(killmail_key, policy_id);
}

// === PolicyRegistry Functions ===
public fun has_active_policy(registry: &PolicyRegistry, character_id: TenantItemId): bool {
    registry.active_policies.contains(character_id)
}

public(package) fun register_policy(
    registry: &mut PolicyRegistry,
    character_id: TenantItemId,
    policy_id: ID,
) {
    assert!(
        !registry.active_policies.contains(character_id),
        wreckage_protocol::errors::character_already_insured(),
    );
    registry.active_policies.add(character_id, policy_id);
}

public(package) fun unregister_policy(
    registry: &mut PolicyRegistry,
    character_id: TenantItemId,
) {
    if (registry.active_policies.contains(character_id)) {
        registry.active_policies.remove(character_id);
    };
}

// === Version Check ===
public fun assert_claim_registry_version(r: &ClaimRegistry) {
    assert!(r.version == 1, wreckage_protocol::errors::version_mismatch());
}

public fun assert_policy_registry_version(r: &PolicyRegistry) {
    assert!(r.version == 1, wreckage_protocol::errors::version_mismatch());
}
