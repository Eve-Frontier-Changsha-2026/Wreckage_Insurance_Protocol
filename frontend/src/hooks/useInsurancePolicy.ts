import {
  useCurrentClient,
  useCurrentAccount,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PACKAGE_ID } from '../lib/contracts';
import {
  buildPurchasePolicy,
  buildRenewPolicy,
} from '../lib/ptb/insure';
import { useState, useCallback } from 'react';

const POLICY_TYPE = `${PACKAGE_ID}::policy::InsurancePolicy`;

export function useOwnedPolicies() {
  const client = useCurrentClient();
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ['ownedPolicies', account?.address],
    queryFn: async () => {
      const result = await client.listOwnedObjects({
        owner: account!.address,
        type: POLICY_TYPE,
        include: { content: true },
      });
      return result.objects;
    },
    enabled: !!account,
  });
}

export function usePolicyDetail(policyId: string | undefined) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['policyDetail', policyId],
    queryFn: async () => {
      const result = await client.getObject({
        objectId: policyId!,
        include: { content: true },
      });
      return result.object;
    },
    enabled: !!policyId,
  });
}

export function usePurchasePolicy() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: {
      poolId: string;
      characterId: string;
      coverageAmount: bigint;
      includeSelfDestruct: boolean;
      paymentAmountMist: bigint;
    }) => {
      if (!account) return;
      setIsPending(true);
      setError(null);
      try {
        const tx = buildPurchasePolicy(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        return result.Transaction.digest;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, client, queryClient, account],
  );

  return { execute, isPending, error };
}

export function useRenewPolicy() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { policyId: string; poolId: string; paymentAmountMist: bigint }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildRenewPolicy(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        await queryClient.invalidateQueries({ queryKey: ['policyDetail'] });
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
