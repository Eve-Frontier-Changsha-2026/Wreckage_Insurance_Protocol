# Wreckage Insurance Protocol — 進度追蹤

> 格式：最新紀錄放最上面

---

## 狀態

| 階段 | 狀態 |
|------|:----:|
| 設計文檔 | ✅ |
| Spec (審查完成) | ✅ |
| Implementation Plan (審查完成) | ✅ |
| 合約 — wreckage-core | ⬜ |
| 合約 — wreckage-protocol | ⬜ |
| 部署 (testnet) | ⬜ |
| 前端 | ⬜ |

---

## 進度日誌

### 2026-03-20 — Spec + Plan 完成

#### 做了什麼
- 完成系統設計 Spec（Lloyd's of London 太空版映射）
- 4 個 sui-dev-agents 並行審查：architect / security-guard / red-team / development
- 修正 6 CRITICAL + 8 HIGH + 6 MEDIUM 問題
- 完成 25-task implementation plan（5 phases）
- Plan review 修正 3 CRITICAL + 6 IMPORTANT + 5 SUGGESTIONS

#### 關鍵設計決策
- 雙 package 架構：wreckage-core (原語) + wreckage-protocol (業務)
- AdminCap capability pattern（非 address 檢查）
- u64 LP share counters（非 Supply<LP_SHARE>，避免 OTW 限制）
- 獨立 Auction shared objects（非 AuctionHouse 內 Table）
- 全局 ClaimRegistry + PolicyRegistry 防重複
- 虛擬初始流動性 1000/1000 防首存攻擊
- 自爆險：7 天等待期 + 50% 減額賠付
- NFT 兌換 MVP 禁用（池排水風險）
- 單一 init.move 統一建立所有 shared objects

#### 文件位置
- Spec: `docs/superpowers/specs/2026-03-20-wreckage-insurance-protocol-design.md`
- Plan: `docs/superpowers/plans/2026-03-20-wreckage-insurance-protocol.md`

#### 下一步
- 開新 chat，用 subagent-driven-development 執行 Plan Phase 1-5
- 每完成一個 Phase 更新此 progress.md
