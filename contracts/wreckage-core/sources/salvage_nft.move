// contracts/wreckage-core/sources/salvage_nft.move
module wreckage_core::salvage_nft;

use world::in_game_id::TenantItemId;

// === Constants ===
const STATUS_AUCTION: u8 = 0;
const STATUS_SOLD: u8 = 1;
const STATUS_DESTROYED: u8 = 2;

// === Structs ===
public struct SalvageNFT has key, store {
    id: UID,
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    loss_type: u8,
    kill_timestamp: u64,
    estimated_value: u64,
    status: u8,
}

// === Events ===
public struct SalvageMintedEvent has copy, drop {
    nft_id: ID,
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    estimated_value: u64,
}

// === Constructor (package-only — blocks external forging of fake NFTs) ===
public(package) fun mint(
    killmail_id: TenantItemId,
    victim_id: TenantItemId,
    solar_system_id: TenantItemId,
    loss_type: u8,
    kill_timestamp: u64,
    estimated_value: u64,
    ctx: &mut TxContext,
): SalvageNFT {
    let nft = SalvageNFT {
        id: object::new(ctx),
        killmail_id,
        victim_id,
        solar_system_id,
        loss_type,
        kill_timestamp,
        estimated_value,
        status: STATUS_AUCTION,
    };

    sui::event::emit(SalvageMintedEvent {
        nft_id: object::id(&nft),
        killmail_id,
        victim_id,
        solar_system_id,
        estimated_value,
    });

    nft
}

// === Accessors ===
public fun id(nft: &SalvageNFT): ID { object::id(nft) }
public fun killmail_id(nft: &SalvageNFT): TenantItemId { nft.killmail_id }
public fun victim_id(nft: &SalvageNFT): TenantItemId { nft.victim_id }
public fun solar_system_id(nft: &SalvageNFT): TenantItemId { nft.solar_system_id }
public fun loss_type(nft: &SalvageNFT): u8 { nft.loss_type }
public fun kill_timestamp(nft: &SalvageNFT): u64 { nft.kill_timestamp }
public fun estimated_value(nft: &SalvageNFT): u64 { nft.estimated_value }
public fun status(nft: &SalvageNFT): u8 { nft.status }

public fun status_auction(): u8 { STATUS_AUCTION }
public fun status_sold(): u8 { STATUS_SOLD }
public fun status_destroyed(): u8 { STATUS_DESTROYED }

// === Mutators (package-only) ===
public(package) fun set_status(nft: &mut SalvageNFT, status: u8) { nft.status = status; }

// === Destroy (package-only) ===
public(package) fun destroy(nft: SalvageNFT) {
    let SalvageNFT { id, .. } = nft;
    id.delete();
}
