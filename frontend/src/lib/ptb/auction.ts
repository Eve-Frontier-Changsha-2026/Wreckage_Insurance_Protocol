import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../contracts';

const CLOCK = '0x6';

export function buildPlaceBid(args: {
  auctionId: string;
  bidAmountMist: bigint;
}) {
  const tx = new Transaction();

  const [bidCoin] = tx.splitCoins(tx.gas, [args.bidAmountMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::auction::place_bid`,
    arguments: [
      tx.object(args.auctionId),
      bidCoin,
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildSettleAuction(args: {
  auctionId: string;
  poolId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::auction::settle_auction`,
    arguments: [
      tx.object(args.auctionId),
      tx.object(SHARED_OBJECTS.auctionRegistry),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildBuyout(args: {
  auctionId: string;
  poolId: string;
  paymentAmountMist: bigint;
}) {
  const tx = new Transaction();

  const [payment] = tx.splitCoins(tx.gas, [args.paymentAmountMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::auction::buyout`,
    arguments: [
      tx.object(args.auctionId),
      tx.object(SHARED_OBJECTS.auctionRegistry),
      tx.object(args.poolId),
      tx.object(SHARED_OBJECTS.protocolConfig),
      payment,
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildDestroyUnsold(args: {
  auctionId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::auction::destroy_unsold`,
    arguments: [
      tx.object(args.auctionId),
      tx.object(SHARED_OBJECTS.auctionRegistry),
      tx.object(SHARED_OBJECTS.protocolConfig),
      tx.object(CLOCK),
    ],
  });

  return tx;
}
