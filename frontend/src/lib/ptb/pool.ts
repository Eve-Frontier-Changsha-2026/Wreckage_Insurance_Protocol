import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID } from '../contracts';

const CLOCK = '0x6';

export function buildDeposit(args: {
  poolId: string;
  amountMist: bigint;
}) {
  const tx = new Transaction();

  const [depositCoin] = tx.splitCoins(tx.gas, [args.amountMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::risk_pool::deposit`,
    arguments: [
      tx.object(args.poolId),
      depositCoin,
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildWithdraw(args: {
  poolId: string;
  positionId: string;
  sharesToBurn: bigint;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::risk_pool::withdraw`,
    arguments: [
      tx.object(args.poolId),
      tx.object(args.positionId),
      tx.pure.u64(args.sharesToBurn),
      tx.object(CLOCK),
    ],
  });

  return tx;
}

export function buildDestroyEmptyPosition(args: {
  positionId: string;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::risk_pool::destroy_empty_position`,
    arguments: [tx.object(args.positionId)],
  });

  return tx;
}
