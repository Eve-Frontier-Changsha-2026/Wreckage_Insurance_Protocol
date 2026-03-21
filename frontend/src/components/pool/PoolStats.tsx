interface PoolStatsProps {
  pool: unknown;
}

function parsePoolFields(pool: unknown) {
  const o = pool as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function mistToSui(mist: unknown): string {
  return (Number(mist ?? 0) / 1_000_000_000).toFixed(4);
}

export default function PoolStats({ pool }: PoolStatsProps) {
  const fields = parsePoolFields(pool);
  if (!fields) return null;

  const totalDeposits = Number(fields.total_deposits ?? fields.totalDeposits ?? 0);
  const totalShares = Number(fields.total_shares ?? fields.totalShares ?? 0);
  const reservedAmount = Number(fields.reserved_amount ?? fields.reservedAmount ?? 0);
  const tier = Number(fields.tier ?? 0) as 0 | 1 | 2;
  const isActive = fields.is_active ?? fields.isActive ?? true;
  const TIER_NAMES: Record<0 | 1 | 2, string> = { 0: 'Low Risk', 1: 'Medium Risk', 2: 'High Risk' };

  const utilizationPct =
    totalDeposits > 0 ? ((reservedAmount / totalDeposits) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">TVL</p>
        <p className="text-white font-bold text-lg">{mistToSui(totalDeposits)} SUI</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total Shares</p>
        <p className="text-white font-bold text-lg">{totalShares.toLocaleString()}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Reserved</p>
        <p className="text-white font-bold text-lg">{mistToSui(reservedAmount)} SUI</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Utilization</p>
        <p className="text-orange-400 font-bold text-lg">{utilizationPct}%</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Tier</p>
        <p className="text-white font-bold text-lg">{TIER_NAMES[tier] ?? `Tier ${tier}`}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Status</p>
        <span
          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
            isActive ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-red-900/50 text-red-400 border border-red-700'
          }`}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}
