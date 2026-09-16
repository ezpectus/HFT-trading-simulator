// bench_hot_path — dev microbenchmark for the nominal trading path.
// NOT a ctest target: timings are meaningless under CI load. Run manually:
//   ./hft_bench [iterations]
// Measures the paths claimed to be allocation-free/low-latency so future
// perf work has an evidence baseline instead of speculation.
#include "../src/data/signal.h"
#include "../src/strategies/signal_engine_v2.h"
#include "../src/utils/low_latency.h"
#include "test_fixtures.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <vector>

using Clock = std::chrono::steady_clock;

// Sink so the optimizer can't delete the work being measured.
static volatile int64_t g_sink = 0;

template <typename F> static void bench(const char* name, int iters, F&& f) {
    std::vector<int64_t> samples;
    samples.reserve(iters);
    for (int i = 0; i < iters; ++i) {
        const auto t0 = Clock::now();
        f();
        const auto t1 = Clock::now();
        samples.push_back(std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0).count());
    }
    std::sort(samples.begin(), samples.end());
    const int64_t sum = [&] {
        int64_t s = 0;
        for (int64_t v : samples)
            s += v;
        return s;
    }();
    std::printf("%-38s n=%6d  med=%7lld ns  p99=%7lld ns  mean=%7lld ns\n", name, iters,
                (long long)samples[iters / 2], (long long)samples[(iters * 99) / 100],
                (long long)(sum / iters));
}

int main(int argc, char** argv) {
    const int iters = argc > 1 ? std::atoi(argv[1]) : 2000;

    // ── analyze_incremental on a prepopulated cache (the real per-tick path) ──
    SignalEngineV2::Params p;
    p.cooldown_ms = 0; // isolate compute cost from the cooldown gate
    SignalEngineV2 engine(p);
    engine.prepopulate({"BTC/USDT"});

    auto           candles = make_trending_candles(70, 100.0, 0.5);
    auto           ob      = make_order_book(130.0, 0.01, 20, 10.0);
    PressureResult pr{};
    pr.obi_weighted    = 0.3;
    pr.trade_imbalance = 0.2;

    // Warmup: populate any lazy state, settle caches/branch predictors.
    for (int i = 0; i < 200; ++i) {
        auto s = engine.analyze_incremental("BTC/USDT", candles.data(), candles.size(), ob, pr,
                                            FastSignal::now_ns());
        g_sink += static_cast<int64_t>(s.confidence);
    }

    bench("analyze_incremental (prepopulated)", iters, [&] {
        auto s = engine.analyze_incremental("BTC/USDT", candles.data(), candles.size(), ob, pr,
                                            FastSignal::now_ns());
        g_sink += static_cast<int64_t>(s.confidence);
    });

    // ── SPSCQueue push+pop round trip (the AI-signal handoff) ──
    SPSCQueue<Signal, 16> q;
    Signal                item{};
    item.symbol   = "BTC/USDT";
    item.strategy = "bench";
    Signal out{};

    bench("SPSCQueue<Signal,16> push+pop", iters, [&] {
        g_sink += q.push(item) ? 1 : 0;
        g_sink += q.pop(out) ? 1 : 0;
    });

    // ── FastSignal construction + field writes (signal emission cost) ──
    bench("FastSignal ctor + setters", iters, [&] {
        FastSignal s;
        s.set_symbol("BTC/USDT");
        s.set_reason("bench");
        s.direction  = FastSignal::Direction::LONG;
        s.confidence = 75;
        g_sink += static_cast<int64_t>(s.confidence);
    });

    // ── ScopedLatency instrumentation cost (runs per-symbol per-tick in
    //    run_v2_signal_loop — worth knowing what the observability tax is) ──
    LatencyHistogram hist;
    bench("ScopedLatency ctor+dtor+record", iters, [&] {
        { ScopedLatency t(hist); }
        g_sink += 0;
    });
    std::printf("    (histogram samples recorded: %llu)\n",
                (unsigned long long)hist.get_stats().count);
    LatencyHistogram hist_s;
    bench("ScopedLatency sampled 1:16", iters, [&] {
        { ScopedLatency t(hist_s, 16); }
        g_sink += 0;
    });
    std::printf("    (histogram samples recorded: %llu)\n",
                (unsigned long long)hist_s.get_stats().count);

    std::printf("sink=%lld (anti-DCE)\n", (long long)g_sink);
    return 0;
}
