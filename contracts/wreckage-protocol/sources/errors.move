module wreckage_protocol::errors;

// Error code accessors — used by all modules via errors::xxx()
// Policy Errors (0-9)
public fun policy_not_active(): u64 { 0 }
public fun policy_expired(): u64 { 1 }
public fun coverage_out_of_range(): u64 { 2 }
public fun insufficient_payment(): u64 { 3 }

// Rider Errors (10-19)
public fun no_self_destruct_rider(): u64 { 10 }


// Pool Errors (20-29)
public fun pool_not_active(): u64 { 20 }
public fun pool_insufficient_liquidity(): u64 { 21 }
public fun pool_utilization_exceeded(): u64 { 22 }
public fun lp_lock_period_not_elapsed(): u64 { 23 }
public fun lp_withdraw_cap_exceeded(): u64 { 24 }
public fun zero_shares_minted(): u64 { 25 }
public fun wrong_pool(): u64 { 26 }

// Claim Errors (30-39)
public fun killmail_already_claimed(): u64 { 30 }
public fun killmail_victim_mismatch(): u64 { 31 }
public fun killmail_out_of_policy_period(): u64 { 32 }
public fun cooldown_not_elapsed(): u64 { 33 }
public fun max_claims_reached(): u64 { 34 }
public fun not_self_destruct(): u64 { 35 }
public fun is_self_destruct(): u64 { 36 }
public fun payout_below_minimum(): u64 { 37 }
public fun renewal_waiting_period(): u64 { 38 }

// Auction Errors (40-49)
public fun auction_not_in_bidding(): u64 { 40 }
public fun bid_too_low(): u64 { 41 }
public fun auction_not_ended(): u64 { 42 }
public fun auction_not_in_buyout(): u64 { 43 }
public fun buyout_payment_insufficient(): u64 { 44 }
public fun auction_anti_snipe_capped(): u64 { 45 }
public fun auction_pool_tier_mismatch(): u64 { 46 }

// Registry Errors (50-59)
public fun character_already_insured(): u64 { 50 }

// Config Errors (60-69)
public fun version_mismatch(): u64 { 60 }
public fun protocol_paused(): u64 { 61 }
public fun invalid_config(): u64 { 62 }
public fun cancellation_not_allowed(): u64 { 63 }

// SSU Extension Errors (65+)
public fun ssu_not_online(): u64 { 65 }

// General Errors (70+)
public fun invalid_amount(): u64 { 73 }

// Item Valuation Errors (70+)
public fun item_not_priced(): u64 { 70 }
public fun invalid_ltv(): u64 { 71 }
public fun batch_length_mismatch(): u64 { 72 }
