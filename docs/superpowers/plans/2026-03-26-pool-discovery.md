# Pool Discovery + Admin Create Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-discover on-chain pools via event indexing, add admin pool creation from DemoPanel, update testing guide with bootstrap steps.

**Architecture:** Move contract emits `PoolCreatedEvent` on pool creation. Frontend queries events via JSON-RPC fallback (gRPC client lacks `queryEvents`). Shared `PoolSelector` component replaces manual Pool ID input on 4 pages. Admin can create pools from DemoPanel with tier presets.

**Tech Stack:** Move (SUI), React, @mysten/sui, JSON-RPC (`suix_queryEvents`), TanStack Query

**Key Discovery:** `admin_create_pool` creates the shared RiskPool object, but `add_pool_tier` must ALSO be called to register the PoolConfig in ProtocolConfig (required by `purchase_policy`, `renew_policy`, etc.). The admin PTB must do both in one transaction.

---

### Task 1: Move — Add PoolCreatedEvent

**Files:**
- Modify: `contracts/wreckage-protocol/sources/risk_pool.move:42-74`

- [ ] **Step 1: Add PoolCreatedEvent struct**

After `LPWithdrawEvent` (line 56), add:

```move
public struct PoolCreatedEvent has copy, drop {
    pool_id: ID,
    risk_tier: u8,
    creator: address,
}
```

- [ ] **Step 2: Emit event in create_and_share_pool**

Replace lines 59-75:

```move
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
        total_shares: VIRTUAL_SHARES,
        is_active: true,
        version: 1,
    };
    event::emit(PoolCreatedEvent {
        pool_id: object::id(&pool),
        risk_tier: config.risk_tier(),
        creator: ctx.sender(),
    });
    transfer::share_object(pool);
}
```

- [ ] **Step 3: Build + test**

Run:
```bash
cd contracts/wreckage-protocol && sui move build
```
Expected: Build succeeds (no public API change, only added event struct + emit).

```bash
sui move test
```
Expected: All 112 tests pass.

- [ ] **Step 4: Commit**

```bash
git add contracts/wreckage-protocol/sources/risk_pool.move
git commit -m "feat(move): add PoolCreatedEvent for pool discovery"
```

---

### Task 2: Frontend — Pool Discovery Hook

**Files:**
- Create: `frontend/src/lib/rpc.ts`
- Create: `frontend/src/hooks/useDiscoverPools.ts`

- [ ] **Step 1: Create JSON-RPC helper**

File: `frontend/src/lib/rpc.ts`

```typescript
import { GRPC_URLS, DEFAULT_NETWORK, type Network } from '../config/network';

/**
 * Calls SUI JSON-RPC endpoint directly.
 * Needed because SuiGrpcClient doesn't support queryEvents.
 */
export async function jsonRpc<T>(
  method: string,
  params: unknown[],
  network: Network = DEFAULT_NETWORK,
): Promise<T> {
  const url = GRPC_URLS[network];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message ?? 'JSON-RPC error');
  }
  return json.result as T;
}
```

- [ ] **Step 2: Create useDiscoverPools hook**

File: `frontend/src/hooks/useDiscoverPools.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { PACKAGE_ID } from '../lib/contracts';
import { jsonRpc } from '../lib/rpc';

export interface DiscoveredPool {
  poolId: string;
  riskTier: number;
  creator: string;
}

const POOL_CREATED_EVENT_TYPE = `${PACKAGE_ID}::risk_pool::PoolCreatedEvent`;

export const TIER_LABELS: Record<number, string> = {
  0: 'Low Risk',
  1: 'Medium Risk',
  2: 'High Risk',
};

interface EventPage {
  data: Array<{
    parsedJson: {
      pool_id: string;
      risk_tier: number;
      creator: string;
    };
  }>;
  nextCursor: unknown;
  hasNextPage: boolean;
}

export function useDiscoverPools() {
  return useQuery({
    queryKey: ['discoverPools', PACKAGE_ID],
    queryFn: async (): Promise<DiscoveredPool[]> => {
      const result = await jsonRpc<EventPage>(
        'suix_queryEvents',
        [{ MoveEventType: POOL_CREATED_EVENT_TYPE }, null, 50, false],
      );
      // Dedupe by poolId (in case of re-query)
      const seen = new Set<string>();
      const pools: DiscoveredPool[] = [];
      for (const evt of result.data) {
        const { pool_id, risk_tier, creator } = evt.parsedJson;
        if (!seen.has(pool_id)) {
          seen.add(pool_id);
          pools.push({ poolId: pool_id, riskTier: risk_tier, creator });
        }
      }
      // Sort by tier ascending
      pools.sort((a, b) => a.riskTier - b.riskTier);
      return pools;
    },
    staleTime: 60_000, // cache 1 min
    retry: 1,
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/rpc.ts frontend/src/hooks/useDiscoverPools.ts
git commit -m "feat(frontend): add pool discovery hook via JSON-RPC event query"
```

---

### Task 3: Frontend — PoolSelector Component

**Files:**
- Create: `frontend/src/components/pool/PoolSelector.tsx`

- [ ] **Step 1: Create PoolSelector component**

File: `frontend/src/components/pool/PoolSelector.tsx`

```tsx
import { useState } from 'react';
import { useDiscoverPools, TIER_LABELS } from '../../hooks/useDiscoverPools';

interface PoolSelectorProps {
  value: string | undefined;
  onChange: (poolId: string) => void;
  /** Optional: only show pools matching this tier */
  filterTier?: number;
  label?: string;
}

function truncateId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export default function PoolSelector({
  value,
  onChange,
  filterTier,
  label = 'Select Pool',
}: PoolSelectorProps) {
  const { data: pools, isLoading, error } = useDiscoverPools();
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const filtered = pools?.filter(
    (p) => filterTier === undefined || p.riskTier === filterTier,
  );

  const hasDiscoveredPools = filtered && filtered.length > 0;

  // Manual fallback
  if (manualMode || (!isLoading && !hasDiscoveredPools)) {
    return (
      <div>
        <label className="block text-gray-400 text-xs mb-1">{label}</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Paste pool object ID (0x...)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500 placeholder-gray-600"
          />
          <button
            type="button"
            onClick={() => {
              const trimmed = manualInput.trim();
              if (trimmed) onChange(trimmed);
            }}
            disabled={!manualInput.trim()}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Load
          </button>
        </div>
        {hasDiscoveredPools && (
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-orange-400 hover:text-orange-300 text-xs mt-2 underline"
          >
            Back to pool list
          </button>
        )}
        {!isLoading && !hasDiscoveredPools && error && (
          <p className="text-gray-500 text-xs mt-1">
            Could not auto-discover pools. Enter a Pool ID manually.
          </p>
        )}
        {!isLoading && !hasDiscoveredPools && !error && (
          <p className="text-gray-500 text-xs mt-1">
            No pools found on-chain. Ask an admin to create one first.
          </p>
        )}
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div>
        <label className="block text-gray-400 text-xs mb-1">{label}</label>
        <p className="text-gray-500 text-sm">Discovering pools...</p>
      </div>
    );
  }

  // Dropdown
  return (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
      >
        <option value="" disabled>
          — Choose a pool —
        </option>
        {filtered!.map((pool) => (
          <option key={pool.poolId} value={pool.poolId}>
            Tier {pool.riskTier} — {TIER_LABELS[pool.riskTier] ?? `Tier ${pool.riskTier}`} ({truncateId(pool.poolId)})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setManualMode(true)}
        className="text-gray-500 hover:text-gray-400 text-xs mt-1 underline"
      >
        Or enter Pool ID manually
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/pool/PoolSelector.tsx
git commit -m "feat(frontend): add PoolSelector component with auto-discovery"
```

---

### Task 4: Frontend — Admin Create Pool PTB + DemoPanel Form

**Files:**
- Create: `frontend/src/lib/ptb/admin.ts`
- Modify: `frontend/src/pages/demo/DemoPanel.tsx`

- [ ] **Step 1: Create admin.ts PTB builder**

File: `frontend/src/lib/ptb/admin.ts`

```typescript
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

  // 1. Construct PoolConfig value
  const [poolConfig] = tx.moveCall({
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

  // 2. Register tier in ProtocolConfig (required for purchase_policy to work)
  tx.moveCall({
    target: `${PACKAGE_ID}::config::add_pool_tier`,
    arguments: [
      tx.object(args.adminCapId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      poolConfig,
    ],
  });

  // 3. Construct another PoolConfig (previous one was consumed by add_pool_tier)
  const [poolConfig2] = tx.moveCall({
    target: `${PACKAGE_ID}::pool_config::new_pool_config`,
    arguments: [
      tx.pure.u8(Number(params[0])),
      tx.pure.u64(BigInt(params[1])),
      tx.pure.u64(BigInt(params[2])),
      tx.pure.u64(BigInt(params[3])),
      tx.pure.u64(BigInt(params[4])),
      tx.pure.u64(BigInt(params[5])),
      tx.pure.u64(BigInt(params[6])),
      tx.pure.u64(BigInt(params[7])),
      tx.pure.u64(BigInt(params[8])),
      tx.pure.u64(BigInt(params[9])),
      tx.pure.u64(BigInt(params[10])),
      tx.pure.u64(BigInt(params[11])),
      tx.pure.u8(Number(params[12])),
      tx.pure.u64(BigInt(params[13])),
      tx.pure.u64(BigInt(params[14])),
      tx.pure.u64(BigInt(params[15])),
    ],
  });

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
```

**Note:** `PoolConfig` has `copy` ability, but PTB return values are consumed on first use. We construct the PoolConfig twice — once for `add_pool_tier`, once for `admin_create_pool`. This is the simplest approach in a PTB.

- [ ] **Step 2: Add Create Pool form to DemoPanel**

In `frontend/src/pages/demo/DemoPanel.tsx`:

**Add import** (top of file, after existing imports):

```typescript
import { buildAdminCreatePool, TIER_PRESETS } from '../../lib/ptb/admin';
```

**Add state** (after existing form state declarations, around line 335):

```typescript
  // ── Form state — Create Pool ──────────────────────────────────────────
  const [createPoolTier, setCreatePoolTier] = useState('0');
  const [createPoolAdminCap, setCreatePoolAdminCap] = useState('');
  const [createPoolLoading, setCreatePoolLoading] = useState(false);
```

**Add handler** (after existing handlers, before the return statement):

```typescript
  async function handleCreatePool() {
    if (!createPoolAdminCap) return;
    setCreatePoolLoading(true);
    try {
      await execute('Create Pool (Tier ' + createPoolTier + ')', () =>
        buildAdminCreatePool({
          adminCapId: createPoolAdminCap,
          riskTier: Number(createPoolTier),
        }),
      );
    } finally {
      setCreatePoolLoading(false);
    }
  }
```

**Add UI** in Admin Actions section — insert BEFORE the "Expire Policy" block (after the yellow warning `<p>` tag, around line 738):

```tsx
          {/* Create Pool */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">Create Risk Pool</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>AdminCap ID</Label>
                <Input
                  value={createPoolAdminCap}
                  onChange={setCreatePoolAdminCap}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Tier</Label>
                <select
                  value={createPoolTier}
                  onChange={(e) => setCreatePoolTier(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                >
                  {Object.entries(TIER_PRESETS).map(([tier, preset]) => (
                    <option key={tier} value={tier}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Creates a RiskPool + registers tier config in ProtocolConfig (one tx).
            </p>
            <ExecButton
              onClick={handleCreatePool}
              loading={createPoolLoading}
              disabled={!createPoolAdminCap}
            >
              Create Pool
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/ptb/admin.ts frontend/src/pages/demo/DemoPanel.tsx
git commit -m "feat(frontend): add admin create pool PTB + DemoPanel form"
```

---

### Task 5: Frontend — Replace Manual Pool ID Input on 4 Pages

**Files:**
- Modify: `frontend/src/pages/pool/PoolDashboard.tsx`
- Modify: `frontend/src/pages/pool/DepositPage.tsx`
- Modify: `frontend/src/pages/pool/WithdrawPage.tsx`
- Modify: `frontend/src/pages/insure/InsurePage.tsx`

- [ ] **Step 1: Update PoolDashboard.tsx**

Replace the "Load Pool" block (lines 77-98) with PoolSelector:

**Add import** at top:
```typescript
import PoolSelector from '../../components/pool/PoolSelector';
```

**Replace** the `{/* Pool ID Loader */}` block (the `<div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">` block from line 78 to line 98) with:

```tsx
        {/* Pool Selector */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
            Select Pool
          </h2>
          <PoolSelector
            value={loadedPoolId}
            onChange={(id) => {
              setPoolIdInput(id);
              setLoadedPoolId(id);
            }}
          />
        </div>
```

Remove the now-unused `poolIdInput` state variable's manual input/button JSX (the state itself is still used for the onChange callback above — keep the `useState`).

- [ ] **Step 2: Update DepositPage.tsx**

**Add import** at top:
```typescript
import PoolSelector from '../../components/pool/PoolSelector';
```

**Replace** the "Step 1 — Pool ID" block (lines 113-168, the entire `<div className="bg-gray-900 border border-gray-800 rounded-xl p-5">` block containing the Pool ID input, Load button, and pool info display) with:

```tsx
          {/* Pool Selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 1 — Select Pool
            </h2>
            <PoolSelector
              value={loadedPoolId}
              onChange={(id) => {
                setPoolId(id);
                setLoadedPoolId(id);
              }}
            />

            {loadedPoolId && (
              <div className="mt-3">
                {poolLoading ? (
                  <p className="text-gray-500 text-xs">Loading pool...</p>
                ) : poolData ? (
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mt-2">
                    {(() => {
                      const f = parsePoolFields(poolData);
                      const totalDeposits = Number(f?.total_deposits ?? f?.totalDeposits ?? 0);
                      const totalShares = Number(f?.total_shares ?? f?.totalShares ?? 0);
                      return (
                        <>
                          <span>TVL:</span>
                          <span className="text-white text-right">
                            {(totalDeposits / 1_000_000_000).toFixed(4)} SUI
                          </span>
                          <span>Total Shares:</span>
                          <span className="text-white text-right">{totalShares.toLocaleString()}</span>
                          <span>Share Price:</span>
                          <span className="text-orange-400 text-right">
                            {(sharePrice / 1_000_000_000).toFixed(6)} SUI/share
                          </span>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-red-400 text-xs mt-2">Pool not found.</p>
                )}
              </div>
            )}
          </div>
```

- [ ] **Step 3: Update WithdrawPage.tsx**

**Add import** at top:
```typescript
import PoolSelector from '../../components/pool/PoolSelector';
```

**Replace** the "Step 1 — Pool ID" block (lines 159-188, the `<div className="bg-gray-900 border border-gray-800 rounded-xl p-5">` block) with:

```tsx
          {/* Pool Selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 1 — Select Pool
            </h2>
            <PoolSelector
              value={loadedPoolId}
              onChange={(id) => {
                setPoolId(id);
                setLoadedPoolId(id);
                setSelectedPositionId('');
              }}
            />
            {loadedPoolId && poolLoading && (
              <p className="text-gray-500 text-xs mt-2">Loading pool...</p>
            )}
          </div>
```

- [ ] **Step 4: Update InsurePage.tsx**

**Add import** at top:
```typescript
import PoolSelector from '../../components/pool/PoolSelector';
```

**Replace** the Pool ID input block (lines 183-197, from `{/* Pool ID */}` comment to closing `</div>`) with:

```tsx
          {/* Pool Selection — auto-filtered by selected tier */}
          <div>
            <PoolSelector
              value={poolId || undefined}
              onChange={setPoolId}
              filterTier={tier}
              label="Risk Pool"
            />
          </div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/pool/PoolDashboard.tsx frontend/src/pages/pool/DepositPage.tsx frontend/src/pages/pool/WithdrawPage.tsx frontend/src/pages/insure/InsurePage.tsx
git commit -m "feat(frontend): replace manual pool ID input with PoolSelector on 4 pages"
```

---

### Task 6: Documentation — Testing Guide + move-notes.md

**Files:**
- Modify: `docs/frontend-testing-guide.md`
- Modify: `move-notes.md`

- [ ] **Step 1: Add T-0.5 to testing guide**

In `docs/frontend-testing-guide.md`, after the `## 2. T-0: 冷啟動` section (after line 95, the `---` divider before T-1), insert:

```markdown
---

## 2.5. T-0.5: Admin Bootstrap — 建立 Risk Pools

> 目標：Admin 透過 DemoPanel 建立 3 個 tier 的 Risk Pool，讓後續測試能正常運作。
> 路由：`/demo`
> 前置條件：Admin 帳號（擁有 AdminCap）已連接錢包。

### 步驟

1. 以 Admin 帳號連接錢包 → 前往 `/demo`
2. 展開 **3. Admin Actions**
3. 在 "Create Risk Pool" 區塊：
   - **AdminCap ID**：貼入 Admin 擁有的 AdminCap Object ID
   - **Tier**：選擇 **Tier 0 — Low Risk**
   - 點擊 **Create Pool** → 錢包簽名
4. 等 Transaction Log 顯示綠色 ✓ **Create Pool (Tier 0) succeeded**
5. 重複步驟 3-4，分別選擇 **Tier 1 — Medium Risk** 和 **Tier 2 — High Risk**

### 驗證

| 項目 | 預期結果 | Pass? |
|------|---------|-------|
| Tx Log 顯示 3 筆成功 | 綠色 ✓ × 3 | ☐ |
| 前往 `/pool` | PoolSelector dropdown 列出 3 個 pools | ☐ |
| 前往 `/pool/deposit` | PoolSelector dropdown 列出 3 個 pools | ☐ |
| 前往 `/insure` | 切換 tier 時自動顯示對應 pool | ☐ |

### 記錄 Pool IDs

從 Transaction Log 或鏈上 explorer 取得 3 個 Pool Object IDs，記錄在[記錄表](#22-測試用-object-id-記錄表)。

> 完成 T-0.5 後，後續所有涉及 Pool ID 的步驟都可從 dropdown 選取，不再需要手動貼 ID。
```

Also update the "需要的鏈上物件 ID" section (lines 56-64). Replace:

```markdown
- **Pool ID**（每個 tier 各一個）— Admin 預先建立
```

With:

```markdown
- **Pool ID**（每個 tier 各一個）— Admin 在 T-0.5 透過 DemoPanel 建立（前端會自動 discover）
```

And replace:

```markdown
> 這些 ID 由 Claude 或 Admin 透過 CLI 預先建立，測試者只需要拿到 ID 貼進前端。
```

With:

```markdown
> Pool 由 Admin 在 T-0.5 建立，前端會自動偵測。Character 和 Killmail 仍需手動取得。
```

Update T-3 section (line 161): Replace `在輸入框貼入 **Tier 0 Pool 的 Object ID**（從[記錄表](#22-測試用-object-id-記錄表)取得）` with:

```markdown
從 dropdown 選取 **Tier 0 — Low Risk** pool（或手動貼入 Pool ID）
```

Update Table of Contents — add entry after T-0:

```markdown
2.5. [T-0.5: Admin Bootstrap — 建立 Risk Pools](#25-t-05-admin-bootstrap--建立-risk-pools)
```

- [ ] **Step 2: Add Approach C notes to move-notes.md**

Append to `move-notes.md`:

```markdown

## Future: Generic Phantom Pool Refactor (Approach C)

**Status**: Planned, not yet implemented
**Recorded**: 2026-03-26

### Current Design
`RiskPool` is a single non-generic type. All tiers share the same on-chain type, distinguished only by internal `config.risk_tier: u8`. Pool discovery relies on `PoolCreatedEvent` indexing (Approach B).

### Proposed Design
```move
public struct TIER_LOW has drop {}
public struct TIER_MED has drop {}
public struct TIER_HIGH has drop {}

public struct RiskPool<phantom T> has key { ... }
```

Each tier becomes a distinct on-chain type → queryable by type string without event indexing.

### Benefits
- Type-level query: `suix_queryObjects({ StructType: "...::RiskPool<...::TIER_LOW>" })`
- Compile-time tier safety: cannot pass wrong pool to wrong function
- Composability: other protocols can reference `RiskPool<TIER_LOW>` specifically

### Cost
- 30+ function signatures change (`&RiskPool` → `&RiskPool<T>`)
- All tests must add type parameters
- All frontend PTB builders need type arguments
- Cannot dynamically add new tiers at runtime (each new tier = code change + redeploy)

### When to Trigger
- When needing permissionless pool creation
- When cross-protocol composability requires type-level pool distinction
- When event indexer reliability becomes a concern
```

- [ ] **Step 3: Commit**

```bash
git add docs/frontend-testing-guide.md move-notes.md
git commit -m "docs: add admin bootstrap to testing guide + record phantom pool refactor plan"
```

---

### Task 7: Deploy v7 + Create Pools

**Files:**
- No code files — deployment + on-chain operations

- [ ] **Step 1: Deploy v7**

```bash
cd contracts/wreckage-protocol
sui client publish --gas-budget 1000000000 --with-unpublished-dependencies --skip-dependency-verification
```

Record the new PackageID.

- [ ] **Step 2: Update contracts.ts with new PackageID**

Update `frontend/src/lib/contracts.ts`:
- Replace `PACKAGE_ID` with the new v7 package ID
- Update `SHARED_OBJECTS` with new object IDs from deploy output

- [ ] **Step 3: Update deployment.json**

Update `contracts/deployment.json` with v7 details.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Create 3 pools via DemoPanel**

1. Start frontend: `cd frontend && npm run dev`
2. Open `/demo` with Admin wallet
3. Create Tier 0, Tier 1, Tier 2 pools
4. Verify pools appear in PoolSelector dropdown on `/pool`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/contracts.ts contracts/deployment.json
git commit -m "chore: deploy v7 + update contract addresses"
```

- [ ] **Step 7: Update progress.md**

Add to `tasks/progress.md`:
- v7 deployment details
- Pool discovery feature
- Pool IDs created
