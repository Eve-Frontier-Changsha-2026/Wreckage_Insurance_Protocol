import { useState } from 'react';

const TIER_NAMES: Record<number, string> = { 0: 'Low Risk', 1: 'Medium Risk', 2: 'High Risk' };
const TIER_BORDER: Record<number, string> = { 0: 'border-green-800', 1: 'border-yellow-800', 2: 'border-red-800' };
const TIER_TEXT: Record<number, string> = { 0: 'text-green-400', 1: 'text-yellow-400', 2: 'text-red-400' };
const TIER_BG: Record<number, string> = { 0: 'bg-green-900/20', 1: 'bg-yellow-900/20', 2: 'bg-red-900/20' };

// === Helpers ===

export function parsePosFields(position: unknown) {
  const o = position as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

export function getPosId(position: unknown): string {
  return ((position as Record<string, unknown>).objectId as string) ?? '';
}

function truncate(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function mistToSui(mist: unknown): string {
  return (Number(mist ?? 0) / 1_000_000_000).toFixed(4);
}

// === Grouped Pool Card ===

export interface PoolGroup {
  tier: number;
  poolId: string;
  positions: unknown[];
  totalShares: number;
  totalDeposit: number;
  totalEstValue: number;
  count: number;
}

interface PoolGroupCardProps {
  group: PoolGroup;
}

export default function PoolGroupCard({ group }: PoolGroupCardProps) {
  const [open, setOpen] = useState(false);
  const tierName = TIER_NAMES[group.tier] ?? `Tier ${group.tier}`;
  const border = TIER_BORDER[group.tier] ?? 'border-gray-700';
  const text = TIER_TEXT[group.tier] ?? 'text-gray-400';
  const bg = TIER_BG[group.tier] ?? 'bg-gray-900/20';

  return (
    <div className={`bg-gray-900 border ${border} rounded-xl overflow-hidden`}>
      {/* Summary row — always visible */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors ${bg}`}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${border} ${text} ${bg}`}>
            Tier {group.tier}
          </span>
          <span className="text-gray-100 font-semibold text-sm">{tierName}</span>
          <span className="text-gray-600 text-xs">
            {group.count} deposit{group.count > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Deposited</p>
            <p className="text-white font-semibold text-sm">{mistToSui(group.totalDeposit)} SUI</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Est. Value</p>
            <p className="text-orange-400 font-semibold text-sm">
              {group.totalEstValue > 0 ? `${mistToSui(group.totalEstValue)} SUI` : '\u2014'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Shares</p>
            <p className="text-white font-semibold text-sm">{mistToSui(group.totalShares)}</p>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded: individual positions */}
      {open && (
        <div className="border-t border-gray-800">
          {group.positions.map((pos) => {
            const posId = getPosId(pos);
            const fields = parsePosFields(pos);
            if (!fields) return null;

            const shares = Number(fields.shares ?? 0);
            const deposit = Number(fields.initial_deposit ?? 0);
            const epoch = Number(fields.deposited_at ?? 0);
            const date = epoch > 1e9
              ? new Date(epoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : String(epoch);

            return (
              <div key={posId} className="px-5 py-3 border-b border-gray-800/50 last:border-b-0 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <p className="text-gray-600 text-xs font-mono w-[120px]">{truncate(posId)}</p>
                  <p className="text-gray-500 text-xs">{date}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-gray-500 text-xs mr-2">Shares</span>
                    <span className="text-white font-medium">{mistToSui(shares)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 text-xs mr-2">Deposit</span>
                    <span className="text-white font-medium">{mistToSui(deposit)} SUI</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
