import { useQuery } from '@tanstack/react-query';
import { PACKAGE_ID } from '../lib/contracts';
import { jsonRpc } from '../lib/rpc';

export interface DiscoveredPool {
  poolId: string;
  riskTier: number;
  creator: string;
}

const POOL_CREATED_EVENT_TYPE = `${PACKAGE_ID}::risk_pool::PoolCreatedEvent`;

export const TIER_LABELS: Record<number, string> = {
  0: 'Low Risk',
  1: 'Medium Risk',
  2: 'High Risk',
};

interface EventPage {
  data: Array<{
    parsedJson: {
      pool_id: string;
      risk_tier: number;
      creator: string;
    };
  }>;
  nextCursor: unknown;
  hasNextPage: boolean;
}

export function useDiscoverPools() {
  return useQuery({
    queryKey: ['discoverPools', PACKAGE_ID],
    queryFn: async (): Promise<DiscoveredPool[]> => {
      const result = await jsonRpc<EventPage>(
        'suix_queryEvents',
        [{ MoveEventType: POOL_CREATED_EVENT_TYPE }, null, 50, false],
      );
      // Dedupe by poolId (in case of re-query)
      const seen = new Set<string>();
      const pools: DiscoveredPool[] = [];
      for (const evt of result.data) {
        const { pool_id, risk_tier, creator } = evt.parsedJson;
        if (!seen.has(pool_id)) {
          seen.add(pool_id);
          pools.push({ poolId: pool_id, riskTier: risk_tier, creator });
        }
      }
      // Sort by tier ascending
      pools.sort((a, b) => a.riskTier - b.riskTier);
      return pools;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
