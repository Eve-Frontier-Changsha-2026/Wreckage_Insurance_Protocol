import {
  useCurrentClient,
  useCurrentAccount,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PACKAGE_ID } from '../lib/contracts';
import { buildDeposit, buildWithdraw } from '../lib/ptb/pool';
import { useState, useCallback } from 'react';

const LP_POSITION_TYPE = `${PACKAGE_ID}::risk_pool::LPPosition`;

export function useRiskPoolDetail(poolId: string | undefined) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['riskPool', poolId],
    queryFn: async () => {
      const result = await client.getObject({
        objectId: poolId!,
        include: { content: true },
      });
      return result.object;
    },
    enabled: !!poolId,
  });
}

export function useOwnedLPPositions() {
  const client = useCurrentClient();
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ['lpPositions', account?.address],
    queryFn: async () => {
      const result = await client.listOwnedObjects({
        owner: account!.address,
        type: LP_POSITION_TYPE,
        include: { content: true },
      });
      return result.objects;
    },
    enabled: !!account,
  });
}

export function useDeposit() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { poolId: string; amountMist: bigint }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildDeposit(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['riskPool'] });
        await queryClient.invalidateQueries({ queryKey: ['lpPositions'] });
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

export function useWithdraw() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { poolId: string; positionId: string; sharesToBurn: bigint }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildWithdraw(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['riskPool'] });
        await queryClient.invalidateQueries({ queryKey: ['lpPositions'] });
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
