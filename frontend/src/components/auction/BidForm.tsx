import { useState } from 'react';
import { usePlaceBid } from '../../hooks/useAuction';

interface Props {
  auctionId: string;
  currentHighestBid: number; // in MIST
  onSuccess?: () => void;
}

const SUI = 1_000_000_000n;

export default function BidForm({ auctionId, currentHighestBid, onSuccess }: Props) {
  const [bidSui, setBidSui] = useState('');
  const { execute, isPending, error } = usePlaceBid();

  const minBidSui = (currentHighestBid / 1_000_000_000) + 0.0001;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(bidSui);
    if (!bidSui || isNaN(amount)) return;

    const bidMist = BigInt(Math.floor(amount * 1_000_000_000));
    const minMist = BigInt(currentHighestBid) + 1n;

    if (bidMist < minMist) return;

    try {
      await execute({ auctionId, bidAmountMist: bidMist });
      setBidSui('');
      onSuccess?.();
    } catch {
      // error handled by hook
    }
  }

  const bidAmount = parseFloat(bidSui) || 0;
  const isValid = bidAmount > currentHighestBid / 1_000_000_000;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Bid Amount (SUI)
          <span className="ml-2 text-gray-500 text-xs">
            min: {minBidSui.toFixed(4)} SUI
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.0001"
            min={minBidSui}
            value={bidSui}
            onChange={(e) => setBidSui(e.target.value)}
            placeholder={`> ${minBidSui.toFixed(4)}`}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-orange-500 focus:outline-none"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !isValid}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded transition-colors"
          >
            {isPending ? 'Bidding...' : 'Place Bid'}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-red-400 text-xs bg-red-950 border border-red-800 rounded px-3 py-2">
          {error}
        </p>
      )}
    </form>
  );
}
