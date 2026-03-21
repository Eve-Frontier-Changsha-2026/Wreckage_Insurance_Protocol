import { useCurrentClient } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

export function useKillmailDetail(killmailId: string | undefined) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['killmail', killmailId],
    queryFn: async () => {
      const result = await client.getObject({
        objectId: killmailId!,
        include: { content: true },
      });
      return result.object;
    },
    enabled: !!killmailId,
  });
}
