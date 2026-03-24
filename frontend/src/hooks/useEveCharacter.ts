import { useQuery } from '@tanstack/react-query';
import { getObjectWithJson } from '@evefrontier/dapp-kit';

export interface EveCharacter {
  name: string;
  id: string;
  address: string;
}

export function useEveCharacter(characterObjectId: string | undefined) {
  return useQuery({
    queryKey: ['eve-character', characterObjectId],
    queryFn: async (): Promise<EveCharacter | null> => {
      if (!characterObjectId) return null;
      const result = await getObjectWithJson(characterObjectId);
      const json = result.data?.object?.asMoveObject?.contents?.json as
        | Record<string, unknown>
        | undefined;
      if (!json) return null;
      return {
        name: (json.name as string) || 'Unknown',
        id: characterObjectId,
        address: (json.character_address as string) || '',
      };
    },
    enabled: !!characterObjectId,
  });
}
