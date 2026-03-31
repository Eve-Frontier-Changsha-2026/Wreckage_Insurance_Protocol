# InsurePage UX Overhaul — Design Spec

## Problem

1. **Premium calculation bug** — frontend hardcodes SD rider as `base × 1.3` (+30%), but contract charges `coverage × self_destruct_premium_rate / 10000` (typically 70% of coverage). Frontend sends insufficient payment → tx aborts.
2. **No pool/tier context** — users don't understand what Risk Tier, Risk Pool, or LP Deposit mean or how they relate.
3. **No coverage limits** — no min/max guidance; no indication of pool liquidity.
4. **No premium transparency** — single "Estimated Premium" number with no breakdown.
5. **SD rider misrepresented** — shown as "+30% premium" but actual cost is 70% of coverage.

## Design

### Architecture: 3-Step Wizard

Replace the current single-form InsurePage with a step-by-step wizard. Each step must be completed before the next unlocks. All parameters read from on-chain `ProtocolConfig` (via `useProtocolConfig` hook) and pool state (via `useRiskPoolDetail` + `useDiscoverPools`).

Page container: `max-width: 720px`, centered. Responsive: tier cards stack on mobile (`< 600px`).

### Step 1 — Choose Risk Level

**Stepper bar**: `[1 active] — [2 pending] — [3 pending]`

**Intro text**: One-line explanation: "Higher risk tier = higher premium rate, but larger max payouts."

**3 Tier cards** (grid, 3-col desktop / 1-col mobile):
- Top: Tier label (color-coded) + name + large premium rate number + "premium rate" sub-label
- Bottom (3 rows): Coverage range (min~max SUI), Deductible %, SD Rider cost ("+70%")
- "More details >" expands to show all 16 PoolConfig parameters
- Selected card: orange border + "Selected" badge

**Data source**: `useProtocolConfig()` → `content.fields.pool_configs` array. Each `PoolConfig` has `risk_tier`, `base_premium_rate`, `min_coverage`, `max_coverage`, `deductible_bps`, `self_destruct_premium_rate`, etc. All values in bps (÷10000) or MIST (÷1e9).

**Pool status bar** (below tier cards):
- Shows pool liquidity + max insurable amount for selected tier
- Data: `useDiscoverPools()` → find pool matching selected tier → `useRiskPoolDetail(poolId)` → extract `total_liquidity` (Balance) and compute `available = total_liquidity - reserved`, `max_insurable = available * 80%`

**No-funds warning**: If pool doesn't exist or `max_insurable < min_coverage`:
- Orange warning banner: "No liquidity for this tier"
- CTA link: "Provide liquidity >" → navigates to `/pool/deposit`
- "Continue" button disabled

**Continue button**: Enabled only when selected tier has sufficient pool liquidity. Stores: `selectedTier`, `poolId` (auto-resolved), `poolConfig` (from ProtocolConfig).

### Step 2 — Coverage & Options

**Stepper bar**: `[1 done ✓ "Low Risk 5%"] — [2 active] — [3 pending]`

**Coverage Amount input**:
- Label + hint: "Max SUI you receive if your ship is destroyed."
- Number input with "SUI" suffix
- Below input: `Min: {min_coverage} SUI` / `Max: {max_insurable} SUI (pool limit)`
  - `max_insurable = min(pool_config.max_coverage, available_liquidity × 80%, protocol_config.max_coverage_limit)` — all converted from MIST to SUI
- Slider track (visual only, or functional)
- Input clamped to [min, max] on blur

**Character Object ID**:
- Label + hint: "The EVE Frontier character this policy protects."
- Text input, `0x...` placeholder

**Self-Destruct Rider**:
- Toggle card with title + short description
- When rider details are visible (always shown, toggle controls inclusion):
  - Additional premium: `+{coverage × sd_premium_rate / 10000} SUI ({sd_premium_rate/100}% of coverage)`
  - Waiting period: `{sd_waiting_period / 86400} days`
  - Est. max payout (1st claim): computed as `coverage × (1 - deductible) × sd_payout_rate / 10000`
  - Formula: `cov × decay × (1-ded) × {sd_payout_rate/100}%`

**Continue button**: Enabled when coverage > 0 && within range && characterId non-empty.

### Step 3 — Review & Purchase

**Stepper bar**: `[1 done ✓] — [2 done ✓] — [3 active]`

**Policy summary block**:
- Risk Tier, Coverage Amount, Duration (30 days), Character ID, SD Rider (included/not)

**Premium Breakdown block** (orange border):
- Base Premium: `{coverage × base_premium_rate / 10000} SUI` with rate shown
- SD Rider Premium: `{coverage × sd_premium_rate / 10000} SUI` or "--"
- Protocol Fee: `{total_premium × protocol_fee_bps / 10000} SUI → treasury` (informational — this is deducted from premium inside the contract, NOT charged extra to the user)
- **Total "You Pay"**: `base + SD rider` (user pays this amount; contract splits fee to treasury internally)

**Estimated Claim Payouts block**:
- 1st claim: `coverage × (1 - deductible_bps/10000)` — show as green
- 2nd claim: apply decay once — show as yellow
- 3rd claim: apply decay twice — show as red
- Note: "Max {max_claims} claims / policy. {cooldown}h cooldown between claims."
- For SD rider: separate line showing reduced payout formula

**Confirm button**: Executes `usePurchasePolicy` with correct `paymentAmountMist = base_premium + sd_premium` (both computed from on-chain params).

**Post-purchase**: same success screen as current, navigates to policy detail.

### Premium Calculation Fix

**Delete**: `calcPremium()` function in InsurePage and `TIER_RATES` constant in RiskTierSelector.

**Replace with**: `useInsurancePremium(coverage, tier, sdRider)` or inline calculation using on-chain PoolConfig:

```typescript
function calcPremiumFromConfig(
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
```

All intermediate math uses `bigint` to match contract's u128 behavior.

### Files Changed

| File | Change |
|------|--------|
| `pages/insure/InsurePage.tsx` | Full rewrite: wizard layout, 3-step state machine, on-chain premium calc |
| `components/policy/RiskTierSelector.tsx` | Remove `TIER_RATES` export, rewrite to accept `PoolConfig[]` prop, simplified card layout |
| `components/policy/RiderToggle.tsx` | Accept `sdPremiumRate`, `sdPayoutRate`, `sdWaitingPeriod`, `coverageMist` props; show real cost |
| `components/policy/PremiumBreakdown.tsx` | **New**: premium breakdown panel component |
| `components/policy/ClaimEstimate.tsx` | **New**: estimated payout for first N claims |
| `hooks/useProtocolConfig.ts` | Add `PoolConfig` field parser (extract nested `pool_configs` array) |
| `hooks/useDiscoverPools.ts` | Already exists, no change needed |

### Not in Scope

- LP Pool page UX improvements (separate chat)
- Contract parameter changes (premium rates, deductible values)
- Dynamic premium pricing based on pool utilization
- "Your Policies" section stays as-is on this page

## Mockup Reference

Visual mockup: `.superpowers/brainstorm/41736-1774544130/content/wizard-rwd-v2.html`
