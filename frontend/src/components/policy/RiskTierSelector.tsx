import type { RiskTier } from '../../lib/types';
import { TIER_NAMES } from '../../lib/types';

const TIER_RATES: Record<RiskTier, { bps: number; label: string; color: string; desc: string }> = {
  0: { bps: 500, label: '5.00%', color: 'text-green-400', desc: 'Standard coverage, lowest premium' },
  1: { bps: 800, label: '8.00%', color: 'text-yellow-400', desc: 'Enhanced coverage, moderate premium' },
  2: { bps: 1200, label: '12.00%', color: 'text-red-400', desc: 'Full coverage, highest premium' },
};

interface RiskTierSelectorProps {
  value: RiskTier;
  onChange: (tier: RiskTier) => void;
}

export default function RiskTierSelector({ value, onChange }: RiskTierSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {([0, 1, 2] as RiskTier[]).map((tier) => {
        const info = TIER_RATES[tier];
        const isSelected = value === tier;
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onChange(tier)}
            className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-all text-left ${
              isSelected
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800'
            }`}
          >
            <span className={`text-xs font-semibold uppercase tracking-wide ${info.color}`}>
              Tier {tier}
            </span>
            <span className="text-sm font-bold text-gray-100">{TIER_NAMES[tier]}</span>
            <span className={`text-lg font-mono font-bold ${info.color}`}>{info.label}</span>
            <span className="text-xs text-gray-500 text-center leading-snug">{info.desc}</span>
            {isSelected && (
              <span className="mt-1 text-xs text-orange-400 font-medium">Selected</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { TIER_RATES };
