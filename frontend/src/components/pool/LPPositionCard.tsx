interface LPPositionCardProps {
  position: unknown;
  sharePrice: number;
  onClick?: () => void;
}

function parsePosFields(position: unknown) {
  const o = position as Record<string, unknown>;
  const content = o?.content as Record<string, unknown> | undefined;
  const fields = content?.fields as Record<string, unknown> | undefined;
  return fields ?? null;
}

function truncate(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function mistToSui(mist: unknown): string {
  return (Number(mist ?? 0) / 1_000_000_000).toFixed(4);
}

export default function LPPositionCard({ position, sharePrice, onClick }: LPPositionCardProps) {
  const o = position as Record<string, unknown>;
  const posId = (o.objectId as string) ?? '';
  const fields = parsePosFields(position);

  if (!fields) return null;

  const shares = Number(fields.shares ?? 0);
  const depositAmount = Number(fields.deposit_amount ?? fields.depositAmount ?? 0);
  const depositEpoch = Number(fields.deposit_epoch ?? fields.depositEpoch ?? 0);
  const estimatedValue = sharePrice > 0 ? shares * sharePrice : 0;

  return (
    <div
      onClick={onClick}
      className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${onClick ? 'cursor-pointer hover:border-orange-500/50 transition-colors' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-xs font-mono">{truncate(posId)}</p>
        <span className="text-xs text-orange-400 bg-orange-900/30 border border-orange-800 px-2 py-0.5 rounded-full">
          LP Position
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Shares Held</p>
          <p className="text-white font-semibold">{shares.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Deposit Amount</p>
          <p className="text-white font-semibold">{mistToSui(depositAmount)} SUI</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Est. Current Value</p>
          <p className="text-orange-400 font-bold">
            {(estimatedValue / 1_000_000_000).toFixed(4)} SUI
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Deposit Epoch</p>
          <p className="text-white font-semibold">{depositEpoch}</p>
        </div>
      </div>
    </div>
  );
}
