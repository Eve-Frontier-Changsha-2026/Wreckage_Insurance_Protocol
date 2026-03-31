// frontend/src/components/policy/ClaimEstimate.tsx
import { calcClaimPayout, calcSdClaimPayout, mistToSuiDisplay, type PoolConfigFields } from '../../lib/poolConfigParser';

interface ClaimEstimateProps {
  coverageMist: bigint;
  poolConfig: PoolConfigFields;
  includeSd: boolean;
  maxClaims: number;
  cooldownHours: number;
}

const COLORS = ['text-green-400', 'text-yellow-400', 'text-red-400'];

export default function ClaimEstimate({
  coverageMist,
  poolConfig,
  includeSd,
  maxClaims,
  cooldownHours,
}: ClaimEstimateProps) {
  const claimsToShow = Math.min(3, maxClaims);

  return (
    <div className="bg-gray-950 rounded-xl p-5">
      <div className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-3">
        Estimated Claim Payouts
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {Array.from({ length: claimsToShow }, (_, i) => {
          const payout = calcClaimPayout(
            coverageMist,
            i,
            poolConfig.claim_decay_rate,
            poolConfig.deductible_bps,
          );
          return (
            <div key={i} className="text-gray-400 text-xs">
              {i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'} claim:{' '}
              <span className={`font-semibold ${COLORS[i] ?? 'text-gray-300'}`}>
                ~{mistToSuiDisplay(payout)} SUI
              </span>
              {i === 0 && <span className="text-gray-600 ml-1">(- {poolConfig.deductible_bps / 100}% deductible)</span>}
              {i > 0 && <span className="text-gray-600 ml-1">(+ {poolConfig.claim_decay_rate / 100}% decay)</span>}
            </div>
          );
        })}
        {includeSd && (
          <div className="text-gray-400 text-xs mt-1 pt-1 border-t border-gray-800">
            SD 1st claim:{' '}
            <span className="font-semibold text-yellow-400">
              ~{mistToSuiDisplay(calcSdClaimPayout(coverageMist, 0, poolConfig))} SUI
            </span>
            <span className="text-gray-600 ml-1">
              ({poolConfig.self_destruct_payout_rate / 100}% of base after {poolConfig.self_destruct_decay_multiplier}x decay)
            </span>
          </div>
        )}
      </div>
      <div className="text-gray-600 text-[11px] mt-2">
        Max {maxClaims} claims / policy. {cooldownHours}h cooldown between claims.
      </div>
    </div>
  );
}
