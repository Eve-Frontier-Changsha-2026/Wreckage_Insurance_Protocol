import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useAuctionDetail, useSettleAuction, useBuyout } from '../../hooks/useAuction';
import BidForm from '../../components/auction/BidForm';
import CountdownTimer from '../../components/auction/CountdownTimer';

function truncate(addr: string, chars = 8) {
  if (!addr || addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function mistToSui(mist: number) {
  return (mist / 1_000_000_000).toFixed(4);
}

const STATUS_STYLES: Record<string, string> = {
  bidding: 'bg-green-900 text-green-300 border border-green-700',
  buyout: 'bg-orange-900 text-orange-300 border border-orange-700',
  settled: 'bg-gray-800 text-gray-400 border border-gray-600',
  unsold: 'bg-red-900 text-red-300 border border-red-700',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-800">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-200 text-sm font-mono text-right max-w-xs break-all">{value}</span>
    </div>
  );
}

export default function AuctionDetailPage() {
  const { auctionId } = useParams<{ auctionId: string }>();
  const account = useCurrentAccount();
  const { data: auctionObj, isLoading } = useAuctionDetail(auctionId);
  const { execute: settle, isPending: isSettling } = useSettleAuction();
  const { execute: buyout, isPending: isBuyingOut, error: buyoutError } = useBuyout();

  const [poolId, setPoolId] = useState('');
  const [buyoutSui, setBuyoutSui] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  if (!auctionId) {
    return <div className="text-red-400 p-8">Invalid auction ID</div>;
  }

  if (!account) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Connect your wallet to view auction details</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-800 rounded" />
        ))}
      </div>
    );
  }

  const o = auctionObj as { objectId?: string; content?: { fields?: Record<string, unknown> } } | undefined;
  const f = o?.content?.fields;

  if (!f) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-red-400 bg-red-950 border border-red-800 rounded-lg p-4">
          Failed to load auction data
        </div>
      </div>
    );
  }

  const auction = {
    id: String(o?.objectId ?? auctionId),
    salvageNftId: String(f.salvage_nft_id ?? ''),
    startingPrice: Number(f.starting_price ?? 0),
    highestBid: Number(f.highest_bid ?? 0),
    highestBidder: f.highest_bidder ? String(f.highest_bidder) : null,
    startsAt: Number(f.starts_at ?? 0),
    endsAt: Number(f.ends_at ?? 0),
    status: String(f.status ?? 'bidding') as 'bidding' | 'buyout' | 'settled' | 'unsold',
    killmailId: String((f.salvage_nft as Record<string, unknown>)?.fields?.killmail_id ?? ''),
    estimatedValue: Number((f.salvage_nft as Record<string, unknown>)?.fields?.estimated_value ?? 0),
  };

  const isEnded = Date.now() > auction.endsAt;

  async function handleSettle() {
    if (!poolId.trim()) { setTxError('Pool ID required'); return; }
    setTxError(null);
    try {
      const digest = await settle({ auctionId: auction.id, poolId: poolId.trim() });
      setTxHash(digest ?? null);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : 'Settle failed');
    }
  }

  async function handleBuyout() {
    if (!poolId.trim()) { setTxError('Pool ID required'); return; }
    const amount = parseFloat(buyoutSui);
    if (!buyoutSui || isNaN(amount) || amount <= 0) { setTxError('Invalid buyout amount'); return; }
    setTxError(null);
    try {
      const paymentAmountMist = BigInt(Math.floor(amount * 1_000_000_000));
      const digest = await buyout({ auctionId: auction.id, poolId: poolId.trim(), paymentAmountMist });
      setTxHash(digest ?? null);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : 'Buyout failed');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back */}
      <Link to="/salvage" className="text-sm text-gray-500 hover:text-orange-400 mb-6 inline-block">
        ← Back to Auctions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Salvage Auction</h1>
          <p className="text-xs font-mono text-gray-500">{truncate(auction.id, 12)}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${STATUS_STYLES[auction.status] ?? ''}`}>
          {auction.status.toUpperCase()}
        </span>
      </div>

      {/* Details */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <Row label="Salvage NFT" value={truncate(auction.salvageNftId)} />
        <Row label="Starting Price" value={`${mistToSui(auction.startingPrice)} SUI`} />
        <Row
          label="Highest Bid"
          value={
            auction.highestBid > 0 ? (
              <span className="text-orange-400">{mistToSui(auction.highestBid)} SUI</span>
            ) : '—'
          }
        />
        {auction.highestBidder && (
          <Row label="Highest Bidder" value={truncate(auction.highestBidder)} />
        )}
        <Row
          label="Time Remaining"
          value={
            auction.status === 'settled' || auction.status === 'unsold'
              ? 'Ended'
              : <CountdownTimer endsAt={auction.endsAt} />
          }
        />
        {auction.estimatedValue > 0 && (
          <Row label="Est. Value" value={`${mistToSui(auction.estimatedValue)} SUI`} />
        )}
      </div>

      {/* Tx feedback */}
      {txHash && (
        <div className="mb-4 bg-green-950 border border-green-800 rounded-lg px-4 py-3 text-green-300 text-sm">
          Success! Tx: <span className="font-mono">{truncate(txHash)}</span>
        </div>
      )}
      {(txError || buyoutError) && (
        <div className="mb-4 bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {txError || buyoutError}
        </div>
      )}

      {/* Actions */}
      {auction.status === 'bidding' && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Place Bid</h2>
            <BidForm
              auctionId={auction.id}
              currentHighestBid={auction.highestBid || auction.startingPrice}
              onSuccess={() => setTxHash(null)}
            />
          </div>

          {isEnded && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">Settle Auction</h2>
              <div className="space-y-2">
                <input
                  type="text"
                  value={poolId}
                  onChange={(e) => setPoolId(e.target.value)}
                  placeholder="Pool ID (0x...)"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={handleSettle}
                  disabled={isSettling}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                >
                  {isSettling ? 'Settling...' : 'Settle Auction'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {auction.status === 'buyout' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Buyout</h2>
          <div className="space-y-2">
            <input
              type="text"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              placeholder="Pool ID (0x...)"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-orange-500 focus:outline-none"
            />
            <input
              type="number"
              step="0.0001"
              min="0"
              value={buyoutSui}
              onChange={(e) => setBuyoutSui(e.target.value)}
              placeholder="Payment amount (SUI)"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={handleBuyout}
              disabled={isBuyingOut}
              className="w-full py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
            >
              {isBuyingOut ? 'Processing...' : 'Buy Now'}
            </button>
          </div>
        </div>
      )}

      {(auction.status === 'settled' || auction.status === 'unsold') && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-gray-400">
            {auction.status === 'settled'
              ? 'Auction has been settled. Winner: ' + (auction.highestBidder ? truncate(auction.highestBidder) : 'N/A')
              : 'Auction ended with no bids.'}
          </p>
        </div>
      )}
    </div>
  );
}
