module wreckage_protocol::item_valuation;

use sui::table::{Self, Table};
use sui::clock::Clock;
use wreckage_protocol::config::AdminCap;
use wreckage_protocol::errors;

// === Structs ===
public struct ValuationRegistry has key {
    id: UID,
    prices: Table<u64, u64>,
    price_updated_at: Table<u64, u64>,
    default_ltv_bps: u64,
    version: u64,
}

// === Events ===
public struct ItemPriceSetEvent has copy, drop {
    item_type_id: u64,
    price_per_unit: u64,
    updated_at: u64,
}

public struct LTVUpdatedEvent has copy, drop {
    old_ltv_bps: u64,
    new_ltv_bps: u64,
}

// === Package Init ===
public(package) fun create_and_share_valuation_registry(ctx: &mut TxContext) {
    let registry = ValuationRegistry {
        id: object::new(ctx),
        prices: table::new(ctx),
        price_updated_at: table::new(ctx),
        default_ltv_bps: 7000,
        version: 1,
    };
    transfer::share_object(registry);
}

// === Admin Functions ===
public fun set_item_price(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    item_type_id: u64,
    price_per_unit: u64,
    clock: &Clock,
) {
    let now = clock.timestamp_ms();
    if (registry.prices.contains(item_type_id)) {
        *registry.prices.borrow_mut(item_type_id) = price_per_unit;
        *registry.price_updated_at.borrow_mut(item_type_id) = now;
    } else {
        registry.prices.add(item_type_id, price_per_unit);
        registry.price_updated_at.add(item_type_id, now);
    };
    sui::event::emit(ItemPriceSetEvent { item_type_id, price_per_unit, updated_at: now });
}

public fun set_item_prices_batch(
    admin: &AdminCap,
    registry: &mut ValuationRegistry,
    type_ids: vector<u64>,
    prices: vector<u64>,
    clock: &Clock,
) {
    assert!(type_ids.length() == prices.length(), errors::batch_length_mismatch());
    let mut i = 0;
    while (i < type_ids.length()) {
        set_item_price(admin, registry, type_ids[i], prices[i], clock);
        i = i + 1;
    };
}

public fun set_default_ltv(
    _: &AdminCap,
    registry: &mut ValuationRegistry,
    ltv_bps: u64,
) {
    assert!(ltv_bps <= 10000, errors::invalid_ltv());
    let old = registry.default_ltv_bps;
    registry.default_ltv_bps = ltv_bps;
    sui::event::emit(LTVUpdatedEvent { old_ltv_bps: old, new_ltv_bps: ltv_bps });
}

// === Query Functions ===
public fun estimate_value(
    registry: &ValuationRegistry,
    item_type_id: u64,
    quantity: u32,
): u64 {
    assert!(registry.prices.contains(item_type_id), errors::item_not_priced());
    let price = *registry.prices.borrow(item_type_id);
    (((price as u128) * (quantity as u128)) as u64)
}

public fun collateral_value(
    registry: &ValuationRegistry,
    item_type_id: u64,
    quantity: u32,
): u64 {
    let value = estimate_value(registry, item_type_id, quantity);
    (((value as u128) * (registry.default_ltv_bps as u128) / 10000) as u64)
}

public fun is_priced(registry: &ValuationRegistry, item_type_id: u64): bool {
    registry.prices.contains(item_type_id)
}

public fun get_price(registry: &ValuationRegistry, item_type_id: u64): u64 {
    assert!(registry.prices.contains(item_type_id), errors::item_not_priced());
    *registry.prices.borrow(item_type_id)
}

public fun get_price_updated_at(registry: &ValuationRegistry, item_type_id: u64): u64 {
    assert!(registry.price_updated_at.contains(item_type_id), errors::item_not_priced());
    *registry.price_updated_at.borrow(item_type_id)
}

public fun default_ltv_bps(registry: &ValuationRegistry): u64 {
    registry.default_ltv_bps
}

public fun version(registry: &ValuationRegistry): u64 {
    registry.version
}
