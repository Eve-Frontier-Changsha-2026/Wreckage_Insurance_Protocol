# Pool Discovery + Admin Create Pool + Testing Guide

## Problem

1. Frontend 所有 pool 頁面要求手動貼 Pool Object ID — 一般玩家不知道 ID
2. `admin_create_pool` 沒有 PTB builder，只能用 CLI
3. Testing guide 缺少 pool bootstrap 步驟

## Design Decision

**Approach B: Event Indexing** — 合約 emit `PoolCreatedEvent`，前端查 events 自動列出所有 pools。

預留 Approach C (generic phantom `RiskPool<T>`) 的接口，記錄在 `move-notes.md`。

## 1. Move Contract Change

### risk_pool.move

新增 event + 在 `create_and_share_pool` 中 emit：

```move
public struct PoolCreatedEvent has copy, drop {
    pool_id: ID,
    risk_tier: u8,
    creator: address,
}
```

在 `create_and_share_pool` 的 `transfer::share_object(pool)` 之前：

```move
event::emit(PoolCreatedEvent {
    pool_id: object::id(&pool),
    risk_tier: config.risk_tier(),
    creator: ctx.sender(),
});
```

**影響**: 1 file，不改任何 public API signature。需 redeploy。

## 2. Frontend: Pool Discovery Hook

### `hooks/useDiscoverPools.ts`

gRPC client 沒有 `queryEvents`。用 JSON-RPC fallback：

```typescript
// POST to fullnode endpoint
// method: "suix_queryEvents"
// params: [{ MoveEventType: `${PACKAGE_ID}::risk_pool::PoolCreatedEvent` }, null, 50, false]
```

Response 解析後回傳 `{ poolId: string, riskTier: number }[]`。

Hook: `useDiscoverPools()` → `{ data: DiscoveredPool[], isLoading, error }`

**Fallback**: 如果 event query 失敗（例如 indexer 尚未索引），允許手動輸入 Pool ID。

### Tier 標籤映射

```typescript
const TIER_LABELS: Record<number, string> = {
  0: 'Low Risk',
  1: 'Medium Risk',
  2: 'High Risk',
};
```

## 3. Frontend: PoolSelector Component

### `components/pool/PoolSelector.tsx`

共用元件，替換 4 個頁面的手動 Pool ID 輸入：

- 自動載入 discovered pools → dropdown
- 顯示: `Tier 0 — Low Risk (0x1234...abcd)`
- 選取後自動設定 poolId
- 底部 "Or enter Pool ID manually" 展開手動輸入（fallback）
- Loading state + error state

Props:
```typescript
interface PoolSelectorProps {
  value: string | undefined;        // selected pool ID
  onChange: (poolId: string) => void;
  label?: string;                   // default "Select Pool"
}
```

## 4. Frontend: Admin Create Pool

### `lib/ptb/admin.ts` (new)

```typescript
buildAdminCreatePool(args: {
  adminCapId: string;
  configId: string;
  // PoolConfig 16 fields — 用 preset 簡化
  riskTier: number;
  // ...all 16 pool_config fields
}): Transaction
```

因為 16 個參數太多，DemoPanel 提供 **3 tier presets**（Low/Medium/High），Admin 只需選 tier → 一鍵建立。

Preset 值沿用 `docs/testing-guide.md` 的建議值。

### DemoPanel: "Create Pool" 表單

Admin Actions 區塊新增：
- Tier selector (0/1/2)
- "Create Pool" button
- 成功後顯示新 pool ID（從 tx effects 解析）

## 5. Page Modifications

4 個頁面統一改用 `PoolSelector`：

| 頁面 | 改動 |
|------|------|
| `PoolDashboard.tsx` | "Load Pool" 區塊 → PoolSelector |
| `DepositPage.tsx` | "Step 1 — Pool ID" → PoolSelector |
| `WithdrawPage.tsx` | "Step 1 — Pool ID" → PoolSelector |
| `InsurePage.tsx` | "Risk Pool Object ID" input → PoolSelector（tier 連動） |

InsurePage 特殊處理：當 user 選 tier 時，自動 filter 對應 tier 的 pool。

## 6. Testing Guide Update

在 T-0 和 T-3 之間插入 **T-0.5: Admin Bootstrap**：

1. Admin 用 DemoPanel → Create Pool (Tier 0, 1, 2)
2. 記錄 3 個 Pool IDs
3. 驗證 PoolSelector 能自動列出 3 個 pools

更新 T-3 (Deposit) 步驟：手動貼 ID → 從 dropdown 選取。

## 7. Future: Generic Phantom Refactor (Approach C)

記錄到 `move-notes.md`，不在此次實作：

```move
// Future: RiskPool<phantom T> where T = TIER_LOW | TIER_MED | TIER_HIGH
// Benefits: type-level query, compile-time tier safety
// Cost: 30+ function signatures change, all tests, all PTBs
// Trigger: when needing permissionless pool creation or cross-protocol composability
```

## Files Changed

| File | Type | Change |
|------|------|--------|
| `risk_pool.move` | Move | +PoolCreatedEvent |
| `hooks/useDiscoverPools.ts` | New | event query hook |
| `components/pool/PoolSelector.tsx` | New | shared pool dropdown |
| `lib/ptb/admin.ts` | New | admin PTB builders |
| `pages/pool/PoolDashboard.tsx` | Edit | use PoolSelector |
| `pages/pool/DepositPage.tsx` | Edit | use PoolSelector |
| `pages/pool/WithdrawPage.tsx` | Edit | use PoolSelector |
| `pages/insure/InsurePage.tsx` | Edit | use PoolSelector + tier filter |
| `pages/demo/DemoPanel.tsx` | Edit | add Create Pool form |
| `docs/frontend-testing-guide.md` | Edit | add T-0.5 bootstrap |
| `move-notes.md` | Edit | record Approach C |

## Redeploy Required

`PoolCreatedEvent` 是新增 event，需要 redeploy v7。但因為：
- 沒有 struct layout change
- 沒有改 public API

**可以先建 pool（v6），event 在 v7 才開始 emit。** 前端的 PoolSelector 需要 v7 才能 auto-discover，v6 仍可 fallback 手動輸入。

或者反過來：先 deploy v7 → 再 create pools → events 就會被記錄。推薦這個順序。
