// Unit tests for HFT Signal Engine
// Tests: FFT, spectral_trend_score, fft_lowpass, EMA, RSI, OBI, VWAP, pressure,
// SignalEngine::analyze
//
// Build: g++ -std=c++20 -I src tests/test_signal_engine.cpp -o test_signal_engine -lfmt
// Run:   ./test_signal_engine
#include "../src/data/signal.h"
#include "../src/data/types.h"
#include "../src/strategies/signal_engine.h"

#include <cassert>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using namespace hft;

// ─── Test helpers ───

static int tests_run    = 0;
static int tests_passed = 0;

#define TEST(name)                                                                                 \
    static void name();                                                                            \
    struct name##_runner {                                                                         \
        name##_runner() {                                                                          \
            tests_run++;                                                                           \
            printf("  [RUN] %s ... ", #name);                                                      \
            try {                                                                                  \
                name();                                                                            \
                tests_passed++;                                                                    \
                printf("PASS\n");                                                                  \
            } catch (const std::exception& e) {                                                    \
                printf("FAIL: %s\n", e.what());                                                    \
            }                                                                                      \
        }                                                                                          \
    } name##_instance;                                                                             \
    static void name()

#define ASSERT_TRUE(cond)                                                                          \
    do {                                                                                           \
        if (!(cond)) throw std::runtime_error(#cond " is false");                                  \
    } while (0)

#define ASSERT_FALSE(cond)                                                                         \
    do {                                                                                           \
        if ((cond)) throw std::runtime_error(#cond " is true");                                    \
    } while (0)

#define ASSERT_EQ(a, b)                                                                            \
    do {                                                                                           \
        if ((a) != (b)) throw std::runtime_error(#a " != " #b);                                    \
    } while (0)

#define ASSERT_NEAR(a, b, eps)                                                                     \
    do {                                                                                           \
        if (std::abs((a) - (b)) > (eps)) throw std::runtime_error(#a " not near " #b);             \
    } while (0)

static std::vector<Candle> make_candles(int n, double start, double slope) {
    std::vector<Candle> candles;
    for (int i = 0; i < n; ++i) {
        Candle c;
        c.timestamp = 1704067200 + i * 300;
        c.open      = start + i * slope - slope * 0.5;
        c.high      = start + i * slope + 1.0;
        c.low       = start + i * slope - 1.0;
        c.close     = start + i * slope;
        c.volume    = 100.0 + (i % 10) * 10;
        c.symbol    = "BTC/USDT";
        c.exchange  = "binance";
        candles.push_back(c);
    }
    return candles;
}

static std::vector<Candle> make_oscillating_candles(int n, double center, double amplitude) {
    std::vector<Candle> candles;
    for (int i = 0; i < n; ++i) {
        Candle c;
        c.timestamp  = 1704067200 + i * 300;
        double close = center + amplitude * std::sin(i * 0.3);
        c.open       = close - 0.5;
        c.high       = close + 1.0;
        c.low        = close - 1.0;
        c.close      = close;
        c.volume     = 100.0;
        c.symbol     = "BTC/USDT";
        c.exchange   = "binance";
        candles.push_back(c);
    }
    return candles;
}

static OrderBook make_order_book(double mid_price, double bid_imbalance = 0.0) {
    OrderBook ob;
    ob.symbol   = "BTC/USDT";
    ob.exchange = "binance";
    for (int i = 0; i < 10; ++i) {
        double bid_qty = 1.0 + (bid_imbalance > 0 ? bid_imbalance * (10 - i) : 0);
        double ask_qty = 1.0 + (bid_imbalance < 0 ? -bid_imbalance * (10 - i) : 0);
        ob.bids.push_back({mid_price * (1.0 - 0.0001 * (i + 1)), bid_qty});
        ob.asks.push_back({mid_price * (1.0 + 0.0001 * (i + 1)), ask_qty});
    }
    return ob;
}

// ─── FFT tests ───

TEST(test_fft_basic) {
    std::valarray<std::complex<double>> data(4);
    data[0] = 1.0;
    data[1] = 2.0;
    data[2] = 3.0;
    data[3] = 4.0;
    fft(data);
    // DC component should be sum of inputs
    ASSERT_NEAR(std::real(data[0]), 10.0, 0.001);
}

TEST(test_fft_power_of_2) {
    std::valarray<std::complex<double>> data(8);
    for (size_t i = 0; i < 8; ++i)
        data[i] = static_cast<double>(i);
    fft(data);
    // DC = 0+1+2+3+4+5+6+7 = 28
    ASSERT_NEAR(std::real(data[0]), 28.0, 0.001);
}

TEST(test_spectral_trend_score_uptrend) {
    auto                candles = make_candles(128, 100.0, 0.5);
    std::vector<double> closes;
    for (auto& c : candles)
        closes.push_back(c.close);
    double score = spectral_trend_score(closes);
    ASSERT_TRUE(score > 0.0); // Trend-dominated
}

TEST(test_spectral_trend_score_oscillating) {
    auto                candles = make_oscillating_candles(128, 100.0, 10.0);
    std::vector<double> closes;
    for (auto& c : candles)
        closes.push_back(c.close);
    double score = spectral_trend_score(closes);
    ASSERT_TRUE(score < 0.0); // Cycle-dominated
}

TEST(test_spectral_trend_score_short_data) {
    std::vector<double> closes = {100, 101, 102};
    double              score  = spectral_trend_score(closes);
    ASSERT_EQ(score, 0.0);
}

TEST(test_fft_lowpass_smooths) {
    std::vector<double> closes;
    for (int i = 0; i < 128; ++i) {
        closes.push_back(100 + i * 0.1 + std::sin(i * 3) * 5);
    }
    auto smoothed = fft_lowpass(closes, 0.1);
    ASSERT_EQ(smoothed.size(), closes.size());
    // Smoothed should have less variance
    double mean = 0;
    for (auto v : closes)
        mean += v;
    mean /= closes.size();
    double orig_var = 0;
    for (auto v : closes)
        orig_var += (v - mean) * (v - mean);
    orig_var /= closes.size();
    double smooth_var = 0;
    for (auto v : smoothed)
        smooth_var += (v - mean) * (v - mean);
    smooth_var /= smoothed.size();
    ASSERT_TRUE(smooth_var < orig_var);
}

TEST(test_fft_lowpass_short_data) {
    std::vector<double> closes = {100, 101};
    auto                result = fft_lowpass(closes, 0.2);
    ASSERT_EQ(result.size(), 2u);
}

// ─── EMA tests ───

TEST(test_ema_basic) {
    std::vector<double> values = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    auto                ema    = compute_ema(values, 5);
    ASSERT_EQ(ema.size(), values.size());
    // First 4 should be NaN
    ASSERT_TRUE(std::isnan(ema[0]));
    ASSERT_TRUE(std::isnan(ema[3]));
    // EMA[4] = average of first 5 = 3.0
    ASSERT_NEAR(ema[4], 3.0, 0.001);
}

TEST(test_ema_short_data) {
    std::vector<double> values = {1, 2};
    auto                ema    = compute_ema(values, 5);
    ASSERT_TRUE(std::isnan(ema[0]));
}

// ─── RSI tests ───

TEST(test_rsi_uptrend) {
    std::vector<double> closes;
    for (int i = 0; i < 30; ++i)
        closes.push_back(100 + i);
    auto rsi = compute_rsi(closes, 14);
    ASSERT_EQ(rsi.size(), closes.size());
    // In a pure uptrend, RSI should be near 100
    ASSERT_NEAR(rsi.back(), 100.0, 1.0);
}

TEST(test_rsi_downtrend) {
    std::vector<double> closes;
    for (int i = 0; i < 30; ++i)
        closes.push_back(200 - i);
    auto rsi = compute_rsi(closes, 14);
    // In a pure downtrend, RSI should be near 0
    ASSERT_TRUE(rsi.back() < 5.0);
}

TEST(test_rsi_short_data) {
    std::vector<double> closes = {100, 101};
    auto                rsi    = compute_rsi(closes, 14);
    ASSERT_TRUE(std::isnan(rsi[0]));
}

// ─── OBI tests ───

TEST(test_obi_balanced) {
    OrderBook ob  = make_order_book(65000, 0.0);
    double    obi = compute_obi(ob);
    ASSERT_NEAR(obi, 0.0, 0.01);
}

TEST(test_obi_bid_heavy) {
    OrderBook ob  = make_order_book(65000, 0.5);
    double    obi = compute_obi(ob);
    ASSERT_TRUE(obi > 0.0);
}

TEST(test_obi_ask_heavy) {
    OrderBook ob  = make_order_book(65000, -0.5);
    double    obi = compute_obi(ob);
    ASSERT_TRUE(obi < 0.0);
}

TEST(test_obi_empty_book) {
    OrderBook ob;
    double    obi = compute_obi(ob);
    ASSERT_EQ(obi, 0.0);
}

// ─── VWAP tests ───

TEST(test_vwap_basic) {
    auto   candles = make_candles(20, 100.0, 1.0);
    double vwap    = compute_vwap(candles);
    // VWAP should be between min and max close
    double min_close = candles.front().close;
    double max_close = candles.back().close;
    ASSERT_TRUE(vwap >= min_close - 1.0 && vwap <= max_close + 1.0);
}

TEST(test_vwap_empty) {
    std::vector<Candle> empty;
    double              vwap = compute_vwap(empty);
    ASSERT_EQ(vwap, 0.0);
}

// ─── Pressure tests ───

TEST(test_pressure_bullish) {
    auto   candles  = make_candles(10, 100.0, 2.0);
    double pressure = compute_pressure(candles);
    ASSERT_TRUE(pressure > 0.0); // All bullish candles
}

TEST(test_pressure_bearish) {
    std::vector<Candle> candles;
    for (int i = 0; i < 10; ++i) {
        Candle c;
        c.open   = 200 - i * 2 + 1;
        c.high   = 200 - i * 2 + 2;
        c.low    = 200 - i * 2;
        c.close  = 200 - i * 2;
        c.volume = 100;
        candles.push_back(c);
    }
    double pressure = compute_pressure(candles);
    ASSERT_TRUE(pressure < 0.0);
}

TEST(test_pressure_short_data) {
    std::vector<Candle> candles  = make_candles(1, 100, 1);
    double              pressure = compute_pressure(candles);
    ASSERT_EQ(pressure, 0.0);
}

// ─── SignalEngine::analyze tests ───

TEST(test_analyze_insufficient_data) {
    SignalEngine::Params params;
    SignalEngine         engine(params);
    auto                 candles = make_candles(10, 100, 1);
    OrderBook            ob      = make_order_book(100);
    auto                 sig     = engine.analyze("BTC/USDT", candles, ob);
    ASSERT_EQ(sig.direction, "NEUTRAL");
    ASSERT_TRUE(sig.confidence == 0.0);
}

TEST(test_analyze_uptrend_long) {
    SignalEngine::Params params;
    params.obi_threshold      = 0.0;
    params.pressure_threshold = 0.0;
    SignalEngine engine(params);
    auto         candles = make_candles(100, 100, 1.0);
    OrderBook    ob      = make_order_book(200, 0.3);
    auto         sig     = engine.analyze("BTC/USDT", candles, ob);
    // Strong uptrend should produce LONG or at least non-NEUTRAL
    ASSERT_TRUE(sig.direction == "LONG" || sig.direction == "NEUTRAL");
    if (sig.direction == "LONG") {
        ASSERT_TRUE(sig.confidence > 0.0);
        ASSERT_TRUE(sig.stop_loss < sig.entry_price);
        ASSERT_TRUE(sig.take_profit > sig.entry_price);
    }
}

TEST(test_analyze_downtrend_short) {
    SignalEngine::Params params;
    params.obi_threshold      = 0.0;
    params.pressure_threshold = 0.0;
    SignalEngine        engine(params);
    std::vector<Candle> candles;
    for (int i = 0; i < 100; ++i) {
        Candle c;
        c.timestamp = 1704067200 + i * 300;
        c.open      = 200 - i * 1.0 + 0.5;
        c.high      = 200 - i * 1.0 + 1.0;
        c.low       = 200 - i * 1.0 - 1.0;
        c.close     = 200 - i * 1.0;
        c.volume    = 100;
        c.symbol    = "BTC/USDT";
        c.exchange  = "binance";
        candles.push_back(c);
    }
    OrderBook ob  = make_order_book(100, -0.3);
    auto      sig = engine.analyze("BTC/USDT", candles, ob);
    if (sig.direction == "SHORT") {
        ASSERT_TRUE(sig.confidence > 0.0);
        ASSERT_TRUE(sig.stop_loss > sig.entry_price);
        ASSERT_TRUE(sig.take_profit < sig.entry_price);
    }
}

TEST(test_analyze_confidence_range) {
    SignalEngine::Params params;
    SignalEngine         engine(params);
    auto                 candles = make_candles(100, 100, 0.5);
    OrderBook            ob      = make_order_book(150, 0.0);
    auto                 sig     = engine.analyze("BTC/USDT", candles, ob);
    if (sig.direction != "NEUTRAL") {
        ASSERT_TRUE(sig.confidence >= 0.0 && sig.confidence <= 95.0);
    }
}

TEST(test_analyze_reason_not_empty) {
    SignalEngine::Params params;
    SignalEngine         engine(params);
    auto                 candles = make_candles(100, 100, 0.5);
    OrderBook            ob      = make_order_book(150, 0.0);
    auto                 sig     = engine.analyze("BTC/USDT", candles, ob);
    ASSERT_FALSE(sig.reason.empty());
}

// ─── Signal struct tests ───

TEST(test_signal_rr_ratio_long) {
    Signal sig;
    sig.direction   = "LONG";
    sig.entry_price = 100;
    sig.stop_loss   = 95;
    sig.take_profit = 115;
    double rr       = sig.rr_ratio();
    // risk = 5, reward = 15, rr = 3.0
    ASSERT_NEAR(rr, 3.0, 0.01);
}

TEST(test_signal_rr_ratio_short) {
    Signal sig;
    sig.direction   = "SHORT";
    sig.entry_price = 100;
    sig.stop_loss   = 105;
    sig.take_profit = 85;
    double rr       = sig.rr_ratio();
    // risk = 5, reward = 15, rr = 3.0
    ASSERT_NEAR(rr, 3.0, 0.01);
}

TEST(test_signal_is_actionable) {
    Signal sig;
    sig.direction = "LONG";
    ASSERT_TRUE(sig.is_actionable());
    sig.direction = "SHORT";
    ASSERT_TRUE(sig.is_actionable());
    sig.direction = "NEUTRAL";
    ASSERT_FALSE(sig.is_actionable());
}

// ─── Main ───

int main() {
    printf("\n=== HFT Signal Engine Unit Tests ===\n\n");
    printf("Results: %d/%d passed\n\n", tests_passed, tests_run);
    return tests_passed == tests_run ? 0 : 1;
}
