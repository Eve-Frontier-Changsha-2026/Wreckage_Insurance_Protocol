import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../contracts';

export function buildPurchaseViaSsu(params: {
  ssuObjectId: string;
  poolObjectId: string;
  characterObjectId: string;
  coverageAmount: bigint;
  includeSelfDestruct: boolean;
  paymentCoinId: string;
  senderAddress: string;
}) {
  const tx = new Transaction();
  const [policy] = tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::purchase_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object(params.characterObjectId),
      tx.pure.u64(params.coverageAmount),
      tx.pure.bool(params.includeSelfDestruct),
      tx.object(params.paymentCoinId),
      tx.object('0x6'), // Clock
    ],
  });
  tx.transferObjects([policy], tx.pure.address(params.senderAddress));
  return tx;
}

export function buildClaimViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  killmailObjectId: string;
  poolObjectId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::claim_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(params.killmailObjectId),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.claimRegistry),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildSelfDestructClaimViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  killmailObjectId: string;
  poolObjectId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::self_destruct_claim_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(params.killmailObjectId),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.claimRegistry),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildRenewViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  poolObjectId: string;
  paymentCoinId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::renew_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(params.poolObjectId),
      tx.object(params.paymentCoinId),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildCancelViaSsu(params: {
  ssuObjectId: string;
  policyObjectId: string;
  poolObjectId: string;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::ssu_extension::cancel_via_ssu`,
    arguments: [
      tx.object(params.ssuObjectId),
      tx.object(params.policyObjectId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(params.poolObjectId),
      tx.object(SHARED_OBJECTS.policyRegistry),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}

export function buildSetItemPrice(params: {
  adminCapId: string;
  itemTypeId: number;
  pricePerUnit: bigint;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::item_valuation::set_item_price`,
    arguments: [
      tx.object(params.adminCapId),
      tx.object(SHARED_OBJECTS.valuationRegistry),
      tx.pure.u64(params.itemTypeId),
      tx.pure.u64(params.pricePerUnit),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}
