import { useEveAssembly } from '../../hooks/useEveAssembly';

export function SSUStatusCard({
  ssuObjectId,
}: {
  ssuObjectId?: string;
}) {
  const { data, isLoading } = useEveAssembly(ssuObjectId);

  if (!ssuObjectId) {
    return (
      <div className="p-4 border border-dashed border-gray-600 rounded-lg text-gray-500 text-center">
        No SSU selected — insurance available via direct contract calls
      </div>
    );
  }

  if (isLoading)
    return <div className="p-4 text-gray-400">Loading SSU...</div>;

  const assembly = data?.assembly;
  const isOnline = assembly?.state === 'online';

  return (
    <div
      className={`p-4 rounded-lg border ${isOnline ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">
            {assembly?.name || 'Smart Storage Unit'}
          </h3>
          <p className="text-sm text-gray-400">
            Type: {assembly?.type || 'SSU'}
          </p>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-bold ${isOnline ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}
        >
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      {isOnline && (
        <p className="mt-2 text-xs text-green-300">
          Insurance services active at this station
        </p>
      )}
    </div>
  );
}
