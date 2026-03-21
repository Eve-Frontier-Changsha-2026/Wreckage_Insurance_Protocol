#[test_only]
module wreckage_protocol::pool_config_tests;

use wreckage_protocol::pool_config;

#[test]
fun test_create_valid_pool_config() {
    let config = pool_config::test_pool_config();
    assert!(pool_config::risk_tier(&config) == 2);
    assert!(pool_config::base_premium_rate(&config) == 500);
    assert!(pool_config::deductible_bps(&config) == 1000);
    assert!(pool_config::max_ncb_total_discount_bps(&config) == 3000);
}

#[test]
#[expected_failure]
fun test_premium_rate_below_minimum() {
    pool_config::new_pool_config(
        1, 10, // premium rate 10 bps < 50 minimum
        50_000_000_000, 1_000_000_000,
        172800, 1000, 7000, 604800, 5000, 2,
        1000, 1000, 3, 3000, 2000, 86400,
    );
}

#[test]
#[expected_failure]
fun test_ncb_discount_exceeds_cap() {
    // 1500 bps * 3 streak = 4500 > max 3000
    pool_config::new_pool_config(
        1, 500, 50_000_000_000, 1_000_000_000,
        172800, 1000, 7000, 604800, 5000, 2,
        1000, 1500, 3, 3000, 2000, 86400,
    );
}

#[test]
fun test_create_valid_auction_config() {
    let config = pool_config::test_auction_config();
    assert!(pool_config::auction_duration(&config) == 259200);
    assert!(pool_config::anti_snipe_window(&config) == 600);
}
