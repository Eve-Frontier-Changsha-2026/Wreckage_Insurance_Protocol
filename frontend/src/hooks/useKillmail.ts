import { useQuery } from '@tanstack/react-query';
import { jsonRpc, rpcGetObject } from '../lib/rpc';
import { PACKAGE_ID } from '../lib/contracts';

export function useKillmailDetail(killmailId: string | undefined) {
  return useQuery({
    queryKey: ['killmail', killmailId],
    queryFn: async () => {
      const result = await rpcGetObject(killmailId!);
      return result.data;
    },
    enabled: !!killmailId,
  });
}

// === Utopia killmail indexer ===

export interface UtopiaKillmail {
  id: string;          // Game-internal killmail ID (NOT Sui object ID)
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  reporterId: string;
  reporterName: string;
  lossType: string;
  solarSystemId: number;
  killedAt: number;    // ms timestamp
  shard: number;
}

const UTOPIA_BASE = 'https://utopia.evedataco.re/api';

/** Fetch killmails where gameCharacterId was the victim (deaths). */
export function useCharacterKillmails(gameCharacterId: string | undefined) {
  return useQuery({
    queryKey: ['utopia-kills', gameCharacterId],
    queryFn: async (): Promise<UtopiaKillmail[]> => {
      const res = await fetch(`${UTOPIA_BASE}/character/${gameCharacterId}/kills`);
      if (!res.ok) throw new Error(`Utopia API error: ${res.status}`);
      const json = await res.json();
      // API returns { items: [...] } or flat array
      return (json.items ?? json) as UtopiaKillmail[];
    },
    enabled: !!gameCharacterId && gameCharacterId.length > 4,
    staleTime: 30_000,
    retry: 1,
  });
}

// === On-chain killmail resolver ===

export interface OnChainKillmail {
  suiObjectId: string;
  killTimestamp: number; // seconds
  txDigest: string;
}

/**
 * Fetches all KillmailCreatedEvent events from our package,
 * then resolves each to its Sui object ID via transaction effects.
 * Used to map utopia game killmails → on-chain Killmail object IDs.
 */
export function useOnChainKillmails() {
  return useQuery({
    queryKey: ['onchain-killmails', PACKAGE_ID],
    queryFn: async (): Promise<OnChainKillmail[]> => {
      // 1. Query KillmailCreatedEvent events from our merged package
      const eventsResult = await jsonRpc<{
        data: Array<{
          id: { txDigest: string; eventSeq: string };
          parsedJson: { kill_timestamp: string };
        }>;
        hasNextPage: boolean;
      }>('suix_queryEvents', [
        { MoveEventType: `${PACKAGE_ID}::killmail::KillmailCreatedEvent` },
        null, // cursor
        50,   // limit (enough for hackathon)
        false, // ascending
      ]);

      if (!eventsResult.data?.length) return [];

      // 2. Dedupe by txDigest, then resolve Sui object IDs in parallel
      const uniqueDigests = [...new Set(eventsResult.data.map(e => e.id.txDigest))];

      const txResults = await Promise.all(
        uniqueDigests.map(digest =>
          jsonRpc<{
            objectChanges?: Array<{
              type: string;
              objectType?: string;
              objectId?: string;
            }>;
          }>('sui_getTransactionBlock', [digest, { showObjectChanges: true }]),
        ),
      );

      // Build digest → created Killmail object ID map
      const digestToObjectId = new Map<string, string>();
      for (let i = 0; i < uniqueDigests.length; i++) {
        const created = txResults[i].objectChanges?.find(
          c => c.type === 'created' && c.objectType?.includes('::killmail::Killmail'),
        );
        if (created?.objectId) {
          digestToObjectId.set(uniqueDigests[i], created.objectId);
        }
      }

      // 3. Map events → OnChainKillmail
      const results: OnChainKillmail[] = [];
      for (const evt of eventsResult.data) {
        const objectId = digestToObjectId.get(evt.id.txDigest);
        if (objectId) {
          results.push({
            suiObjectId: objectId,
            killTimestamp: Number(evt.parsedJson.kill_timestamp),
            txDigest: evt.id.txDigest,
          });
        }
      }

      return results;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Given a utopia killmail's killedAt (ms), find the matching on-chain Killmail Sui object ID.
 * Matches by kill_timestamp (seconds).
 */
export function resolveUtopiaToOnChain(
  utopiaKilledAtMs: number,
  onChainKillmails: OnChainKillmail[] | undefined,
): OnChainKillmail | undefined {
  if (!onChainKillmails?.length) return undefined;
  const targetSec = Math.floor(utopiaKilledAtMs / 1000);
  return onChainKillmails.find(km => km.killTimestamp === targetSec);
}
