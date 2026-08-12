// Performance tests for C++ HFT optimizations
// Tests symbol map, SIMD indicators, and other performance improvements
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "data/symbol_map.h"
#include "strategies/simd_indicators.h"
#include "utils/low_latency.h"
#include <chrono>
#include <doctest.h>
#include <random>
#include <vector>

using namespace hft;

TEST_SUITE("C++ Performance Optimizations") {

TEST_CASE("SymbolMap - Build and Lookup") {
    SymbolMap map;
    std::vector<std::string> symbols = {"BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"};
    
    map.build(symbols);
    
    CHECK(map.size() == 5);
    CHECK(map.get_id("BTC/USDT") == 0);
    CHECK(map.get_id("ETH/USDT") == 1);
    CHECK(map.get_symbol(0) == "BTC/USDT");
    CHECK(map.get_symbol(1) == "ETH/USDT");
    CHECK(map.has_symbol("BTC/USDT") == true);
    CHECK(map.has_symbol("UNKNOWN") == false);
}

TEST_CASE("SymbolMap - Lookup Performance") {
    SymbolMap map;
    std::vector<std::string> symbols;
    for (int i = 0; i < 100; ++i) {
        symbols.push_back("SYMBOL" + std::to_string(i) + "/USDT");
    }
    map.build(symbols);
    
    // Benchmark lookup performance
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 100000; ++i) {
        map.get_id("SYMBOL50/USDT");
    }
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
    
    // Lookup should be < 100ns on average
    double avg_ns = static_cast<double>(duration) / 100000.0;
    CHECK(avg_ns < 100.0);
}

TEST_CASE("PerfectSymbolMap - Compile-time Hash") {
    uint64_t hash1 = symbol_hash("BTC/USDT");
    uint64_t hash2 = symbol_hash("BTC/USDT");
    uint64_t hash3 = symbol_hash("ETH/USDT");
    
    CHECK(hash1 == hash2); // Same string should have same hash
    CHECK(hash1 != hash3); // Different strings should have different hash
}

TEST_CASE("SimdEMA - Scalar Calculation") {
    std::vector<double> prices = {100.0, 101.0, 102.0, 103.0, 104.0};
    double alpha = 0.2;
    
    double ema = SimdEMA::ema_scalar(prices.back(), prices[prices.size() - 2], alpha);
    CHECK(ema > 0);
}

TEST_CASE("SimdEMA - Array Calculation") {
    std::vector<double> prices = {100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0};
    double alpha = 0.2;
    
    auto ema_values = SimdEMA::ema_array(prices, alpha);
    CHECK(ema_values.size() == prices.size());
    CHECK(ema_values[0] == prices[0]);
    CHECK(ema_values.back() > 0);
}

TEST_CASE("SimdRSI - Calculation") {
    std::vector<double> prices;
    for (int i = 0; i < 20; ++i) {
        prices.push_back(100.0 + i * 0.5 + (i % 2 == 0 ? 1.0 : -0.5));
    }
    
    double rsi = SimdRSI::rsi(prices, 14);
    CHECK(rsi >= 0.0);
    CHECK(rsi <= 100.0);
}

TEST_CASE("SimdMA - Simple Moving Average") {
    std::vector<double> prices = {100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0};
    
    double sma = SimdMA::sma(prices, 5);
    CHECK(sma > 100.0);
    CHECK(sma < 107.0);
}

TEST_CASE("SimdVWAP - Volume Weighted Average Price") {
    std::vector<double> prices = {100.0, 101.0, 102.0, 103.0, 104.0};
    std::vector<double> volumes = {10.0, 20.0, 30.0, 40.0, 50.0};
    
    double vwap = SimdVWAP::vwap(prices, volumes, 5);
    CHECK(vwap > 100.0);
    CHECK(vwap < 104.0);
}

TEST_CASE("SimdUtils - CPU Feature Detection") {
    std::string features = SimdUtils::get_cpu_features();
    CHECK(!features.empty());
    
    bool has_avx2 = SimdUtils::has_avx2();
    // Don't assert on has_avx2 since it depends on hardware
}

TEST_CASE("LatencyHistogram - Basic Recording") {
    LatencyHistogram hist;
    
    hist.record(1.0);
    hist.record(2.0);
    hist.record(3.0);
    
    auto stats = hist.get_stats();
    CHECK(stats.count == 3);
    CHECK(stats.min == 1.0);
    CHECK(stats.max == 3.0);
}

TEST_CASE("LatencyHistogram - Percentile Calculation") {
    LatencyHistogram hist;
    
    // Record 100 samples at 10μs
    for (int i = 0; i < 100; ++i) {
        hist.record(10.0);
    }
    
    auto stats = hist.get_stats();
    CHECK(stats.count == 100);
    CHECK(stats.p50 > 0);
    CHECK(stats.p95 > 0);
    CHECK(stats.p99 > 0);
}

TEST_CASE("ScopedLatency - RAII Timing") {
    LatencyHistogram hist;
    
    {
        ScopedLatency timer(hist);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    
    auto stats = hist.get_stats();
    CHECK(stats.count == 1);
    CHECK(stats.min > 0);
}

TEST_CASE("SPSCQueue - Basic Operations") {
    SPSCQueue<int, 16> queue;
    
    CHECK(queue.empty() == true);
    CHECK(queue.size() == 0);
    
    CHECK(queue.push(42) == true);
    CHECK(queue.empty() == false);
    CHECK(queue.size() == 1);
    
    int value;
    CHECK(queue.pop(value) == true);
    CHECK(value == 42);
    CHECK(queue.empty() == true);
}

TEST_CASE("SPSCQueue - Capacity Limit") {
    SPSCQueue<int, 4> queue;
    
    // Fill queue
    CHECK(queue.push(1) == true);
    CHECK(queue.push(2) == true);
    CHECK(queue.push(3) == true);
    CHECK(queue.push(4) == true);
    
    // Should be full
    CHECK(queue.push(5) == false);
    
    // Drain
    int value;
    for (int i = 1; i <= 4; ++i) {
        CHECK(queue.pop(value) == true);
        CHECK(value == i);
    }
    
    CHECK(queue.empty() == true);
}

TEST_CASE("Spinlock - Basic Locking") {
    Spinlock lock;
    int counter = 0;
    
    {
        SpinlockGuard guard(lock);
        counter = 42;
    }
    
    CHECK(counter == 42);
}

TEST_CASE("ThreadAffinity - Core Count") {
    int cores = ThreadAffinity::num_cores();
    CHECK(cores > 0);
}

TEST_CASE("CircuitBreaker - Basic Operation") {
    CircuitBreaker cb(3, 30);
    
    CHECK(cb.allow_request() == true);
    CHECK(cb.get_state() == CircuitBreaker::State::CLOSED);
    
    cb.record_failure();
    cb.record_failure();
    cb.record_failure();
    
    // Should be open after threshold
    CHECK(cb.get_state() == CircuitBreaker::State::OPEN);
    CHECK(cb.allow_request() == false);
}

TEST_CASE("Benchmark - Symbol Lookup vs Linear Search") {
    SymbolMap map;
    std::vector<std::string> symbols;
    for (int i = 0; i < 1000; ++i) {
        symbols.push_back("SYMBOL" + std::to_string(i) + "/USDT");
    }
    map.build(symbols);
    
    // Benchmark map lookup
    auto start_map = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 100000; ++i) {
        map.get_id("SYMBOL500/USDT");
    }
    auto end_map = std::chrono::high_resolution_clock::now();
    auto map_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end_map - start_map).count();
    
    // Benchmark linear search
    auto start_linear = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 100000; ++i) {
        auto it = std::find(symbols.begin(), symbols.end(), "SYMBOL500/USDT");
        (void)it;
    }
    auto end_linear = std::chrono::high_resolution_clock::now();
    auto linear_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end_linear - start_linear).count();
    
    // Map lookup should be significantly faster
    CHECK(map_duration < linear_duration);
}

TEST_CASE("Benchmark - SIMD vs Scalar EMA") {
    std::vector<double> prices;
    for (int i = 0; i < 1000; ++i) {
        prices.push_back(100.0 + i * 0.01);
    }
    
    double alpha = 0.2;
    
    // Benchmark scalar
    auto start_scalar = std::chrono::high_resolution_clock::now();
    auto ema_scalar = SimdEMA::ema_array(prices, alpha);
    auto end_scalar = std::chrono::high_resolution_clock::now();
    auto scalar_duration = std::chrono::duration_cast<std::chrono::microseconds>(end_scalar - start_scalar).count();
    
    // SIMD would be faster if AVX2 is available
    // Don't assert on performance since it depends on hardware
    CHECK(ema_scalar.size() == prices.size());
}

} // TEST_SUITE
