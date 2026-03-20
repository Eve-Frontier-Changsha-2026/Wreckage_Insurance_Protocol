// contracts/wreckage-core/tests/rider_tests.move
#[test_only]
module wreckage_core::rider_tests;

use wreckage_core::rider;
use wreckage_core::pool_config;

#[test]
fun test_rider_premium_calculation() {
    let config = pool_config::test_pool_config(); // SD rate = 7000 = 70%
    let premium = rider::calculate_rider_premium(10_000_000_000, &config); // 10 SUI
    assert!(premium == 7_000_000_000); // 70% of 10 SUI
}

#[test]
fun test_waiting_period_check() {
    let config = pool_config::test_pool_config(); // SD waiting = 604800 (7d)
    assert!(!rider::is_waiting_period_elapsed(1000, 1000 + 604799, &config));
    assert!(rider::is_waiting_period_elapsed(1000, 1000 + 604800, &config));
}

#[test]
fun test_self_destruct_payout_reduction() {
    let config = pool_config::test_pool_config(); // SD payout rate = 5000 = 50%
    let payout = rider::calculate_self_destruct_payout(10_000_000_000, &config);
    assert!(payout == 5_000_000_000); // 50% of 10 SUI
}
