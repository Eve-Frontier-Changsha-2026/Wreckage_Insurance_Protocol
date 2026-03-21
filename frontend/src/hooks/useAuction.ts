import {
  useCurrentClient,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SHARED_OBJECTS } from '../lib/contracts';
import { buildPlaceBid, buildSettleAuction, buildBuyout } from '../lib/ptb/auction';
import { useState, useCallback } from 'react';

export function useAuctionDetail(auctionId: string | undefined) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['auction', auctionId],
    queryFn: async () => {
      const result = await client.getObject({
        objectId: auctionId!,
        include: { content: true },
      });
      return result.object;
    },
    enabled: !!auctionId,
    refetchInterval: 10_000,
  });
}

export function useAuctionRegistry() {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['auctionRegistry'],
    queryFn: async () => {
      const result = await client.getObject({
        objectId: SHARED_OBJECTS.auctionRegistry,
        include: { content: true },
      });
      return result.object;
    },
    refetchInterval: 15_000,
  });
}

export function usePlaceBid() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { auctionId: string; bidAmountMist: bigint }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildPlaceBid(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['auction'] });
        await queryClient.invalidateQueries({ queryKey: ['auctionRegistry'] });
        return result.Transaction.digest;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}

export function useSettleAuction() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(
    async (args: { auctionId: string; poolId: string }) => {
      setIsPending(true);
      try {
        const tx = buildSettleAuction(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['auction'] });
        await queryClient.invalidateQueries({ queryKey: ['auctionRegistry'] });
        return result.Transaction.digest;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending };
}

export function useBuyout() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { auctionId: string; poolId: string; paymentAmountMist: bigint }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildBuyout(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['auction'] });
        await queryClient.invalidateQueries({ queryKey: ['auctionRegistry'] });
        return result.Transaction.digest;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}
