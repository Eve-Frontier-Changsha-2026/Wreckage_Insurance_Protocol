// frontend/src/components/policy/RiderToggle.tsx
import { mistToSuiDisplay, type PoolConfigFields } from '../../lib/poolConfigParser';

interface RiderToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
  coverageMist: bigint;
  poolConfig: PoolConfigFields | null;
}

export default function RiderToggle({ enabled, onChange, coverageMist, poolConfig }: RiderToggleProps) {
  const sdPremium = poolConfig
    ? coverageMist * BigInt(poolConfig.self_destruct_premium_rate) / 10000n
    : 0n;
  const sdPayoutEst = poolConfig
    ? coverageMist * BigInt(10000 - poolConfig.deductible_bps) / 10000n * BigInt(poolConfig.self_destruct_payout_rate) / 10000n
    : 0n;
  const waitingDays = poolConfig ? Math.floor(poolConfig.self_destruct_waiting_period / 86400) : 7;

  return (
    <div
      className={`bg-gray-950 rounded-xl p-4 border transition-all ${
        enabled ? 'border-orange-500 bg-orange-500/5' : 'border-gray-800'
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-100">Add Self-Destruct Coverage</div>
          <div className="text-xs text-gray-500 mt-1 leading-relaxed">
            Covers intentional self-destruct. Reduced payout ({poolConfig ? poolConfig.self_destruct_payout_rate / 100 : 50}% base). {waitingDays}-day waiting period.
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(!enabled)}
          className={`flex-shrink-0 w-[42px] h-6 rounded-full relative transition-colors ${
            enabled ? 'bg-orange-500' : 'bg-gray-700'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white absolute top-0.5 left-0.5 transition-transform ${
              enabled ? 'translate-x-[18px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {poolConfig && (
        <div className="mt-3 bg-gray-900 rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Additional premium</span>
            <span className="text-yellow-400 font-medium">
              +{mistToSuiDisplay(sdPremium)} SUI ({poolConfig.self_destruct_premium_rate / 100}%)
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Waiting period</span>
            <span className="text-gray-200">{waitingDays} days</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Est. max payout</span>
            <span className="text-gray-200">~{mistToSuiDisplay(sdPayoutEst)} SUI</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Formula</span>
            <span className="text-gray-600">cov * decay * (1-ded) * {poolConfig.self_destruct_payout_rate / 100}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
