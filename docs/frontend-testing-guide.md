# Wreckage Insurance Protocol — Frontend Manual Testing Guide

> 純使用者視角的手動測試步驟。
> 所有操作都在瀏覽器 + 錢包完成，不需要打任何 CLI 指令。
> 測試環境：SUI Testnet，合約 v6。

---

## Table of Contents

1. [測試前準備](#1-測試前準備)
2. [T-0: 冷啟動 — 未連接錢包](#2-t-0-冷啟動--未連接錢包)
3. [T-1: 連接錢包](#3-t-1-連接錢包)
4. [T-2: Dashboard 總覽](#4-t-2-dashboard-總覽)
5. [T-3: LP 存款 — 注入流動性](#5-t-3-lp-存款--注入流動性)
6. [T-4: 購買保單](#6-t-4-購買保單)
7. [T-5: 查看保單詳情](#7-t-5-查看保單詳情)
8. [T-6: 續保](#8-t-6-續保)
9. [T-7: 提交普通理賠](#9-t-7-提交普通理賠)
10. [T-8: 提交自毀理賠](#10-t-8-提交自毀理賠)
11. [T-9: 殘骸拍賣 — 瀏覽與出價](#11-t-9-殘骸拍賣--瀏覽與出價)
12. [T-10: 殘骸拍賣 — 結算/買斷/銷毀](#12-t-10-殘骸拍賣--結算買斷銷毀)
13. [T-11: 保單轉讓](#13-t-11-保單轉讓)
14. [T-12: 保單取消](#14-t-12-保單取消)
15. [T-13: LP 提款](#15-t-13-lp-提款)
16. [T-14: Demo Panel 快捷操作](#16-t-14-demo-panel-快捷操作)
17. [T-15: EVE SSU 整合](#17-t-15-eve-ssu-整合)
18. [T-16: 負面測試 — 故意搞壞它](#18-t-16-負面測試--故意搞壞它)
19. [T-17: 多人流程完整走一輪](#19-t-17-多人流程完整走一輪)
20. [T-18: UX 體感檢查](#20-t-18-ux-體感檢查)
21. [驗收 Checklist](#21-驗收-checklist)
22. [測試用 Object ID 記錄表](#22-測試用-object-id-記錄表)

---

## 1. 測試前準備

### 你需要

| 項目 | 說明 |
|------|------|
| Chrome / Brave | 最新版瀏覽器 |
| Sui Wallet 擴充套件 | 安裝 [Sui Wallet](https://chrome.google.com/webstore/detail/sui-wallet) 或 Suiet |
| Testnet SUI | 錢包切到 Testnet，領水龍頭 >= 5 SUI |
| 前端網址 | `http://localhost:5173` 或 Vercel 部署網址 |

### 測試帳號建議

| 帳號 | 角色 | 用途 |
|------|------|------|
| 帳號 A | Admin / LP / 投保人 | 主要測試帳號，做大部分操作 |
| 帳號 B | 第二位使用者 | 用於保單轉讓接收、拍賣競標 |

> 最低只需 1 個帳號就能跑完 T-0 ~ T-15。T-11（轉讓）和 T-17（多人流程）需要第 2 個帳號。

### 需要的鏈上物件 ID

測試過程中會用到以下 Object ID，請先記錄在[記錄表](#22-測試用-object-id-記錄表)：

- **Pool ID**（每個 tier 各一個）— Admin 預先建立
- **Character Object ID** — EVE Frontier 角色物件
- **Killmail Object ID** — 理賠時需要

> 這些 ID 由 Claude 或 Admin 透過 CLI 預先建立，測試者只需要拿到 ID 貼進前端。

---

## 2. T-0: 冷啟動 — 未連接錢包

> 目標：確認所有頁面在未登入狀態下不會白屏或 crash。

### 步驟

1. 打開瀏覽器，進入前端首頁
2. **不要連接錢包**，依序點擊 Navbar 上的每個連結：

| 點擊 | 看到 | Pass? |
|------|------|-------|
| **Dashboard** | 頁面載入，顯示 "Connect your wallet to get started" 和 ConnectButton | ☐ |
| **Insure** | 顯示 "Connect your wallet to manage insurance policies" | ☐ |
| **Claims** | 顯示 "Connect your wallet to submit a claim." | ☐ |
| **LP Pool** | 顯示 "Connect your wallet to view the LP pool." | ☐ |
| **Salvage** | 頁面載入，顯示拍賣列表（拍賣是公開的，不需錢包） | ☐ |
| **Demo** | 顯示 "Connect wallet to use demo panel" | ☐ |

3. 打開 DevTools → Console，確認 **0 個紅色錯誤**

### 預期

- 所有頁面都有友善的未連接提示
- 沒有任何白屏或 JavaScript error
- Navbar 的 "WIP" logo 和所有導航連結可見

---

## 3. T-1: 連接錢包

### 步驟

1. 點擊 Navbar 右上角的 **Connect** 按鈕
2. 彈出錢包選擇 Modal → 選擇你的錢包（Sui Wallet / Suiet）
3. 錢包擴充套件彈出授權請求 → 點擊 **Approve**
4. 觀察 Navbar 右上角

| 檢查 | 預期 | Pass? |
|------|------|-------|
| 連接後 Navbar 顯示 | 地址縮寫（如 `0xab12...ef56`） | ☐ |
| 確認 Network | Testnet（在錢包擴充套件中確認） | ☐ |
| Dashboard 自動更新 | "Connect your wallet" 消失，出現 stats 卡片 | ☐ |

5. 點擊地址 → 選擇 **Disconnect**
6. 確認回到未連接狀態
7. 重新連接 → 確認自動恢復

---

## 4. T-2: Dashboard 總覽

> 路由：`/`（首頁）

### 步驟

1. 連接錢包後進入 Dashboard
2. 觀察 4 張 Stats 卡片：

| 卡片 | 標籤 | 預期內容 |
|------|------|---------|
| 左 1 | **Your Policies** | `0 active / 0 total`（新帳號）。下方有 "Manage policies" 連結 |
| 左 2 | **LP Positions** | `0`。下方有 "View pool" 連結 |
| 左 3 | **Active Auctions** | 數字。下方有 "Browse auctions" 連結 |
| 左 4 | **Protocol Version** | 版本號或 `—`。下方有 "Demo panel" 連結 |

3. 往下滾動，看到 **Protocol Config** 區塊
   - 確認有顯示 Config ID、Policy Registry、Claim Registry、Auction Registry（都是 `0x...` 格式）
   - 如果沒有 → 代表 ProtocolConfig 查詢失敗，記錄問題

4. 再往下，看到 **Quick Links** 六宮格
   - 點擊每張卡片，確認跳轉到正確頁面

| 卡片 | 跳轉到 | Pass? |
|------|--------|-------|
| Purchase Insurance | `/insure` | ☐ |
| Submit a Claim | `/claims` | ☐ |
| Provide Liquidity | `/pool/deposit` | ☐ |
| Withdraw Liquidity | `/pool/withdraw` | ☐ |
| Salvage Auctions | `/salvage` | ☐ |
| Demo Panel | `/demo` | ☐ |

---

## 5. T-3: LP 存款 — 注入流動性

> 路由：`/pool/deposit`
> 這是購買保單的前置條件 — Pool 沒有流動性就無法投保。

### 步驟

1. 點擊 Navbar **LP Pool** → 點擊右上角 **Deposit** 按鈕（或從 Dashboard 點 "Provide Liquidity"）
2. 看到標題 **"Deposit SUI"** 和副標題 "Provide liquidity to the risk pool and earn LP shares."

3. **Step 1 — Pool ID**：
   - 在輸入框貼入 **Tier 0 Pool 的 Object ID**（從[記錄表](#22-測試用-object-id-記錄表)取得）
   - 點擊 **Load** 按鈕

4. 觀察 Pool 資訊載入：

| 欄位 | 預期 | Pass? |
|------|------|-------|
| TVL | `0 SUI`（全新 pool）或之前的存款金額 | ☐ |
| Total Shares | `0` 或之前的份額數 | ☐ |
| Share Price | `1 SUI/share`（首次存款）或計算值 | ☐ |

5. **Step 2 — Amount**：
   - 輸入 `2`（代表 2 SUI）
   - 下方自動顯示 "= 2000000000 MIST"
   - **Estimated LP Shares to Receive** 顯示橘色數字（首次存款 ≈ 2）

6. 點擊 **Confirm Deposit**

7. **錢包彈出簽名請求** → 確認交易內容 → 點擊 **Approve**

8. 等待交易確認...

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功畫面 | 顯示綠色打勾 + "Deposit Successful" + tx digest | ☐ |
| tx digest | 一串 base58 字串（可複製） | ☐ |
| 兩個按鈕 | "Back to Pool Dashboard" 和 "Deposit More" | ☐ |

9. 點擊 **Back to Pool Dashboard** → 在 "My LP Positions" 看到新的 LP Position 卡片

| 卡片欄位 | 預期 | Pass? |
|---------|------|-------|
| Shares Held | `2`（或接近） | ☐ |
| Deposit Amount | `2 SUI` | ☐ |
| Est. Current Value | `2 SUI`（首次，share price = 1） | ☐ |

> 記下這個 **LPPosition Object ID**，提款時會用到。

---

## 6. T-4: 購買保單

> 路由：`/insure`

### 步驟

1. 點擊 Navbar **Insure**
2. 上方先看到 "Your Policies" 區塊 → 目前應為 "No policies found. Purchase one below."

3. 往下滾到 **"Purchase New Policy"** 表單

4. **選擇風險等級**（RiskTierSelector）：
   - 點擊 **Tier 0 — Low Risk** → 確認顯示 "5.00%"、"Selected" 標記
   - 點擊 **Tier 1 — Medium Risk** → 確認切換到 "8.00%"
   - 點擊 **Tier 2 — High Risk** → 確認切換到 "12.00%"
   - 最終選定 **Tier 0**

| Tier 按鈕 | 費率 | 描述 | Pass? |
|-----------|------|------|-------|
| Tier 0 | 5.00% | Low Risk | ☐ |
| Tier 1 | 8.00% | Medium Risk | ☐ |
| Tier 2 | 12.00% | High Risk | ☐ |

5. **Coverage Amount (SUI)**：輸入 `1`（代表 1 SUI 的保額）

6. **Risk Pool Object ID**：貼入 **Tier 0 Pool ID**
   - 如果 tier 不匹配，交易會失敗（這在負面測試覆蓋）

7. **Character Object ID**：貼入你的 EVE Character Object ID
   - 如果有 EVE SDK 整合，旁邊會出現紫色 **CharacterBadge** 顯示角色名稱

8. **Self-Destruct Rider**（RiderToggle）：
   - 先保持 **OFF** 狀態
   - 觀察下方 **Estimated Premium**：
     - Tier 0, Coverage 1 SUI, 無 Rider → `0.0500 SUI`（5%）

9. 切換 Rider 為 **ON**：
   - Toggle 滑塊變橘色
   - Premium 更新為 `0.0650 SUI`（5% × 1.3 = 6.5%）
   - 旁邊標註 "(500% + 30% SD rider)" 之類的說明

10. 選定你要的 Rider 狀態，點擊 **Purchase Policy**

11. **錢包簽名** → Approve

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功 Toast | 綠色背景，顯示 "Policy purchased! Tx: {digest}" | ☐ |
| 上方 Policy 列表 | 出現一張新的 **PolicyCard** | ☐ |

12. 觀察新的 **PolicyCard**：

| 欄位 | 預期 | Pass? |
|------|------|-------|
| Risk Tier badge | 綠色 "Tier 0" | ☐ |
| Status badge | 綠色 "ACTIVE" | ☐ |
| Coverage | `1 SUI` | ☐ |
| NCB | `NCB 0`（灰色，新保單） | ☐ |
| SD Rider badge | 有或沒有，取決於你的選擇 | ☐ |
| Object ID | 底部灰色小字 `0x...` | ☐ |

> 記下 **Policy Object ID**，後續操作需要。

---

## 7. T-5: 查看保單詳情

> 路由：`/insure/:policyId`

### 步驟

1. 在 `/insure` 頁面點擊剛建立的 **PolicyCard**

2. 跳轉到 Policy Detail 頁面，確認：

| 欄位 | 預期 | Pass? |
|------|------|-------|
| 頁面標題 | "Policy Detail" | ☐ |
| 副標題 | Policy Object ID（灰色等寬字體） | ☐ |
| Risk Tier badge | 右上角，顏色正確 | ☐ |
| Status badge | 右上角，"Active" 綠色 | ☐ |
| Coverage | `1 SUI` | ☐ |
| Premium Paid | 你支付的金額 | ☐ |
| Created At | 日期時間（非 "—"） | ☐ |
| Expires At | 未來的日期時間 | ☐ |
| NCB Streak | `0` | ☐ |
| Claims | `0` | ☐ |
| SD Rider | "Enabled"（紫色）或 "None"（灰色） | ☐ |
| Character ID | 等寬字體顯示 | ☐ |

3. 看到藍色按鈕 **"Submit a Claim for this Policy"** → 先不點
4. 看到 **"Renew Policy"** 區塊 → T-6 測
5. 看到 **"Policy Actions"** 區塊（Transfer / Cancel） → T-11、T-12 測
6. 點擊左上角 **"← Back to Insurance"** → 回到 `/insure`

---

## 8. T-6: 續保

> 路由：`/insure/:policyId`（同 T-5 頁面）

### 步驟

1. 進入一張 **Active** 保單的詳情頁

2. 找到 **"Renew Policy"** 區塊

3. **Risk Pool Object ID**：貼入對應 tier 的 Pool ID

4. **Payment Amount (SUI)**：
   - 系統會顯示 "Estimated renewal premium: X SUI"
   - 在輸入框填入金額（可直接用建議值或稍高）

5. 點擊 **Renew Policy** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功 Toast | 綠色，顯示 tx digest | ☐ |
| Expires At | 日期延後（舊到期日 + policy_duration） | ☐ |
| NCB Streak | 如果之前 0 claims → +1（變成 `1`，橘色） | ☐ |

6. 重新載入頁面，確認資料持久化

---

## 9. T-7: 提交普通理賠

> 路由：`/claims`

### 前置條件
- 有一張 **Active** 保單（T-4 建立的）
- 有一個 **Killmail Object ID**（從[記錄表](#22-測試用-object-id-記錄表)取得）

### 步驟

1. 點擊 Navbar **Claims**

2. **Step 1 — Select Policy**：
   - 點擊下拉選單，看到你的保單列表
   - 選擇一張 Active 保單
   - 下方出現保單摘要：Coverage、Claim Count、SD Rider（Yes/No）、Status

| 摘要 | 預期 | Pass? |
|------|------|-------|
| Coverage | `1 SUI` | ☐ |
| Claim Count | `0` | ☐ |
| Status | "Active"（綠色） | ☐ |

3. **Step 2 — Killmail Object ID**：
   - 貼入 Killmail ID

4. **Step 3 — Risk Pool Object ID**：
   - 貼入對應 tier 的 Pool ID

5. **Step 4 — Claim Type**：
   - 點擊 **"Normal Claim"** 選項
   - 邊框變橘色，背景變深

6. 點擊 **Confirm & Submit Claim**

7. **錢包簽名** → Approve

8. 等待交易完成...

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功畫面 | 大橘色打勾 + "Claim Submitted" | ☐ |
| Transaction Digest | 顯示 tx digest（橘色等寬字體） | ☐ |
| "View Claim History" 按鈕 | 可點擊 | ☐ |
| "Submit Another Claim" 按鈕 | 可點擊，重置表單 | ☐ |

9. 點擊 **View Claim History** → 跳轉到 `/claims/history`

10. 在 Claim History 頁面確認：
    - 表格中保單的 Claims 欄位從 `0` 變成 `1`（橘色）

11. 回到保單詳情 `/insure/:policyId`：
    - Claims 欄位 = `1`

> 理賠成功後會自動建立 **SalvageNFT** 和 **Auction**。記下 Auction ID（可在 `/salvage` 找到）。

---

## 10. T-8: 提交自毀理賠

> 路由：`/claims`

### 前置條件
- 有一張 **Active** 保單 **且開啟了 SD Rider**
- 如果沒有 → 先用 T-4 購買一張新保單，RiderToggle 設為 ON

### 步驟

1. 進入 `/claims`

2. **Step 1**：選擇有 SD Rider 的保單
   - 摘要中 SD Rider 顯示 "Yes"（橘色）

3. **Step 2 + 3**：填入 Killmail ID 和 Pool ID

4. **Step 4 — Claim Type**：
   - **Normal Claim** — 可選
   - **Self-Destruct Claim** — 可選（因為有 SD Rider）
   - 點擊 **"Self-Destruct Claim"** → 邊框變橘色

5. 點擊 **Confirm & Submit Claim** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功畫面 | "Claim Submitted" + tx digest | ☐ |
| Payout 金額 | 低於 Normal Claim（SD rate < 100%） | ☐ |

### 對比測試：無 SD Rider 保單嘗試自毀理賠

6. 回到 `/claims`，選一張 **沒有 SD Rider** 的保單
7. 看 Step 4：

| 檢查 | 預期 | Pass? |
|------|------|-------|
| Self-Destruct 選項 | 半透明（opacity 50%），標註 "(rider required)" | ☐ |
| 嘗試點擊 | 無法選取 | ☐ |

---

## 11. T-9: 殘骸拍賣 — 瀏覽與出價

> 路由：`/salvage` → `/salvage/:auctionId`

### 前置條件
- T-7 或 T-8 完成 → 理賠自動產生了 Auction

### 步驟

1. 點擊 Navbar **Salvage**

2. 看到 **"Salvage Auctions"** 標題
3. 在 **Auction Registry** 區塊：
   - 如果有 active auctions → 顯示橘色 badge "{N} active"
   - 自動載入 auction 卡片

4. 如果沒自動載入，手動輸入 Auction ID：
   - 在輸入框貼入 Auction Object ID
   - 按 Enter 或點 **Add**
   - 出現 ID chip（灰色小標籤），卡片載入

5. 觀察 **AuctionCard**：

| 欄位 | 預期 | Pass? |
|------|------|-------|
| Auction ID | 等寬灰色，截斷顯示 | ☐ |
| Status badge | "bidding"（藍色之類）或對應狀態 | ☐ |
| Starting Price | `X SUI` | ☐ |
| Highest Bid | `0 SUI`（初始）或已有出價 | ☐ |
| Time Left | 倒計時（如 `0d 23:45:12`）或 CountdownTimer | ☐ |

6. 點擊 AuctionCard → 進入 **Auction Detail**

7. 確認詳情顯示：

| 欄位 | 預期 | Pass? |
|------|------|-------|
| Salvage NFT | NFT ID | ☐ |
| Starting Price | `X SUI` | ☐ |
| Highest Bid | 橘色金額（有值時）或灰色 `0` | ☐ |
| Time Remaining | CountdownTimer 即時倒數 | ☐ |

8. 在 **Place Bid** 區塊的 **BidForm**：
   - 看到 "Bid Amount (SUI)" 輸入框
   - 下方提示 "min: X SUI"
   - 輸入一個 **低於** min 的數字 → 按鈕應為 disabled
   - 輸入一個 **高於** min 的數字（如 `0.1` SUI）
   - 點擊 **Place Bid** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功訊息 | 綠色 "Success! Tx: ..." | ☐ |
| Highest Bid 更新 | 你的出價金額 | ☐ |
| Highest Bidder 更新 | 你的地址 | ☐ |

9. **CountdownTimer 驗證**：
   - 等待 10 秒，觀察倒計時更新
   - 剩餘 < 10 分鐘 → 數字變紅色
   - 剩餘 10 分鐘 ~ 1 小時 → 黃色
   - 剩餘 > 1 小時 → 綠色

---

## 12. T-10: 殘骸拍賣 — 結算/買斷/銷毀

> 路由：`/salvage/:auctionId`

### 10A. 結算（Settle）

> 前置：拍賣已結束（CountdownTimer 顯示 "Ended"）且有出價

1. 拍賣結束後，頁面出現 **"Settle Auction"** 區塊
2. 輸入 **Pool ID**
3. 點擊 **Settle Auction** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功 | 綠色 Success 訊息 + tx digest | ☐ |
| Status | 變為 "settled" | ☐ |
| 顯示訊息 | "Auction settled. Winner: {地址}" | ☐ |

### 10B. 買斷（Buyout）

> 前置：拍賣進入 buyout 階段

1. 看到 **"Buyout"** 區塊
2. 輸入 **Pool ID** 和 **Payment Amount (SUI)**
3. 點擊 **Buy Now** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功 | 綠色訊息 | ☐ |
| NFT | 轉移到你的錢包 | ☐ |

### 10C. 銷毀未售出（Destroy Unsold）

> 前置：拍賣結束 + buyout 期限過 + 無人出價/購買

1. 看到 "Auction ended with no bids." 訊息
2. 點擊紅色按鈕 **Destroy Unsold NFT** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功 | NFT 銷毀，拍賣關閉 | ☐ |

---

## 13. T-11: 保單轉讓

> 路由：`/insure/:policyId`

### 前置條件
- 有一張 Active 保單
- 有第二個錢包地址（帳號 B）

### 步驟

1. 進入保單詳情頁

2. 滾到 **"Policy Actions"** 區塊

3. 填入 **Risk Pool Object ID**（shared input，Transfer 和 Cancel 共用）

4. 在 "Transfer to" 輸入框貼入 **帳號 B 的地址**
   - 注意紅色警告：**"Warning: NCB streak will be reset and cooldown applied."**

5. 點擊 **Transfer Policy** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功 Toast | 綠色，tx digest | ☐ |

6. **驗證 — 帳號 A**：
   - 刷新 `/insure` → 該保單從列表消失
   - 或保單詳情頁 owner 已不是你

7. **驗證 — 帳號 B**：
   - 切換到帳號 B 的錢包
   - 刷新 `/insure` → 看到接收到的保單
   - 進入詳情頁 → **NCB Streak = 0**（被重置了）

| 檢查 | 預期 | Pass? |
|------|------|-------|
| 帳號 A 看不到保單 | ☐ | ☐ |
| 帳號 B 看到保單 | ☐ | ☐ |
| NCB 重置為 0 | ☐ | ☐ |

---

## 14. T-12: 保單取消

> 路由：`/insure/:policyId`

### 步驟

1. 進入一張 **Active** 保單的詳情頁（建議用一張不再需要的測試保單）

2. 滾到 **"Policy Actions"** → Cancel 區塊

3. 注意紅色警告：**"Cancel is irreversible. Premium is NOT refunded."**

4. 填入 Pool ID（如果尚未填寫）

5. 點擊紅色按鈕 **Cancel Policy** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| Status badge | 從 "Active" 變為 **"Cancelled"** | ☐ |
| Renew 區塊 | 消失，顯示 "This policy is cancelled and cannot be renewed." | ☐ |
| Action 按鈕 | Transfer / Cancel 消失或 disabled | ☐ |

6. 回到 `/insure` → PolicyCard 上 status badge 顯示 "CANCELLED"

---

## 15. T-13: LP 提款

> 路由：`/pool/withdraw`

### 步驟

1. 點擊 Navbar **LP Pool** → 右上角 **Withdraw**

2. **Step 1 — Pool ID**：貼入 Pool ID → 點擊 **Load**
   - "Loading pool..." → 載入完成

3. **Step 2 — Select Position**：
   - 下拉選單列出你的 LP Positions
   - 選擇一個 position → 顯示摘要

| 摘要 | 預期 | Pass? |
|------|------|-------|
| Available Shares | 你存入時的 shares 數 | ☐ |
| Deposit Amount | `2 SUI`（T-3 存入的） | ☐ |

4. **Step 3 — Shares to Burn**：
   - 輸入 `1`（部分提款）
   - 或點擊 **Max** → 自動填入全部 shares
   - **Estimated SUI to Receive** 顯示橘色金額

5. 觀察 **Exit Fee Indicator**：

| Pool 使用率 | 進度條顏色 | 標籤 | Pass? |
|------------|-----------|------|-------|
| < 50% | 綠色 | "Low" | ☐ |
| 50-80% | 黃色 | "Moderate" | ☐ |
| > 80% | 紅色 | "High" | ☐ |

6. 看到 **"Exit Fee Notice"** 黃色警告框

7. 點擊 **Confirm Withdrawal** → 錢包簽名

| 結果 | 預期 | Pass? |
|------|------|-------|
| 成功畫面 | "Withdrawal Successful" + tx digest | ☐ |
| SUI 到帳 | 錢包餘額增加（扣除 exit fee） | ☐ |

8. 點擊 **Back to Pool Dashboard** → LP Position shares 減少

### 超額提款測試

9. 嘗試輸入一個 **超過 Available Shares** 的數字
   → 預期：顯示紅色 "Cannot exceed X shares."，按鈕 disabled

---

## 16. T-14: Demo Panel 快捷操作

> 路由：`/demo`

### 步驟

1. 點擊 Navbar **Demo**

2. 看到 4 個可展開的 Section：

| Section | 預設狀態 | 內容 |
|---------|---------|------|
| Protocol Status | 展開 | Shared Object IDs + Config 參數 |
| Quick Actions | 展開 | Deposit / Purchase / Claim / Bid 表單 |
| Admin Actions | 收合 | Expire / Settle / Set Item Price / Destroy |
| Transaction Log | 展開 | 交易歷史記錄 |

### Protocol Status

3. 確認 Shared Objects 列表：
   - 每個 Object 旁邊有 **Copy 按鈕** → 點擊複製，確認剪貼簿有值
   - protocolConfig, policyRegistry, claimRegistry, auctionRegistry, valuationRegistry

### Quick Actions — 快速存款

4. 在 "Deposit to Pool" 區塊：
   - 填入 Pool ID 和 Amount（如 `0.5`）
   - 點擊 **Deposit** → 錢包簽名
   - 觀察 **Transaction Log** 新增一筆

### Quick Actions — 快速購保

5. 在 "Purchase Policy" 區塊：
   - 填入 Pool ID、Character ID、Coverage、Premium Payment
   - 選擇是否開啟 "Include Self-Destruct Rider"
   - 點擊 **Purchase Policy** → 錢包簽名

### Transaction Log

6. 觀察 Transaction Log：

| 欄位 | 預期 | Pass? |
|------|------|-------|
| 狀態圖示 | 綠色 ✓（成功）或紅色 ✗（失敗） | ☐ |
| Action 名稱 | 如 "Deposit", "Purchase Policy" | ☐ |
| Timestamp | 正確時間 | ☐ |
| TX digest | 橘色等寬字體，旁邊有 Copy 按鈕 | ☐ |

7. 點擊 **Clear Log** → 清空所有記錄

### Admin Actions

8. 展開 Admin Actions
   - 看到黃色警告："These calls require an AdminCap..."
   - 如果你是 Admin → 可以操作
   - 如果你不是 Admin → 操作會鏈上失敗（Transaction Log 紅色 ✗）

---

## 17. T-15: EVE SSU 整合

> 路由：`/insure` + `/`

### 步驟

#### Dashboard SSU 探索

1. 在 Dashboard 頁面找到 **"Explore SSU"** 輸入框
2. 貼入一個 **SSU Object ID**
3. 下方出現 **GameWorldContext** 區塊

| 欄位 | 預期 | Pass? |
|------|------|-------|
| EVE Frontier Context 標題 | 可見 | ☐ |
| Station | 站點名稱或 "Unknown" | ☐ |
| ID | SSU ID 截斷顯示 | ☐ |
| Owner | 角色名稱（紫色文字） | ☐ |

#### InsurePage SSU 狀態

4. 在 `/insure` 頁面找到 **"EVE Frontier SSU"** 區塊
5. 在 "SSU Object ID (optional)" 輸入框貼入 SSU ID

6. 觀察 **SSUStatusCard**：

| 狀態 | 預期 | Pass? |
|------|------|-------|
| 無 ID | 虛線框，"No SSU selected — insurance available via direct contract calls" | ☐ |
| 載入中 | "Loading SSU..." | ☐ |
| 線上 | 綠色邊框，"ONLINE" badge，"Insurance services active at this station" | ☐ |
| 離線 | 紅色邊框，"OFFLINE" badge | ☐ |

---

## 18. T-16: 負面測試 — 故意搞壞它

> 目標：確認在各種錯誤操作下，前端不會 crash，能給出合理的錯誤訊息。

### 輸入錯誤

| # | 操作 | 在哪裡 | 預期結果 | Pass? |
|---|------|--------|---------|-------|
| 16.1 | Coverage 填 `0` | `/insure` | 按鈕 disabled 或合約 abort | ☐ |
| 16.2 | Coverage 填超大數（如 `99999`） | `/insure` | 合約 abort（pool 流動性不足），紅色錯誤 | ☐ |
| 16.3 | Object ID 填亂碼（如 `abc123`） | 任何 ID 欄位 | 查詢失敗，顯示錯誤 | ☐ |
| 16.4 | Object ID 留空 | 任何必填欄位 | 按鈕 disabled | ☐ |
| 16.5 | Pool ID 和 Tier 不匹配 | `/insure` | 合約 abort（tier mismatch） | ☐ |
| 16.6 | Bid 金額 < 目前最高出價 | `/salvage/:id` | BidForm 不接受或合約 abort | ☐ |
| 16.7 | 提款 shares 超過持有量 | `/pool/withdraw` | 紅色 "Cannot exceed X shares" | ☐ |

### 狀態衝突

| # | 操作 | 預期結果 | Pass? |
|---|------|---------|-------|
| 16.8 | 對已 Cancelled 保單點 Renew | 看不到 Renew 區塊（"This policy is cancelled...") | ☐ |
| 16.9 | 對已 Cancelled 保單提交理賠 | Claims dropdown 中該保單標記 inactive，disable | ☐ |
| 16.10 | 餘額不足時購保 | 錢包報錯 insufficient balance | ☐ |
| 16.11 | 連續快速點擊 Submit 兩次 | 第一次成功，第二次 object version conflict | ☐ |
| 16.12 | Pool 無流動性時購保 | 合約 abort，前端紅色錯誤 | ☐ |

### 關鍵驗證

- [ ] **所有錯誤情況都不導致白屏或 JS crash**
- [ ] **錯誤訊息是人類可讀的**（不是 raw hex 或 abort code）
- [ ] **錯誤後表單可以修正並重新提交**

---

## 19. T-17: 多人流程完整走一輪

> 需要 2 個帳號。這是完整的端到端場景。

### 場景：LP 注資 → 投保 → 理賠 → 拍賣競標 → 結算

| Step | 帳號 | 操作 | 預期 |
|------|------|------|------|
| 1 | A | `/pool/deposit` — 存 3 SUI 到 Pool T0 | LP Position 建立 |
| 2 | A | `/insure` — 購買 Tier 0 保單，coverage 1 SUI，有 SD Rider | PolicyCard 出現 |
| 3 | A | `/claims` — 提交 Normal Claim | "Claim Submitted" 成功畫面 |
| 4 | A | `/salvage` — 找到新建立的 Auction | AuctionCard 顯示 |
| 5 | A | `/salvage/:id` — 出價 0.1 SUI | Highest Bid 更新 |
| 6 | B | `/salvage/:id` — 出價 0.2 SUI | B 成為最高出價者，A 退款 |
| 7 | A | `/salvage/:id` — 出價 0.3 SUI | A 再次最高出價者，B 退款 |
| 8 | — | 等拍賣結束... | CountdownTimer 歸零 |
| 9 | 任一 | `/salvage/:id` — Settle Auction | A 獲得 SalvageNFT，0.3 SUI 進 Pool |
| 10 | A | `/pool/withdraw` — 提取全部 LP shares | 收到 3 SUI + premium + auction 收入 - 理賠支出 |

### 資金流驗證

```
Pool 初始: 3 SUI (A 存入)
+ Premium: ~0.065 SUI (保費)
- Claim:   ~1 SUI (理賠支出)
+ Auction: 0.3 SUI (拍賣收入)
─────────
Pool 最終: ~2.365 SUI
```

| 檢查 | 預期 | Pass? |
|------|------|-------|
| A 的 LP 提款金額大致合理 | ≈ 2.365 SUI（扣除 exit fee） | ☐ |
| 過程中無任何 error | 全部操作成功 | ☐ |
| 各頁面數據一致 | Policy/Pool/Auction 資料互相吻合 | ☐ |

---

## 20. T-18: UX 體感檢查

### Loading & Feedback

| # | 場景 | 預期 | Pass? |
|---|------|------|-------|
| 18.1 | 任何 async 查詢期間 | 有 Spinner 或 "Loading..." | ☐ |
| 18.2 | 交易發送中 | 按鈕文字變 "Waiting for wallet..." 並 disabled | ☐ |
| 18.3 | 交易成功 | 綠色 Toast 或成功畫面，顯示 tx digest | ☐ |
| 18.4 | 交易失敗 | 紅色 Toast 或錯誤框，清楚說明原因 | ☐ |
| 18.5 | 表單提交成功後 | 表單清空、或導航到結果頁 | ☐ |

### 導航

| # | 場景 | 預期 | Pass? |
|---|------|------|-------|
| 18.6 | Navbar active state | 當前頁面的 link 為橘色高亮 | ☐ |
| 18.7 | 返回按鈕 | "← Back to..." 能正確返回上一層 | ☐ |
| 18.8 | 直接輸入 URL | 如 `/insure/0x123` 能正確載入（SPA routing） | ☐ |

### Copy & Display

| # | 場景 | 預期 | Pass? |
|---|------|------|-------|
| 18.9 | 長 Object ID | 截斷顯示，不破版 | ☐ |
| 18.10 | Copy 按鈕（Demo Panel） | 點擊後剪貼簿有正確值 | ☐ |
| 18.11 | SUI 金額顯示 | 有 "SUI" 單位標示，合理小數位 | ☐ |

---

## 21. 驗收 Checklist

### Core Flows（必須全過）

| 測試 | 通過 |
|------|------|
| T-0: 未連接錢包 — 所有頁面可 render | ☐ |
| T-1: 連接/斷開錢包 | ☐ |
| T-2: Dashboard 載入並顯示正確資料 | ☐ |
| T-3: LP Deposit 成功 | ☐ |
| T-4: Purchase Policy（3 種 tier + rider toggle） | ☐ |
| T-5: Policy Detail 欄位正確 | ☐ |
| T-6: Renew Policy + NCB 遞增 | ☐ |
| T-7: Normal Claim 成功 | ☐ |
| T-8: Self-Destruct Claim 成功 + 無 Rider 時 disabled | ☐ |
| T-9: Auction 出價成功 | ☐ |
| T-10: Auction Settle / Buyout / Destroy | ☐ |
| T-11: Transfer Policy + NCB reset | ☐ |
| T-12: Cancel Policy 不可逆 | ☐ |
| T-13: LP Withdraw 成功 | ☐ |

### 補充測試

| 測試 | 通過 |
|------|------|
| T-14: Demo Panel 操作 + Tx Log | ☐ |
| T-15: EVE SSU 元件載入 | ☐ |
| T-16: 負面測試 — 無 crash，有錯誤訊息 | ☐ |
| T-17: 多人完整流程 | ☐ |
| T-18: UX 體感 | ☐ |

---

## 22. 測試用 Object ID 記錄表

> 在測試前填入，方便複製貼上。

| 項目 | Object ID |
|------|-----------|
| ProtocolConfig | `0x0e9ca9dbc87e828f907f0c8011973a9ba5ee8d3c1e0bea08b42f050a622d4523` |
| PolicyRegistry | `0x11903d4c33205930b2fd9f79cbf2899d301940a4dc79b01e76981ab3806fbef8` |
| ClaimRegistry | `0xe42f02223e9e635a2b03c9e3337fdcba0fb1a9bb7fba469df17bb70c142d8036` |
| AuctionRegistry | `0x682807b31effdf6160e296b00012331b3a58b8560b102f733dfc6919944e29f9` |
| ValuationRegistry | `0x0a617a6b38cbe66b8f0e00d9b10daf3f6383bf62c9e13ad3de6d89716f99f77a` |
| Pool T0 (Low Risk) | |
| Pool T1 (Medium Risk) | |
| Pool T2 (High Risk) | |
| AdminCap | |
| Character (EVE) | |
| Killmail #1 | |
| Killmail #2 | |
| SSU | |
| 帳號 A 地址 | |
| 帳號 B 地址 | |
