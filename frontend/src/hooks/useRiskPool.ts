import {
  useCurrentClient,
  useCurrentAccount,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PACKAGE_ID } from '../lib/contracts';
import { rpcGetObject, rpcGetOwnedObjects } from '../lib/rpc';
import { buildDeposit, buildWithdraw } from '../lib/ptb/pool';
import { useState, useCallback } from 'react';

const LP_POSITION_TYPE = `${PACKAGE_ID}::risk_pool::LPPosition`;

export function useRiskPoolDetail(poolId: string | undefined) {
  return useQuery({
    queryKey: ['riskPool', poolId],
    queryFn: async () => {
      const result = await rpcGetObject(poolId!);
      return result.data;
    },
    enabled: !!poolId,
  });
}

/** Fetch multiple pool objects by ID (for per-pool sharePrice). */
export function useRiskPoolsBatch(poolIds: string[]) {
  return useQuery({
    queryKey: ['riskPoolsBatch', ...poolIds],
    queryFn: async () => {
      const results = await Promise.all(
        poolIds.map(async (id) => {
          const result = await rpcGetObject(id);
          return { id, data: result.data };
        }),
      );
      return Object.fromEntries(results.map((r) => [r.id, r.data]));
    },
    enabled: poolIds.length > 0,
  });
}

export function useOwnedLPPositions() {
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ['lpPositions', account?.address],
    queryFn: async () => {
      return rpcGetOwnedObjects(account!.address, LP_POSITION_TYPE);
    },
    enabled: !!account,
  });
}

export function useDeposit() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { poolId: string; amountMist: bigint }) => {
      if (!account) throw new Error('Wallet not connected');
      setIsPending(true);
      setError(null);
      try {
        const tx = buildDeposit({ ...args, senderAddress: account.address });
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
    [account, dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}

export function useWithdraw() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { poolId: string; positionId: string; sharesToBurn: bigint }) => {
      if (!account) throw new Error('Wallet not connected');
      setIsPending(true);
      setError(null);
      try {
        const tx = buildWithdraw({ ...args, senderAddress: account.address });
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
    [account, dAppKit, client, queryClient],
  );

  return { execute, isPending, error };
}
