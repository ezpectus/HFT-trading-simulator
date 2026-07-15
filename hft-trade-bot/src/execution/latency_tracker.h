// End-to-end latency tracker — per-stage histograms, percentile computation, budget enforcement.
//
// Tracks: Signal→Order, Order→ACK, ACK→Fill latencies.
// P50/P95/P99/P99.9 histograms per stage. Latency budget enforcement with alerts.
// Uses LatencyHistogram from low_latency.h.
//
// No heap allocations in hot path.
#pragma once

#include "../utils/low_latency.h"
#include <array>
#include <atomic>
#include <cstdint>
#include <chrono>
#include <functional>
#include <string>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Latency stage identifiers
// ─────────────────────────────────────────────────────────────────────────────
enum class LatencyStage : uint8_t {
    SIGNAL_TO_ORDER = 0,   // Signal received → order submitted
    ORDER_TO_ACK = 1,      // Order sent → exchange ACK
    ACK_TO_FILL = 2,       // ACK → first fill
    SIGNAL_TO_FILL = 3,    // Full round-trip: signal → fill
    ORDER_TO_FILL = 4,     // Order sent → full fill
    MARKET_DATA_PROCESS = 5, // Market data receive → processed
    RISK_CHECK = 6,        // Pre-trade risk check duration
    STRATEGY_COMPUTE = 7,  // Strategy computation duration
};

inline const char* latency_stage_str(LatencyStage s) {
    switch (s) {
        case LatencyStage::SIGNAL_TO_ORDER:   return "SIGNAL_TO_ORDER";
        case LatencyStage::ORDER_TO_ACK:      return "ORDER_TO_ACK";
        case LatencyStage::ACK_TO_FILL:       return "ACK_TO_FILL";
        case LatencyStage::SIGNAL_TO_FILL:    return "SIGNAL_TO_FILL";
        case LatencyStage::ORDER_TO_FILL:     return "ORDER_TO_FILL";
        case LatencyStage::MARKET_DATA_PROCESS: return "MARKET_DATA_PROCESS";
        case LatencyStage::RISK_CHECK:        return "RISK_CHECK";
        case LatencyStage::STRATEGY_COMPUTE:  return "STRATEGY_COMPUTE";
    }
    return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────────────────────
// Latency tracker — per-stage histograms with percentile computation
// ─────────────────────────────────────────────────────────────────────────────
class LatencyTracker {
public:
    static constexpr size_t NUM_STAGES = 8;
    static constexpr int64_t MAX_LATENCY_US = 10'000'000;  // 10 seconds max

    using AlertCallback = std::function<void(LatencyStage, int64_t us, double threshold_us)>;

    struct StageStats {
        int64_t count{0};
        int64_t min_us{INT64_MAX};
        int64_t max_us{0};
        int64_t sum_us{0};
        int64_t p50_us{0};
        int64_t p95_us{0};
        int64_t p99_us{0};
        int64_t p999_us{0};
    };

    explicit LatencyTracker(int64_t histogram_bins = 64)
        : histogram_bins_(histogram_bins)
    {
        for (auto& h : histograms_) {
            for (auto& c : h.bin_counts) c.store(0, std::memory_order_relaxed);
            h.total_count.store(0, std::memory_order_relaxed);
        }
    }

    // Record a latency sample for a stage (in nanoseconds)
    void record(LatencyStage stage, int64_t latency_ns) noexcept {
        size_t idx = static_cast<size_t>(stage);
        if (idx >= NUM_STAGES) return;

        int64_t us = latency_ns / 1000;
        if (us < 0) us = 0;
        if (us > MAX_LATENCY_US) us = MAX_LATENCY_US;

        // Update basic stats
        auto& stats = stats_[idx];
        stats.count.fetch_add(1, std::memory_order_relaxed);
        stats.sum_us.fetch_add(us, std::memory_order_relaxed);

        // Atomic min/max update via CAS loop
        int64_t current_min = stats.min_us.load(std::memory_order_relaxed);
        while (us < current_min &&
               !stats.min_us.compare_exchange_weak(current_min, us,
                   std::memory_order_relaxed, std::memory_order_relaxed)) {}

        int64_t current_max = stats.max_us.load(std::memory_order_relaxed);
        while (us > current_max &&
               !stats.max_us.compare_exchange_weak(current_max, us,
                   std::memory_order_relaxed, std::memory_order_relaxed)) {}

        // Update histogram
        auto& h = histograms_[idx];
        size_t bin = static_cast<size_t>(static_cast<double>(us) / MAX_LATENCY_US * histogram_bins_);
        if (bin >= histogram_bins_) bin = histogram_bins_ - 1;
        h.bin_counts[bin].fetch_add(1, std::memory_order_relaxed);
        h.total_count.fetch_add(1, std::memory_order_relaxed);

        // Check latency budget
        double budget = budgets_[idx].load(std::memory_order_relaxed);
        if (budget > 0.0 && static_cast<double>(us) > budget) {
            if (alert_cb_) alert_cb_(stage, us, budget);
        }
    }

    // Convenience: record with start/end timestamps
    void record_interval(LatencyStage stage, int64_t start_ns, int64_t end_ns) noexcept {
        record(stage, end_ns - start_ns);
    }

    // Set latency budget (in microseconds) for a stage. 0 = no budget.
    void set_budget(LatencyStage stage, double budget_us) noexcept {
        budgets_[static_cast<size_t>(stage)].store(budget_us, std::memory_order_relaxed);
    }

    // Get current stats for a stage
    StageStats get_stats(LatencyStage stage) const noexcept {
        size_t idx = static_cast<size_t>(stage);
        StageStats result;
        result.count = stats_[idx].count.load(std::memory_order_relaxed);
        result.sum_us = stats_[idx].sum_us.load(std::memory_order_relaxed);
        result.min_us = stats_[idx].min_us.load(std::memory_order_relaxed);
        result.max_us = stats_[idx].max_us.load(std::memory_order_relaxed);

        // Compute percentiles from histogram
        const auto& h = histograms_[idx];
        int64_t total = h.total_count.load(std::memory_order_relaxed);
        if (total > 0) {
            result.p50_us = percentile_from_histogram(h, 0.50, total);
            result.p95_us = percentile_from_histogram(h, 0.95, total);
            result.p99_us = percentile_from_histogram(h, 0.99, total);
            result.p999_us = percentile_from_histogram(h, 0.999, total);
        }

        return result;
    }

    // Reset all stats
    void reset() noexcept {
        for (size_t i = 0; i < NUM_STAGES; ++i) {
            stats_[i].count.store(0, std::memory_order_relaxed);
            stats_[i].sum_us.store(0, std::memory_order_relaxed);
            stats_[i].min_us.store(INT64_MAX, std::memory_order_relaxed);
            stats_[i].max_us.store(0, std::memory_order_relaxed);
            histograms_[i].total_count.store(0, std::memory_order_relaxed);
            for (auto& c : histograms_[i].bin_counts) c.store(0, std::memory_order_relaxed);
        }
    }

    void set_alert_callback(AlertCallback cb) { alert_cb_ = std::move(cb); }

    // Get all stage stats as a formatted string (for logging)
    std::string summary() const {
        std::string result;
        for (size_t i = 0; i < NUM_STAGES; ++i) {
            auto stats = get_stats(static_cast<LatencyStage>(i));
            if (stats.count == 0) continue;
            result += std::string(latency_stage_str(static_cast<LatencyStage>(i))) +
                     ": n=" + std::to_string(stats.count) +
                     " p50=" + std::to_string(stats.p50_us) + "us" +
                     " p95=" + std::to_string(stats.p95_us) + "us" +
                     " p99=" + std::to_string(stats.p99_us) + "us" +
                     " max=" + std::to_string(stats.max_us) + "us\n";
        }
        return result;
    }

private:
    struct HistogramData {
        std::array<std::atomic<int64_t>, 128> bin_counts{};
        std::atomic<int64_t> total_count{0};
    };

    int64_t percentile_from_histogram(const HistogramData& h, double pct, int64_t total) const noexcept {
        int64_t target = static_cast<int64_t>(static_cast<double>(total) * pct);
        int64_t cumulative = 0;
        for (size_t i = 0; i < histogram_bins_; ++i) {
            cumulative += h.bin_counts[i].load(std::memory_order_relaxed);
            if (cumulative >= target) {
                // Interpolate within bin
                double bin_width = static_cast<double>(MAX_LATENCY_US) / histogram_bins_;
                return static_cast<int64_t>(i * bin_width + bin_width * 0.5);
            }
        }
        return MAX_LATENCY_US;
    }

    struct AtomicStats {
        std::atomic<int64_t> count{0};
        std::atomic<int64_t> sum_us{0};
        std::atomic<int64_t> min_us{INT64_MAX};
        std::atomic<int64_t> max_us{0};
    };

    int64_t histogram_bins_;
    alignas(64) std::array<HistogramData, NUM_STAGES> histograms_{};
    alignas(64) std::array<AtomicStats, NUM_STAGES> stats_{};
    alignas(64) std::array<std::atomic<double>, NUM_STAGES> budgets_{};
    AlertCallback alert_cb_;
};

// ─────────────────────────────────────────────────────────────────────────────
// Scoped latency measurement — RAII timer for a specific stage
// ─────────────────────────────────────────────────────────────────────────────
class ScopedLatencyMeasurement {
public:
    ScopedLatencyMeasurement(LatencyTracker& tracker, LatencyStage stage)
        : tracker_(tracker)
        , stage_(stage)
        , start_ns_(now_ns())
    {}

    ~ScopedLatencyMeasurement() {
        tracker_.record(stage_, now_ns() - start_ns_);
    }

    // Non-copyable, non-movable
    ScopedLatencyMeasurement(const ScopedLatencyMeasurement&) = delete;
    ScopedLatencyMeasurement& operator=(const ScopedLatencyMeasurement&) = delete;

private:
    static int64_t now_ns() noexcept {
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            tp.time_since_epoch()).count();
    }

    LatencyTracker& tracker_;
    LatencyStage stage_;
    int64_t start_ns_;
};

} // namespace hft
