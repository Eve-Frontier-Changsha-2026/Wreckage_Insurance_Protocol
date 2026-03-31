import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID } from '../contracts';

// World objects from deployment.json (merged package — same PACKAGE_ID)
const KILLMAIL_REGISTRY = '0x0c3e7a3855fbbdf6f7e12bbb4ffcf5b2a2bf732305e35be4a81684a719794a92';
const ADMIN_ACL = '0x69211b06b724ee1852e3cd430e835012d0fafa3a51468f98843428c2794a425d';
const OBJECT_REGISTRY = '0x65d644ca1588e17377ee1fc28c2f21780d74b01155c715a8ce77dbfe995584f1';

export interface CreateKillmailArgs {
  characterObjectId: string;  // shared Character object ID (reporter)
  itemId: string;             // killmail game ID (e.g. "15")
  killerId: string;           // killer characterItemId (e.g. "2112000192")
  victimId: string;           // victim characterItemId (e.g. "2112000187")
  killTimestamp: number;      // epoch seconds
  lossType: number;           // 0 = SHIP
  solarSystemId: string;      // e.g. "30013131"
}

/**
 * Build PTB to call world::killmail::create_killmail
 * Must be signed by AdminACL-authorized sponsor (deployer wallet).
 */
export interface CreateCharacterArgs {
  gameCharacterId: number;    // e.g. 2112000187
  tenant: string;             // e.g. "evefrontier"
  tribeId: number;            // e.g. 1
  characterAddress: string;   // wallet address
  name: string;               // character name
}

/**
 * Build PTB: create_character → share_character (single tx)
 * Must be signed by AdminACL-authorized sponsor (deployer wallet).
 */
export function buildCreateAndShareCharacter(args: CreateCharacterArgs) {
  const tx = new Transaction();

  const character = tx.moveCall({
    target: `${PACKAGE_ID}::character::create_character`,
    arguments: [
      tx.object(OBJECT_REGISTRY),
      tx.object(ADMIN_ACL),
      tx.pure.u32(args.gameCharacterId),
      tx.pure.string(args.tenant),
      tx.pure.u32(args.tribeId),
      tx.pure.address(args.characterAddress),
      tx.pure.string(args.name),
    ],
  });

  tx.moveCall({
    target: `${PACKAGE_ID}::character::share_character`,
    arguments: [
      character,
      tx.object(ADMIN_ACL),
    ],
  });

  return tx;
}

export function buildCreateKillmail(args: CreateKillmailArgs) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::killmail::create_killmail`,
    arguments: [
      tx.object(KILLMAIL_REGISTRY),
      tx.object(ADMIN_ACL),
      tx.pure.u64(BigInt(args.itemId)),
      tx.pure.u64(BigInt(args.killerId)),
      tx.pure.u64(BigInt(args.victimId)),
      tx.object(args.characterObjectId),
      tx.pure.u64(BigInt(args.killTimestamp)),
      tx.pure.u8(args.lossType),
      tx.pure.u64(BigInt(args.solarSystemId)),
    ],
  });

  return tx;
}
