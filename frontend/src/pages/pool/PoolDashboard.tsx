import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit-react';
import { useRiskPoolDetail, useOwnedLPPositions } from '../../hooks/useRiskPool';
import PoolStats from '../../components/pool/PoolStats';
import LPPositionCard from '../../components/pool/LPPositionCard';

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
  if (totalShares === 0) return 0;
  return totalDeposits / totalShares;
}

export default function PoolDashboard() {
  const account = useCurrentAccount();
  const [poolIdInput, setPoolIdInput] = useState('');
  const [loadedPoolId, setLoadedPoolId] = useState<string | undefined>(undefined);

  const { data: poolData, isLoading: poolLoading } = useRiskPoolDetail(loadedPoolId);
  const { data: positions, isLoading: positionsLoading } = useOwnedLPPositions();

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to view the LP pool.</p>
        <ConnectButton />
      </div>
    );
  }

  const sharePrice = poolData ? computeSharePrice(poolData) : 0;

  const myPositions = positions?.filter((pos) => {
    if (!loadedPoolId) return true;
    const o = pos as Record<string, unknown>;
    const content = o?.content as Record<string, unknown> | undefined;
    const fields = content?.fields as Record<string, unknown> | undefined;
    const pid = (fields?.pool_id ?? fields?.poolId) as string | undefined;
    return pid === loadedPoolId;
  }) ?? [];

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-white">LP Pool Dashboard</h1>
          <div className="flex gap-3">
            <Link
              to="/pool/deposit"
              className="bg-orange-500 hover:bg-orange-400 text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Deposit
            </Link>
            <Link
              to="/pool/withdraw"
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors border border-gray-700"
            >
              Withdraw
            </Link>
          </div>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          View pool statistics and manage your LP positions.
        </p>

        {/* Pool ID Loader */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
            Load Pool
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={poolIdInput}
              onChange={(e) => setPoolIdInput(e.target.value)}
              placeholder="Paste pool object ID (0x...)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500 placeholder-gray-600"
            />
            <button
              onClick={() => setLoadedPoolId(poolIdInput.trim() || undefined)}
              disabled={!poolIdInput.trim()}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Load Pool
            </button>
          </div>
        </div>

        {/* Pool Stats */}
        {loadedPoolId && (
          <div className="mb-8">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3">
              Pool Statistics
            </h2>
            {poolLoading ? (
              <p className="text-gray-500 text-sm">Loading pool data...</p>
            ) : poolData ? (
              <PoolStats pool={poolData} />
            ) : (
              <p className="text-gray-500 text-sm">Pool not found or failed to load.</p>
            )}
          </div>
        )}

        {/* My Positions */}
        <div>
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3">
            My LP Positions
            {loadedPoolId && <span className="text-gray-500 font-normal ml-2 text-xs">(filtered by loaded pool)</span>}
          </h2>

          {positionsLoading ? (
            <p className="text-gray-500 text-sm">Loading positions...</p>
          ) : myPositions.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <p className="text-gray-500 text-sm mb-3">No LP positions found.</p>
              <Link
                to="/pool/deposit"
                className="text-orange-400 hover:text-orange-300 text-sm underline"
              >
                Deposit to get started
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {myPositions.map((pos) => {
                const o = pos as Record<string, unknown>;
                const posId = (o.objectId as string) ?? Math.random().toString();
                return (
                  <LPPositionCard
                    key={posId}
                    position={pos}
                    sharePrice={sharePrice}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
