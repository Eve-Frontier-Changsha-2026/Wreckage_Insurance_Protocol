// contracts/wreckage-core/sources/errors.move
module wreckage_protocol::errors;

// === Policy Errors ===
#[error(code = 0)]
const EPolicyNotActive: vector<u8> = b"Policy is not active";
#[error(code = 1)]
const EPolicyExpired: vector<u8> = b"Policy has expired";
#[error(code = 2)]
const ECoverageOutOfRange: vector<u8> = b"Coverage amount out of allowed range";
#[error(code = 3)]
const EInsufficientPayment: vector<u8> = b"Insufficient payment for premium";

// === Rider Errors ===
#[error(code = 10)]
const ENoSelfDestructRider: vector<u8> = b"Policy does not have self-destruct rider";
#[error(code = 11)]
const ESelfDestructWaitingPeriod: vector<u8> = b"Self-destruct waiting period not elapsed";

// === Pool Errors ===
#[error(code = 20)]
const EPoolNotActive: vector<u8> = b"Risk pool is not active";
#[error(code = 21)]
const EPoolInsufficientLiquidity: vector<u8> = b"Pool has insufficient liquidity for payout";
#[error(code = 22)]
const EPoolUtilizationExceeded: vector<u8> = b"Pool utilization safety valve exceeded";
#[error(code = 23)]
const ELPLockPeriodNotElapsed: vector<u8> = b"LP lock period has not elapsed";
#[error(code = 24)]
const ELPWithdrawCapExceeded: vector<u8> = b"LP withdrawal cap exceeded";
#[error(code = 25)]
const EZeroSharesMinted: vector<u8> = b"Deposit would mint zero shares";
#[error(code = 26)]
const EWrongPool: vector<u8> = b"LP position does not belong to this pool";

// === Claim Errors ===
#[error(code = 30)]
const EKillmailAlreadyClaimed: vector<u8> = b"Killmail has already been claimed";
#[error(code = 31)]
const EKillmailVictimMismatch: vector<u8> = b"Killmail victim does not match insured character";
#[error(code = 32)]
const EKillmailOutOfPolicyPeriod: vector<u8> = b"Kill timestamp is outside policy period";
#[error(code = 33)]
const ECooldownNotElapsed: vector<u8> = b"Claim cooldown period has not elapsed";
#[error(code = 34)]
const EMaxClaimsReached: vector<u8> = b"Maximum claims per policy reached";
#[error(code = 35)]
const ENotSelfDestruct: vector<u8> = b"Killmail is not a self-destruct (killer != victim)";
#[error(code = 36)]
const EIsSelfDestruct: vector<u8> = b"Cannot use standard claim for self-destruct";
#[error(code = 37)]
const EPayoutBelowMinimum: vector<u8> = b"Calculated payout is below minimum threshold";
#[error(code = 38)]
const ERenewalWaitingPeriod: vector<u8> = b"Renewal waiting period not elapsed";

// === Auction Errors ===
#[error(code = 40)]
const EAuctionNotInBiddingPhase: vector<u8> = b"Auction is not in bidding phase";
#[error(code = 41)]
const EBidTooLow: vector<u8> = b"Bid is below minimum increment";
#[error(code = 42)]
const EAuctionNotEnded: vector<u8> = b"Auction has not ended yet";
#[error(code = 43)]
const EAuctionNotInBuyoutPhase: vector<u8> = b"Auction is not in buyout phase";
#[error(code = 44)]
const EBuyoutPaymentInsufficient: vector<u8> = b"Buyout payment is insufficient";
#[error(code = 45)]
const EAuctionAntiSnipeCapped: vector<u8> = b"Auction anti-snipe extension cap reached";
#[error(code = 46)]
const EAuctionPoolTierMismatch: vector<u8> = b"Auction pool tier does not match source";

// === Registry Errors ===
#[error(code = 50)]
const ECharacterAlreadyInsured: vector<u8> = b"Character already has an active policy";

// === Config Errors ===
#[error(code = 60)]
const EVersionMismatch: vector<u8> = b"Object version mismatch";
#[error(code = 61)]
const EProtocolPaused: vector<u8> = b"Protocol is paused for this operation";
#[error(code = 62)]
const EInvalidConfig: vector<u8> = b"Invalid configuration parameter";
#[error(code = 63)]
const ECancellationNotAllowed: vector<u8> = b"Policy cannot be cancelled";

// === SSU Extension Errors ===
#[error(code = 65)]
const ESSUNotOnline: vector<u8> = b"Smart Storage Unit is not online";

// === Item Valuation Errors ===
#[error(code = 70)]
const EItemNotPriced: vector<u8> = b"Item type has no price set in valuation registry";
#[error(code = 71)]
const EInvalidLTV: vector<u8> = b"LTV ratio must be <= 10000 bps";
#[error(code = 72)]
const EBatchLengthMismatch: vector<u8> = b"Type IDs and prices vectors must have same length";

// === Public Accessors (used by wreckage-protocol) ===
public fun policy_not_active(): u64 { 0 }
public fun policy_expired(): u64 { 1 }
public fun coverage_out_of_range(): u64 { 2 }
public fun insufficient_payment(): u64 { 3 }
public fun no_self_destruct_rider(): u64 { 10 }
public fun self_destruct_waiting_period(): u64 { 11 }
public fun pool_not_active(): u64 { 20 }
public fun pool_insufficient_liquidity(): u64 { 21 }
public fun pool_utilization_exceeded(): u64 { 22 }
public fun lp_lock_period_not_elapsed(): u64 { 23 }
public fun lp_withdraw_cap_exceeded(): u64 { 24 }
public fun zero_shares_minted(): u64 { 25 }
public fun wrong_pool(): u64 { 26 }
public fun killmail_already_claimed(): u64 { 30 }
public fun killmail_victim_mismatch(): u64 { 31 }
public fun killmail_out_of_policy_period(): u64 { 32 }
public fun cooldown_not_elapsed(): u64 { 33 }
public fun max_claims_reached(): u64 { 34 }
public fun not_self_destruct(): u64 { 35 }
public fun is_self_destruct(): u64 { 36 }
public fun payout_below_minimum(): u64 { 37 }
public fun renewal_waiting_period(): u64 { 38 }
public fun auction_not_in_bidding(): u64 { 40 }
public fun bid_too_low(): u64 { 41 }
public fun auction_not_ended(): u64 { 42 }
public fun auction_not_in_buyout(): u64 { 43 }
public fun buyout_payment_insufficient(): u64 { 44 }
public fun auction_anti_snipe_capped(): u64 { 45 }
public fun auction_pool_tier_mismatch(): u64 { 46 }
public fun character_already_insured(): u64 { 50 }
public fun version_mismatch(): u64 { 60 }
public fun protocol_paused(): u64 { 61 }
public fun invalid_config(): u64 { 62 }
public fun cancellation_not_allowed(): u64 { 63 }
public fun ssu_not_online(): u64 { 65 }
public fun item_not_priced(): u64 { 70 }
public fun invalid_ltv(): u64 { 71 }
public fun batch_length_mismatch(): u64 { 72 }
