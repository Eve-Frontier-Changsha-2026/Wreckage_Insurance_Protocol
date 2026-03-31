// frontend/src/lib/poolConfigParser.ts

export interface PoolConfigFields {
  risk_tier: number;
  base_premium_rate: number;
  max_coverage: number;
  min_coverage: number;
  cooldown_period: number;
  claim_decay_rate: number;
  self_destruct_premium_rate: number;
  self_destruct_waiting_period: number;
  self_destruct_payout_rate: number;
  self_destruct_decay_multiplier: number;
  deductible_bps: number;
  ncb_discount_bps: number;
  max_ncb_streak: number;
  max_ncb_total_discount_bps: number;
  subrogation_rate_bps: number;
  renewal_waiting_period: number;
}

export interface ProtocolConfigFields {
  pool_configs: PoolConfigFields[];
  protocol_fee_bps: number;
  max_claims_per_policy: number;
  max_coverage_limit: number;
  is_policy_paused: boolean;
}

/**
 * Parse raw JSON-RPC ProtocolConfig object into typed fields.
 * Handles nested `{fields: {...}}` wrappers from sui_getObject.
 */
export function parseProtocolConfig(raw: unknown): ProtocolConfigFields | null {
  const obj = raw as Record<string, unknown> | null;
  if (!obj) return null;
  const content = obj.content as Record<string, unknown> | undefined;
  const fields = (content?.fields ?? obj.fields) as Record<string, unknown> | undefined;
  if (!fields) return null;

  const rawConfigs = fields.pool_configs as unknown[];
  const pool_configs: PoolConfigFields[] = (rawConfigs ?? []).map((entry) => {
    const e = entry as Record<string, unknown>;
    const f = (e.fields ?? e) as Record<string, unknown>;
    return {
      risk_tier: Number(f.risk_tier ?? 0),
      base_premium_rate: Number(f.base_premium_rate ?? 0),
      max_coverage: Number(f.max_coverage ?? 0),
      min_coverage: Number(f.min_coverage ?? 0),
      cooldown_period: Number(f.cooldown_period ?? 0),
      claim_decay_rate: Number(f.claim_decay_rate ?? 0),
      self_destruct_premium_rate: Number(f.self_destruct_premium_rate ?? 0),
      self_destruct_waiting_period: Number(f.self_destruct_waiting_period ?? 0),
      self_destruct_payout_rate: Number(f.self_destruct_payout_rate ?? 0),
      self_destruct_decay_multiplier: Number(f.self_destruct_decay_multiplier ?? 0),
      deductible_bps: Number(f.deductible_bps ?? 0),
      ncb_discount_bps: Number(f.ncb_discount_bps ?? 0),
      max_ncb_streak: Number(f.max_ncb_streak ?? 0),
      max_ncb_total_discount_bps: Number(f.max_ncb_total_discount_bps ?? 0),
      subrogation_rate_bps: Number(f.subrogation_rate_bps ?? 0),
      renewal_waiting_period: Number(f.renewal_waiting_period ?? 0),
    };
  });

  return {
    pool_configs,
    protocol_fee_bps: Number(fields.protocol_fee_bps ?? 0),
    max_claims_per_policy: Number(fields.max_claims_per_policy ?? 0),
    max_coverage_limit: Number(fields.max_coverage_limit ?? 0),
    is_policy_paused: Boolean(fields.is_policy_paused ?? false),
  };
}

/**
 * Calculate premium from on-chain PoolConfig, matching contract math.
 * Uses bigint to match contract's u128 intermediate values.
 */
export function calcPremiumFromConfig(
  coverageMist: bigint,
  poolConfig: PoolConfigFields,
  includeSd: boolean,
): { basePremium: bigint; sdPremium: bigint; total: bigint } {
  const base = coverageMist * BigInt(poolConfig.base_premium_rate) / 10000n;
  const sd = includeSd
    ? coverageMist * BigInt(poolConfig.self_destruct_premium_rate) / 10000n
    : 0n;
  return { basePremium: base, sdPremium: sd, total: base + sd };
}

/**
 * Calculate estimated claim payout for the Nth claim (0-indexed).
 * Matches contract's anti_fraud::calculate_payout logic.
 */
export function calcClaimPayout(
  coverageMist: bigint,
  claimIndex: number,
  decayRateBps: number,
  deductibleBps: number,
): bigint {
  let amount = coverageMist;
  const decayFactor = 10000n - BigInt(decayRateBps);
  for (let i = 0; i < claimIndex; i++) {
    amount = amount * decayFactor / 10000n;
  }
  const deductible = amount * BigInt(deductibleBps) / 10000n;
  return amount - deductible;
}

/**
 * Calculate self-destruct claim payout.
 * Enhanced decay (multiplier) + deductible + SD payout rate.
 */
export function calcSdClaimPayout(
  coverageMist: bigint,
  claimIndex: number,
  poolConfig: PoolConfigFields,
): bigint {
  const effectiveDecay = Math.min(
    poolConfig.claim_decay_rate * poolConfig.self_destruct_decay_multiplier,
    9999,
  );
  const basePayout = calcClaimPayout(
    coverageMist,
    claimIndex,
    effectiveDecay,
    poolConfig.deductible_bps,
  );
  return basePayout * BigInt(poolConfig.self_destruct_payout_rate) / 10000n;
}

/** Convert MIST (bigint) to SUI display string */
export function mistToSuiDisplay(mist: bigint, decimals = 4): string {
  const whole = mist / 1_000_000_000n;
  const frac = mist % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, '0').slice(0, decimals);
  return `${whole}.${fracStr}`;
}
