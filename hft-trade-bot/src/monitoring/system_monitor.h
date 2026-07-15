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
#include <cstdio>

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
        char buf[512];
        int n = std::snprintf(buf, sizeof(buf),
            "{\"orders_sent\":%llu,\"orders_filled\":%llu,\"orders_rejected\":%llu,"
            "\"orders_canceled\":%llu,\"signals_received\":%llu,\"signals_processed\":%llu,"
            "\"errors\":%llu,\"reconnects\":%llu,\"shm_drops\":%llu,\"heartbeats_sent\":%llu,"
            "\"heartbeats_missed\":%llu,\"fill_rate\":%.4f,\"rejection_rate\":%.4f,"
            "\"uptime_seconds\":%llu}",
            (unsigned long long)s.orders_sent, (unsigned long long)s.orders_filled,
            (unsigned long long)s.orders_rejected, (unsigned long long)s.orders_canceled,
            (unsigned long long)s.signals_received, (unsigned long long)s.signals_processed,
            (unsigned long long)s.errors, (unsigned long long)s.reconnects,
            (unsigned long long)s.shm_drops, (unsigned long long)s.heartbeats_sent,
            (unsigned long long)s.heartbeats_missed, s.fill_rate, s.rejection_rate,
            (unsigned long long)s.uptime_seconds);
        return std::string(buf, n);
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
    double memory_usage_mb{0.0};

    bool is_healthy() const noexcept {
        return shm_healthy && exchange_connected && signal_engine_active
            && error_count_5min < 100
            && last_signal_age_ms < 10000;
    }

    std::string format_json() const {
        char buf[256];
        int n = std::snprintf(buf, sizeof(buf),
            "{\"healthy\":%s,\"shm_healthy\":%s,\"exchange_connected\":%s,"
            "\"signal_engine_active\":%s,\"last_signal_age_ms\":%llu,"
            "\"last_fill_age_ms\":%llu,\"error_count_5min\":%lld,"
            "\"memory_usage_mb\":%.2f}",
            is_healthy() ? "true" : "false",
            shm_healthy ? "true" : "false",
            exchange_connected ? "true" : "false",
            signal_engine_active ? "true" : "false",
            (unsigned long long)last_signal_age_ms,
            (unsigned long long)last_fill_age_ms,
            (long long)error_count_5min,
            memory_usage_mb);
        return std::string(buf, n);
    }
};

} // namespace hft
