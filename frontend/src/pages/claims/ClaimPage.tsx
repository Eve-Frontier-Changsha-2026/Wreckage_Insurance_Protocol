import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react';
import { useOwnedPolicies } from '../../hooks/useInsurancePolicy';
import { useSubmitClaim, useSubmitSelfDestructClaim } from '../../hooks/useClaims';
import {
  useMyKillmails,
  useOnChainKillmails,
  resolveToOnChain,
  type EveEyesKillmail,
} from '../../hooks/useKillmail';
import { useSolarSystemNames } from '../../hooks/useSolarSystem';
import { useDiscoverPools } from '../../hooks/useDiscoverPools';
import { TIER_NAMES } from '../../lib/types';

type ClaimType = 'normal' | 'selfDestruct';

function truncate(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function parsePolicyFields(obj: unknown) {
  const o = obj as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

export default function ClaimPage() {
  const account = useCurrentAccount();
  const [searchParams] = useSearchParams();
  const urlPolicyId = searchParams.get('policyId') ?? '';

  const { data: policies, isLoading: policiesLoading } = useOwnedPolicies();
  const submitClaim = useSubmitClaim();
  const submitSelfDestruct = useSubmitSelfDestructClaim();
  const { data: pools } = useDiscoverPools();

  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(urlPolicyId);
  const [selectedKillmailIdx, setSelectedKillmailIdx] = useState<number>(-1);
  const [killmailSearch, setKillmailSearch] = useState('');
  const [manualKillmailId, setManualKillmailId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [poolId, setPoolId] = useState('');
  const [claimType, setClaimType] = useState<ClaimType>('normal');
  const [successDigest, setSuccessDigest] = useState<string | null>(null);

  // Extract selected policy fields (safe before early return)
  const selectedPolicyObj = policies?.find((obj) => {
    const o = obj as Record<string, unknown>;
    return (o.objectId as string) === selectedPolicyId;
  });
  const selectedFields = selectedPolicyObj ? parsePolicyFields(selectedPolicyObj) : null;
  const hasSelfDestructRider = selectedFields?.has_self_destruct_rider === true
    || selectedFields?.hasSelfDestructRider === true;
  const policyStatus = (selectedFields?.status as string | undefined) ?? '';
  const isActive = policyStatus === 'active' || policyStatus === '0'
    || Number(policyStatus) === 0;

  // Eve Eyes killmail feed — auto-filtered by connected wallet
  const { data: killmails, isLoading: killmailsLoading } = useMyKillmails();
  const { data: onChainKillmails, isLoading: onChainLoading } = useOnChainKillmails();

  // Resolve solar system names for all killmails
  const systemIds = useMemo(
    () => (killmails ?? []).map((km) => km.solarSystemId),
    [killmails],
  );
  const { data: systemNames } = useSolarSystemNames(systemIds);

  // Filter killmails by search term
  const filteredKillmails = useMemo(() => {
    if (!killmails) return [];
    if (!killmailSearch.trim()) return killmails;
    const q = killmailSearch.toLowerCase();
    return killmails.filter((km) => {
      const sysName = systemNames?.get(km.solarSystemId)?.toLowerCase() ?? '';
      return (
        km.killer.label.toLowerCase().includes(q) ||
        sysName.includes(q) ||
        km.lossType.toLowerCase().includes(q) ||
        km.killTimestamp.toLowerCase().includes(q)
      );
    });
  }, [killmails, killmailSearch, systemNames]);

  // Resolve selected killmail → on-chain Sui object ID
  const selectedKillmail: EveEyesKillmail | undefined =
    filteredKillmails && selectedKillmailIdx >= 0
      ? filteredKillmails[selectedKillmailIdx]
      : undefined;
  const resolvedOnChain = selectedKillmail
    ? resolveToOnChain(selectedKillmail, onChainKillmails)
    : undefined;

  // The killmail ID to use in the PTB
  const killmailId = resolvedOnChain?.suiObjectId ?? manualKillmailId;

  // Auto-fill pool ID from policy tier
  const policyTier = Number(selectedFields?.risk_tier ?? selectedFields?.tier ?? 0);
  const resolvedPoolId = useMemo(
    () => pools?.find((p) => p.riskTier === policyTier)?.poolId ?? '',
    [pools, policyTier],
  );

  useEffect(() => {
    if (resolvedPoolId && !poolId) setPoolId(resolvedPoolId);
  }, [resolvedPoolId, poolId]);

  // Reset pool auto-fill when policy changes
  useEffect(() => {
    if (resolvedPoolId) setPoolId(resolvedPoolId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolicyId, resolvedPoolId]);

  const isPending = submitClaim.isPending || submitSelfDestruct.isPending;
  const error = submitClaim.error ?? submitSelfDestruct.error;

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to submit a claim.</p>
        <ConnectButton />
      </div>
    );
  }

  const canSubmit =
    selectedPolicyId.trim() !== '' &&
    killmailId.trim() !== '' &&
    poolId.trim() !== '' &&
    !isPending &&
    isActive;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      const args = {
        policyId: selectedPolicyId.trim(),
        killmailId: killmailId.trim(),
        poolId: poolId.trim(),
      };

      let digest: string | undefined;
      if (claimType === 'selfDestruct') {
        digest = await submitSelfDestruct.execute(args);
      } else {
        digest = await submitClaim.execute(args);
      }

      if (digest) {
        setSuccessDigest(digest);
      }
    } catch {
      // error is captured by hooks
    }
  }

  if (successDigest) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 px-4">
        <div className="bg-gray-900 border border-orange-500 rounded-xl p-8 max-w-lg w-full text-center">
          <div className="text-orange-400 text-4xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-white mb-2">Claim Submitted</h2>
          <p className="text-gray-400 text-sm mb-4">Transaction broadcast successfully.</p>
          <div className="bg-gray-800 rounded-lg p-3 mb-6">
            <p className="text-xs text-gray-500 mb-1">Transaction Digest</p>
            <p className="text-orange-400 font-mono text-xs break-all">{successDigest}</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              to="/claims/history"
              className="block bg-orange-500 hover:bg-orange-400 text-black font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              View Claim History
            </Link>
            <button
              onClick={() => {
                setSuccessDigest(null);
                setSelectedKillmailIdx(-1);
                setKillmailSearch('');
                setShowAdvanced(false);
                setManualKillmailId('');
                setPoolId('');
              }}
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Submit Another Claim
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Submit Claim</h1>
        <p className="text-gray-500 text-sm mb-8">
          File an insurance claim for a ship loss event.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Step 1: Select Policy */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 1 — Select Policy
            </h2>

            {policiesLoading ? (
              <p className="text-gray-500 text-sm">Loading policies...</p>
            ) : !policies || policies.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No active policies found.{' '}
                <Link to="/insure" className="text-orange-400 hover:underline">
                  Purchase a policy
                </Link>{' '}
                first.
              </p>
            ) : (
              <select
                value={selectedPolicyId}
                onChange={(e) => {
                  setSelectedPolicyId(e.target.value);
                  setClaimType('normal');
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="">— Choose a policy —</option>
                {policies.map((obj) => {
                  const o = obj as Record<string, unknown>;
                  const id = o.objectId as string;
                  const fields = parsePolicyFields(obj);
                  const tier = fields?.risk_tier ?? fields?.tier ?? '?';
                  const tierNum = Number(tier) as 0 | 1 | 2;
                  const status = (fields?.status as string | undefined) ?? '';
                  const active = status === 'active' || status === '0' || Number(status) === 0;
                  return (
                    <option key={id} value={id} disabled={!active}>
                      {truncate(id)} — {TIER_NAMES[tierNum] ?? `Tier ${tierNum}`}
                      {!active ? ' (inactive)' : ''}
                    </option>
                  );
                })}
              </select>
            )}

            {selectedFields && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                <span>Coverage:</span>
                <span className="text-white text-right">
                  {(Number(selectedFields.coverage_amount ?? selectedFields.coverageAmount ?? 0) / 1_000_000_000).toFixed(4)} SUI
                </span>
                <span>Claim Count:</span>
                <span className="text-white text-right">
                  {String(selectedFields.claim_count ?? selectedFields.claimCount ?? 0)}
                </span>
                <span>SD Rider:</span>
                <span className={`text-right font-medium ${hasSelfDestructRider ? 'text-orange-400' : 'text-gray-600'}`}>
                  {hasSelfDestructRider ? 'Yes' : 'No'}
                </span>
                <span>Status:</span>
                <span className={`text-right font-medium ${isActive ? 'text-green-400' : 'text-red-400'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            )}

            {selectedPolicyId && !isActive && selectedFields && (
              <p className="mt-3 text-red-400 text-xs">
                This policy is not active. Claims can only be submitted on active policies.
              </p>
            )}
          </div>

          {/* Step 2: Killmail */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 2 — Select Killmail
            </h2>

            {killmailsLoading ? (
              <p className="text-gray-500 text-sm">Loading killmails...</p>
            ) : !killmails || killmails.length === 0 ? (
              <div>
                <p className="text-gray-500 text-sm mb-3">
                  No ship losses found for this wallet.
                </p>
                {/* Show advanced input directly when no killmails */}
                <label className="block text-gray-400 text-xs mb-1">
                  Paste the Killmail Sui Object ID
                </label>
                <input
                  type="text"
                  value={manualKillmailId}
                  onChange={(e) => setManualKillmailId(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500 placeholder-gray-600"
                />
              </div>
            ) : (
              <>
                {/* Search box */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={killmailSearch}
                    onChange={(e) => {
                      setKillmailSearch(e.target.value);
                      setSelectedKillmailIdx(-1); // reset selection on search change
                    }}
                    placeholder="Search by killer, system, type..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
                  />
                  <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {/* Killmail cards */}
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                  {filteredKillmails.length === 0 ? (
                    <p className="text-gray-600 text-xs py-2">No killmails match your search.</p>
                  ) : (
                    filteredKillmails.map((km, idx) => {
                      const isSelected = selectedKillmailIdx === idx;
                      const onChain = resolveToOnChain(km, onChainKillmails);
                      const sysName = systemNames?.get(km.solarSystemId) ?? km.solarSystemId;
                      const date = new Date(km.killTimestamp);
                      const dateStr = date.toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      });
                      const timeStr = date.toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      });

                      return (
                        <button
                          key={km.killmailItemId}
                          type="button"
                          onClick={() => {
                            setSelectedKillmailIdx(isSelected ? -1 : idx);
                            setManualKillmailId('');
                            setShowAdvanced(false);
                          }}
                          disabled={!onChain && !onChainLoading}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            isSelected
                              ? 'border-orange-500 bg-orange-500/10'
                              : onChain
                              ? 'border-gray-700 hover:border-gray-600 cursor-pointer'
                              : 'border-gray-800 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-sm font-medium">
                              Killed by {km.killer.label}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {dateStr}, {timeStr}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">{sysName}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-400">{km.lossType}</span>
                            <span className="text-gray-600">·</span>
                            {onChainLoading ? (
                              <span className="text-gray-500">resolving...</span>
                            ) : onChain ? (
                              <span className="text-green-400">on-chain</span>
                            ) : (
                              <span className="text-yellow-500">pending</span>
                            )}
                          </div>
                          {isSelected && onChain && (
                            <p className="mt-1.5 text-[10px] text-gray-600 font-mono break-all">
                              {onChain.suiObjectId}
                            </p>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Advanced fallback — collapsible */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="mt-3 text-gray-500 hover:text-gray-400 text-xs transition-colors flex items-center gap-1"
                >
                  <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▸</span>
                  Can't find your killmail?
                </button>
                {showAdvanced && (
                  <div className="mt-2">
                    <label className="block text-gray-400 text-xs mb-1">
                      Paste the Killmail Sui Object ID directly
                    </label>
                    <input
                      type="text"
                      value={manualKillmailId}
                      onChange={(e) => {
                        setManualKillmailId(e.target.value);
                        setSelectedKillmailIdx(-1);
                      }}
                      placeholder="0x..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500 placeholder-gray-600"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 3: Pool Object ID */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 3 — Risk Pool
            </h2>
            <input
              type="text"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              placeholder="0x..."
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-500 ${
                resolvedPoolId ? 'bg-gray-800/50 border-gray-700/50 text-gray-400' : 'bg-gray-800 border-gray-700 text-white placeholder-gray-600'
              }`}
            />
            {resolvedPoolId ? (
              <p className="text-[11px] text-gray-600 mt-1">
                Auto-filled from {TIER_NAMES[policyTier as 0 | 1 | 2] ?? `Tier ${policyTier}`} pool
              </p>
            ) : (
              <p className="text-[11px] text-gray-600 mt-1">
                Enter the Risk Pool object ID that covers your policy tier
              </p>
            )}
          </div>

          {/* Step 4: Claim Type */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 4 — Claim Type
            </h2>
            <div className="flex flex-col gap-3">
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                claimType === 'normal'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}>
                <input
                  type="radio"
                  name="claimType"
                  value="normal"
                  checked={claimType === 'normal'}
                  onChange={() => setClaimType('normal')}
                  className="mt-0.5 accent-orange-500"
                />
                <div>
                  <p className="text-white text-sm font-medium">Normal Claim</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Standard ship destruction claim. Requires a valid killmail.
                  </p>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                hasSelfDestructRider
                  ? 'cursor-pointer'
                  : 'cursor-not-allowed opacity-50'
              } ${
                claimType === 'selfDestruct' && hasSelfDestructRider
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}>
                <input
                  type="radio"
                  name="claimType"
                  value="selfDestruct"
                  checked={claimType === 'selfDestruct'}
                  disabled={!hasSelfDestructRider}
                  onChange={() => setClaimType('selfDestruct')}
                  className="mt-0.5 accent-orange-500"
                />
                <div>
                  <p className="text-white text-sm font-medium">
                    Self-Destruct Claim
                    {!hasSelfDestructRider && (
                      <span className="ml-2 text-xs text-gray-600 font-normal">(rider required)</span>
                    )}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    For intentional self-destruction. Requires the SD rider add-on.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-bold py-3 px-6 rounded-xl transition-colors text-sm"
          >
            {isPending ? 'Submitting...' : 'Confirm & Submit Claim'}
          </button>

          <p className="text-gray-600 text-xs text-center">
            Claims are processed on-chain. Payout is sent automatically upon validation.
          </p>
        </form>
      </div>
    </div>
  );
}
