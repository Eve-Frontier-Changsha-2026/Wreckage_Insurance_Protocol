import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../contracts';

const CLOCK = '0x6';

export function buildPurchasePolicy(args: {
  poolId: string;
  insuredAddress: string;
  coverageAmount: bigint;
  includeSelfDestruct: boolean;
  paymentAmountMist: bigint;
  senderAddress: string;
}) {
  const tx = new Transaction();

  const [payment] = tx.splitCoins(tx.gas, [args.paymentAmountMist]);

  const [policy] = tx.moveCall({
    target: `${PACKAGE_ID}::underwriting::purchase_policy`,
    arguments: [
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.pure.address(args.insuredAddress),
      tx.pure.u64(args.coverageAmount),
      tx.pure.bool(args.includeSelfDestruct),
      payment,
      tx.object(CLOCK),
    ],
  });

  tx.transferObjects([policy], tx.pure.address(args.senderAddress));

  return tx;
}

export function buildRenewPolicy(args: {
  policyId: string;
  poolId: string;
  paymentAmountMist: bigint;
}) {
  const tx = new Transaction();

  const [payment] = tx.splitCoins(tx.gas, [args.paymentAmountMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::underwriting::renew_policy`,
    arguments: [
      tx.object(args.policyId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(args.poolId),
      payment,
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildTransferPolicy(args: {
  policyId: string;
  recipient: string;
}) {
  const tx = new Transaction();

  // H-4: transfer_policy now takes policy by value and does transfer internally
  // No separate transferObjects needed — the Move function handles it atomically
  tx.moveCall({
    target: `${PACKAGE_ID}::underwriting::transfer_policy`,
    arguments: [
      tx.object(args.policyId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.pure.address(args.recipient),
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildCancelPolicy(args: {
  policyId: string;
  poolId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::underwriting::cancel_policy`,
    arguments: [
      tx.object(args.policyId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildExpirePolicy(args: {
  policyId: string;
  poolId: string;
}) {
  const tx = new Transaction();

  // H-5: expire_policy now requires ProtocolConfig for pause check
  tx.moveCall({
    target: `${PACKAGE_ID}::underwriting::expire_policy`,
    arguments: [
      tx.object(args.policyId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(CLOCK),
    ],
  });

  return tx;
}
