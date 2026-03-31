// frontend/src/components/policy/RiskTierSelector.tsx
import type { RiskTier } from '../../lib/types';
import { TIER_NAMES } from '../../lib/types';
import type { PoolConfigFields } from '../../lib/poolConfigParser';

const TIER_COLORS: Record<number, string> = {
  0: 'text-green-400',
  1: 'text-yellow-400',
  2: 'text-red-400',
};

interface RiskTierSelectorProps {
  value: RiskTier;
  onChange: (tier: RiskTier) => void;
  poolConfigs: PoolConfigFields[];
}

function mistToSui(mist: number): string {
  return (mist / 1_000_000_000).toFixed(0);
}

export default function RiskTierSelector({ value, onChange, poolConfigs }: RiskTierSelectorProps) {
  const tiers: RiskTier[] = [0, 1, 2];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiers.map((tier) => {
        const config = poolConfigs.find((c) => c.risk_tier === tier);
        const isSelected = value === tier;
        const color = TIER_COLORS[tier] ?? 'text-gray-400';

        return (
          <button
            key={tier}
            type="button"
            onClick={() => onChange(tier)}
            className={`relative flex flex-col items-center bg-gray-950 rounded-xl p-5 border transition-all cursor-pointer ${
              isSelected
                ? 'border-orange-500 bg-orange-500/5'
                : 'border-gray-800 hover:border-gray-700 hover:bg-gray-900'
            }`}
          >
            {/* Top: rate */}
            <div className="text-center pb-4 w-full">
              <div className={`text-[10px] font-bold uppercase tracking-[1.5px] ${color}`}>
                Tier {tier}
              </div>
              <div className="text-[15px] font-bold text-gray-100 mt-1">
                {TIER_NAMES[tier] ?? `Tier ${tier}`}
              </div>
              <div className={`text-[28px] font-extrabold font-mono leading-none mt-2 ${color}`}>
                {config ? `${(config.base_premium_rate / 100).toFixed(0)}%` : '--'}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">premium rate</div>
            </div>

            {/* Stats */}
            {config && (
              <div className="w-full border-t border-gray-800 pt-3 flex flex-col gap-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Coverage</span>
                  <span className="text-gray-300">{mistToSui(config.min_coverage)} ~ {mistToSui(config.max_coverage)} SUI</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Deductible</span>
                  <span className="text-gray-300">{config.deductible_bps / 100}%</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">SD Rider</span>
                  <span className="text-gray-300">+{config.self_destruct_premium_rate / 100}%</span>
                </div>
              </div>
            )}

            {!config && (
              <div className="w-full border-t border-gray-800 pt-3">
                <p className="text-gray-600 text-[11px] text-center italic">Not configured</p>
              </div>
            )}

            {isSelected && (
              <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 bg-orange-500 text-black text-[9px] font-bold px-2.5 py-0.5 rounded-full">
                Selected
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
