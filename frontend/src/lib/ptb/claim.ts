import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../contracts';

const CLOCK = '0x6';

export function buildSubmitClaim(args: {
  policyId: string;
  killmailId: string;
  poolId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::claims::submit_claim`,
    arguments: [
      tx.object(args.policyId),
      tx.object(args.killmailId),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.claimRegistry),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildSubmitSelfDestructClaim(args: {
  policyId: string;
  killmailId: string;
  poolId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::claims::submit_self_destruct_claim`,
    arguments: [
      tx.object(args.policyId),
      tx.object(args.killmailId),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.claimRegistry),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(CLOCK),
    ],
  });

  return tx;
}
