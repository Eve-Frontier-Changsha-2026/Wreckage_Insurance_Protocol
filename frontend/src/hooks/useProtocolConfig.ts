import { useQuery } from '@tanstack/react-query';
import { SHARED_OBJECTS } from '../lib/contracts';
import { rpcGetObject } from '../lib/rpc';
import { parseProtocolConfig, type ProtocolConfigFields } from '../lib/poolConfigParser';

export function useProtocolConfig() {
  return useQuery({
    queryKey: ['protocolConfig'],
    queryFn: async () => {
      const result = await rpcGetObject(SHARED_OBJECTS.protocolConfig);
      return result.data;
    },
    staleTime: 60_000,
  });
}

/** Parsed, typed ProtocolConfig fields */
export function useParsedProtocolConfig() {
  const { data, ...rest } = useProtocolConfig();
  const parsed = data ? parseProtocolConfig(data) : null;
  return { data: parsed, ...rest };
}
