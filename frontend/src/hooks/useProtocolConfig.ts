import { useCurrentClient } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import { SHARED_OBJECTS } from '../lib/contracts';

export function useProtocolConfig() {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['protocolConfig'],
    queryFn: async () => {
      const result = await client.getObject({
        objectId: SHARED_OBJECTS.protocolConfig,
        include: { content: true },
      });
      return result.object;
    },
    staleTime: 60_000,
  });
}
