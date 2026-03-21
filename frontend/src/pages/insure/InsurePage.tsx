import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useOwnedPolicies, usePurchasePolicy } from '../../hooks/useInsurancePolicy';
import PolicyCard from '../../components/policy/PolicyCard';
import RiskTierSelector, { TIER_RATES } from '../../components/policy/RiskTierSelector';
import RiderToggle from '../../components/policy/RiderToggle';
import type { RiskTier } from '../../lib/types';

const MIST_PER_SUI = 1_000_000_000n;

function calcPremium(coverageSui: number, tier: RiskTier, sdRider: boolean): number {
  const bps = TIER_RATES[tier].bps;
  const base = (coverageSui * bps) / 10000;
  return sdRider ? base * 1.3 : base;
}

export default function InsurePage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { data: policies, isLoading, error } = useOwnedPolicies();
  const { execute, isPending, error: txError } = usePurchasePolicy();

  // Form state
  const [poolId, setPoolId] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [coverageSui, setCoverageSui] = useState('100');
  const [tier, setTier] = useState<RiskTier>(0);
  const [sdRider, setSdRider] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const coverageNum = parseFloat(coverageSui) || 0;
  const premiumSui = calcPremium(coverageNum, tier, sdRider);

  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    setToast(null);
    if (!poolId.trim() || !characterId.trim() || coverageNum <= 0) {
      setToast({ type: 'error', msg: 'Please fill in all fields.' });
      return;
    }
    try {
      const coverageMist = BigInt(Math.round(coverageNum * 1e9));
      const premiumMist = BigInt(Math.round(premiumSui * 1e9));
      const digest = await execute({
        poolId: poolId.trim(),
        characterId: characterId.trim(),
        coverageAmount: coverageMist,
        includeSelfDestruct: sdRider,
        paymentAmountMist: premiumMist,
      });
      setToast({ type: 'success', msg: `Policy purchased! Tx: ${digest}` });
      setPoolId('');
      setCharacterId('');
    } catch {
      // error already set in hook
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Insurance</h1>
        <p className="text-sm text-gray-500 mt-1">Purchase and manage your wreckage insurance policies</p>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium break-all ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/15 border border-red-500/40 text-red-300'
          }`}
        >
          {toast.msg}
          <button
            onClick={() => setToast(null)}
            className="ml-3 opacity-60 hover:opacity-100 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Existing policies */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Your Policies</h2>
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-orange-400 rounded-full animate-spin" />
            Loading policies…
          </div>
        )}
        {error && (
          <p className="text-red-400 text-sm">Failed to load policies: {error.message}</p>
        )}
        {!isLoading && !error && policies && policies.length === 0 && (
          <p className="text-gray-600 text-sm">No policies found. Purchase one below.</p>
        )}
        {policies && policies.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {policies.map((p) => {
              const id = (p as { objectId?: string; id?: string }).objectId ?? (p as { id?: string }).id ?? '';
              return (
                <PolicyCard
                  key={id}
                  policy={p}
                  onClick={() => navigate(`/insure/${id}`)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Purchase form */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Purchase New Policy</h2>
        <form
          onSubmit={handlePurchase}
          className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6"
        >
          {/* Risk tier */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Risk Tier</label>
            <RiskTierSelector value={tier} onChange={setTier} />
          </div>

          {/* Coverage amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="coverage">
              Coverage Amount (SUI)
            </label>
            <div className="relative">
              <input
                id="coverage"
                type="number"
                min="1"
                step="1"
                value={coverageSui}
                onChange={(e) => setCoverageSui(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
                placeholder="100"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">SUI</span>
            </div>
          </div>

          {/* Pool ID */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="pool-id">
              Risk Pool Object ID
            </label>
            <input
              id="pool-id"
              type="text"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              placeholder="0x..."
            />
            <p className="text-xs text-gray-600 mt-1">Paste the Risk Pool object ID for your chosen tier</p>
          </div>

          {/* Character ID */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="character-id">
              Character Object ID
            </label>
            <input
              id="character-id"
              type="text"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              placeholder="0x..."
            />
          </div>

          {/* SD Rider toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Optional Rider</label>
            <RiderToggle enabled={sdRider} onChange={setSdRider} />
          </div>

          {/* Premium summary */}
          <div className="bg-gray-800/60 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Estimated Premium
              <span className="ml-2 text-xs text-gray-600">
                ({TIER_RATES[tier].bps / 100}%{sdRider ? ' + 30% SD rider' : ''})
              </span>
            </span>
            <span className="text-lg font-bold text-orange-400 font-mono">
              {premiumSui.toFixed(4)} SUI
            </span>
          </div>

          {/* Tx error */}
          {txError && (
            <p className="text-red-400 text-sm break-all">{txError}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || coverageNum <= 0}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-all bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Waiting for wallet…
              </span>
            ) : (
              'Purchase Policy'
            )}
          </button>
        </form>
      </section>
    </div>
  );
}

// suppress unused import warning — MIST_PER_SUI kept for reference
void MIST_PER_SUI;
