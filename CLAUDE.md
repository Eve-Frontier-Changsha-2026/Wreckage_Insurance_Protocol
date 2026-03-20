# SUI Full-Stack Project

## SUI Skill Routing
- Move 合約開發 → `sui-developer` skill（含品質檢查）
- Move 測試 → `sui-tester` skill（含 gas tracking）
- SUI 架構設計 → `sui-architect` skill
- 部署 → `sui-deployer` skill（devnet→testnet→mainnet）
- 安全審計 → `sui-security-guard` + `sui-red-team`
- Move 程式碼品質 → `move-code-quality` skill
- SUI SDK/CLI 問題 → 先用 `sui-docs-query` 查最新文件，不依賴過期資訊
- 前端 dApp → `sui-frontend` + `sui-ts-sdk`
- zkLogin → `sui-zklogin` skill
- Passkey → `sui-passkey` skill
- 前後端整合 → `sui-fullstack-integration` skill（TS type generation from Move）
- Seal 加密 → `sui-seal` skill
- Kiosk NFT → `sui-kiosk` skill
- DeepBook DEX → `sui-deepbook` skill

## Build & Test
- Move 改動後必跑 `sui move test` 再 commit
- TypeScript 改動後必跑 `npx tsc --noEmit` 再 commit
- 部署前跑 `sui move build` 確認無錯誤

## Red Team (Move Contracts)
- 核心合約（auth、金流、access control）用 `sui-red-team` skill
- 列出 ≤5 攻擊向量：access control bypass、integer overflow、object manipulation、economic exploit、DoS
