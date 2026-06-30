// Monitoring — real-time system health and performance metrics.
//
// Tracks: order throughput, fill rate, rejection rate, latency percentiles,
// SHM queue depth, error counts, memory usage. Thread-safe with atomics.
// No heap allocations in hot path.
#pragma once

#include "../utils/low_latency.h"
#include <atomic>
#include <array>
#include <cstdint>
#include <chrono>
#include <string>
#include <string_view>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// SystemMonitor — atomic counters for all system metrics
// ─────────────────────────────────────────────────────────────────────────────
class SystemMonitor {
public:
    enum class Metric : size_t {
        ORDERS_SENT = 0,
        ORDERS_FILLED = 1,
        ORDERS_REJECTED = 2,
        ORDERS_CANCELED = 3,
        SIGNALS_RECEIVED = 4,
        SIGNALS_PROCESSED = 5,
        ERRORS = 6,
        RECONNECTS = 7,
        SHM_DROPS = 8,
        HEARTBEATS_SENT = 9,
        HEARTBEATS_MISSED = 10,
        COUNT
    };

    void increment(Metric m, int64_t delta = 1) noexcept {
        counters_[static_cast<size_t>(m)].fetch_add(delta, std::memory_order_relaxed);
    }

    int64_t get(Metric m) const noexcept {
        return counters_[static_cast<size_t>(m)].load(std::memory_order_relaxed);
    }

    double fill_rate() const noexcept {
        int64_t sent = get(Metric::ORDERS_SENT);
        int64_t filled = get(Metric::ORDERS_FILLED);
        return sent > 0 ? static_cast<double>(filled) / sent : 0.0;
    }

    double rejection_rate() const noexcept {
        int64_t sent = get(Metric::ORDERS_SENT);
        int64_t rejected = get(Metric::ORDERS_REJECTED);
        return sent > 0 ? static_cast<double>(rejected) / sent : 0.0;
    }

    struct Snapshot {
        int64_t orders_sent;
        int64_t orders_filled;
        int64_t orders_rejected;
        int64_t orders_canceled;
        int64_t signals_received;
        int64_t signals_processed;
        int64_t errors;
        int64_t reconnects;
        int64_t shm_drops;
        int64_t heartbeats_sent;
        int64_t heartbeats_missed;
        double fill_rate;
        double rejection_rate;
        uint64_t uptime_seconds;
    };

    Snapshot snapshot() const noexcept {
        Snapshot s;
        s.orders_sent = get(Metric::ORDERS_SENT);
        s.orders_filled = get(Metric::ORDERS_FILLED);
        s.orders_rejected = get(Metric::ORDERS_REJECTED);
        s.orders_canceled = get(Metric::ORDERS_CANCELED);
        s.signals_received = get(Metric::SIGNALS_RECEIVED);
        s.signals_processed = get(Metric::SIGNALS_PROCESSED);
        s.errors = get(Metric::ERRORS);
        s.reconnects = get(Metric::RECONNECTS);
        s.shm_drops = get(Metric::SHM_DROPS);
        s.heartbeats_sent = get(Metric::HEARTBEATS_SENT);
        s.heartbeats_missed = get(Metric::HEARTBEATS_MISSED);
        s.fill_rate = fill_rate();
        s.rejection_rate = rejection_rate();
        s.uptime_seconds = uptime_seconds();
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
        return std::string("{\"orders_sent\":") + std::to_string(s.orders_sent) +
               ",\"orders_filled\":" + std::to_string(s.orders_filled) +
               ",\"orders_rejected\":" + std::to_string(s.orders_rejected) +
               ",\"signals_received\":" + std::to_string(s.signals_received) +
               ",\"signals_processed\":" + std::to_string(s.signals_processed) +
               ",\"errors\":" + std::to_string(s.errors) +
               ",\"reconnects\":" + std::to_string(s.reconnects) +
               ",\"shm_drops\":" + std::to_string(s.shm_drops) +
               ",\"fill_rate\":" + std::to_string(s.fill_rate) +
               ",\"rejection_rate\":" + std::to_string(s.rejection_rate) +
               ",\"uptime_seconds\":" + std::to_string(s.uptime_seconds) +
               "}";
    }

private:
    std::array<std::atomic<int64_t>, static_cast<size_t>(Metric::COUNT)> counters_{};
    std::chrono::steady_clock::time_point start_time_{std::chrono::steady_clock::now()};
};

// ─────────────────────────────────────────────────────────────────────────────
// MemoryTracker — track approximate memory usage
// ─────────────────────────────────────────────────────────────────────────────
class MemoryTracker {
public:
    void record_allocation(size_t bytes) noexcept {
        total_allocated_.fetch_add(bytes, std::memory_order_relaxed);
        current_usage_.fetch_add(bytes, std::memory_order_relaxed);
        if (bytes > max_single_alloc_.load(std::memory_order_relaxed)) {
            max_single_alloc_.store(bytes, std::memory_order_relaxed);
        }
    }

    void record_deallocation(size_t bytes) noexcept {
        current_usage_.fetch_sub(bytes, std::memory_order_relaxed);
    }

    size_t current_usage() const noexcept {
        return current_usage_.load(std::memory_order_relaxed);
    }

    size_t total_allocated() const noexcept {
        return total_allocated_.load(std::memory_order_relaxed);
    }

    size_t max_single_alloc() const noexcept {
        return max_single_alloc_.load(std::memory_order_relaxed);
    }

private:
    std::atomic<size_t> current_usage_{0};
    std::atomic<size_t> total_allocated_{0};
    std::atomic<size_t> max_single_alloc_{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// HealthStatus — aggregate health for /health endpoint
// ─────────────────────────────────────────────────────────────────────────────
struct HealthStatus {
    bool shm_healthy{true};
    bool exchange_connected{true};
    bool signal_engine_active{true};
    uint64_t last_signal_age_ms{0};
    uint64_t last_fill_age_ms{0};
    int64_t error_count_5min{0};
    double cpu_usage_pct{0.0};
    size_t memory_usage_mb{0.0};

    bool is_healthy() const noexcept {
        return shm_healthy && exchange_connected && signal_engine_active
            && error_count_5min < 100
            && last_signal_age_ms < 10000;
    }

    std::string format_json() const {
        return std::string("{\"healthy\":") + (is_healthy() ? "true" : "false") +
               ",\"shm_healthy\":" + (shm_healthy ? "true" : "false") +
               ",\"exchange_connected\":" + (exchange_connected ? "true" : "false") +
               ",\"signal_engine_active\":" + (signal_engine_active ? "true" : "false") +
               ",\"last_signal_age_ms\":" + std::to_string(last_signal_age_ms) +
               ",\"last_fill_age_ms\":" + std::to_string(last_fill_age_ms) +
               ",\"error_count_5min\":" + std::to_string(error_count_5min) +
               ",\"memory_usage_mb\":" + std::to_string(memory_usage_mb) +
               "}";
    }
};

} // namespace hft
