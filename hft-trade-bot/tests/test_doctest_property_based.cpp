// Property-based testing for C++ HFT strategies
// Generates random market data sequences and verifies invariants:
//   1. After opposite fill, position is closed or reversed
//   2. Unrealized PnL is consistent with position direction and price
//   3. Adding to position updates weighted average entry
//   4. Multiple positions on different symbols are independent
//   5. Candle data high >= low always
//   6. Rapid open/close cycles leave no position
//   7. check_sl_tp detects correct trigger direction
//   8. Realized PnL correct after close
//
// Build: linked via CMakeLists.txt as test_doctest_property_based
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/data/types.h"
#include "../src/position/position_manager_v2.h"
#include <cmath>
#include <random>
#include <unordered_map>
#include <vector>

using namespace hft;

// ─── Random Data Generators ───

struct RNG {
    std::mt19937_64 gen;
    explicit RNG(uint64_t seed) : gen(seed) {}

    double uniform(double lo, double hi) {
        std::uniform_real_distribution<double> d(lo, hi);
        return d(gen);
    }

    double price(double base = 65000.0, double vol = 0.02) {
        return base * (1.0 + uniform(-vol, vol));
    }

    double qty(double lo = 0.01, double hi = 1.0) { return uniform(lo, hi); }
};

struct Candle {
    double open, high, low, close, volume;
};

std::vector<Candle> generate_candles(RNG& rng, int n, double base_price = 65000.0) {
    std::vector<Candle> candles;
    double              prev_close = base_price;
    for (int i = 0; i < n; ++i) {
        double open   = prev_close;
        double change = rng.uniform(-0.01, 0.01);
        double close  = open * (1.0 + change);
        double high   = std::max(open, close) * (1.0 + rng.uniform(0, 0.005));
        double low    = std::min(open, close) * (1.0 - rng.uniform(0, 0.005));
        double volume = rng.qty(0.5, 5.0);
        candles.push_back({open, high, low, close, volume});
        prev_close = close;
    }
    return candles;
}

// ─── Property Tests ───

TEST_CASE("Property: Opposite fill closes position") {
    for (uint64_t seed = 1; seed <= 100; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry      = rng.price();
        double qty        = rng.qty();
        double exit_price = entry * (1.0 + rng.uniform(-0.05, 0.05));

        // Open long via on_fill
        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);
        REQUIRE(mgr.has_position("BTC/USDT"));

        // Close via opposite fill
        mgr.on_fill("BTC/USDT", "binance", Side::SELL, qty, exit_price, 0.0, 1, 1);

        // Invariant: position is closed
        CHECK_FALSE(mgr.has_position("BTC/USDT"));
    }
}

TEST_CASE("Property: Unrealized PnL consistency for longs") {
    for (uint64_t seed = 1; seed <= 200; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry   = rng.price();
        double qty     = rng.qty();
        double current = entry * (1.0 + rng.uniform(-0.1, 0.1));

        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);
        mgr.update_mark_prices({{"BTC/USDT", current}});

        auto pos = mgr.get_position("BTC/USDT");
        REQUIRE(pos.is_open());

        // Invariant: unrealized_pnl = (current - entry) * qty for longs
        double expected_pnl = (current - entry) * qty;
        CHECK(pos.unrealized_pnl == doctest::Approx(expected_pnl).epsilon(0.01));
    }
}

TEST_CASE("Property: Unrealized PnL consistency for shorts") {
    for (uint64_t seed = 1; seed <= 200; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry   = rng.price();
        double qty     = rng.qty();
        double current = entry * (1.0 + rng.uniform(-0.1, 0.1));

        mgr.on_fill("BTC/USDT", "binance", Side::SELL, qty, entry, 0.0, 1, 1);
        mgr.update_mark_prices({{"BTC/USDT", current}});

        auto pos = mgr.get_position("BTC/USDT");
        REQUIRE(pos.is_open());

        // Invariant: unrealized_pnl = (entry - current) * qty for shorts
        double expected_pnl = (entry - current) * qty;
        CHECK(pos.unrealized_pnl == doctest::Approx(expected_pnl).epsilon(0.01));
    }
}

TEST_CASE("Property: No position after close") {
    for (uint64_t seed = 1; seed <= 100; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry = rng.price();
        double qty   = rng.qty();

        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);
        REQUIRE(mgr.has_position("BTC/USDT"));

        mgr.on_fill("BTC/USDT", "binance", Side::SELL, qty,
                    entry * (1.0 + rng.uniform(-0.05, 0.05)), 0.0, 1, 1);

        // Invariant: position is closed
        CHECK_FALSE(mgr.has_position("BTC/USDT"));
    }
}

TEST_CASE("Property: Multiple positions on different symbols are independent") {
    for (uint64_t seed = 1; seed <= 50; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double btc_entry = rng.price(65000.0);
        double eth_entry = rng.price(3500.0);
        double btc_qty   = rng.qty();
        double eth_qty   = rng.qty();

        mgr.on_fill("BTC/USDT", "binance", Side::BUY, btc_qty, btc_entry, 0.0, 1, 1);
        mgr.on_fill("ETH/USDT", "binance", Side::SELL, eth_qty, eth_entry, 0.0, 2, 2);

        // Close BTC position
        mgr.on_fill("BTC/USDT", "binance", Side::SELL, btc_qty, btc_entry * 1.01, 0.0, 1, 1);

        // Invariant: ETH position still open
        CHECK_FALSE(mgr.has_position("BTC/USDT"));
        CHECK(mgr.has_position("ETH/USDT"));
    }
}

TEST_CASE("Property: Adding to position updates weighted average entry") {
    for (uint64_t seed = 1; seed <= 100; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry1 = rng.price();
        double qty1   = rng.qty();
        double entry2 = entry1 * (1.0 + rng.uniform(-0.02, 0.02));
        double qty2   = rng.qty();

        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty1, entry1, 0.0, 1, 1);
        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty2, entry2, 0.0, 1, 1);

        auto pos = mgr.get_position("BTC/USDT");
        REQUIRE(pos.is_open());

        // Invariant: entry_price = weighted average
        double expected = (entry1 * qty1 + entry2 * qty2) / (qty1 + qty2);
        CHECK(pos.entry_price == doctest::Approx(expected).epsilon(0.001));
        CHECK(pos.quantity == doctest::Approx(qty1 + qty2).epsilon(0.001));
    }
}

TEST_CASE("Property: Candle data high >= low always") {
    for (uint64_t seed = 1; seed <= 500; ++seed) {
        RNG  rng(seed);
        auto candles = generate_candles(rng, 50);

        for (const auto& c : candles) {
            CHECK(c.high >= c.low);
            CHECK(c.high >= c.open);
            CHECK(c.high >= c.close);
            CHECK(c.low <= c.open);
            CHECK(c.low <= c.close);
            CHECK(c.volume > 0);
        }
    }
}

TEST_CASE("Property: Position manager handles rapid open/close cycles") {
    for (uint64_t seed = 1; seed <= 50; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        for (int i = 0; i < 20; ++i) {
            double entry = rng.price();
            double qty   = rng.qty();
            mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);
            REQUIRE(mgr.has_position("BTC/USDT"));
            mgr.on_fill("BTC/USDT", "binance", Side::SELL, qty,
                        entry * (1.0 + rng.uniform(-0.01, 0.01)), 0.0, 1, 1);
            CHECK_FALSE(mgr.has_position("BTC/USDT"));
        }

        CHECK_FALSE(mgr.has_position("BTC/USDT"));
    }
}

TEST_CASE("Property: check_sl_tp detects correct trigger direction") {
    for (uint64_t seed = 1; seed <= 100; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry = rng.price();
        double qty   = rng.qty();

        // Open long
        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);

        // Price drops significantly — should trigger SL
        double sl_price = entry * 0.95;
        auto   triggers = mgr.check_sl_tp({{"BTC/USDT", sl_price}}, 2.0, 3.0);
        CHECK_FALSE(triggers.empty());
        CHECK(triggers[0].reason == "STOP_LOSS");

        // Price rises significantly — should trigger TP
        mgr.reset();
        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);
        double tp_price = entry * 1.10;
        triggers        = mgr.check_sl_tp({{"BTC/USDT", tp_price}}, 2.0, 3.0);
        CHECK_FALSE(triggers.empty());
        CHECK(triggers[0].reason == "TAKE_PROFIT");
    }
}

TEST_CASE("Property: realized PnL correct after close") {
    for (uint64_t seed = 1; seed <= 100; ++seed) {
        RNG               rng(seed);
        PositionManagerV2 mgr;

        double entry      = rng.price();
        double qty        = rng.qty();
        double exit_price = entry * (1.0 + rng.uniform(-0.05, 0.05));

        mgr.on_fill("BTC/USDT", "binance", Side::BUY, qty, entry, 0.0, 1, 1);
        mgr.on_fill("BTC/USDT", "binance", Side::SELL, qty, exit_price, 0.0, 1, 1);

        // Invariant: realized_pnl = (exit - entry) * qty for longs
        double expected_pnl = (exit_price - entry) * qty;
        auto   pos          = mgr.get_position("BTC/USDT");
        CHECK(pos.realized_pnl == doctest::Approx(expected_pnl).epsilon(0.01));
    }
}
