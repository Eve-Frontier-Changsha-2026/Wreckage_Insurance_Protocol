import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuctionRegistry, useAuctionDetail } from '../../hooks/useAuction';
import AuctionCard from '../../components/auction/AuctionCard';

function parseAuction(obj: unknown) {
  const o = obj as { objectId?: string; content?: { fields?: Record<string, unknown> } };
  const f = o?.content?.fields;
  if (!f) return null;
  return {
    id: String(o.objectId ?? ''),
    salvageNftId: String(f.salvage_nft_id ?? ''),
    startingPrice: Number(f.starting_price ?? 0),
    highestBid: Number(f.highest_bid ?? 0),
    highestBidder: f.highest_bidder ? String(f.highest_bidder) : null,
    startsAt: Number(f.starts_at ?? 0),
    endsAt: Number(f.ends_at ?? 0),
    status: String(f.status ?? 'bidding') as 'bidding' | 'buyout' | 'settled' | 'unsold',
  };
}

function AuctionCardLoader({ auctionId, onClick }: { auctionId: string; onClick: () => void }) {
  const { data, isLoading } = useAuctionDetail(auctionId);
  const auction = data ? parseAuction(data) : null;

  if (isLoading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse h-36" />
    );
  }
  if (!auction) {
    return (
      <div className="bg-gray-900 border border-red-900 rounded-lg p-4 text-red-400 text-sm">
        Failed to load {auctionId.slice(0, 10)}...
      </div>
    );
  }
  return <AuctionCard auction={auction} onClick={onClick} />;
}

export default function AuctionListPage() {
  const navigate = useNavigate();
  const { data: registryObj, isLoading: registryLoading } = useAuctionRegistry();
  const [inputId, setInputId] = useState('');
  const [manualIds, setManualIds] = useState<string[]>([]);

  const registryFields = (registryObj as { content?: { fields?: Record<string, unknown> } } | undefined)
    ?.content?.fields;
  const activeFromRegistry: string[] = Array.isArray(registryFields?.active_auctions)
    ? (registryFields!.active_auctions as unknown[]).map(String)
    : [];

  const allIds = Array.from(new Set([...activeFromRegistry, ...manualIds]));

  function addManualId() {
    const id = inputId.trim();
    if (!id || manualIds.includes(id)) return;
    setManualIds((prev) => [...prev, id]);
    setInputId('');
  }

  function removeManual(id: string) {
    setManualIds((prev) => prev.filter((x) => x !== id));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Salvage Auctions</h1>
        <p className="text-gray-400 text-sm">Bid on recovered wreckage from destroyed ships</p>
      </div>

      {/* Registry status */}
      <div className="mb-6 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-300">Auction Registry</span>
          {registryLoading && (
            <span className="text-xs text-gray-500 animate-pulse">Loading...</span>
          )}
          {activeFromRegistry.length > 0 && (
            <span className="text-xs bg-orange-900 text-orange-300 border border-orange-700 px-2 py-0.5 rounded-full">
              {activeFromRegistry.length} active
            </span>
          )}
        </div>

        {/* Manual ID input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManualId()}
            placeholder="Paste auction object ID (0x...)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-orange-500 focus:outline-none"
          />
          <button
            onClick={addManualId}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded transition-colors"
          >
            Add
          </button>
        </div>

        {manualIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {manualIds.map((id) => (
              <span
                key={id}
                className="flex items-center gap-1 text-xs font-mono bg-gray-800 text-gray-300 border border-gray-700 px-2 py-1 rounded"
              >
                {id.slice(0, 10)}...
                <button
                  onClick={() => removeManual(id)}
                  className="text-gray-500 hover:text-red-400 ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Auction grid */}
      {allIds.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No auctions found. Paste an auction ID above to view it.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allIds.map((id) => (
            <AuctionCardLoader
              key={id}
              auctionId={id}
              onClick={() => navigate(`/salvage/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
