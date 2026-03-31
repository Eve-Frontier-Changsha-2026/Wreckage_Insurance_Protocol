import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit-react';

const UTOPIA_CHARACTERS_URL = 'https://utopia.evedataco.re/api/characters';

export interface GameCharacter {
  id: string;          // game character ID (0x...)
  name: string;
  address: string;     // SUI wallet address
  tribeId: number;
  tribeName: string;
  tribeTicker: string;
  createdAt: number;
}

/**
 * Resolves the connected wallet's EVE Frontier game character
 * by fetching all characters and matching by wallet address.
 */
export function useGameCharacter() {
  const account = useCurrentAccount();
  const walletAddress = account?.address;

  return useQuery({
    queryKey: ['game-character', walletAddress],
    queryFn: async (): Promise<GameCharacter | null> => {
      const res = await fetch(UTOPIA_CHARACTERS_URL);
      if (!res.ok) throw new Error(`Utopia characters API error: ${res.status}`);
      const json = await res.json();
      const items = (json.items ?? json) as GameCharacter[];
      const match = items.find(
        (c) => c.address?.toLowerCase() === walletAddress!.toLowerCase(),
      );
      return match ?? null;
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60_000, // cache 5 min — character doesn't change often
    retry: 1,
  });
}
