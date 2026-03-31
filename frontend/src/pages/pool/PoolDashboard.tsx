import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react';
import { useRiskPoolDetail, useOwnedLPPositions, useRiskPoolsBatch } from '../../hooks/useRiskPool';
import PoolSelector from '../../components/pool/PoolSelector';
import PoolStats from '../../components/pool/PoolStats';
import PoolGroupCard, { parsePosFields, getPosId, type PoolGroup } from '../../components/pool/LPPositionCard';

function parsePoolFields(pool: unknown) {
  const o = pool as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function computeSharePrice(pool: unknown): number {
  const fields = parsePoolFields(pool);
  if (!fields) return 0;
  const rawLiquidity = fields.total_liquidity;
  const totalLiquidity = Number(
    typeof rawLiquidity === 'object' && rawLiquidity !== null
      ? (rawLiquidity as Record<string, unknown>).value ?? (rawLiquidity as Record<string, unknown>).fields?.value ?? 0
      : rawLiquidity ?? 0,
  );
  const totalShares = Number(fields.total_shares ?? fields.totalShares ?? 0);
  if (totalShares === 0) return 0;
  return totalLiquidity / totalShares;
}

export default function PoolDashboard() {
  const account = useCurrentAccount();
  const [poolIdInput, setPoolIdInput] = useState('');
  const [loadedPoolId, setLoadedPoolId] = useState<string | undefined>(undefined);

  const { data: poolData, isLoading: poolLoading } = useRiskPoolDetail(loadedPoolId);
  const { data: positions, isLoading: positionsLoading } = useOwnedLPPositions();

  // Collect unique pool IDs from positions for per-pool sharePrice
  const uniquePoolIds = Array.from(
    new Set(
      (positions ?? [])
        .map((pos) => {
          const fields = parsePosFields(pos);
          return String(fields?.pool_id ?? '');
        })
        .filter((id) => id.length > 2),
    ),
  );
  const { data: poolsMap } = useRiskPoolsBatch(uniquePoolIds);

  // Per-pool sharePrice lookup
  const sharePriceByPool = (poolId: string): number => {
    const pool = poolsMap?.[poolId];
    return pool ? computeSharePrice(pool) : 0;
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to view the LP pool.</p>
        <ConnectButton />
      </div>
    );
  }

  const myPositions = positions?.filter((pos) => {
    if (!loadedPoolId) return true;
    const fields = parsePosFields(pos);
    const pid = (fields?.pool_id ?? fields?.poolId) as string | undefined;
    return pid === loadedPoolId;
  }) ?? [];

  // Group positions by tier
  const poolGroups: PoolGroup[] = (() => {
    const map = new Map<number, PoolGroup>();
    for (const pos of myPositions) {
      const fields = parsePosFields(pos);
      if (!fields) continue;
      const tier = Number(fields.pool_risk_tier ?? -1);
      const poolId = String(fields.pool_id ?? '');
      const shares = Number(fields.shares ?? 0);
      const deposit = Number(fields.initial_deposit ?? 0);
      const sp = sharePriceByPool(poolId);
      const estValue = sp > 0 ? shares * sp : 0;
      const existing = map.get(tier);
      if (existing) {
        existing.positions.push(pos);
        existing.totalShares += shares;
        existing.totalDeposit += deposit;
        existing.totalEstValue += estValue;
        existing.count += 1;
      } else {
        map.set(tier, { tier, poolId, positions: [pos], totalShares: shares, totalDeposit: deposit, totalEstValue: estValue, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.tier - b.tier);
  })();

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

        {/* Pool Selector */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-orange-400 font-semibold text-sm uppercase tracking-wider mb-4">
            Select Pool
          </h2>
          <PoolSelector
            value={loadedPoolId}
            onChange={(id) => {
              setPoolIdInput(id);
              setLoadedPoolId(id);
            }}
          />
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
          ) : poolGroups.length === 0 ? (
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
              {poolGroups.map((group) => (
                <PoolGroupCard key={group.tier} group={group} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
