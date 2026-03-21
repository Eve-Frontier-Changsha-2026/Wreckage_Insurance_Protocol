import type { RiskTier } from '../../lib/types';
import { TIER_NAMES } from '../../lib/types';

const TIER_BADGE: Record<number, string> = {
  0: 'bg-green-500/20 text-green-400 border-green-500/40',
  1: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  2: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  expired: 'bg-gray-500/20 text-gray-400',
  claimed: 'bg-blue-500/20 text-blue-400',
};

function mistToSui(mist: number): string {
  return (mist / 1_000_000_000).toFixed(4);
}

/** Safely extract fields from a gRPC object's content */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFields(obj: any): Record<string, any> | null {
  try {
    return obj?.content?.fields ?? null;
  } catch {
    return null;
  }
}

interface PolicyCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  policy: any; // raw gRPC object
  onClick?: () => void;
}

export default function PolicyCard({ policy, onClick }: PolicyCardProps) {
  const fields = extractFields(policy);
  const objectId: string = policy?.objectId ?? policy?.id ?? 'unknown';

  if (!fields) {
    return (
      <div
        onClick={onClick}
        className="border border-gray-800 rounded-xl bg-gray-900 p-4 cursor-pointer hover:border-gray-700 transition-colors"
      >
        <p className="text-xs text-gray-500 font-mono truncate">{objectId}</p>
        <p className="text-xs text-gray-600 mt-1">No content available</p>
      </div>
    );
  }

  const tier = Number(fields.tier ?? 0) as RiskTier;
  const coverage = Number(fields.coverage_amount ?? fields.coverageAmount ?? 0);
  const ncbStreak = Number(fields.ncb_streak ?? fields.ncbStreak ?? 0);
  const hasSdRider = Boolean(fields.has_self_destruct_rider ?? fields.hasSelfDestructRider ?? false);
  const rawStatus = String(fields.status ?? 'active');
  const status = rawStatus.toLowerCase().includes('active')
    ? 'active'
    : rawStatus.toLowerCase().includes('claim')
    ? 'claimed'
    : 'expired';

  return (
    <div
      onClick={onClick}
      className={`border rounded-xl bg-gray-900 p-4 transition-all ${
        onClick ? 'cursor-pointer hover:border-orange-500/40 hover:bg-gray-800/60' : ''
      } border-gray-800`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TIER_BADGE[tier] ?? TIER_BADGE[0]}`}>
          {TIER_NAMES[tier] ?? `Tier ${tier}`}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[status] ?? STATUS_BADGE['expired']}`}>
          {status.toUpperCase()}
        </span>
      </div>

      {/* Coverage */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-0.5">Coverage</p>
        <p className="text-lg font-bold text-gray-100 font-mono">{mistToSui(coverage)} SUI</p>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>
          NCB{' '}
          <span className={`font-semibold ${ncbStreak > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
            {ncbStreak}
          </span>
        </span>
        {hasSdRider && (
          <span className="flex items-center gap-1 text-purple-400">
            <span>SD Rider</span>
          </span>
        )}
      </div>

      {/* Object ID */}
      <p className="mt-2 text-xs text-gray-600 font-mono truncate">{objectId}</p>
    </div>
  );
}
