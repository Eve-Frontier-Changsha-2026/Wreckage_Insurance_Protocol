import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../contracts';

/**
 * Tier preset configs for admin pool creation.
 * Each array has 16 values matching pool_config::new_pool_config() params:
 * [risk_tier, base_premium_rate, max_coverage, min_coverage, cooldown_period,
 *  claim_decay_rate, self_destruct_premium_rate, self_destruct_waiting_period,
 *  self_destruct_payout_rate, self_destruct_decay_multiplier, deductible_bps,
 *  ncb_discount_bps, max_ncb_streak, max_ncb_total_discount_bps,
 *  subrogation_rate_bps, renewal_waiting_period]
 */
export const TIER_PRESETS: Record<number, { label: string; params: (number | bigint)[] }> = {
  0: {
    label: 'Tier 0 — Low Risk',
    params: [
      0,                  // risk_tier
      200,                // base_premium_rate = 2%
      100_000_000_000,    // max_coverage = 100 SUI
      1_000_000_000,      // min_coverage = 1 SUI
      604_800,            // cooldown_period = 7 days (seconds)
      500,                // claim_decay_rate = 5%
      5000,               // self_destruct_premium_rate = 50%
      604_800,            // self_destruct_waiting_period = 7 days
      5000,               // self_destruct_payout_rate = 50%
      2,                  // self_destruct_decay_multiplier = 2x
      1000,               // deductible_bps = 10%
      500,                // ncb_discount_bps = 5% per streak
      5,                  // max_ncb_streak
      2500,               // max_ncb_total_discount_bps = 25%
      2000,               // subrogation_rate_bps = 20%
      86_400,             // renewal_waiting_period = 24h
    ],
  },
  1: {
    label: 'Tier 1 — Medium Risk',
    params: [
      1,                  // risk_tier
      400,                // base_premium_rate = 4%
      50_000_000_000,     // max_coverage = 50 SUI
      1_000_000_000,      // min_coverage = 1 SUI
      432_000,            // cooldown_period = 5 days
      800,                // claim_decay_rate = 8%
      6000,               // self_destruct_premium_rate = 60%
      604_800,            // self_destruct_waiting_period = 7 days
      4000,               // self_destruct_payout_rate = 40%
      2,                  // self_destruct_decay_multiplier = 2x
      1500,               // deductible_bps = 15%
      800,                // ncb_discount_bps = 8% per streak
      3,                  // max_ncb_streak
      2400,               // max_ncb_total_discount_bps = 24%
      2500,               // subrogation_rate_bps = 25%
      86_400,             // renewal_waiting_period = 24h
    ],
  },
  2: {
    label: 'Tier 2 — High Risk',
    params: [
      2,                  // risk_tier
      700,                // base_premium_rate = 7%
      30_000_000_000,     // max_coverage = 30 SUI
      1_000_000_000,      // min_coverage = 1 SUI
      259_200,            // cooldown_period = 3 days
      1000,               // claim_decay_rate = 10%
      7000,               // self_destruct_premium_rate = 70%
      604_800,            // self_destruct_waiting_period = 7 days
      5000,               // self_destruct_payout_rate = 50%
      3,                  // self_destruct_decay_multiplier = 3x
      2000,               // deductible_bps = 20%
      1000,               // ncb_discount_bps = 10% per streak
      3,                  // max_ncb_streak
      3000,               // max_ncb_total_discount_bps = 30%
      3000,               // subrogation_rate_bps = 30%
      86_400,             // renewal_waiting_period = 24h
    ],
  },
};

/**
 * Builds a PTB that:
 * 1. Calls pool_config::new_pool_config(...) to construct a PoolConfig value
 * 2. Calls config::add_pool_tier to register the tier in ProtocolConfig
 * 3. Calls config::admin_create_pool to create + share the RiskPool object
 *
 * All three in one transaction so the pool is ready for use immediately.
 */
export function buildAdminCreatePool(args: {
  adminCapId: string;
  riskTier: number;
}) {
  const preset = TIER_PRESETS[args.riskTier];
  if (!preset) throw new Error(`Unknown tier: ${args.riskTier}`);

  const tx = new Transaction();
  const params = preset.params;

  function buildPoolConfigCall() {
    return tx.moveCall({
      target: `${PACKAGE_ID}::pool_config::new_pool_config`,
      arguments: [
        tx.pure.u8(Number(params[0])),     // risk_tier
        tx.pure.u64(BigInt(params[1])),     // base_premium_rate
        tx.pure.u64(BigInt(params[2])),     // max_coverage
        tx.pure.u64(BigInt(params[3])),     // min_coverage
        tx.pure.u64(BigInt(params[4])),     // cooldown_period
        tx.pure.u64(BigInt(params[5])),     // claim_decay_rate
        tx.pure.u64(BigInt(params[6])),     // self_destruct_premium_rate
        tx.pure.u64(BigInt(params[7])),     // self_destruct_waiting_period
        tx.pure.u64(BigInt(params[8])),     // self_destruct_payout_rate
        tx.pure.u64(BigInt(params[9])),     // self_destruct_decay_multiplier
        tx.pure.u64(BigInt(params[10])),    // deductible_bps
        tx.pure.u64(BigInt(params[11])),    // ncb_discount_bps
        tx.pure.u8(Number(params[12])),     // max_ncb_streak
        tx.pure.u64(BigInt(params[13])),    // max_ncb_total_discount_bps
        tx.pure.u64(BigInt(params[14])),    // subrogation_rate_bps
        tx.pure.u64(BigInt(params[15])),    // renewal_waiting_period
      ],
    });
  }

  // 1. Construct PoolConfig for add_pool_tier
  const [poolConfig1] = buildPoolConfigCall();

  // 2. Register tier in ProtocolConfig (required for purchase_policy to work)
  tx.moveCall({
    target: `${PACKAGE_ID}::config::add_pool_tier`,
    arguments: [
      tx.object(args.adminCapId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      poolConfig1,
    ],
  });

  // 3. Construct another PoolConfig (previous one was consumed by add_pool_tier)
  const [poolConfig2] = buildPoolConfigCall();

  // 4. Create + share the RiskPool
  tx.moveCall({
    target: `${PACKAGE_ID}::config::admin_create_pool`,
    arguments: [
      tx.object(args.adminCapId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      poolConfig2,
    ],
  });

  return tx;
}
