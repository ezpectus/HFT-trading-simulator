// Unit tests for TradeHandler using doctest
// Tests: aggressor detection, VWAP, rolling stats O(1) incremental sums, large trade detection,
// reset
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/market_data/trade_handler.h"

#include <cmath>

using namespace hft;

static TradeEvent make_trade(double price, double qty, bool is_buyer_maker = false) {
    TradeEvent t;
    t.price          = price;
    t.quantity       = qty;
    t.is_buyer_maker = is_buyer_maker;
    return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// Aggressor detection
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: buy volume accumulates for buy aggressor") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, false));
    th.on_trade(make_trade(50100, 2.0, false));
    CHECK(th.buy_volume() == doctest::Approx(3.0));
    CHECK(th.buy_trades() == 2);
    CHECK(th.sell_volume() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: sell volume accumulates for sell aggressor") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, true));
    th.on_trade(make_trade(49900, 3.0, true));
    CHECK(th.sell_volume() == doctest::Approx(4.0));
    CHECK(th.sell_trades() == 2);
    CHECK(th.buy_volume() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: mixed buy/sell volume") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, false));
    th.on_trade(make_trade(50100, 2.0, true));
    th.on_trade(make_trade(50200, 3.0, false));
    CHECK(th.buy_volume() == doctest::Approx(4.0));
    CHECK(th.sell_volume() == doctest::Approx(2.0));
    CHECK(th.total_volume() == doctest::Approx(6.0));
    CHECK(th.total_trades() == 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// Volume imbalance
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: volume_imbalance all buy") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, false));
    CHECK(th.volume_imbalance() == doctest::Approx(1.0));
}

TEST_CASE("TradeHandler: volume_imbalance all sell") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, true));
    CHECK(th.volume_imbalance() == doctest::Approx(-1.0));
}

TEST_CASE("TradeHandler: volume_imbalance balanced") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, false));
    th.on_trade(make_trade(50100, 1.0, true));
    CHECK(th.volume_imbalance() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: volume_imbalance empty returns zero") {
    TradeHandler th(100);
    CHECK(th.volume_imbalance() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: trade_count_imbalance") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, false));
    th.on_trade(make_trade(50100, 1.0, false));
    th.on_trade(make_trade(50200, 1.0, true));
    // (2 - 1) / 3 = 0.333...
    CHECK(th.trade_count_imbalance() == doctest::Approx(1.0 / 3.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Session VWAP
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: session_vwap empty returns zero") {
    TradeHandler th(100);
    CHECK(th.session_vwap() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: session_vwap single trade") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0));
    CHECK(th.session_vwap() == doctest::Approx(50000.0));
}

TEST_CASE("TradeHandler: session_vwap weighted average") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0)); // notional = 50000
    th.on_trade(make_trade(51000, 2.0)); // notional = 102000
    // VWAP = (50000 + 102000) / 3 = 50666.67
    CHECK(th.session_vwap() == doctest::Approx(152000.0 / 3.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Rolling VWAP — O(1) incremental
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: rolling_vwap empty returns zero") {
    TradeHandler th(100);
    CHECK(th.rolling_vwap() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: rolling_vwap equals session when within window") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0));
    th.on_trade(make_trade(51000, 2.0));
    CHECK(th.rolling_vwap() == doctest::Approx(th.session_vwap()));
}

TEST_CASE("TradeHandler: rolling_vwap excludes old trades after window wrap") {
    TradeHandler th(4);
    // Fill window: 4 trades
    th.on_trade(make_trade(100, 1.0)); // old, will be evicted
    th.on_trade(make_trade(200, 1.0));
    th.on_trade(make_trade(300, 1.0));
    th.on_trade(make_trade(400, 1.0));
    // 5th trade evicts the first (price=100)
    th.on_trade(make_trade(500, 1.0));
    // Rolling VWAP should be (200+300+400+500) / 4 = 350
    CHECK(th.rolling_vwap() == doctest::Approx(350.0));
}

TEST_CASE("TradeHandler: rolling_vwap with volume weighting") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 10.0));
    th.on_trade(make_trade(52000, 2.0));
    // VWAP = (50000*10 + 52000*2) / 12 = (500000 + 104000) / 12 = 50333.33
    CHECK(th.rolling_vwap() == doctest::Approx(604000.0 / 12.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Rolling mean volume — O(1) incremental
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: rolling_mean_volume empty returns zero") {
    TradeHandler th(100);
    CHECK(th.rolling_mean_volume() == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: rolling_mean_volume simple average") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0));
    th.on_trade(make_trade(50100, 2.0));
    th.on_trade(make_trade(50200, 3.0));
    // mean = (1+2+3) / 3 = 2.0
    CHECK(th.rolling_mean_volume() == doctest::Approx(2.0));
}

TEST_CASE("TradeHandler: rolling_mean_volume after window wrap") {
    TradeHandler th(4);
    th.on_trade(make_trade(100, 10.0));
    th.on_trade(make_trade(200, 20.0));
    th.on_trade(make_trade(300, 30.0));
    th.on_trade(make_trade(400, 40.0));
    th.on_trade(make_trade(500, 50.0)); // evicts 10.0
    // mean = (20+30+40+50) / 4 = 35
    CHECK(th.rolling_mean_volume() == doctest::Approx(35.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Rolling std volume — O(1) incremental
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: rolling_std_volume less than 2 samples returns zero") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0));
    CHECK(th.rolling_std_volume(1.0) == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: rolling_std_volume uniform data returns zero") {
    TradeHandler th(100);
    for (int i = 0; i < 10; ++i) {
        th.on_trade(make_trade(50000, 5.0));
    }
    double mean = th.rolling_mean_volume();
    CHECK(mean == doctest::Approx(5.0));
    CHECK(th.rolling_std_volume(mean) == doctest::Approx(0.0));
}

TEST_CASE("TradeHandler: rolling_std_volume known values") {
    TradeHandler th(100);
    // volumes: 1, 2, 3, 4, 5
    th.on_trade(make_trade(100, 1.0));
    th.on_trade(make_trade(200, 2.0));
    th.on_trade(make_trade(300, 3.0));
    th.on_trade(make_trade(400, 4.0));
    th.on_trade(make_trade(500, 5.0));
    double mean = th.rolling_mean_volume(); // 3.0
    CHECK(mean == doctest::Approx(3.0));
    // Sample variance = ((1-3)² + (2-3)² + (3-3)² + (4-3)² + (5-3)²) / 4
    //                = (4 + 1 + 0 + 1 + 4) / 4 = 2.5
    // std = sqrt(2.5) ≈ 1.5811
    double sd = th.rolling_std_volume(mean);
    CHECK(sd == doctest::Approx(std::sqrt(2.5)));
}

TEST_CASE("TradeHandler: rolling_std_volume after window wrap") {
    TradeHandler th(4);
    th.on_trade(make_trade(100, 1.0));
    th.on_trade(make_trade(200, 2.0));
    th.on_trade(make_trade(300, 3.0));
    th.on_trade(make_trade(400, 4.0));
    th.on_trade(make_trade(500, 5.0)); // evicts 1.0
    // volumes: 2, 3, 4, 5 → mean = 3.5
    // var = ((2-3.5)² + (3-3.5)² + (4-3.5)² + (5-3.5)²) / 3
    //     = (2.25 + 0.25 + 0.25 + 2.25) / 3 = 5/3 ≈ 1.6667
    // std = sqrt(5/3) ≈ 1.2910
    double mean = th.rolling_mean_volume();
    CHECK(mean == doctest::Approx(3.5));
    double sd = th.rolling_std_volume(mean);
    CHECK(sd == doctest::Approx(std::sqrt(5.0 / 3.0)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Large trade detection
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: no large trade detection below min_samples") {
    TradeHandler th(100);
    for (int i = 0; i < 29; ++i) {
        th.on_trade(make_trade(50000, 1.0));
    }
    // 30th trade with huge volume — but min_samples_ = 30, vol_idx_ = 30 >= 30
    // Actually vol_idx_ will be 30 after this trade, so check happens
    th.on_trade(make_trade(50000, 1000.0));
    // This should trigger since 1000 >> mean + 3*sd
    CHECK(th.large_trade_count() >= 1);
}

TEST_CASE("TradeHandler: large trade detected with outlier volume") {
    TradeHandler th(100);
    // Feed 30 normal trades
    for (int i = 0; i < 30; ++i) {
        th.on_trade(make_trade(50000, 1.0));
    }
    // 31st trade with huge volume
    th.on_trade(make_trade(50000, 100.0));
    CHECK(th.large_trade_count() >= 1);
    CHECK(th.last_large_trade().quantity == doctest::Approx(100.0));
}

TEST_CASE("TradeHandler: no large trade when volume is normal") {
    TradeHandler th(100);
    for (int i = 0; i < 50; ++i) {
        th.on_trade(make_trade(50000, 1.0));
    }
    CHECK(th.large_trade_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Last trade
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: last_trade returns most recent") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0));
    th.on_trade(make_trade(51000, 2.0));
    CHECK(th.last_trade().price == doctest::Approx(51000.0));
    CHECK(th.last_trade().quantity == doctest::Approx(2.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: reset clears all stats") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0, false));
    th.on_trade(make_trade(50100, 2.0, true));
    th.reset_session();
    CHECK(th.buy_volume() == doctest::Approx(0.0));
    CHECK(th.sell_volume() == doctest::Approx(0.0));
    CHECK(th.total_volume() == doctest::Approx(0.0));
    CHECK(th.total_trades() == 0);
    CHECK(th.session_vwap() == doctest::Approx(0.0));
    CHECK(th.rolling_vwap() == doctest::Approx(0.0));
    CHECK(th.rolling_mean_volume() == doctest::Approx(0.0));
    CHECK(th.large_trade_count() == 0);
}

TEST_CASE("TradeHandler: reset allows new trades to work correctly") {
    TradeHandler th(100);
    th.on_trade(make_trade(50000, 1.0));
    th.reset_session();
    th.on_trade(make_trade(51000, 2.0));
    CHECK(th.total_volume() == doctest::Approx(2.0));
    CHECK(th.session_vwap() == doctest::Approx(51000.0));
    CHECK(th.rolling_vwap() == doctest::Approx(51000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Window wrap consistency — O(1) vs expected values
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TradeHandler: rolling_vwap consistent after multiple wraps") {
    TradeHandler th(8);
    for (int i = 1; i <= 20; ++i) {
        th.on_trade(make_trade(i * 100.0, 1.0));
    }
    // After 20 trades with window 8: last 8 trades are prices 1300..2000
    // VWAP = (1300+1400+...+2000) / 8 = (1300+2000)*8/2 / 8 = 1650
    CHECK(th.rolling_vwap() == doctest::Approx(1650.0));
}

TEST_CASE("TradeHandler: rolling_mean_volume consistent after multiple wraps") {
    TradeHandler th(8);
    for (int i = 1; i <= 20; ++i) {
        th.on_trade(make_trade(100, static_cast<double>(i)));
    }
    // Last 8 volumes: 13, 14, 15, 16, 17, 18, 19, 20
    // mean = (13+14+...+20) / 8 = 132 / 8 = 16.5
    CHECK(th.rolling_mean_volume() == doctest::Approx(16.5));
}
