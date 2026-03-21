import CountdownTimer from './CountdownTimer';

interface Auction {
  id: string;
  salvageNftId: string;
  startingPrice: number;
  highestBid: number;
  highestBidder: string | null;
  startsAt: number;
  endsAt: number;
  status: 'bidding' | 'buyout' | 'settled' | 'unsold';
}

interface Props {
  auction: Auction;
  onClick: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  bidding: 'bg-green-900 text-green-300 border border-green-700',
  buyout: 'bg-orange-900 text-orange-300 border border-orange-700',
  settled: 'bg-gray-800 text-gray-400 border border-gray-600',
  unsold: 'bg-red-900 text-red-300 border border-red-700',
};

function truncate(addr: string, chars = 6) {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function mistToSui(mist: number) {
  return (mist / 1_000_000_000).toFixed(4);
}

export default function AuctionCard({ auction, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-900 border border-gray-800 rounded-lg p-4 cursor-pointer hover:border-orange-500 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-gray-400">{truncate(auction.id)}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[auction.status] ?? ''}`}>
          {auction.status.toUpperCase()}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Starting</span>
          <span className="text-gray-300">{mistToSui(auction.startingPrice)} SUI</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Highest Bid</span>
          <span className="text-orange-400 font-semibold">
            {auction.highestBid > 0 ? `${mistToSui(auction.highestBid)} SUI` : '—'}
          </span>
        </div>
        {auction.highestBidder && (
          <div className="flex justify-between">
            <span className="text-gray-500">Bidder</span>
            <span className="text-gray-300 font-mono text-xs">{truncate(auction.highestBidder)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
        <span className="text-xs text-gray-500">Time Left</span>
        {auction.status === 'settled' || auction.status === 'unsold' ? (
          <span className="text-xs text-gray-500">Ended</span>
        ) : (
          <CountdownTimer endsAt={auction.endsAt} />
        )}
      </div>
    </div>
  );
}
