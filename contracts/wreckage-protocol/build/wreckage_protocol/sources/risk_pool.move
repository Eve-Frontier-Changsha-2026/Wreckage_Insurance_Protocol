// contracts/wreckage-protocol/sources/risk_pool.move
module wreckage_protocol::risk_pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use wreckage_protocol::pool_config::PoolConfig;
use wreckage_protocol::errors;

// === Constants ===
const VIRTUAL_SHARES: u64 = 1000;
const VIRTUAL_LIQUIDITY: u64 = 1000; // 1000 MIST
const MAX_UTILIZATION_BPS: u64 = 8000; // 80%
const LP_LOCK_PERIOD: u64 = 604800; // 7 days in seconds
const LP_WITHDRAW_CAP_BPS: u64 = 2500; // 25%
const UTILIZATION_FEE_THRESHOLD_BPS: u64 = 6000; // 60%

// === Structs ===
public struct RiskPool has key {
    id: UID,
    config: PoolConfig,
    total_liquidity: Balance<SUI>,
    reserved_amount: u64,
    total_premiums_collected: u64,
    total_claims_paid: u64,
    total_shares: u64,
    is_active: bool,
    version: u64,
}

public struct LPPosition has key, store {
    id: UID,
    pool_risk_tier: u8,
    shares: u64,
    deposited_at: u64,
    initial_deposit: u64,
}

// === Events ===
public struct LPDepositEvent has copy, drop {
    pool_tier: u8,
    depositor: address,
    amount: u64,
    shares_minted: u64,
}

public struct LPWithdrawEvent has copy, drop {
    pool_tier: u8,
    withdrawer: address,
    amount: u64,
    shares_burned: u64,
    fee: u64,
}

// === Constructor (package-visible, share inside this module) ===
public(package) fun create_and_share_pool(
    config: PoolConfig,
    ctx: &mut TxContext,
) {
    let pool = RiskPool {
        id: object::new(ctx),
        config,
        total_liquidity: balance::zero(),
        reserved_amount: 0,
        total_premiums_collected: 0,
        total_claims_paid: 0,
        total_shares: VIRTUAL_SHARES, // virtual initial shares
        is_active: true,
        version: 1,
    };
    transfer::share_object(pool);
}

// === Accessors ===
public fun config(pool: &RiskPool): &PoolConfig { &pool.config }
public fun total_liquidity_value(pool: &RiskPool): u64 { pool.total_liquidity.value() + VIRTUAL_LIQUIDITY }
public fun raw_liquidity_value(pool: &RiskPool): u64 { pool.total_liquidity.value() }
public fun reserved_amount(pool: &RiskPool): u64 { pool.reserved_amount }
public fun total_shares(pool: &RiskPool): u64 { pool.total_shares }
public fun is_active(pool: &RiskPool): bool { pool.is_active }
public fun risk_tier(pool: &RiskPool): u8 { pool.config.risk_tier() }
public fun total_premiums_collected(pool: &RiskPool): u64 { pool.total_premiums_collected }
public fun total_claims_paid(pool: &RiskPool): u64 { pool.total_claims_paid }

public fun available_liquidity(pool: &RiskPool): u64 {
    let total = total_liquidity_value(pool);
    if (total > pool.reserved_amount) {
        total - pool.reserved_amount
    } else {
        0
    }
}

public fun utilization_bps(pool: &RiskPool): u64 {
    let total = total_liquidity_value(pool);
    if (total == 0) return 10000;
    pool.reserved_amount * 10000 / total
}

// === LP Deposit ===
public fun deposit(
    pool: &mut RiskPool,
    deposit_coin: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
): LPPosition {
    assert!(pool.is_active, errors::pool_not_active());
    let deposit_amount = deposit_coin.value();
    assert!(deposit_amount > 0, 0);

    // Calculate shares: deposit * total_shares / total_liquidity
    let total_liq = total_liquidity_value(pool);
    let shares = (((deposit_amount as u128) * (pool.total_shares as u128) / (total_liq as u128)) as u64);
    assert!(shares > 0, errors::zero_shares_minted());

    pool.total_shares = pool.total_shares + shares;
    pool.total_liquidity.join(deposit_coin.into_balance());

    let position = LPPosition {
        id: object::new(ctx),
        pool_risk_tier: pool.config.risk_tier(),
        shares,
        deposited_at: clock.timestamp_ms() / 1000,
        initial_deposit: deposit_amount,
    };

    event::emit(LPDepositEvent {
        pool_tier: pool.config.risk_tier(),
        depositor: ctx.sender(),
        amount: deposit_amount,
        shares_minted: shares,
    });

    position
}

// === LP Withdraw ===
public fun withdraw(
    pool: &mut RiskPool,
    position: &mut LPPosition,
    shares_to_burn: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(position.pool_risk_tier == pool.config.risk_tier(), errors::wrong_pool());
    assert!(shares_to_burn > 0 && shares_to_burn <= position.shares, 0);

    // Check lock period
    let now = clock.timestamp_ms() / 1000;
    assert!(now >= position.deposited_at + LP_LOCK_PERIOD, errors::lp_lock_period_not_elapsed());

    // Calculate withdrawal amount
    let total_liq = total_liquidity_value(pool);
    let gross_amount = (((shares_to_burn as u128) * (total_liq as u128) / (pool.total_shares as u128)) as u64);

    // Check withdraw cap (25% of available)
    let avail = available_liquidity(pool);
    let max_withdraw = avail * LP_WITHDRAW_CAP_BPS / 10000;
    assert!(gross_amount <= max_withdraw, errors::lp_withdraw_cap_exceeded());

    // Calculate dynamic withdrawal fee
    // fee_rate_bps = (utilization_bps - 6000) * 2, applied to gross_amount
    let util = utilization_bps(pool);
    let fee = if (util > UTILIZATION_FEE_THRESHOLD_BPS) {
        let fee_rate_bps = (util - UTILIZATION_FEE_THRESHOLD_BPS) * 2;
        (((gross_amount as u128) * (fee_rate_bps as u128) / 10000) as u64)
    } else {
        0
    };
    let net_amount = gross_amount - fee;

    // Ensure we don't withdraw more than raw balance
    let net_amount = if (net_amount > pool.total_liquidity.value()) {
        pool.total_liquidity.value()
    } else {
        net_amount
    };

    position.shares = position.shares - shares_to_burn;
    pool.total_shares = pool.total_shares - shares_to_burn;

    // Invariant: remaining liquidity must cover reservations
    assert!(pool.total_liquidity.value() - net_amount >= pool.reserved_amount,
        errors::pool_insufficient_liquidity());

    let withdraw_balance = pool.total_liquidity.split(net_amount);

    event::emit(LPWithdrawEvent {
        pool_tier: pool.config.risk_tier(),
        withdrawer: ctx.sender(),
        amount: net_amount,
        shares_burned: shares_to_burn,
        fee,
    });

    coin::from_balance(withdraw_balance, ctx)
}

// === Pool Operations (called by claims/underwriting) ===
public(package) fun collect_premium(pool: &mut RiskPool, premium: Balance<SUI>) {
    let amount = premium.value();
    pool.total_premiums_collected = pool.total_premiums_collected + amount;
    pool.total_liquidity.join(premium);
}

public(package) fun reserve_coverage(pool: &mut RiskPool, amount: u64) {
    let new_reserved = pool.reserved_amount + amount;
    let total = total_liquidity_value(pool);
    let max_reserved = total * MAX_UTILIZATION_BPS / 10000;
    assert!(new_reserved <= max_reserved, errors::pool_utilization_exceeded());
    pool.reserved_amount = new_reserved;
}

public(package) fun release_reservation(pool: &mut RiskPool, amount: u64) {
    assert!(amount <= pool.reserved_amount, errors::pool_insufficient_liquidity());
    pool.reserved_amount = pool.reserved_amount - amount;
}

public(package) fun pay_claim(
    pool: &mut RiskPool,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(pool.total_liquidity.value() >= amount, errors::pool_insufficient_liquidity());
    pool.total_claims_paid = pool.total_claims_paid + amount;
    // Release reservation atomically
    release_reservation(pool, amount);
    let payout = pool.total_liquidity.split(amount);
    // Invariant check
    assert!(pool.total_liquidity.value() >= pool.reserved_amount,
        errors::pool_insufficient_liquidity());
    coin::from_balance(payout, ctx)
}

public(package) fun receive_auction_revenue(pool: &mut RiskPool, revenue: Balance<SUI>) {
    pool.total_liquidity.join(revenue);
}

// === LPPosition Accessors ===
public fun lp_pool_tier(pos: &LPPosition): u8 { pos.pool_risk_tier }
public fun lp_shares(pos: &LPPosition): u64 { pos.shares }
public fun lp_deposited_at(pos: &LPPosition): u64 { pos.deposited_at }
public fun lp_initial_deposit(pos: &LPPosition): u64 { pos.initial_deposit }

public fun destroy_empty_position(pos: LPPosition) {
    assert!(pos.shares == 0, 0);
    let LPPosition { id, .. } = pos;
    id.delete();
}

// === Version Check ===
public fun assert_version(pool: &RiskPool) {
    assert!(pool.version == 1, errors::version_mismatch());
}
