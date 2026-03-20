// contracts/wreckage-core/tests/salvage_nft_tests.move
#[test_only]
module wreckage_core::salvage_nft_tests;

use wreckage_core::salvage_nft;

#[test]
fun test_status_constants() {
    assert!(salvage_nft::status_auction() == 0);
    assert!(salvage_nft::status_sold() == 1);
    assert!(salvage_nft::status_destroyed() == 2);
}
// Note: full mint tests require TenantItemId, tested in wreckage-protocol e2e tests
