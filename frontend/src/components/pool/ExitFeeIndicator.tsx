interface ExitFeeIndicatorProps {
  utilizationPct: number;
}

export default function ExitFeeIndicator({ utilizationPct: pct }: ExitFeeIndicatorProps) {
  const isLow = pct < 50;
  const isMid = pct >= 50 && pct <= 80;

  const color = isLow ? 'text-green-400' : isMid ? 'text-yellow-400' : 'text-red-400';
  const barColor = isLow ? 'bg-green-500' : isMid ? 'bg-yellow-500' : 'bg-red-500';
  const label = isLow ? 'Low' : isMid ? 'Moderate' : 'High';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-gray-400 text-xs uppercase tracking-wider">Exit Fee Risk</p>
        <span className={`text-sm font-bold ${color}`}>{label} ({pct.toFixed(1)}%)</span>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <p className="text-gray-500 text-xs">
        Exit fee increases with pool utilization. Current utilization: {pct.toFixed(1)}%.
        {pct > 80 && (
          <span className="text-red-400 ml-1">High utilization — expect elevated exit fees.</span>
        )}
        {pct >= 50 && pct <= 80 && (
          <span className="text-yellow-400 ml-1">Moderate utilization — some exit fees apply.</span>
        )}
        {pct < 50 && (
          <span className="text-green-400 ml-1">Low utilization — minimal exit fees.</span>
        )}
      </p>
    </div>
  );
}
