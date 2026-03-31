import { GRPC_URLS, DEFAULT_NETWORK, type Network } from '../config/network';

/**
 * Calls SUI JSON-RPC endpoint directly.
 * Needed because SuiGrpcClient returns binary content instead of parsed fields.
 */
export async function jsonRpc<T>(
  method: string,
  params: unknown[],
  network: Network = DEFAULT_NETWORK,
): Promise<T> {
  const url = GRPC_URLS[network];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message ?? 'JSON-RPC error');
  }
  return json.result as T;
}

/** Fetch a single object with parsed content via JSON-RPC. */
export async function rpcGetObject(objectId: string) {
  return jsonRpc<{ data: Record<string, unknown> }>('sui_getObject', [
    objectId,
    { showContent: true },
  ]);
}

/** Fetch owned objects of a given type with parsed content via JSON-RPC. */
export async function rpcGetOwnedObjects(owner: string, structType: string) {
  const result = await jsonRpc<{ data: { data: Record<string, unknown> }[] }>(
    'suix_getOwnedObjects',
    [owner, { filter: { StructType: structType }, options: { showContent: true } }],
  );
  // Flatten: each entry has {data: {objectId, content: {fields}}} → return inner .data
  return (result.data ?? []).map((entry) => entry.data);
}
