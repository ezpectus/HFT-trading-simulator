// Monitoring — real-time system health and performance metrics.
//
// Tracks: order throughput, fill rate, rejection rate, latency percentiles,
// SHM queue depth, error counts, memory usage. Thread-safe with atomics.
// No heap allocations in hot path.
#pragma once

#include "../utils/low_latency.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <string_view>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// SystemMonitor — atomic counters for all system metrics
// ─────────────────────────────────────────────────────────────────────────────
class SystemMonitor {
  public:
    enum class Metric : size_t {
        ORDERS_SENT       = 0,
        ORDERS_FILLED     = 1,
        ORDERS_REJECTED   = 2,
        ORDERS_CANCELED   = 3,
        SIGNALS_RECEIVED  = 4,
        SIGNALS_PROCESSED = 5,
        ERRORS            = 6,
        RECONNECTS        = 7,
        SHM_DROPS         = 8,
        // HEARTBEATS_SENT removed (S246): the bot never initiates heartbeats —
        // it only auto-pongs — so no honest increment site exists. MISSED is
        // real: the feed watchdog trips when the expected broadcast goes silent.
        HEARTBEATS_MISSED = 9,
        COUNT
    };

    void increment(Metric m, int64_t delta = 1) noexcept {
        counters_[static_cast<size_t>(m)].fetch_add(delta, std::memory_order_relaxed);
    }

    int64_t get(Metric m) const noexcept {
        return counters_[static_cast<size_t>(m)].load(std::memory_order_relaxed);
    }

    double fill_rate() const noexcept {
        int64_t sent   = get(Metric::ORDERS_SENT);
        int64_t filled = get(Metric::ORDERS_FILLED);
        return sent > 0 ? static_cast<double>(filled) / sent : 0.0;
    }

    double rejection_rate() const noexcept {
        int64_t sent     = get(Metric::ORDERS_SENT);
        int64_t rejected = get(Metric::ORDERS_REJECTED);
        return sent > 0 ? static_cast<double>(rejected) / sent : 0.0;
    }

    struct Snapshot {
        int64_t  orders_sent;
        int64_t  orders_filled;
        int64_t  orders_rejected;
        int64_t  orders_canceled;
        int64_t  signals_received;
        int64_t  signals_processed;
        int64_t  errors;
        int64_t  reconnects;
        int64_t  shm_drops;
        int64_t  heartbeats_missed;
        double   fill_rate;
        double   rejection_rate;
        uint64_t uptime_seconds;
    };

    Snapshot snapshot() const noexcept {
        Snapshot s;
        s.orders_sent       = get(Metric::ORDERS_SENT);
        s.orders_filled     = get(Metric::ORDERS_FILLED);
        s.orders_rejected   = get(Metric::ORDERS_REJECTED);
        s.orders_canceled   = get(Metric::ORDERS_CANCELED);
        s.signals_received  = get(Metric::SIGNALS_RECEIVED);
        s.signals_processed = get(Metric::SIGNALS_PROCESSED);
        s.errors            = get(Metric::ERRORS);
        s.reconnects        = get(Metric::RECONNECTS);
        s.shm_drops         = get(Metric::SHM_DROPS);
        s.heartbeats_missed = get(Metric::HEARTBEATS_MISSED);
        s.fill_rate         = fill_rate();
        s.rejection_rate    = rejection_rate();
        s.uptime_seconds    = uptime_seconds();
        return s;
    }

    void reset() noexcept {
        for (auto& c : counters_) {
            c.store(0, std::memory_order_relaxed);
        }
        start_time_ = std::chrono::steady_clock::now();
    }

    uint64_t uptime_seconds() const noexcept {
        auto now = std::chrono::steady_clock::now();
        return static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::seconds>(now - start_time_).count());
    }

    std::string format_json() const {
        auto s = snapshot();
        char buf[512];
        int  n = std::snprintf(
            buf, sizeof(buf),
            "{\"orders_sent\":%llu,\"orders_filled\":%llu,\"orders_rejected\":%llu,"
             "\"orders_canceled\":%llu,\"signals_received\":%llu,\"signals_processed\":%llu,"
             "\"errors\":%llu,\"reconnects\":%llu,\"shm_drops\":%llu,"
             "\"heartbeats_missed\":%llu,\"fill_rate\":%.4f,\"rejection_rate\":%.4f,"
             "\"uptime_seconds\":%llu}",
            (unsigned long long)s.orders_sent, (unsigned long long)s.orders_filled,
            (unsigned long long)s.orders_rejected, (unsigned long long)s.orders_canceled,
            (unsigned long long)s.signals_received, (unsigned long long)s.signals_processed,
            (unsigned long long)s.errors, (unsigned long long)s.reconnects,
            (unsigned long long)s.shm_drops, (unsigned long long)s.heartbeats_missed, s.fill_rate,
            s.rejection_rate, (unsigned long long)s.uptime_seconds);
        if (n <= 0) return "{}";
        n = std::min(n, static_cast<int>(sizeof(buf) - 1));
        return std::string(buf, static_cast<size_t>(n));
    }

    // Prometheus text exposition format — the /metrics endpoint is scraped by
    // prometheus.yml, so it must speak exposition format, not JSON.
    std::string format_prometheus() const {
        auto s = snapshot();
        char buf[2048];
        int  n = std::snprintf(
            buf, sizeof(buf),
            "# HELP hft_orders_sent_total Orders sent to exchange\n"
             "# TYPE hft_orders_sent_total counter\n"
             "hft_orders_sent_total %llu\n"
             "# HELP hft_orders_filled_total Orders filled\n"
             "# TYPE hft_orders_filled_total counter\n"
             "hft_orders_filled_total %llu\n"
             "# HELP hft_orders_rejected_total Orders rejected\n"
             "# TYPE hft_orders_rejected_total counter\n"
             "hft_orders_rejected_total %llu\n"
             "# HELP hft_orders_canceled_total Orders canceled\n"
             "# TYPE hft_orders_canceled_total counter\n"
             "hft_orders_canceled_total %llu\n"
             "# HELP hft_signals_received_total Signals received over IPC\n"
             "# TYPE hft_signals_received_total counter\n"
             "hft_signals_received_total %llu\n"
             "# HELP hft_signals_processed_total Signals processed\n"
             "# TYPE hft_signals_processed_total counter\n"
             "hft_signals_processed_total %llu\n"
             "# HELP hft_errors_total Errors logged\n"
             "# TYPE hft_errors_total counter\n"
             "hft_errors_total %llu\n"
             "# HELP hft_reconnects_total Exchange reconnects\n"
             "# TYPE hft_reconnects_total counter\n"
             "hft_reconnects_total %llu\n"
             "# HELP hft_shm_drops_total Shared-memory ring drops\n"
             "# TYPE hft_shm_drops_total counter\n"
             "hft_shm_drops_total %llu\n"
             "# HELP hft_heartbeats_missed_total Expected feed frames missed\n"
             "# TYPE hft_heartbeats_missed_total counter\n"
             "hft_heartbeats_missed_total %llu\n"
             "# HELP hft_fill_rate Ratio of filled to sent orders\n"
             "# TYPE hft_fill_rate gauge\n"
             "hft_fill_rate %.4f\n"
             "# HELP hft_rejection_rate Ratio of rejected to sent orders\n"
             "# TYPE hft_rejection_rate gauge\n"
             "hft_rejection_rate %.4f\n"
             "# HELP hft_uptime_seconds Process uptime\n"
             "# TYPE hft_uptime_seconds gauge\n"
             "hft_uptime_seconds %llu\n",
            (unsigned long long)s.orders_sent, (unsigned long long)s.orders_filled,
            (unsigned long long)s.orders_rejected, (unsigned long long)s.orders_canceled,
            (unsigned long long)s.signals_received, (unsigned long long)s.signals_processed,
            (unsigned long long)s.errors, (unsigned long long)s.reconnects,
            (unsigned long long)s.shm_drops, (unsigned long long)s.heartbeats_missed, s.fill_rate,
            s.rejection_rate, (unsigned long long)s.uptime_seconds);
        if (n <= 0) return {};
        n = std::min(n, static_cast<int>(sizeof(buf) - 1));
        return std::string(buf, static_cast<size_t>(n)) + format_runtime_prometheus();
    }

    // Runtime gauges refreshed by the main loop each iteration.
    struct RuntimeGauges {
        double active_positions{0.0};
        double pnl_unrealized{0.0};
        double pnl_total{0.0}; // realized + unrealized
        double memory_usage_mb{0.0};
        double shm_signal_queue_depth{0.0};
        double shm_order_queue_depth{0.0};
        double shm_fill_queue_depth{0.0};
    };

    void set_runtime_gauges(const RuntimeGauges& g) noexcept {
        g_active_positions_.store(g.active_positions, std::memory_order_relaxed);
        g_pnl_unrealized_.store(g.pnl_unrealized, std::memory_order_relaxed);
        g_pnl_total_.store(g.pnl_total, std::memory_order_relaxed);
        g_memory_usage_mb_.store(g.memory_usage_mb, std::memory_order_relaxed);
        g_shm_signal_queue_depth_.store(g.shm_signal_queue_depth, std::memory_order_relaxed);
        g_shm_order_queue_depth_.store(g.shm_order_queue_depth, std::memory_order_relaxed);
        g_shm_fill_queue_depth_.store(g.shm_fill_queue_depth, std::memory_order_relaxed);
    }

    static constexpr size_t LATENCY_BUCKETS = 35;

    // cumulative[] = per-bucket cumulative counts; le bound of bucket i = 2^((i+1)/2) μs
    void set_latency_histogram(const uint64_t* cumulative, size_t n, uint64_t total,
                               double sum_us) noexcept {
        for (size_t i = 0; i < LATENCY_BUCKETS; ++i) {
            latency_buckets_[i].store(i < n ? cumulative[i] : 0, std::memory_order_relaxed);
        }
        latency_count_.store(total, std::memory_order_relaxed);
        latency_sum_us_.store(sum_us, std::memory_order_relaxed);
    }

  private:
    std::string format_runtime_prometheus() const {
        char buf[2048];
        int  n =
            std::snprintf(buf, sizeof(buf),
                          "# HELP hft_active_positions Currently open positions\n"
                          "# TYPE hft_active_positions gauge\n"
                          "hft_active_positions %.0f\n"
                          "# HELP hft_pnl_unrealized Unrealized PnL across open positions\n"
                          "# TYPE hft_pnl_unrealized gauge\n"
                          "hft_pnl_unrealized %.4f\n"
                          "# HELP hft_pnl_total Realized plus unrealized PnL\n"
                          "# TYPE hft_pnl_total gauge\n"
                          "hft_pnl_total %.4f\n"
                          "# HELP hft_memory_usage_mb Process resident memory (MB)\n"
                          "# TYPE hft_memory_usage_mb gauge\n"
                          "hft_memory_usage_mb %.2f\n"
                          "# HELP hft_shm_signal_queue_depth Signals pending in SHM ring\n"
                          "# TYPE hft_shm_signal_queue_depth gauge\n"
                          "hft_shm_signal_queue_depth %.0f\n"
                          "# HELP hft_shm_order_queue_depth Signals queued for order execution\n"
                          "# TYPE hft_shm_order_queue_depth gauge\n"
                          "hft_shm_order_queue_depth %.0f\n"
                          "# HELP hft_shm_fill_queue_depth Fills pending in SHM ring\n"
                          "# TYPE hft_shm_fill_queue_depth gauge\n"
                          "hft_shm_fill_queue_depth %.0f\n",
                          g_active_positions_.load(std::memory_order_relaxed),
                          g_pnl_unrealized_.load(std::memory_order_relaxed),
                          g_pnl_total_.load(std::memory_order_relaxed),
                          g_memory_usage_mb_.load(std::memory_order_relaxed),
                          g_shm_signal_queue_depth_.load(std::memory_order_relaxed),
                          g_shm_order_queue_depth_.load(std::memory_order_relaxed),
                          g_shm_fill_queue_depth_.load(std::memory_order_relaxed));
        std::string out;
        if (n > 0) {
            n = std::min(n, static_cast<int>(sizeof(buf) - 1));
            out.assign(buf, static_cast<size_t>(n));
        }
        out += "# HELP hft_latency_us Order-execution loop latency (microseconds)\n"
               "# TYPE hft_latency_us histogram\n";
        char line[128];
        for (size_t i = 0; i < LATENCY_BUCKETS; ++i) {
            // le bound of bucket i = 2^((i+1)/2) μs — matches LatencyHistogram
            int m = std::snprintf(
                line, sizeof(line), "hft_latency_us_bucket{le=\"%.6g\"} %llu\n",
                std::pow(2.0, (static_cast<double>(i) + 1.0) / 2.0),
                (unsigned long long)latency_buckets_[i].load(std::memory_order_relaxed));
            if (m > 0) out.append(line, static_cast<size_t>(m));
        }
        int m = std::snprintf(line, sizeof(line),
                              "hft_latency_us_bucket{le=\"+Inf\"} %llu\n"
                              "hft_latency_us_sum %.2f\n"
                              "hft_latency_us_count %llu\n",
                              (unsigned long long)latency_count_.load(std::memory_order_relaxed),
                              latency_sum_us_.load(std::memory_order_relaxed),
                              (unsigned long long)latency_count_.load(std::memory_order_relaxed));
        if (m > 0) out.append(line, static_cast<size_t>(m));
        return out;
    }

    std::array<std::atomic<int64_t>, static_cast<size_t>(Metric::COUNT)> counters_{};
    std::chrono::steady_clock::time_point start_time_{std::chrono::steady_clock::now()};
    std::atomic<double>                   g_active_positions_{0.0};
    std::atomic<double>                   g_pnl_unrealized_{0.0};
    std::atomic<double>                   g_pnl_total_{0.0};
    std::atomic<double>                   g_memory_usage_mb_{0.0};
    std::atomic<double>                   g_shm_signal_queue_depth_{0.0};
    std::atomic<double>                   g_shm_order_queue_depth_{0.0};
    std::atomic<double>                   g_shm_fill_queue_depth_{0.0};
    std::array<std::atomic<uint64_t>, LATENCY_BUCKETS> latency_buckets_{};
    std::atomic<uint64_t>                              latency_count_{0};
    std::atomic<double>                                latency_sum_us_{0.0};
};

// ─────────────────────────────────────────────────────────────────────────────
// HealthStatus — aggregate health for /health endpoint
// ─────────────────────────────────────────────────────────────────────────────
struct HealthStatus {
    bool     shm_healthy{true};
    bool     exchange_connected{true};
    bool     signal_engine_active{true};
    uint64_t last_signal_age_ms{0};
    uint64_t last_fill_age_ms{0};
    int64_t  error_count_5min{0};
    double   cpu_usage_pct{0.0};
    double   memory_usage_mb{0.0};

    bool is_healthy() const noexcept {
        return shm_healthy && exchange_connected && signal_engine_active &&
               error_count_5min < 100 && last_signal_age_ms < 10000;
    }

    std::string format_json() const {
        char buf[256];
        int  n = std::snprintf(
            buf, sizeof(buf),
            "{\"healthy\":%s,\"shm_healthy\":%s,\"exchange_connected\":%s,"
             "\"signal_engine_active\":%s,\"last_signal_age_ms\":%llu,"
             "\"last_fill_age_ms\":%llu,\"error_count_5min\":%lld,"
             "\"memory_usage_mb\":%.2f}",
            is_healthy() ? "true" : "false", shm_healthy ? "true" : "false",
            exchange_connected ? "true" : "false", signal_engine_active ? "true" : "false",
            (unsigned long long)last_signal_age_ms, (unsigned long long)last_fill_age_ms,
            (long long)error_count_5min, memory_usage_mb);
        if (n <= 0) return "{}";
        n = std::min(n, static_cast<int>(sizeof(buf) - 1));
        return std::string(buf, static_cast<size_t>(n));
    }
};

} // namespace hft
