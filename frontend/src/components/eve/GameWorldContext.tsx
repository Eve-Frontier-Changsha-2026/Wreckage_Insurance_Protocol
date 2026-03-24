import { useEveAssembly } from '../../hooks/useEveAssembly';

export function GameWorldContext({
  ssuObjectId,
}: {
  ssuObjectId?: string;
}) {
  const { data } = useEveAssembly(ssuObjectId);
  const owner = data?.character;

  if (!ssuObjectId || !data) return null;

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-sm">
      <h4 className="text-gray-400 font-medium mb-1">
        EVE Frontier Context
      </h4>
      <div className="space-y-1 text-gray-300">
        <p>
          Station:{' '}
          <span className="text-white">
            {data.assembly?.name || 'Unknown'}
          </span>
        </p>
        <p>
          ID:{' '}
          <span className="font-mono text-xs text-gray-400">
            {ssuObjectId.slice(0, 10)}...
          </span>
        </p>
        {owner && (
          <p>
            Owner: <span className="text-indigo-300">{owner.name}</span>
          </p>
        )}
      </div>
    </div>
  );
}
