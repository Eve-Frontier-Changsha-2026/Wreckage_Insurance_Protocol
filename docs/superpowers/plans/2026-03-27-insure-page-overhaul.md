# InsurePage UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the InsurePage with a 3-step wizard that reads all parameters from on-chain, fixes the premium calculation bug, and provides full information disclosure.

**Architecture:** 3-step wizard (Risk Level → Coverage & Options → Review & Purchase). All premium/config data from `useProtocolConfig` + `useDiscoverPools` + `useRiskPoolDetail`. Premium math uses `bigint` to match contract. Pool auto-resolved from tier.

**Tech Stack:** React, TypeScript, TailwindCSS, @tanstack/react-query, @mysten/dapp-kit-react

**Spec:** `docs/superpowers/specs/2026-03-27-insure-page-overhaul-design.md`

**Mockup:** `.superpowers/brainstorm/41736-1774544130/content/wizard-rwd-v2.html`

---

### Task 1: Add PoolConfig parser to useProtocolConfig

**Files:**
- Create: `frontend/src/lib/poolConfigParser.ts`
- Modify: `frontend/src/hooks/useProtocolConfig.ts`

**Context:** `ProtocolConfig` on-chain has `pool_configs: vector<PoolConfig>`. JSON-RPC returns nested `{content: {fields: {pool_configs: [{fields: {risk_tier, base_premium_rate, ...}}, ...]}}}`. We need typed parsing.

- [ ] **Step 1: Create poolConfigParser.ts**

```typescript
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
```

- [ ] **Step 2: Update useProtocolConfig to export parsed config**

Replace `frontend/src/hooks/useProtocolConfig.ts` with:

```typescript
import { useQuery } from '@tanstack/react-query';
import { SHARED_OBJECTS } from '../lib/contracts';
import { rpcGetObject } from '../lib/rpc';
import { parseProtocolConfig, type ProtocolConfigFields } from '../lib/poolConfigParser';

export function useProtocolConfig() {
  return useQuery({
    queryKey: ['protocolConfig'],
    queryFn: async () => {
      const result = await rpcGetObject(SHARED_OBJECTS.protocolConfig);
      return result.data;
    },
    staleTime: 60_000,
  });
}

/** Parsed, typed ProtocolConfig fields */
export function useParsedProtocolConfig() {
  const { data, ...rest } = useProtocolConfig();
  const parsed = data ? parseProtocolConfig(data) : null;
  return { data: parsed, ...rest };
}
```

- [ ] **Step 3: Verify tsc passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/poolConfigParser.ts frontend/src/hooks/useProtocolConfig.ts
git commit -m "feat: add PoolConfig parser + premium calculation from on-chain params"
```

---

### Task 2: Create PremiumBreakdown component

**Files:**
- Create: `frontend/src/components/policy/PremiumBreakdown.tsx`

- [ ] **Step 1: Create PremiumBreakdown.tsx**

```typescript
// frontend/src/components/policy/PremiumBreakdown.tsx
import { mistToSuiDisplay } from '../../lib/poolConfigParser';

interface PremiumBreakdownProps {
  basePremiumMist: bigint;
  sdPremiumMist: bigint;
  baseRateBps: number;
  sdRateBps: number;
  protocolFeeBps: number;
  coverageSui: string;
  includeSd: boolean;
}

export default function PremiumBreakdown({
  basePremiumMist,
  sdPremiumMist,
  baseRateBps,
  sdRateBps,
  protocolFeeBps,
  coverageSui,
  includeSd,
}: PremiumBreakdownProps) {
  const total = basePremiumMist + sdPremiumMist;
  const feeAmount = total * BigInt(protocolFeeBps) / 10000n;

  return (
    <div className="bg-gray-950 border border-orange-500 rounded-xl p-5">
      <div className="text-[11px] text-orange-400 font-bold uppercase tracking-widest mb-3">
        Premium Breakdown
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between text-gray-300">
          <span>Base ({(baseRateBps / 100).toFixed(0)}% of {coverageSui})</span>
          <span>{mistToSuiDisplay(basePremiumMist)} SUI</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>SD Rider {includeSd ? `(${(sdRateBps / 100).toFixed(0)}%)` : ''}</span>
          <span>{includeSd ? `${mistToSuiDisplay(sdPremiumMist)} SUI` : '--'}</span>
        </div>
        <div className="flex justify-between text-gray-600 text-xs">
          <span>Protocol Fee ({(protocolFeeBps / 100).toFixed(0)}% to treasury)</span>
          <span>-{mistToSuiDisplay(feeAmount)} SUI</span>
        </div>
        <div className="border-t border-gray-800 mt-2 pt-2 flex justify-between text-orange-400 font-bold text-base">
          <span>You Pay</span>
          <span>{mistToSuiDisplay(total)} SUI</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/policy/PremiumBreakdown.tsx
git commit -m "feat: add PremiumBreakdown component with on-chain param display"
```

---

### Task 3: Create ClaimEstimate component

**Files:**
- Create: `frontend/src/components/policy/ClaimEstimate.tsx`

- [ ] **Step 1: Create ClaimEstimate.tsx**

```typescript
// frontend/src/components/policy/ClaimEstimate.tsx
import { calcClaimPayout, calcSdClaimPayout, mistToSuiDisplay, type PoolConfigFields } from '../../lib/poolConfigParser';

interface ClaimEstimateProps {
  coverageMist: bigint;
  poolConfig: PoolConfigFields;
  includeSd: boolean;
  maxClaims: number;
  cooldownHours: number;
}

const COLORS = ['text-green-400', 'text-yellow-400', 'text-red-400'];

export default function ClaimEstimate({
  coverageMist,
  poolConfig,
  includeSd,
  maxClaims,
  cooldownHours,
}: ClaimEstimateProps) {
  const claimsToShow = Math.min(3, maxClaims);

  return (
    <div className="bg-gray-950 rounded-xl p-5">
      <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-3">
        Estimated Claim Payouts
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {Array.from({ length: claimsToShow }, (_, i) => {
          const payout = calcClaimPayout(
            coverageMist,
            i,
            poolConfig.claim_decay_rate,
            poolConfig.deductible_bps,
          );
          return (
            <div key={i} className="text-gray-400 text-xs">
              {i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'} claim:{' '}
              <span className={`font-semibold ${COLORS[i] ?? 'text-gray-300'}`}>
                ~{mistToSuiDisplay(payout)} SUI
              </span>
              {i === 0 && <span className="text-gray-600 ml-1">(- {poolConfig.deductible_bps / 100}% deductible)</span>}
              {i > 0 && <span className="text-gray-600 ml-1">(+ {poolConfig.claim_decay_rate / 100}% decay)</span>}
            </div>
          );
        })}
        {includeSd && (
          <div className="text-gray-400 text-xs mt-1 pt-1 border-t border-gray-800">
            SD 1st claim:{' '}
            <span className="font-semibold text-yellow-400">
              ~{mistToSuiDisplay(calcSdClaimPayout(coverageMist, 0, poolConfig))} SUI
            </span>
            <span className="text-gray-600 ml-1">
              ({poolConfig.self_destruct_payout_rate / 100}% of base after {poolConfig.self_destruct_decay_multiplier}x decay)
            </span>
          </div>
        )}
      </div>
      <div className="text-gray-600 text-[11px] mt-2">
        Max {maxClaims} claims / policy. {cooldownHours}h cooldown between claims.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/policy/ClaimEstimate.tsx
git commit -m "feat: add ClaimEstimate component with decay/deductible math"
```

---

### Task 4: Rewrite RiskTierSelector to use on-chain PoolConfig

**Files:**
- Modify: `frontend/src/components/policy/RiskTierSelector.tsx`

**Context:** Remove hardcoded `TIER_RATES`. Accept `PoolConfigFields[]` as prop. Show: tier label, name, premium rate (big), 3 stats (coverage range, deductible, SD rider). "More details >" for expansion (can be added later). Matching mockup: spacious cards with `tier-top` and `tier-stats` sections.

- [ ] **Step 1: Rewrite RiskTierSelector.tsx**

```typescript
// frontend/src/components/policy/RiskTierSelector.tsx
import type { RiskTier } from '../../lib/types';
import { TIER_NAMES } from '../../lib/types';
import type { PoolConfigFields } from '../../lib/poolConfigParser';

const TIER_COLORS: Record<number, string> = {
  0: 'text-green-400',
  1: 'text-yellow-400',
  2: 'text-red-400',
};

const TIER_BORDER_COLORS: Record<number, string> = {
  0: 'border-green-400',
  1: 'border-yellow-400',
  2: 'border-red-400',
};

interface RiskTierSelectorProps {
  value: RiskTier;
  onChange: (tier: RiskTier) => void;
  poolConfigs: PoolConfigFields[];
}

function mistToSui(mist: number): string {
  return (mist / 1_000_000_000).toFixed(0);
}

export default function RiskTierSelector({ value, onChange, poolConfigs }: RiskTierSelectorProps) {
  const tiers: RiskTier[] = [0, 1, 2];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiers.map((tier) => {
        const config = poolConfigs.find((c) => c.risk_tier === tier);
        const isSelected = value === tier;
        const color = TIER_COLORS[tier] ?? 'text-gray-400';

        return (
          <button
            key={tier}
            type="button"
            onClick={() => onChange(tier)}
            className={`relative flex flex-col items-center bg-gray-950 rounded-xl p-5 border transition-all cursor-pointer ${
              isSelected
                ? 'border-orange-500 bg-orange-500/5'
                : 'border-gray-800 hover:border-gray-700 hover:bg-gray-900'
            }`}
          >
            {/* Top: rate */}
            <div className="text-center pb-4 w-full">
              <div className={`text-[10px] font-bold uppercase tracking-[1.5px] ${color}`}>
                Tier {tier}
              </div>
              <div className="text-[15px] font-bold text-gray-100 mt-1">
                {TIER_NAMES[tier] ?? `Tier ${tier}`}
              </div>
              <div className={`text-[28px] font-extrabold font-mono leading-none mt-2 ${color}`}>
                {config ? `${(config.base_premium_rate / 100).toFixed(0)}%` : '--'}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">premium rate</div>
            </div>

            {/* Stats */}
            {config && (
              <div className="w-full border-t border-gray-800 pt-3 flex flex-col gap-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Coverage</span>
                  <span className="text-gray-300">{mistToSui(config.min_coverage)} ~ {mistToSui(config.max_coverage)} SUI</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Deductible</span>
                  <span className="text-gray-300">{config.deductible_bps / 100}%</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">SD Rider</span>
                  <span className="text-gray-300">+{config.self_destruct_premium_rate / 100}%</span>
                </div>
              </div>
            )}

            {!config && (
              <div className="w-full border-t border-gray-800 pt-3">
                <p className="text-gray-600 text-[11px] text-center italic">Not configured</p>
              </div>
            )}

            {isSelected && (
              <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 bg-orange-500 text-black text-[9px] font-bold px-2.5 py-0.5 rounded-full">
                Selected
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/policy/RiskTierSelector.tsx
git commit -m "feat: rewrite RiskTierSelector to use on-chain PoolConfig data"
```

---

### Task 5: Rewrite RiderToggle with real cost display

**Files:**
- Modify: `frontend/src/components/policy/RiderToggle.tsx`

- [ ] **Step 1: Rewrite RiderToggle.tsx**

```typescript
// frontend/src/components/policy/RiderToggle.tsx
import { mistToSuiDisplay, type PoolConfigFields } from '../../lib/poolConfigParser';

interface RiderToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
  coverageMist: bigint;
  poolConfig: PoolConfigFields | null;
}

export default function RiderToggle({ enabled, onChange, coverageMist, poolConfig }: RiderToggleProps) {
  const sdPremium = poolConfig
    ? coverageMist * BigInt(poolConfig.self_destruct_premium_rate) / 10000n
    : 0n;
  const sdPayoutEst = poolConfig
    ? coverageMist * BigInt(10000 - poolConfig.deductible_bps) / 10000n * BigInt(poolConfig.self_destruct_payout_rate) / 10000n
    : 0n;
  const waitingDays = poolConfig ? Math.floor(poolConfig.self_destruct_waiting_period / 86400) : 7;

  return (
    <div
      className={`bg-gray-950 rounded-xl p-4 border transition-all ${
        enabled ? 'border-orange-500 bg-orange-500/5' : 'border-gray-800'
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-100">Add Self-Destruct Coverage</div>
          <div className="text-xs text-gray-500 mt-1 leading-relaxed">
            Covers intentional self-destruct. Reduced payout ({poolConfig ? poolConfig.self_destruct_payout_rate / 100 : 50}% base). {waitingDays}-day waiting period.
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(!enabled)}
          className={`flex-shrink-0 w-[42px] h-6 rounded-full relative transition-colors ${
            enabled ? 'bg-orange-500' : 'bg-gray-700'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white absolute top-0.5 left-0.5 transition-transform ${
              enabled ? 'translate-x-[18px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {poolConfig && (
        <div className="mt-3 bg-gray-900 rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Additional premium</span>
            <span className="text-yellow-400 font-medium">
              +{mistToSuiDisplay(sdPremium)} SUI ({poolConfig.self_destruct_premium_rate / 100}%)
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Waiting period</span>
            <span className="text-gray-200">{waitingDays} days</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Est. max payout</span>
            <span className="text-gray-200">~{mistToSuiDisplay(sdPayoutEst)} SUI</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Formula</span>
            <span className="text-gray-600">cov * decay * (1-ded) * {poolConfig.self_destruct_payout_rate / 100}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/policy/RiderToggle.tsx
git commit -m "feat: rewrite RiderToggle with real SD premium cost from on-chain params"
```

---

### Task 6: Rewrite InsurePage as 3-step wizard

**Files:**
- Modify: `frontend/src/pages/insure/InsurePage.tsx`

**Context:** This is the largest task. The page becomes a 3-step wizard using a `step` state variable (1/2/3). Each step is a section inside one scroll container. Data flows: Step 1 resolves `poolConfig` + `poolId`, Step 2 collects `coverageMist` + `characterId` + `sdRider`, Step 3 shows summary and handles purchase.

- [ ] **Step 1: Rewrite InsurePage.tsx**

```typescript
// frontend/src/pages/insure/InsurePage.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react';
import { useOwnedPolicies, usePurchasePolicy } from '../../hooks/useInsurancePolicy';
import { useParsedProtocolConfig } from '../../hooks/useProtocolConfig';
import { useDiscoverPools, type DiscoveredPool } from '../../hooks/useDiscoverPools';
import { useRiskPoolDetail } from '../../hooks/useRiskPool';
import PolicyCard from '../../components/policy/PolicyCard';
import RiskTierSelector from '../../components/policy/RiskTierSelector';
import RiderToggle from '../../components/policy/RiderToggle';
import PremiumBreakdown from '../../components/policy/PremiumBreakdown';
import ClaimEstimate from '../../components/policy/ClaimEstimate';
import {
  calcPremiumFromConfig,
  mistToSuiDisplay,
  type PoolConfigFields,
} from '../../lib/poolConfigParser';
import { TIER_NAMES, type RiskTier } from '../../lib/types';

// Helper: extract Balance<SUI> value from JSON-RPC
function extractBalance(raw: unknown): number {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return Number(obj.value ?? (obj.fields as Record<string, unknown>)?.value ?? 0);
  }
  return Number(raw ?? 0);
}

// Stepper component
function Stepper({ step, tierLabel, coverageLabel }: { step: number; tierLabel?: string; coverageLabel?: string }) {
  const steps = [
    { num: 1, label: step > 1 && tierLabel ? tierLabel : 'Risk Level' },
    { num: 2, label: step > 2 && coverageLabel ? coverageLabel : 'Coverage' },
    { num: 3, label: 'Review' },
  ];
  return (
    <div className="flex items-center gap-2 mb-5">
      {steps.map((s, i) => (
        <div key={s.num} className="contents">
          {i > 0 && <div className="flex-1 h-px bg-gray-800 min-w-3" />}
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
              step > s.num ? 'bg-green-500 text-black' :
              step === s.num ? 'bg-orange-500 text-black' :
              'bg-gray-800 text-gray-500 border border-gray-700'
            }`}
          >
            {step > s.num ? '\u2713' : s.num}
          </div>
          <span className={`text-xs whitespace-nowrap ${
            step === s.num ? 'text-orange-400 font-semibold' : 'text-gray-500'
          }`}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function InsurePage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { data: policies, isLoading: policiesLoading } = useOwnedPolicies();
  const { execute, isPending, error: txError } = usePurchasePolicy();
  const { data: protocolConfig, isLoading: configLoading } = useParsedProtocolConfig();
  const { data: pools } = useDiscoverPools();

  // Wizard state
  const [step, setStep] = useState(1);
  const [tier, setTier] = useState<RiskTier>(0);
  const [coverageSui, setCoverageSui] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [sdRider, setSdRider] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Resolve pool for selected tier
  const poolForTier: DiscoveredPool | undefined = useMemo(
    () => pools?.find((p) => p.riskTier === tier),
    [pools, tier],
  );
  const { data: poolData } = useRiskPoolDetail(poolForTier?.poolId);

  // Parse pool liquidity
  const poolFields = useMemo(() => {
    if (!poolData) return null;
    const content = (poolData as Record<string, unknown>).content as Record<string, unknown> | undefined;
    return (content?.fields ?? null) as Record<string, unknown> | null;
  }, [poolData]);

  const totalLiquidity = poolFields ? extractBalance(poolFields.total_liquidity) : 0;
  const reservedAmount = poolFields ? Number(poolFields.reserved_amount ?? 0) : 0;
  const availableLiquidity = Math.max(0, totalLiquidity - reservedAmount);
  const maxInsurableMist = Math.floor(availableLiquidity * 0.8); // 80% utilization cap

  // Get PoolConfig for selected tier
  const poolConfig: PoolConfigFields | null = useMemo(
    () => protocolConfig?.pool_configs.find((c) => c.risk_tier === tier) ?? null,
    [protocolConfig, tier],
  );

  // Coverage limits
  const minCoverageSui = poolConfig ? poolConfig.min_coverage / 1e9 : 1;
  const maxCoverageSui = poolConfig
    ? Math.min(poolConfig.max_coverage, maxInsurableMist, protocolConfig?.max_coverage_limit ?? Infinity) / 1e9
    : 0;
  const hasLiquidity = maxCoverageSui >= minCoverageSui;

  // Premium calculation
  const coverageNum = parseFloat(coverageSui) || 0;
  const coverageMist = BigInt(Math.round(coverageNum * 1e9));
  const premium = poolConfig && coverageNum > 0
    ? calcPremiumFromConfig(coverageMist, poolConfig, sdRider)
    : { basePremium: 0n, sdPremium: 0n, total: 0n };

  // Validation
  const coverageValid = coverageNum >= minCoverageSui && coverageNum <= maxCoverageSui;
  const canContinueStep2 = coverageValid && characterId.trim().length > 2;

  async function handlePurchase() {
    setToast(null);
    if (!poolForTier || !poolConfig || !account) return;
    try {
      const digest = await execute({
        poolId: poolForTier.poolId,
        characterId: characterId.trim(),
        coverageAmount: coverageMist,
        includeSelfDestruct: sdRider,
        paymentAmountMist: premium.total,
      });
      setToast({ type: 'success', msg: `Policy purchased! Tx: ${digest}` });
      setStep(1);
      setCoverageSui('');
      setCharacterId('');
      setSdRider(false);
    } catch {
      // error captured by hook
    }
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-gray-400 text-lg">Connect your wallet to manage insurance policies</p>
        <ConnectButton />
      </div>
    );
  }

  const tierLabel = poolConfig ? `${TIER_NAMES[tier]} ${poolConfig.base_premium_rate / 100}%` : undefined;
  const coverageLabel = coverageNum > 0 ? `${coverageNum} SUI` : undefined;

  return (
    <div className="max-w-[720px] mx-auto px-5 py-9">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-gray-100">Purchase Insurance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Protect your EVE Frontier ship. Choose risk level, set coverage, review & purchase.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium break-all mb-6 ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/15 border border-red-500/40 text-red-300'
          }`}
        >
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-3 opacity-60 hover:opacity-100">x</button>
        </div>
      )}

      {/* ========== STEP 1: Risk Level ========== */}
      {step === 1 && (
        <div>
          <Stepper step={1} />
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-gray-400 text-sm mb-5">
              Higher risk tier = higher premium rate, but larger max payouts.
            </p>

            {configLoading ? (
              <p className="text-gray-500 text-sm">Loading config...</p>
            ) : protocolConfig ? (
              <RiskTierSelector
                value={tier}
                onChange={setTier}
                poolConfigs={protocolConfig.pool_configs}
              />
            ) : (
              <p className="text-red-400 text-sm">Failed to load protocol config.</p>
            )}

            {/* Pool status bar */}
            {poolConfig && (
              <div className="mt-4 bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 flex justify-between items-center">
                <span className="text-xs text-gray-500">Pool Liquidity</span>
                {poolForTier ? (
                  <span className={`text-sm font-semibold font-mono ${hasLiquidity ? 'text-green-400' : 'text-yellow-400'}`}>
                    {(availableLiquidity / 1e9).toFixed(2)} SUI available
                  </span>
                ) : (
                  <span className="text-sm text-gray-600 italic">No pool yet</span>
                )}
              </div>
            )}

            {/* No liquidity warning */}
            {poolConfig && !hasLiquidity && (
              <div className="mt-4 bg-orange-950 border border-orange-900 rounded-xl p-4 flex gap-2.5 items-start">
                <span className="text-yellow-400 text-lg flex-shrink-0">&#9888;</span>
                <div>
                  <div className="text-yellow-300 text-sm font-semibold">No liquidity for this tier</div>
                  <div className="text-orange-700 text-xs mt-1">
                    LP deposits are needed before coverage can be issued.{' '}
                    <a href="/pool/deposit" className="text-orange-400 underline font-medium">
                      Provide liquidity &gt;
                    </a>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!hasLiquidity || !poolConfig}
              onClick={() => setStep(2)}
              className="w-full mt-5 py-3 rounded-xl font-bold text-sm bg-orange-500 hover:bg-orange-400 text-black disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              Continue &gt;
            </button>
          </div>
        </div>
      )}

      {/* ========== STEP 2: Coverage & Options ========== */}
      {step === 2 && poolConfig && (
        <div>
          <Stepper step={2} tierLabel={tierLabel} />
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {/* Coverage */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1">Coverage Amount</label>
              <p className="text-xs text-gray-500 mb-2">Max SUI you receive if your ship is destroyed.</p>
              <div className="relative">
                <input
                  type="number"
                  value={coverageSui}
                  onChange={(e) => setCoverageSui(e.target.value)}
                  min={minCoverageSui}
                  max={maxCoverageSui}
                  step="0.1"
                  placeholder={minCoverageSui.toFixed(1)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2.5 text-white text-base font-mono pr-14 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 placeholder-gray-600"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">SUI</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-600 mt-1.5">
                <span>Min: {minCoverageSui.toFixed(1)} SUI</span>
                <span>Max: {maxCoverageSui.toFixed(1)} SUI (pool limit)</span>
              </div>
              {/* Visual bar */}
              <div className="mt-2 h-[5px] bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-orange-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, (coverageNum - minCoverageSui) / (maxCoverageSui - minCoverageSui) * 100))}%` }}
                />
              </div>
            </div>

            {/* Character */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1">Character Object ID</label>
              <p className="text-xs text-gray-500 mb-2">The EVE Frontier character this policy protects.</p>
              <input
                type="text"
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                placeholder="0x..."
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2.5 text-white text-sm font-mono outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 placeholder-gray-600"
              />
            </div>

            {/* SD Rider */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">Self-Destruct Rider</label>
              <RiderToggle
                enabled={sdRider}
                onChange={setSdRider}
                coverageMist={coverageMist}
                poolConfig={poolConfig}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3 rounded-xl text-sm font-semibold text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                &lt; Back
              </button>
              <button
                type="button"
                disabled={!canContinueStep2}
                onClick={() => setStep(3)}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-orange-500 hover:bg-orange-400 text-black disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
              >
                Continue &gt;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== STEP 3: Review & Purchase ========== */}
      {step === 3 && poolConfig && protocolConfig && (
        <div>
          <Stepper step={3} tierLabel={tierLabel} coverageLabel={coverageLabel} />
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <p className="text-sm text-gray-400">Confirm your policy. Premium is deducted from your wallet.</p>

            {/* Summary */}
            <div className="bg-gray-950 rounded-xl p-4 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Risk Tier</span>
                <span className="text-green-400 font-semibold">Tier {tier} — {TIER_NAMES[tier]}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Coverage</span>
                <span className="text-gray-100 font-medium">{coverageNum.toFixed(2)} SUI</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Duration</span>
                <span className="text-gray-100">30 days</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Character</span>
                <span className="text-gray-100 font-mono text-xs">
                  {characterId.length > 16 ? `${characterId.slice(0, 8)}...${characterId.slice(-6)}` : characterId}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>SD Rider</span>
                <span className={sdRider ? 'text-yellow-400 font-medium' : 'text-gray-600'}>
                  {sdRider ? 'Included' : 'Not included'}
                </span>
              </div>
            </div>

            {/* Premium Breakdown */}
            <PremiumBreakdown
              basePremiumMist={premium.basePremium}
              sdPremiumMist={premium.sdPremium}
              baseRateBps={poolConfig.base_premium_rate}
              sdRateBps={poolConfig.self_destruct_premium_rate}
              protocolFeeBps={protocolConfig.protocol_fee_bps}
              coverageSui={coverageNum.toFixed(2)}
              includeSd={sdRider}
            />

            {/* Claim Estimate */}
            <ClaimEstimate
              coverageMist={coverageMist}
              poolConfig={poolConfig}
              includeSd={sdRider}
              maxClaims={protocolConfig.max_claims_per_policy}
              cooldownHours={Math.floor(poolConfig.cooldown_period / 3600)}
            />

            {/* Tx error */}
            {txError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm break-all">
                {txError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-3 rounded-xl text-sm font-semibold text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                &lt; Back
              </button>
              <button
                type="button"
                disabled={isPending || premium.total === 0n}
                onClick={handlePurchase}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-orange-500 hover:bg-orange-400 text-black disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Confirming...' : 'Confirm & Purchase'}
              </button>
            </div>
            <p className="text-center text-gray-600 text-[11px]">Non-refundable. Activates immediately.</p>
          </div>
        </div>
      )}

      {/* ========== Your Policies (unchanged) ========== */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Your Policies</h2>
        {policiesLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-orange-400 rounded-full animate-spin" />
            Loading policies...
          </div>
        )}
        {!policiesLoading && policies && policies.length === 0 && (
          <p className="text-gray-600 text-sm">No policies found. Purchase one above.</p>
        )}
        {policies && policies.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {policies.map((p) => {
              const id = (p as { objectId?: string }).objectId ?? '';
              return (
                <PolicyCard key={id} policy={p} onClick={() => navigate(`/insure/${id}`)} />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Visual check — run dev server**

Run: `cd frontend && npm run dev`
Open: `http://localhost:5173/insure`
Check: Step 1 renders with tier cards, pool status bar, correct premium rates from on-chain config.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/insure/InsurePage.tsx
git commit -m "feat: rewrite InsurePage as 3-step wizard with on-chain params"
```

---

### Task 7: Remove dead code and verify build

**Files:**
- Modify: `frontend/src/components/policy/RiskTierSelector.tsx` (remove old TIER_RATES export if still imported elsewhere)

- [ ] **Step 1: Search for stale TIER_RATES imports**

Run: `cd frontend && grep -r "TIER_RATES" src/`
Expected: Only `RiskTierSelector.tsx` should reference it (from the old version). If `InsurePage.tsx` still imports it, that import was already removed in Task 6.

- [ ] **Step 2: Remove any remaining TIER_RATES references**

If any files still import `TIER_RATES` from `RiskTierSelector`, remove those imports. The new `RiskTierSelector` no longer exports `TIER_RATES`.

- [ ] **Step 3: Verify full tsc + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 0 errors, build succeeds

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead TIER_RATES references, verify clean build"
```

---

### Summary

| Task | Component | Key change |
|------|-----------|------------|
| 1 | `poolConfigParser.ts` + `useProtocolConfig.ts` | Typed PoolConfig parser, premium/claim math (bigint) |
| 2 | `PremiumBreakdown.tsx` | New: shows base + SD + fee + total |
| 3 | `ClaimEstimate.tsx` | New: estimated payouts for first N claims |
| 4 | `RiskTierSelector.tsx` | Rewrite: accepts `PoolConfigFields[]`, spacious cards |
| 5 | `RiderToggle.tsx` | Rewrite: real SD cost from on-chain params |
| 6 | `InsurePage.tsx` | Full rewrite: 3-step wizard, pool auto-select, on-chain calc |
| 7 | Cleanup | Remove dead `TIER_RATES`, verify build |
