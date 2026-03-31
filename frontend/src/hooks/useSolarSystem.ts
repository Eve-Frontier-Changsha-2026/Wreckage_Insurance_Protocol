import { useQuery } from '@tanstack/react-query';
import { fetchSolarSystem, type SolarSystem } from '../lib/eveEyes';

// In-memory cache shared across all hook instances (survives re-renders, not page refreshes)
const systemCache = new Map<string, SolarSystem>();

/**
 * Resolves an array of solar system IDs to their names.
 * Returns a Map<systemId, systemName>.
 * Uses in-memory cache + react-query for deduplication.
 */
export function useSolarSystemNames(systemIds: string[]) {
  const uniqueIds = [...new Set(systemIds.filter(Boolean))];

  return useQuery({
    queryKey: ['solar-systems', uniqueIds.sort().join(',')],
    queryFn: async (): Promise<Map<string, string>> => {
      const result = new Map<string, string>();

      // Check cache first
      const uncached: string[] = [];
      for (const id of uniqueIds) {
        const cached = systemCache.get(id);
        if (cached) {
          result.set(id, cached.name);
        } else {
          uncached.push(id);
        }
      }

      // Fetch uncached in parallel (max 10 concurrent)
      const batchSize = 10;
      for (let i = 0; i < uncached.length; i += batchSize) {
        const batch = uncached.slice(i, i + batchSize);
        const systems = await Promise.allSettled(
          batch.map((id) => fetchSolarSystem(id)),
        );
        for (let j = 0; j < batch.length; j++) {
          const settled = systems[j];
          if (settled.status === 'fulfilled') {
            systemCache.set(batch[j], settled.value);
            result.set(batch[j], settled.value.name);
          } else {
            result.set(batch[j], batch[j]); // fallback: show numeric ID
          }
        }
      }

      return result;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 10 * 60_000, // system names don't change — cache 10 min
  });
}
