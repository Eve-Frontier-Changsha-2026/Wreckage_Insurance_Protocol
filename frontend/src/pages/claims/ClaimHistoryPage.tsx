import { Link } from 'react-router-dom';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';
import { useOwnedPolicies } from '../../hooks/useInsurancePolicy';
import { TIER_NAMES } from '../../lib/types';

function truncate(id: string, front = 8, back = 6) {
  return id.length > front + back + 3
    ? `${id.slice(0, front)}...${id.slice(-back)}`
    : id;
}

function parsePolicyFields(obj: unknown) {
  const o = obj as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function statusBadge(status: string) {
  const normalized = status === '0' ? 'active' : status === '1' ? 'expired' : status === '2' ? 'claimed' : status;
  const colors: Record<string, string> = {
    active: 'bg-green-900/40 text-green-400 border-green-700',
    expired: 'bg-gray-800 text-gray-500 border-gray-700',
    claimed: 'bg-orange-900/40 text-orange-400 border-orange-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[normalized] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {normalized || 'unknown'}
    </span>
  );
}

export default function ClaimHistoryPage() {
  const account = useCurrentAccount();
  const { data: policies, isLoading } = useOwnedPolicies();

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to view claim history.</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Claim History</h1>
            <p className="text-gray-500 text-sm">Past and pending claims across your policies.</p>
          </div>
          <Link
            to="/claims"
            className="bg-orange-500 hover:bg-orange-400 text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + New Claim
          </Link>
        </div>

        {/* Indexer notice */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6 flex gap-3">
          <span className="text-yellow-500 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-yellow-400 text-sm font-medium">Indexer Required for Full History</p>
            <p className="text-gray-400 text-sm mt-1">
              Claim history requires an event indexer integration. For MVP, claim counts per policy
              are shown below. Each policy's detail page links back to its on-chain state.
            </p>
          </div>
        </div>

        {/* Policies table */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-16 animate-pulse" />
            ))}
          </div>
        ) : !policies || policies.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm mb-3">No policies found for this account.</p>
            <Link
              to="/insure"
              className="text-orange-400 hover:underline text-sm"
            >
              Purchase a policy to get started
            </Link>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_80px_100px_80px] gap-4 px-5 py-3 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <span>Policy ID</span>
              <span className="text-center">Tier</span>
              <span className="text-center">Claims</span>
              <span className="text-center">Status</span>
              <span className="text-right">Action</span>
            </div>

            {/* Rows */}
            {policies.map((obj) => {
              const o = obj as Record<string, unknown>;
              const id = o.objectId as string;
              const fields = parsePolicyFields(obj);

              const tier = Number(fields?.tier ?? fields?.risk_tier ?? 0) as 0 | 1 | 2;
              const claimCount = Number(fields?.claim_count ?? fields?.claimCount ?? 0);
              const status = String(fields?.status ?? '');
              const hasSdRider = fields?.has_self_destruct_rider === true
                || fields?.hasSelfDestructRider === true;

              return (
                <div
                  key={id}
                  className="grid grid-cols-[1fr_120px_80px_100px_80px] gap-4 px-5 py-4 border-b border-gray-800 last:border-b-0 items-center hover:bg-gray-800/40 transition-colors"
                >
                  {/* Policy ID */}
                  <div>
                    <p className="text-white font-mono text-sm">{truncate(id)}</p>
                    {hasSdRider && (
                      <span className="text-xs text-orange-500 font-medium">SD Rider</span>
                    )}
                  </div>

                  {/* Tier */}
                  <div className="text-center">
                    <span className="text-gray-300 text-sm">
                      {TIER_NAMES[tier] ?? `Tier ${tier}`}
                    </span>
                  </div>

                  {/* Claim count */}
                  <div className="text-center">
                    <span className={`text-sm font-semibold ${claimCount > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
                      {claimCount}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center">
                    {statusBadge(status)}
                  </div>

                  {/* Action */}
                  <div className="flex justify-end">
                    <Link
                      to={`/policies/${id}`}
                      className="text-orange-400 hover:text-orange-300 text-xs font-medium transition-colors"
                    >
                      Detail →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {policies && policies.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{policies.length}</p>
              <p className="text-xs text-gray-500 mt-1">Total Policies</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-orange-400">
                {policies.reduce((sum, obj) => {
                  const fields = parsePolicyFields(obj);
                  return sum + Number(fields?.claim_count ?? fields?.claimCount ?? 0);
                }, 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Claims</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">
                {policies.filter((obj) => {
                  const fields = parsePolicyFields(obj);
                  const s = String(fields?.status ?? '');
                  return s === 'active' || s === '0';
                }).length}
              </p>
              <p className="text-xs text-gray-500 mt-1">Active Policies</p>
            </div>
          </div>
        )}

        <p className="text-center text-gray-600 text-xs mt-6">
          For a full claims ledger, integrate the WIP event indexer.
        </p>
      </div>
    </div>
  );
}
