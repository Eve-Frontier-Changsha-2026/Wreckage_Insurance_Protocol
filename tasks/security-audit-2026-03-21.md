# Security Audit Report — 2026-03-21

## Security Guard + Red Team (10 rounds, 70% confidence)

---

## CRITICAL (5 exploits — same root cause)

**Root cause: `wreckage-core` exposes `public fun` constructors/mutators — any on-chain package can forge/corrupt state**

| # | Function | Impact |
|---|----------|--------|
| C-1 | `policy::create()` | Mint fake policies with MAX_U64 coverage, zero premium |
| C-2 | `policy::set_status/set_cooldown_until/increment_claim_count/reset_no_claim_streak/increment_no_claim_streak/set_renewal_data` | Manipulate any policy state |
| C-3 | `salvage_nft::mint()` | Mint fake SalvageNFTs |
| C-4 | `salvage_nft::set_status()` | Mark any NFT as sold/destroyed |
| C-5 | `policy::destroy()` | Destroy active policy, stranding pool reservations |

**Full exploit chain (Round 9):** `policy::create()` fake 80 SUI coverage → `submit_claim()` → drain ~64.8 SUI from pool. Zero cost.

**Fix:** All `wreckage-core` constructors/mutators → `public(package)`. Since deployment merged all packages into one (`--with-unpublished-dependencies`), `public(package)` will still allow `wreckage-protocol` modules to call them, while blocking external attackers.

---

## HIGH (6)

| # | Issue | File | Fix |
|---|-------|------|-----|
| H-1 | Auction hardcodes anti-snipe 600s, ignores AuctionConfig | auction.move:189-190 | Pass config to `place_bid` |
| H-2 | No min bid increment — 1 MIST bids extend auction forever | auction.move:171 | Enforce `min_bid_increment_bps` |
| H-3 | Claim reservation bug: subsequent claims ADD reservations without releasing | claims.move:80-83 | Track per-policy reservation |
| H-4 | `transfer_policy` doesn't enforce actual transfer | underwriting.move:185-209 | Move transfer inside function |
| H-5 | No pause check on `expire_policy` — can release reservations during emergency | underwriting.move:214-244 | Add pause check |
| H-6 | `emit_renewed_event/emit_transferred_event` are public — fake events | policy.move:141-155 | `public(package)` |

---

## SUSPICIOUS (3)

- **S-1:** `renew_policy` resets `created_at`, potentially bypassing waiting period
- **S-2:** `settle_auction` doesn't validate pool tier — revenue to wrong pool
- **S-3:** Anti-snipe extension has no max cap — infinite extension possible

---

## MEDIUM (8)

- M-1: No admin function to deactivate a RiskPool
- M-2: No setter for `max_claims_per_policy` or `protocol_fee_bps`
- M-3: `subrogation_rate_bps` not validated <= 10000
- M-4: `anti_snipe_window` not validated <= `auction_duration`
- M-5: `claim_count` is u8 (max 255)
- M-6: `LPPosition` uses `pool_risk_tier` not pool ID — cross-pool withdraw possible
- M-7: Renewal of time-expired policy without `expire_policy` first
- M-8: Duplicate `AuctionConfig` in init (ProtocolConfig vs AuctionRegistry)

---

## DEFENDED (2)

- ✅ Integer math: u128 intermediates, PoolConfig validation, zero/MAX_U64 handled
- ✅ First-depositor attack: virtual shares (1000) + virtual liquidity (1000 MIST) + 7-day lock

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 (same root cause) |
| HIGH | 6 |
| SUSPICIOUS | 3 |
| MEDIUM | 8 |
| LOW | 4 |
| DEFENDED | 2 |

**No secrets found.** No private keys, mnemonics, or API keys in codebase.

## Priority Fix Order

1. **P0:** `public fun` → `public(package)` on all wreckage-core constructors/mutators
2. **P1:** Fix `auction::buyout()` overpayment (no refund)
3. **P1:** Fix claims reservation accounting (H-3)
4. **P2:** Add pool tier validation in settle/buyout
5. **P2:** Cap anti-snipe extension
6. **P3:** Add missing admin controls (M-1, M-2)
