// frontend/src/pages/insure/InsurePage.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';
import { useOwnedPolicies, usePurchasePolicy } from '../../hooks/useInsurancePolicy';
import { useParsedProtocolConfig } from '../../hooks/useProtocolConfig';
import { useDiscoverPools, type DiscoveredPool } from '../../hooks/useDiscoverPools';
import { useRiskPoolDetail, useOwnedLPPositions } from '../../hooks/useRiskPool';
import { parsePosFields } from '../../components/pool/LPPositionCard';
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
  const [sdRider, setSdRider] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Resolve pool for selected tier
  const poolForTier: DiscoveredPool | undefined = useMemo(
    () => pools?.find((p) => p.riskTier === tier),
    [pools, tier],
  );
  const { data: poolData } = useRiskPoolDetail(poolForTier?.poolId);
  const { data: lpPositions } = useOwnedLPPositions();

  // User's deposit in the selected pool
  const myDepositInPool = useMemo(() => {
    if (!lpPositions || !poolForTier) return 0;
    return lpPositions.reduce((sum, pos) => {
      const fields = parsePosFields(pos);
      if (!fields) return sum;
      if (String(fields.pool_id ?? '') === poolForTier.poolId) {
        return sum + Number(fields.initial_deposit ?? 0);
      }
      return sum;
    }, 0);
  }, [lpPositions, poolForTier]);

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
  const canContinueStep2 = coverageValid;

  async function handlePurchase() {
    setToast(null);
    if (!poolForTier || !poolConfig || !account) return;
    try {
      const digest = await execute({
        poolId: poolForTier.poolId,
        insuredAddress: account.address,
        coverageAmount: coverageMist,
        includeSelfDestruct: sdRider,
        paymentAmountMist: premium.total,
      });
      setToast({ type: 'success', msg: `Policy purchased! Tx: ${digest}` });
      setStep(1);
      setCoverageSui('');
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

            {/* Pool Breakdown */}
            {poolConfig && (
              <div className="mt-4 bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
                {poolForTier ? (() => {
                  const tvl = totalLiquidity / 1e9;
                  const reserved = reservedAmount / 1e9;
                  const free = availableLiquidity / 1e9;
                  const insurable = maxInsurableMist / 1e9;
                  const myDep = myDepositInPool / 1e9;
                  const reservedPct = tvl > 0 ? (reserved / tvl) * 100 : 0;
                  const insurablePct = tvl > 0 ? (insurable / tvl) * 100 : 0;

                  return (
                    <>
                      {/* Header */}
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Pool Breakdown</span>
                        <span className="text-sm font-semibold text-gray-200 font-mono">{tvl.toFixed(2)} SUI total</span>
                      </div>

                      {/* Stacked bar */}
                      <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
                        {reservedPct > 0 && (
                          <div
                            className="bg-orange-500/70 h-full"
                            style={{ width: `${reservedPct}%` }}
                            title={`Reserved: ${reserved.toFixed(2)} SUI`}
                          />
                        )}
                        {insurablePct > 0 && (
                          <div
                            className="bg-green-500 h-full"
                            style={{ width: `${insurablePct}%` }}
                            title={`Insurable: ${insurable.toFixed(2)} SUI`}
                          />
                        )}
                        {(100 - reservedPct - insurablePct) > 0.5 && (
                          <div
                            className="bg-gray-600 h-full"
                            title={`Buffer (20% reserve): ${(free - insurable).toFixed(2)} SUI`}
                          />
                        )}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
                          <span className="text-gray-400">Insurable</span>
                          <span className="text-green-400 font-semibold font-mono">{insurable.toFixed(2)}</span>
                        </div>
                        {reserved > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/70 inline-block" />
                            <span className="text-gray-400">Reserved</span>
                            <span className="text-orange-400 font-semibold font-mono">{reserved.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-gray-600 inline-block" />
                          <span className="text-gray-400">Buffer 20%</span>
                          <span className="text-gray-500 font-mono">{Math.max(0, free - insurable).toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Your contribution */}
                      {myDep > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                          <span className="text-xs text-gray-500">Your deposit in this pool</span>
                          <span className="text-sm font-semibold text-blue-400 font-mono">{myDep.toFixed(2)} SUI</span>
                        </div>
                      )}

                      {/* Insufficient warning inline */}
                      {!hasLiquidity && (
                        <div className="bg-orange-950/60 border border-orange-900/50 rounded-lg px-3 py-2.5 flex gap-2 items-start">
                          <span className="text-yellow-400 text-sm flex-shrink-0">&#9888;</span>
                          <p className="text-orange-300/80 text-xs leading-relaxed">
                            {insurable > 0
                              ? `Min coverage is ${minCoverageSui.toFixed(1)} SUI but only ${insurable.toFixed(2)} SUI is insurable. `
                              : 'No insurable liquidity — deposits are fully reserved. '}
                            <a href="/pool/deposit" className="text-orange-400 underline font-medium">
                              Add liquidity &gt;
                            </a>
                          </p>
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Pool Liquidity</span>
                    <span className="text-sm text-gray-600 italic">No pool yet</span>
                  </div>
                )}
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

            {/* Insured Address */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1">Insured Address</label>
              <p className="text-xs text-gray-500 mb-2">Policy is bound to your connected wallet.</p>
              <div className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2.5 text-gray-400 text-sm font-mono">
                {account?.address ? `${account.address.slice(0, 10)}...${account.address.slice(-8)}` : '—'}
              </div>
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
                <span>Insured</span>
                <span className="text-gray-100 font-mono text-xs">
                  {account?.address ? `${account.address.slice(0, 8)}...${account.address.slice(-6)}` : '—'}
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
