import { useState } from 'react';
import { useDiscoverPools, TIER_LABELS } from '../../hooks/useDiscoverPools';
import { isValidObjectId } from '../../lib/validation';

interface PoolSelectorProps {
  value: string | undefined;
  onChange: (poolId: string) => void;
  /** Optional: only show pools matching this tier */
  filterTier?: number;
  label?: string;
}

function truncateId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export default function PoolSelector({
  value,
  onChange,
  filterTier,
  label = 'Select Pool',
}: PoolSelectorProps) {
  const { data: pools, isLoading, error } = useDiscoverPools();
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const filtered = pools?.filter(
    (p) => filterTier === undefined || p.riskTier === filterTier,
  );

  const hasDiscoveredPools = filtered && filtered.length > 0;

  // Manual fallback
  if (manualMode || (!isLoading && !hasDiscoveredPools)) {
    return (
      <div>
        <label className="block text-gray-400 text-xs mb-1">{label}</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Paste pool object ID (0x...)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500 placeholder-gray-600"
          />
          <button
            type="button"
            onClick={() => {
              const trimmed = manualInput.trim();
              if (trimmed && isValidObjectId(trimmed)) onChange(trimmed);
            }}
            disabled={!manualInput.trim() || !isValidObjectId(manualInput.trim())}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Load
          </button>
        </div>
        {hasDiscoveredPools && (
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-orange-400 hover:text-orange-300 text-xs mt-2 underline"
          >
            Back to pool list
          </button>
        )}
        {!isLoading && !hasDiscoveredPools && error && (
          <p className="text-gray-500 text-xs mt-1">
            Could not auto-discover pools. Enter a Pool ID manually.
          </p>
        )}
        {!isLoading && !hasDiscoveredPools && !error && (
          <p className="text-gray-500 text-xs mt-1">
            No pools found on-chain. Ask an admin to create one first.
          </p>
        )}
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div>
        <label className="block text-gray-400 text-xs mb-1">{label}</label>
        <p className="text-gray-500 text-sm">Discovering pools...</p>
      </div>
    );
  }

  // Dropdown
  return (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
      >
        <option value="" disabled>
          — Choose a pool —
        </option>
        {filtered!.map((pool) => (
          <option key={pool.poolId} value={pool.poolId}>
            Tier {pool.riskTier} — {TIER_LABELS[pool.riskTier] ?? `Tier ${pool.riskTier}`} ({truncateId(pool.poolId)})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setManualMode(true)}
        className="text-gray-500 hover:text-gray-400 text-xs mt-1 underline"
      >
        Or enter Pool ID manually
      </button>
    </div>
  );
}
