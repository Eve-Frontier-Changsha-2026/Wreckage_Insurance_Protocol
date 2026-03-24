import {
  useSignAndExecuteTransaction,
  useCurrentAccount,
} from '@mysten/dapp-kit-react';
import {
  buildPurchaseViaSsu,
  buildClaimViaSsu,
  buildSelfDestructClaimViaSsu,
  buildRenewViaSsu,
  buildCancelViaSsu,
} from '../lib/ptb/ssu';

export function useSSUExtension(ssuObjectId: string | undefined) {
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction();
  const account = useCurrentAccount();

  const purchaseViaSsu = async (params: {
    poolObjectId: string;
    characterObjectId: string;
    coverageAmount: bigint;
    includeSelfDestruct: boolean;
    paymentCoinId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    if (!account?.address) throw new Error('Wallet not connected');
    const tx = buildPurchaseViaSsu({
      ssuObjectId,
      senderAddress: account.address,
      ...params,
    });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const claimViaSsu = async (params: {
    policyObjectId: string;
    killmailObjectId: string;
    poolObjectId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildClaimViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const selfDestructClaimViaSsu = async (params: {
    policyObjectId: string;
    killmailObjectId: string;
    poolObjectId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildSelfDestructClaimViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const renewViaSsu = async (params: {
    policyObjectId: string;
    poolObjectId: string;
    paymentCoinId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildRenewViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  const cancelViaSsu = async (params: {
    policyObjectId: string;
    poolObjectId: string;
  }) => {
    if (!ssuObjectId) throw new Error('No SSU selected');
    const tx = buildCancelViaSsu({ ssuObjectId, ...params });
    return signAndExecuteTransaction({ transaction: tx });
  };

  return {
    purchaseViaSsu,
    claimViaSsu,
    selfDestructClaimViaSsu,
    renewViaSsu,
    cancelViaSsu,
  };
}
