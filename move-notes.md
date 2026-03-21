# Wreckage Insurance Protocol — Move Notes

## Deployment (Testnet)

- **Network**: testnet
- **Date**: 2026-03-21
- **PackageID**: `0x053c5c2ae486c33e6e91d9169ea79385211d46373224953ad752ecf576786f77`
- **Deployer**: `0x1509b5fdf09296b2cf749a710e36da06f5693ccd5b2144ad643b3a895abcbc4c`
- **Gas**: ~0.784 SUI
- **Deployment mode**: Single-package (world + wreckage-core + wreckage-protocol merged via `--with-unpublished-dependencies`)

### Key Object IDs

| Object | ID |
|--------|----|
| ProtocolConfig | `0xaf987a7f3e744ed40d3c5fa8df827d9968bc305b78137d1b805bab4c65ba28bf` |
| PolicyRegistry | `0x4b1ad0fb5d335aefaa47d46fff10e5fc30336f24138e104cb8fb26ab1f73d0bc` |
| ClaimRegistry | `0xbe6e14a5b0028c84bd2af59ff96f41a5d4878783a4592341b0711df287fcab40` |
| AuctionRegistry | `0xba5a4846807889ff322983a4008069fb417b780f4cc94ec8f44e5d5a8216697d` |
| UpgradeCap | `0xa9d9767d5f982777b08541319019e5d36e4f5e6b7f8c442a2eaa4d68a0c0c935` |

## Module Summary (16 modules in wreckage-protocol)

| Module | Purpose |
|--------|---------|
| `errors` | Shared error code accessors (originally wreckage-core) |
| `policy` | InsurancePolicy struct + accessors/mutators + events (originally wreckage-core) |
| `salvage_nft` | SalvageNFT struct + mint/destroy + events (originally wreckage-core) |
| `pool_config` | PoolConfig + AuctionConfig value types with validation (originally wreckage-core) |
| `rider` | Self-destruct rider premium/payout calculations (originally wreckage-core) |
| `config` | AdminCap + ProtocolConfig + admin functions |
| `init` | Consolidated init: AdminCap + ProtocolConfig + all registries |
| `registry` | ClaimRegistry + PolicyRegistry |
| `risk_pool` | RiskPool + LPPosition + LP deposit/withdraw/premium/payout mechanics |
| `anti_fraud` | FraudCheckResult + multi-signal scoring (velocity, amount, character age, killmail) |
| `underwriting` | purchase_policy + renew_policy + transfer_policy + expire_policy |
| `claims` | submit_claim (combat + self-destruct) + approve/reject + salvage mint |
| `salvage` | SalvageNFT lifecycle management |
| `auction` | AuctionRegistry + Auction + create/bid/settle/buyout/destroy |
| `subrogation` | emit_subrogation — bounty reward calculation from subrogation_rate_bps |
| `integration` | Mock events: SalvageBountyRequest, FleetInsuranceRequest, ClaimCompletedHook |

## Tests

- **Total**: 86 tests all passing
- wreckage-core modules (merged): 10 tests (policy 3, pool_config 4, rider 3)
- config: 8, registry: 6, risk_pool: 11, anti_fraud: 12, underwriting: 10
- claims: 6, salvage: 2, auction: 8, e2e: 13

## Security Status

- **Audit date**: 2026-03-21 (Security Guard + Red Team, 10 rounds)
- **CRITICAL (5)**: All fixed — wreckage-core `public fun` → `public(package)` via package merge
- **HIGH (6)**: Documented, not yet fixed (auction hardcoded anti-snipe, claim reservation accounting, transfer_policy doesn't enforce transfer, expire_policy no pause check, public event emitters)
- **SUSPICIOUS (3)**: renewal resets created_at, settle_auction no tier check, no anti-snipe cap
- **Full report**: `tasks/security-audit-2026-03-21.md`

## Known Risks / Limitations

1. **Single-package deployment**: world + wreckage-core + wreckage-protocol merged into one package. Cannot independently upgrade world or core. Acceptable for hackathon MVP.
2. **World contracts fork**: Local fork of `evefrontier/world-contracts` with added accessor functions. If upstream changes, fork needs manual sync.
3. **NCB off-by-one**: Claim resets streak to 0, next renewal increments to 1. Minor, MVP acceptable.
4. **Auction anti-snipe hardcoded**: 600s window/extension, ignores AuctionConfig values. (H-1, H-2)
5. **Claim reservation tracking**: Subsequent claims on same policy add reservations without releasing prior. (H-3)
6. **No pool deactivation**: Admin cannot deactivate a RiskPool. (M-1)
7. **LPPosition uses tier not pool ID**: Cross-pool withdraw theoretically possible if same tier. (M-6)

## Architecture Decisions

- **AdminCap pattern**: Single admin capability, transferred at init. No multi-sig.
- **u64 LP shares**: OTW only allows one Supply, so LP tracking uses u64 counters instead of coin-based shares.
- **Shared objects**: ProtocolConfig, PolicyRegistry, ClaimRegistry, AuctionRegistry, RiskPool — all shared, no `store` ability.
- **`create_and_share_*` pattern**: Structs without `store` must be shared in their defining module.
- **Version field**: All shared objects have version for future upgradeability.
