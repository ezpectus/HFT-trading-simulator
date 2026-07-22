// Unit tests for CandleAggregator using doctest
// Tests: time-based, volume-based, tick-based aggregation, flush, zero-price edge case
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/market_data/candle_aggregator.h"

#include <cmath>
#include <vector>

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Construction & config
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: time-based construction") {
    CandleAggregator agg("BTCUSDT", "binance", static_cast<int64_t>(5));
    CHECK(agg.mode() == CandleMode::TIME);
    CHECK(agg.interval_ns() == 5 * 1'000'000'000LL);
    CHECK(agg.candle_count() == 0);
}

TEST_CASE("CandleAggregator: volume-based construction") {
    CandleAggregator agg("BTCUSDT", "binance", 100.0);
    CHECK(agg.mode() == CandleMode::VOLUME);
    CHECK(agg.threshold() == doctest::Approx(100.0));
}

TEST_CASE("CandleAggregator: tick-based construction") {
    CandleAggregator agg("BTCUSDT", "binance", static_cast<uint64_t>(10));
    CHECK(agg.mode() == CandleMode::TICK);
    CHECK(agg.threshold() == doctest::Approx(10.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Time-based aggregation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: time-based emits after interval") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(1),
                            [&](const Candle& c) { emitted.push_back(c); });

    // Tick at t=0
    agg.on_trade(0, 50000.0, 1.0);
    // Tick at t=0.5s — same bar
    agg.on_trade(500'000'000, 50100.0, 0.5);
    // Tick at t=1s — triggers emit
    agg.on_trade(1'000'000'000, 50200.0, 0.5);

    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].open == doctest::Approx(50000.0));
    CHECK(emitted[0].high == doctest::Approx(50200.0));
    CHECK(emitted[0].low == doctest::Approx(50000.0));
    CHECK(emitted[0].close == doctest::Approx(50200.0));
    CHECK(emitted[0].volume == doctest::Approx(2.0));
    CHECK(emitted[0].symbol == "BTCUSDT");
    CHECK(emitted[0].exchange == "binance");
}

TEST_CASE("CandleAggregator: time-based no emit before interval") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(5),
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000'000, 50100.0, 1.0);
    agg.on_trade(2'000'000'000, 50200.0, 1.0);
    agg.on_trade(3'000'000'000, 50300.0, 1.0);
    agg.on_trade(4'000'000'000, 50400.0, 1.0);

    CHECK(emitted.empty());
    CHECK(agg.candle_count() == 0);
}

TEST_CASE("CandleAggregator: time-based multiple bars") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(1),
                            [&](const Candle& c) { emitted.push_back(c); });

    // Bar 1
    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000'000, 51000.0, 1.0);
    // Bar 2
    agg.on_trade(1'500'000'000, 52000.0, 1.0);
    agg.on_trade(2'500'000'000, 53000.0, 1.0);

    REQUIRE(emitted.size() == 2);
    CHECK(emitted[0].open == doctest::Approx(50000.0));
    CHECK(emitted[0].close == doctest::Approx(51000.0));
    CHECK(emitted[1].open == doctest::Approx(52000.0));
    CHECK(emitted[1].close == doctest::Approx(53000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Volume-based aggregation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: volume-based emits at threshold") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", 10.0,
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.on_trade(0, 50000.0, 3.0);
    agg.on_trade(1'000'000, 50100.0, 3.0);
    agg.on_trade(2'000'000, 50200.0, 4.0); // total = 10 → emit

    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].volume == doctest::Approx(10.0));
}

TEST_CASE("CandleAggregator: volume-based no emit below threshold") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", 10.0,
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.on_trade(0, 50000.0, 3.0);
    agg.on_trade(1'000'000, 50100.0, 3.0);

    CHECK(emitted.empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// Tick-based aggregation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: tick-based emits at tick count") {
    std::vector<Candle> emitted;
    CandleAggregator    agg(
        "BTCUSDT", "binance", static_cast<uint64_t>(3),
        [&](const Candle& c) { emitted.push_back(c); }, true);

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000, 50100.0, 1.0);
    agg.on_trade(2'000'000, 50200.0, 1.0); // 3 ticks → emit

    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].close == doctest::Approx(50200.0));
}

TEST_CASE("CandleAggregator: tick-based no emit below count") {
    std::vector<Candle> emitted;
    CandleAggregator    agg(
        "BTCUSDT", "binance", static_cast<uint64_t>(5),
        [&](const Candle& c) { emitted.push_back(c); }, true);

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000, 50100.0, 1.0);
    agg.on_trade(2'000'000, 50200.0, 1.0);

    CHECK(emitted.empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// OHLC correctness
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: OHLC tracks high and low correctly") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(1),
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(200'000'000, 49500.0, 1.0); // low
    agg.on_trade(400'000'000, 51000.0, 1.0); // high
    agg.on_trade(600'000'000, 50500.0, 1.0);
    agg.on_trade(1'000'000'000, 50800.0, 1.0); // close + emit

    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].open == doctest::Approx(50000.0));
    CHECK(emitted[0].high == doctest::Approx(51000.0));
    CHECK(emitted[0].low == doctest::Approx(49500.0));
    CHECK(emitted[0].close == doctest::Approx(50800.0));
}

TEST_CASE("CandleAggregator: volume accumulates correctly") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(1),
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.on_trade(0, 50000.0, 1.5);
    agg.on_trade(200'000'000, 50100.0, 2.5);
    agg.on_trade(400'000'000, 50200.0, 3.0);
    agg.on_trade(1'000'000'000, 50300.0, 1.0);

    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].volume == doctest::Approx(8.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Flush
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: flush emits incomplete candle") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(10),
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000, 50100.0, 1.0);
    CHECK(emitted.empty());

    agg.flush();
    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].open == doctest::Approx(50000.0));
    CHECK(emitted[0].close == doctest::Approx(50100.0));
}

TEST_CASE("CandleAggregator: flush on empty does nothing") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(10),
                            [&](const Candle& c) { emitted.push_back(c); });

    agg.flush();
    CHECK(emitted.empty());
    CHECK(agg.candle_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Zero-price edge case (regression test for bar_active_ fix)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: zero price first tick initializes bar") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(1),
                            [&](const Candle& c) { emitted.push_back(c); });

    // First tick with price 0.0 — should still initialize the bar
    agg.on_trade(0, 0.0, 1.0);
    agg.on_trade(500'000'000, 100.0, 1.0);
    agg.on_trade(1'000'000'000, 200.0, 1.0); // emit

    REQUIRE(emitted.size() == 1);
    CHECK(emitted[0].open == doctest::Approx(0.0));
    CHECK(emitted[0].high == doctest::Approx(200.0));
    CHECK(emitted[0].low == doctest::Approx(0.0));
    CHECK(emitted[0].close == doctest::Approx(200.0));
}

TEST_CASE("CandleAggregator: zero price after bar reset starts new bar") {
    std::vector<Candle> emitted;
    CandleAggregator    agg("BTCUSDT", "binance", static_cast<int64_t>(1),
                            [&](const Candle& c) { emitted.push_back(c); });

    // First bar with normal prices
    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000'000, 51000.0, 1.0); // emit bar 1

    // Second bar starts with price 0.0
    agg.on_trade(1'500'000'000, 0.0, 1.0);
    agg.on_trade(2'500'000'000, 100.0, 1.0); // emit bar 2

    REQUIRE(emitted.size() == 2);
    CHECK(emitted[0].open == doctest::Approx(50000.0));
    CHECK(emitted[1].open == doctest::Approx(0.0));
    CHECK(emitted[1].high == doctest::Approx(100.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Current candle access
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: current_candle returns in-progress bar") {
    CandleAggregator agg("BTCUSDT", "binance", static_cast<int64_t>(10));

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000, 50100.0, 1.0);

    auto& c = agg.current_candle();
    CHECK(c.open == doctest::Approx(50000.0));
    CHECK(c.close == doctest::Approx(50100.0));
    CHECK(c.volume == doctest::Approx(2.0));
}

TEST_CASE("CandleAggregator: candle_count tracks total emissions") {
    CandleAggregator agg("BTCUSDT", "binance", static_cast<int64_t>(1));

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000'000, 51000.0, 1.0); // bar 1
    agg.on_trade(2'000'000'000, 52000.0, 1.0); // bar 2
    agg.on_trade(3'000'000'000, 53000.0, 1.0); // bar 3

    CHECK(agg.candle_count() == 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// No callback
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CandleAggregator: works without callback") {
    CandleAggregator agg("BTCUSDT", "binance", static_cast<int64_t>(1));

    agg.on_trade(0, 50000.0, 1.0);
    agg.on_trade(1'000'000'000, 51000.0, 1.0);

    // Should not crash, should still count
    CHECK(agg.candle_count() == 1);
}
