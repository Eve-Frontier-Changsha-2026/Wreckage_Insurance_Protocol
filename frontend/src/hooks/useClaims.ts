import {
  useDAppKit,
  useCurrentClient,
} from '@mysten/dapp-kit-react';
import { useQueryClient } from '@tanstack/react-query';
import { buildSubmitClaim, buildSubmitSelfDestructClaim } from '../lib/ptb/claim';
import { useState, useCallback } from 'react';

export function useSubmitClaim() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { policyId: string; killmailId: string; poolId: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildSubmitClaim(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        await queryClient.invalidateQueries({ queryKey: ['riskPool'] });
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

export function useSubmitSelfDestructClaim() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: { policyId: string; killmailId: string; poolId: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const tx = buildSubmitSelfDestructClaim(args);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(
            result.FailedTransaction.status.error?.message ?? 'Transaction failed',
          );
        }
        await client.waitForTransaction({ digest: result.Transaction.digest });
        await queryClient.invalidateQueries({ queryKey: ['ownedPolicies'] });
        await queryClient.invalidateQueries({ queryKey: ['riskPool'] });
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
