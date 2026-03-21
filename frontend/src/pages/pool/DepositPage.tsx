import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';
import { useRiskPoolDetail, useDeposit } from '../../hooks/useRiskPool';

const MIST_PER_SUI = 1_000_000_000n;

function parsePoolFields(pool: unknown) {
  const o = pool as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function computeSharePrice(pool: unknown): number {
  const fields = parsePoolFields(pool);
  if (!fields) return 0;
  const totalDeposits = Number(fields.total_deposits ?? fields.totalDeposits ?? 0);
  const totalShares = Number(fields.total_shares ?? fields.totalShares ?? 0);
  if (totalShares === 0) return 1_000_000_000; // 1 SUI per share for first depositor
  return totalDeposits / totalShares;
}

export default function DepositPage() {
  const account = useCurrentAccount();
  const [poolId, setPoolId] = useState('');
  const [loadedPoolId, setLoadedPoolId] = useState<string | undefined>(undefined);
  const [amountSui, setAmountSui] = useState('');
  const [successDigest, setSuccessDigest] = useState<string | null>(null);

  const { data: poolData, isLoading: poolLoading } = useRiskPoolDetail(loadedPoolId);
  const { execute, isPending, error } = useDeposit();

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to deposit.</p>
        <ConnectButton />
      </div>
    );
  }

  const sharePrice = poolData ? computeSharePrice(poolData) : 0;
  const amountFloat = parseFloat(amountSui) || 0;
  const amountMist = BigInt(Math.floor(amountFloat * 1_000_000_000));
  const estimatedShares =
    sharePrice > 0 && amountFloat > 0
      ? ((amountFloat * 1_000_000_000) / sharePrice).toFixed(4)
      : '—';

  const canDeposit =
    !!loadedPoolId && amountFloat > 0 && amountMist > 0n && !isPending;

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!canDeposit || !loadedPoolId) return;
    try {
      const digest = await execute({ poolId: loadedPoolId, amountMist });
      if (digest) setSuccessDigest(digest);
    } catch {
      // error captured by hook
    }
  }

  if (successDigest) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 px-4">
        <div className="bg-gray-900 border border-orange-500 rounded-xl p-8 max-w-lg w-full text-center">
          <div className="text-orange-400 text-4xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-white mb-2">Deposit Successful</h2>
          <p className="text-gray-400 text-sm mb-4">Your SUI has been deposited into the pool.</p>
          <div className="bg-gray-800 rounded-lg p-3 mb-6">
            <p className="text-xs text-gray-500 mb-1">Transaction Digest</p>
            <p className="text-orange-400 font-mono text-xs break-all">{successDigest}</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              to="/pool"
              className="block bg-orange-500 hover:bg-orange-400 text-black font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Back to Pool Dashboard
            </Link>
            <button
              onClick={() => {
                setSuccessDigest(null);
                setAmountSui('');
              }}
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Deposit More
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/pool" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Pool Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">Deposit SUI</h1>
        <p className="text-gray-500 text-sm mb-8">
          Provide liquidity to the risk pool and earn LP shares.
        </p>

        <form onSubmit={handleDeposit} className="flex flex-col gap-6">
          {/* Pool ID */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 1 — Pool ID
            </h2>
            <label className="block text-gray-400 text-xs mb-1">Risk Pool Object ID</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500 placeholder-gray-600"
              />
              <button
                type="button"
                onClick={() => setLoadedPoolId(poolId.trim() || undefined)}
                disabled={!poolId.trim()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-3 py-2 rounded-lg transition-colors"
              >
                Load
              </button>
            </div>

            {loadedPoolId && (
              <div className="mt-3">
                {poolLoading ? (
                  <p className="text-gray-500 text-xs">Loading pool...</p>
                ) : poolData ? (
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mt-2">
                    {(() => {
                      const f = parsePoolFields(poolData);
                      const totalDeposits = Number(f?.total_deposits ?? f?.totalDeposits ?? 0);
                      const totalShares = Number(f?.total_shares ?? f?.totalShares ?? 0);
                      return (
                        <>
                          <span>TVL:</span>
                          <span className="text-white text-right">
                            {(totalDeposits / 1_000_000_000).toFixed(4)} SUI
                          </span>
                          <span>Total Shares:</span>
                          <span className="text-white text-right">{totalShares.toLocaleString()}</span>
                          <span>Share Price:</span>
                          <span className="text-orange-400 text-right">
                            {(sharePrice / 1_000_000_000).toFixed(6)} SUI/share
                          </span>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-red-400 text-xs mt-2">Pool not found.</p>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
              Step 2 — Amount
            </h2>
            <label className="block text-gray-400 text-xs mb-1">Amount (SUI)</label>
            <input
              type="number"
              value={amountSui}
              onChange={(e) => setAmountSui(e.target.value)}
              placeholder="0.0000"
              min="0"
              step="0.0001"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
            />
            <p className="text-gray-600 text-xs mt-1">
              = {amountMist.toLocaleString()} MIST
            </p>

            {loadedPoolId && poolData && amountFloat > 0 && (
              <div className="mt-3 bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">Estimated LP Shares to Receive</p>
                <p className="text-orange-400 font-bold text-lg">{estimatedShares}</p>
              </div>
            )}
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
            disabled={!canDeposit}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-bold py-3 px-6 rounded-xl transition-colors text-sm"
          >
            {isPending ? 'Confirming...' : 'Confirm Deposit'}
          </button>

          <p className="text-gray-600 text-xs text-center">
            LP shares represent your proportional ownership of the pool. Share value may change as claims are paid.
          </p>
        </form>
      </div>
    </div>
  );
}
