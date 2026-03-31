// frontend/src/components/policy/PremiumBreakdown.tsx
import { mistToSuiDisplay } from '../../lib/poolConfigParser';

interface PremiumBreakdownProps {
  basePremiumMist: bigint;
  sdPremiumMist: bigint;
  baseRateBps: number;
  sdRateBps: number;
  protocolFeeBps: number;
  coverageSui: string;
  includeSd: boolean;
}

export default function PremiumBreakdown({
  basePremiumMist,
  sdPremiumMist,
  baseRateBps,
  sdRateBps,
  protocolFeeBps,
  coverageSui,
  includeSd,
}: PremiumBreakdownProps) {
  const total = basePremiumMist + sdPremiumMist;
  const feeAmount = total * BigInt(protocolFeeBps) / 10000n;

  return (
    <div className="bg-gray-950 border border-orange-500 rounded-xl p-5">
      <div className="text-[11px] text-orange-400 font-bold uppercase tracking-widest mb-3">
        Premium Breakdown
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between text-gray-300">
          <span>Base ({(baseRateBps / 100).toFixed(0)}% of {coverageSui})</span>
          <span>{mistToSuiDisplay(basePremiumMist)} SUI</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>SD Rider {includeSd ? `(${(sdRateBps / 100).toFixed(0)}%)` : ''}</span>
          <span>{includeSd ? `${mistToSuiDisplay(sdPremiumMist)} SUI` : '--'}</span>
        </div>
        <div className="flex justify-between text-gray-600 text-xs">
          <span>Protocol Fee ({(protocolFeeBps / 100).toFixed(0)}% to treasury)</span>
          <span>-{mistToSuiDisplay(feeAmount)} SUI</span>
        </div>
        <div className="border-t border-gray-800 mt-2 pt-2 flex justify-between text-orange-400 font-bold text-base">
          <span>You Pay</span>
          <span>{mistToSuiDisplay(total)} SUI</span>
        </div>
      </div>
    </div>
  );
}
