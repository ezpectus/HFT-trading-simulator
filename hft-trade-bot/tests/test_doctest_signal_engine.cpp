// Unit tests for SignalEngineV2 indicator classes using doctest
// Tests: InlineEMA, InlineRSI, InlineADX, InlineVWAP, InlineATR, Params validation
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/strategies/signal_engine_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// InlineEMA tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("InlineEMA initialization and update") {
    InlineEMA ema(10);
    CHECK_FALSE(ema.ready());
    ema.init(100.0);
    CHECK(ema.ready());
    CHECK(ema.value() == doctest::Approx(100.0));
    ema.update(110.0);
    // k = 2/11, ema = 110 * (2/11) + 100 * (9/11) = 20 + 81.818 = 101.818
    CHECK(ema.value() == doctest::Approx(101.818).epsilon(0.01));
}

TEST_CASE("InlineEMA converges to value") {
    InlineEMA ema(5);
    ema.init(50.0);
    for (int i = 0; i < 100; ++i) {
        ema.update(100.0);
    }
    CHECK(ema.value() == doctest::Approx(100.0).epsilon(0.01));
}

TEST_CASE("InlineEMA auto-init on first update") {
    InlineEMA ema(10);
    CHECK_FALSE(ema.ready());
    ema.update(42.0);
    CHECK(ema.ready());
    CHECK(ema.value() == doctest::Approx(42.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// InlineRSI tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("InlineRSI returns 50 before ready") {
    InlineRSI rsi(14);
    rsi.init(100.0);
    // Before period completes, should return 50
    for (int i = 0; i < 10; ++i) {
        double val = rsi.update(100.0 + i);
        CHECK(val == doctest::Approx(50.0));
    }
}

TEST_CASE("InlineRSI ready after period updates") {
    InlineRSI rsi(14);
    rsi.init(100.0);
    for (int i = 0; i < 14; ++i) {
        rsi.update(100.0 + i * 0.5);
    }
    CHECK(rsi.ready());
    CHECK(rsi.value() > 50.0); // Rising prices → RSI > 50
}

TEST_CASE("InlineRSI all gains → near 100") {
    InlineRSI rsi(5);
    rsi.init(100.0);
    for (int i = 0; i < 20; ++i) {
        rsi.update(100.0 + i + 1); // Always increasing
    }
    CHECK(rsi.value() > 90.0);
}

TEST_CASE("InlineRSI all losses → near 0") {
    InlineRSI rsi(5);
    rsi.init(100.0);
    for (int i = 0; i < 20; ++i) {
        rsi.update(100.0 - i - 1); // Always decreasing
    }
    CHECK(rsi.value() < 10.0);
}

TEST_CASE("InlineRSI flat prices → near 50") {
    InlineRSI rsi(5);
    rsi.init(100.0);
    for (int i = 0; i < 20; ++i) {
        rsi.update(100.0); // No change
    }
    CHECK(rsi.value() == doctest::Approx(50.0).epsilon(0.01));
}

// ═══════════════════════════════════════════════════════════════════════════
// InlineADX tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("InlineADX returns 0 before ready") {
    InlineADX adx(14);
    double    val = adx.update(100, 95, 98);
    CHECK(val == doctest::Approx(0.0));
}

TEST_CASE("InlineADX ready after period") {
    InlineADX adx(5);
    for (int i = 0; i < 10; ++i) {
        adx.update(100 + i, 95 + i, 98 + i); // Uptrending
    }
    CHECK(adx.ready());
    CHECK(adx.value() > 0.0);
}

TEST_CASE("InlineADX strong trend produces high ADX") {
    InlineADX adx(5);
    // Strong uptrend
    for (int i = 0; i < 30; ++i) {
        adx.update(100 + i * 2, 95 + i * 2, 98 + i * 2);
    }
    CHECK(adx.value() > 20.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// InlineVWAP tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("InlineVWAP basic calculation") {
    InlineVWAP vwap;
    // tp = (100 + 95 + 98) / 3 = 97.67
    vwap.update(100, 95, 98, 1000);
    CHECK(vwap.value() == doctest::Approx(97.67).epsilon(0.01));
}

TEST_CASE("InlineVWAP with zero volume returns 0") {
    InlineVWAP vwap;
    CHECK(vwap.value() == doctest::Approx(0.0));
}

TEST_CASE("InlineVWAP deviation_bps") {
    InlineVWAP vwap;
    vwap.update(100, 100, 100, 1000); // VWAP = 100
    double dev = vwap.deviation_bps(101);
    CHECK(dev == doctest::Approx(100.0).epsilon(0.1)); // 1bp = 0.01%, 100bps = 1%
}

TEST_CASE("InlineVWAP z_score") {
    InlineVWAP vwap;
    for (int i = 0; i < 20; ++i) {
        vwap.update(100 + i * 0.5, 99 + i * 0.5, 99.5 + i * 0.5, 100);
    }
    double z = vwap.z_score(105);
    CHECK(z != 0.0);
}

TEST_CASE("InlineVWAP reset") {
    InlineVWAP vwap;
    vwap.update(100, 95, 98, 1000);
    CHECK(vwap.value() != 0.0);
    vwap.reset();
    CHECK(vwap.value() == 0.0);
}

TEST_CASE("InlineVWAP std_dev positive with variance") {
    InlineVWAP vwap;
    vwap.update(100, 100, 100, 1000);
    vwap.update(110, 110, 110, 1000);
    vwap.update(90, 90, 90, 1000);
    // tp values: 100, 110, 90 → mean=100, variance > 0
    CHECK(vwap.std_dev() > 0.0);
}

TEST_CASE("InlineVWAP std_dev zero with constant prices") {
    InlineVWAP vwap;
    for (int i = 0; i < 10; ++i) {
        vwap.update(100, 100, 100, 1000);
    }
    // All tp = 100, no variance
    CHECK(vwap.std_dev() == doctest::Approx(0.0).epsilon(1e-6));
}

TEST_CASE("InlineVWAP Welford variance correctness") {
    // Regression: Welford's weighted variance should match naive computation
    InlineVWAP vwap;
    struct DataPoint {
        double h, l, c, v;
    };
    DataPoint data[] = {
        {100, 95, 98, 1000}, {105, 100, 103, 1500}, {110, 105, 108, 2000},
        {95, 90, 92, 800},   {102, 97, 100, 1200},
    };

    // Naive computation
    double total_pv = 0, total_v = 0;
    for (const auto& d : data) {
        double tp = (d.h + d.l + d.c) / 3.0;
        total_pv += tp * d.v;
        total_v += d.v;
    }
    double mean      = total_pv / total_v;
    double naive_var = 0;
    for (const auto& d : data) {
        double tp = (d.h + d.l + d.c) / 3.0;
        naive_var += d.v * (tp - mean) * (tp - mean);
    }
    naive_var /= total_v;
    double naive_std = std::sqrt(naive_var);

    // InlineVWAP computation
    for (const auto& d : data) {
        vwap.update(d.h, d.l, d.c, d.v);
    }

    CHECK(vwap.value() == doctest::Approx(mean).epsilon(0.001));
    CHECK(vwap.std_dev() == doctest::Approx(naive_std).epsilon(0.01));
}

// ═══════════════════════════════════════════════════════════════════════════
// InlineATR tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("InlineATR first update returns high-low") {
    InlineATR atr(14);
    double    val = atr.update(105, 95, 100);
    CHECK(val == doctest::Approx(10.0)); // 105 - 95
}

TEST_CASE("InlineATR ready after period") {
    InlineATR atr(5);
    for (int i = 0; i < 10; ++i) {
        atr.update(100 + i, 95 + i, 98 + i);
    }
    CHECK(atr.ready());
    CHECK(atr.value() > 0.0);
}

TEST_CASE("InlineATR with constant range converges") {
    InlineATR atr(5);
    for (int i = 0; i < 20; ++i) {
        atr.update(105, 95, 100); // Constant 10 range
    }
    CHECK(atr.value() == doctest::Approx(10.0).epsilon(0.1));
}

// ═══════════════════════════════════════════════════════════════════════════
// SignalEngineV2::Params tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SignalEngineV2 default params") {
    SignalEngineV2::Params p;
    CHECK(p.ema_fast_period == 21);
    CHECK(p.ema_slow_period == 50);
    CHECK(p.rsi_period == 14);
    CHECK(p.buy_threshold == doctest::Approx(0.3));
    CHECK(p.sell_threshold == doctest::Approx(-0.3));
    CHECK(p.min_confidence == 60);
    CHECK(p.cooldown_ms == 5000);
    CHECK(p.max_leverage == 5);
}

TEST_CASE("SignalEngineV2 custom params") {
    SignalEngineV2::Params p;
    p.ema_fast_period = 10;
    p.ema_slow_period = 30;
    p.buy_threshold   = 0.5;
    SignalEngineV2 engine(p);
    CHECK(engine.params().ema_fast_period == 10);
    CHECK(engine.params().buy_threshold == doctest::Approx(0.5));
}

TEST_CASE("SignalEngineV2 weight sum should be 1.0") {
    SignalEngineV2::Params p;
    double                 sum = p.w_ema + p.w_rsi + p.w_obi + p.w_vwap + p.w_adx + p.w_pressure;
    CHECK(sum == doctest::Approx(1.0).epsilon(0.001));
}

// ═══════════════════════════════════════════════════════════════════════════
// SignalEngineV2 analyze with insufficient data
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SignalEngineV2 insufficient data returns neutral") {
    SignalEngineV2::Params p;
    SignalEngineV2         engine(p);

    // Only 5 candles — way below minimum
    Candle candles[5];
    for (int i = 0; i < 5; ++i) {
        candles[i].close  = 100.0 + i;
        candles[i].high   = 101.0 + i;
        candles[i].low    = 99.0 + i;
        candles[i].volume = 1000;
    }
    OrderBook ob;
    ob.bids = {{99, 1.0}};
    ob.asks = {{101, 1.0}};
    PressureResult pr{};

    auto sig = engine.analyze("BTC/USDT", candles, 5, ob, pr, 1000000000);
    CHECK(sig.direction == FastSignal::Direction::NEUTRAL);
    CHECK(sig.confidence == 0);
}

TEST_CASE("SignalEngineV2 cooldown blocks consecutive signals") {
    SignalEngineV2::Params p;
    p.cooldown_ms = 5000;
    SignalEngineV2 engine(p);

    // Generate enough candles for analysis
    std::vector<Candle> candles(60);
    for (int i = 0; i < 60; ++i) {
        candles[i].close  = 100.0 + i * 0.5;
        candles[i].high   = 101.0 + i * 0.5;
        candles[i].low    = 99.0 + i * 0.5;
        candles[i].volume = 1000;
    }
    OrderBook ob;
    ob.bids = {{99, 1.0}};
    ob.asks = {{101, 1.0}};
    PressureResult pr{};

    // First call — should produce a signal (or at least not be blocked by cooldown)
    auto sig1 = engine.analyze("BTC/USDT", candles.data(), 60, ob, pr, 1'000'000'000);
    // Second call within cooldown — should be blocked
    auto sig2 = engine.analyze("BTC/USDT", candles.data(), 60, ob, pr, 2'000'000'000);
    CHECK(sig2.direction == FastSignal::Direction::NEUTRAL);
}
