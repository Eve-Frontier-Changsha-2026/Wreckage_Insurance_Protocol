// frontend/src/hooks/useKillmail.ts

import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { fetchKillmails, type EveEyesKillmail } from '../lib/eveEyes';
import { jsonRpc } from '../lib/rpc';
import { PACKAGE_ID } from '../lib/contracts';

// Re-export for consumers
export type { EveEyesKillmail } from '../lib/eveEyes';

// === Eve Eyes killmail feed, auto-filtered by connected wallet ===

/**
 * Fetches killmails where the connected wallet is the victim.
 * No game character ID needed — Eve Eyes provides walletAddress directly.
 */
export function useMyKillmails() {
  const account = useCurrentAccount();
  const walletAddress = account?.address?.toLowerCase();

  const query = useQuery({
    queryKey: ['eve-eyes-killmails'],
    queryFn: () => fetchKillmails(100),
    staleTime: 30_000,
    retry: 1,
  });

  // Client-side filter: only killmails where I am the victim
  const myKillmails = walletAddress && query.data
    ? query.data.filter(
        (km) => km.victim.walletAddress.toLowerCase() === walletAddress,
      )
    : [];

  return {
    ...query,
    data: myKillmails,
  };
}

// === On-chain killmail resolver (preserved from previous implementation) ===

export interface OnChainKillmail {
  suiObjectId: string;
  killTimestamp: number; // seconds since epoch
  txDigest: string;
}

/**
 * Fetches all KillmailCreatedEvent events from our package,
 * then resolves each to its Sui object ID via transaction effects.
 */
export function useOnChainKillmails() {
  return useQuery({
    queryKey: ['onchain-killmails', PACKAGE_ID],
    queryFn: async (): Promise<OnChainKillmail[]> => {
      const eventsResult = await jsonRpc<{
        data: Array<{
          id: { txDigest: string; eventSeq: string };
          parsedJson: { kill_timestamp: string };
        }>;
        hasNextPage: boolean;
      }>('suix_queryEvents', [
        { MoveEventType: `${PACKAGE_ID}::killmail::KillmailCreatedEvent` },
        null,
        50,
        false,
      ]);

      if (!eventsResult.data?.length) return [];

      const uniqueDigests = [...new Set(eventsResult.data.map((e) => e.id.txDigest))];

      const txResults = await Promise.all(
        uniqueDigests.map((digest) =>
          jsonRpc<{
            objectChanges?: Array<{
              type: string;
              objectType?: string;
              objectId?: string;
            }>;
          }>('sui_getTransactionBlock', [digest, { showObjectChanges: true }]),
        ),
      );

      const digestToObjectId = new Map<string, string>();
      for (let i = 0; i < uniqueDigests.length; i++) {
        const created = txResults[i].objectChanges?.find(
          (c) => c.type === 'created' && c.objectType?.includes('::killmail::Killmail'),
        );
        if (created?.objectId) {
          digestToObjectId.set(uniqueDigests[i], created.objectId);
        }
      }

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
 * Match an Eve Eyes killmail to its on-chain Sui object ID by timestamp.
 * Eve Eyes gives ISO string → convert to epoch seconds → match on-chain kill_timestamp.
 */
export function resolveToOnChain(
  eveEyesKillmail: EveEyesKillmail,
  onChainKillmails: OnChainKillmail[] | undefined,
): OnChainKillmail | undefined {
  if (!onChainKillmails?.length) return undefined;
  const targetSec = Math.floor(new Date(eveEyesKillmail.killTimestamp).getTime() / 1000);
  return onChainKillmails.find((km) => km.killTimestamp === targetSec);
}
