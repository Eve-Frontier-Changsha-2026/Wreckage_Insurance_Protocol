import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';
import { useRiskPoolDetail, useOwnedLPPositions, useWithdraw } from '../../hooks/useRiskPool';
import ExitFeeIndicator from '../../components/pool/ExitFeeIndicator';

function parsePoolFields(pool: unknown) {
  const o = pool as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function parsePosFields(position: unknown) {
  const o = position as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function computeSharePrice(pool: unknown): number {
  const fields = parsePoolFields(pool);
  if (!fields) return 0;
  const totalDeposits = Number(fields.total_deposits ?? fields.totalDeposits ?? 0);
  const totalShares = Number(fields.total_shares ?? fields.totalShares ?? 0);
  if (totalShares === 0) return 0;
  return totalDeposits / totalShares;
}

function computeUtilization(pool: unknown): number {
  const fields = parsePoolFields(pool);
  if (!fields) return 0;
  const totalDeposits = Number(fields.total_deposits ?? fields.totalDeposits ?? 0);
  const reservedAmount = Number(fields.reserved_amount ?? fields.reservedAmount ?? 0);
  if (totalDeposits === 0) return 0;
  return (reservedAmount / totalDeposits) * 100;
}

function truncate(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

export default function WithdrawPage() {
  const account = useCurrentAccount();
  const [poolId, setPoolId] = useState('');
  const [loadedPoolId, setLoadedPoolId] = useState<string | undefined>(undefined);
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [sharesToBurnInput, setSharesToBurnInput] = useState('');
  const [successDigest, setSuccessDigest] = useState<string | null>(null);

  const { data: poolData, isLoading: poolLoading } = useRiskPoolDetail(loadedPoolId);
  const { data: allPositions, isLoading: positionsLoading } = useOwnedLPPositions();
  const { execute, isPending, error } = useWithdraw();

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to withdraw.</p>
        <ConnectButton />
      </div>
    );
  }

  // Filter positions by loaded pool
  const poolPositions = loadedPoolId
    ? (allPositions ?? []).filter((pos) => {
        const f = parsePosFields(pos);
        const pid = (f?.pool_id ?? f?.poolId) as string | undefined;
        return pid === loadedPoolId;
      })
    : [];

  const selectedPos = poolPositions.find((pos) => {
    const o = pos as Record<string, unknown>;
    return (o.objectId as string) === selectedPositionId;
  });
  const selectedFields = selectedPos ? parsePosFields(selectedPos) : null;
  const maxShares = Number(selectedFields?.shares ?? 0);

  const sharesToBurn = parseInt(sharesToBurnInput) || 0;
  const sharePrice = poolData ? computeSharePrice(poolData) : 0;
  const utilizationPct = poolData ? computeUtilization(poolData) : 0;
  const estimatedSui =
    sharePrice > 0 && sharesToBurn > 0
      ? ((sharesToBurn * sharePrice) / 1_000_000_000).toFixed(4)
      : '—';

  const canWithdraw =
    !!loadedPoolId &&
    !!selectedPositionId &&
    sharesToBurn > 0 &&
    sharesToBurn <= maxShares &&
    !isPending;

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!canWithdraw || !loadedPoolId) return;
    try {
      const digest = await execute({
        poolId: loadedPoolId,
        positionId: selectedPositionId,
        sharesToBurn: BigInt(sharesToBurn),
      });
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
          <h2 className="text-xl font-bold text-white mb-2">Withdrawal Successful</h2>
          <p className="text-gray-400 text-sm mb-4">Your SUI has been returned from the pool.</p>
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
                setSelectedPositionId('');
                setSharesToBurnInput('');
              }}
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Withdraw More
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
        <h1 className="text-2xl font-bold text-white mb-1">Withdraw SUI</h1>
        <p className="text-gray-500 text-sm mb-8">
          Burn LP shares to withdraw your proportional share of the pool.
        </p>

        <form onSubmit={handleWithdraw} className="flex flex-col gap-6">
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
                onClick={() => {
                  setLoadedPoolId(poolId.trim() || undefined);
                  setSelectedPositionId('');
                }}
                disabled={!poolId.trim()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-3 py-2 rounded-lg transition-colors"
              >
                Load
              </button>
            </div>
            {loadedPoolId && poolLoading && (
              <p className="text-gray-500 text-xs mt-2">Loading pool...</p>
            )}
          </div>

          {/* Select Position */}
          {loadedPoolId && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
                Step 2 — Select Position
              </h2>

              {positionsLoading ? (
                <p className="text-gray-500 text-sm">Loading positions...</p>
              ) : poolPositions.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No LP positions found for this pool.
                </p>
              ) : (
                <select
                  value={selectedPositionId}
                  onChange={(e) => {
                    setSelectedPositionId(e.target.value);
                    setSharesToBurnInput('');
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                >
                  <option value="">— Select a position —</option>
                  {poolPositions.map((pos) => {
                    const o = pos as Record<string, unknown>;
                    const id = o.objectId as string;
                    const f = parsePosFields(pos);
                    const shares = Number(f?.shares ?? 0);
                    return (
                      <option key={id} value={id}>
                        {truncate(id)} — {shares.toLocaleString()} shares
                      </option>
                    );
                  })}
                </select>
              )}

              {selectedFields && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <span>Available Shares:</span>
                  <span className="text-white text-right">{maxShares.toLocaleString()}</span>
                  <span>Deposit Amount:</span>
                  <span className="text-white text-right">
                    {(Number(selectedFields.deposit_amount ?? selectedFields.depositAmount ?? 0) / 1_000_000_000).toFixed(4)} SUI
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Shares to Burn */}
          {selectedPositionId && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
                Step 3 — Shares to Burn
              </h2>
              <div className="flex gap-3 mb-2">
                <input
                  type="number"
                  value={sharesToBurnInput}
                  onChange={(e) => setSharesToBurnInput(e.target.value)}
                  placeholder="0"
                  min="1"
                  max={maxShares}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
                />
                <button
                  type="button"
                  onClick={() => setSharesToBurnInput(String(maxShares))}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-2 rounded-lg transition-colors"
                >
                  Max
                </button>
              </div>
              {sharesToBurn > maxShares && (
                <p className="text-red-400 text-xs mb-2">
                  Cannot exceed {maxShares.toLocaleString()} shares.
                </p>
              )}

              {sharePrice > 0 && sharesToBurn > 0 && sharesToBurn <= maxShares && (
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Estimated SUI to Receive</p>
                  <p className="text-orange-400 font-bold text-lg">{estimatedSui} SUI</p>
                  <p className="text-gray-600 text-xs mt-0.5">Before exit fees</p>
                </div>
              )}
            </div>
          )}

          {/* Exit Fee Indicator */}
          {loadedPoolId && poolData && (
            <ExitFeeIndicator utilizationPct={utilizationPct} />
          )}

          {/* Early withdrawal notice */}
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl p-4">
            <p className="text-yellow-400 text-xs font-semibold mb-1">Exit Fee Notice</p>
            <p className="text-gray-400 text-xs">
              Early withdrawal may incur exit fees (dynamic based on pool utilization). Higher pool
              utilization results in higher exit fees to protect remaining LPs.
            </p>
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
            disabled={!canWithdraw}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-bold py-3 px-6 rounded-xl transition-colors text-sm"
          >
            {isPending ? 'Confirming...' : 'Confirm Withdrawal'}
          </button>

          <p className="text-gray-600 text-xs text-center">
            Withdrawal burns your LP shares in exchange for the underlying SUI, minus any applicable exit fees.
          </p>
        </form>
      </div>
    </div>
  );
}
