// Low-latency infrastructure — spinlock, SPSC queue, object pool, latency histogram, thread pinning
//
// Designed for sub-millisecond hot path: signal reception → risk check → order execution.
// No heap allocations in critical sections. Cache-line aligned for false-sharing avoidance.
#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <array>
#include <new>
#include <string>
#include <algorithm>
#include <numeric>
#include <sstream>
#include <iomanip>

#if defined(_WIN32)
  #include <windows.h>
  #include <processthreadsapi.h>
#else
  #include <pthread.h>
  #include <sched.h>
#endif

#if defined(_M_X64) || defined(__x86_64__)
  #include <immintrin.h>
#endif

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Spinlock with _mm_pause — for < 1μs critical sections
// ─────────────────────────────────────────────────────────────────────────────
class Spinlock {
public:
    void lock() noexcept {
        for (;;) {
            uint32_t expected = 0;
            if (flag_.compare_exchange_strong(expected, 1, std::memory_order_acquire)) return;
            // Spin-wait with pause to reduce power + help hyperthreading
            while (flag_.load(std::memory_order_relaxed) != 0) {
#if defined(_M_X64) || defined(__x86_64__)
                _mm_pause();
#endif
            }
        }
    }

    bool try_lock() noexcept {
        uint32_t expected = 0;
        return flag_.compare_exchange_strong(expected, 1, std::memory_order_acquire);
    }

    void unlock() noexcept {
        flag_.store(0, std::memory_order_release);
    }

private:
    std::atomic<uint32_t> flag_{0};
};

class SpinlockGuard {
public:
    explicit SpinlockGuard(Spinlock& lock) : lock_(lock) { lock_.lock(); }
    ~SpinlockGuard() { lock_.unlock(); }
    SpinlockGuard(const SpinlockGuard&) = delete;
    SpinlockGuard& operator=(const SpinlockGuard&) = delete;
private:
    Spinlock& lock_;
};

// ─────────────────────────────────────────────────────────────────────────────
// Lock-free SPSC ring buffer — single-producer single-consumer queue
// Capacity must be power of 2. No heap allocations.
// ─────────────────────────────────────────────────────────────────────────────
template <typename T, size_t Capacity>
class SPSCQueue {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");
    static constexpr size_t MASK = Capacity - 1;

public:
    SPSCQueue() : head_(0), tail_(0) {}

    // Producer: enqueue. Returns false if full.
    bool push(const T& item) noexcept {
        const size_t head = head_.load(std::memory_order_relaxed);
        const size_t next = (head + 1) & MASK;
        if (next == tail_.load(std::memory_order_acquire)) return false;
        buffer_[head] = item;
        head_.store(next, std::memory_order_release);
        return true;
    }

    bool push(T&& item) noexcept {
        const size_t head = head_.load(std::memory_order_relaxed);
        const size_t next = (head + 1) & MASK;
        if (next == tail_.load(std::memory_order_acquire)) return false;
        buffer_[head] = std::move(item);
        head_.store(next, std::memory_order_release);
        return true;
    }

    // Consumer: dequeue. Returns false if empty.
    bool pop(T& out) noexcept {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        if (tail == head_.load(std::memory_order_acquire)) return false;
        out = std::move(buffer_[tail]);
        tail_.store((tail + 1) & MASK, std::memory_order_release);
        return true;
    }

    bool empty() const noexcept {
        return head_.load(std::memory_order_relaxed) == tail_.load(std::memory_order_relaxed);
    }

    size_t size() const noexcept {
        const size_t h = head_.load(std::memory_order_relaxed);
        const size_t t = tail_.load(std::memory_order_relaxed);
        return (h - t) & MASK;
    }

    static constexpr size_t capacity() { return Capacity; }

private:
    // Cache-line pad to prevent false sharing between head and tail
    alignas(64) std::atomic<size_t> head_;
    alignas(64) std::atomic<size_t> tail_;
    alignas(64) T buffer_[Capacity];
};

// ─────────────────────────────────────────────────────────────────────────────
// ObjectPool — pre-allocated, no heap alloc in hot path
// ─────────────────────────────────────────────────────────────────────────────
template <typename T, size_t PoolSize>
class ObjectPool {
public:
    ObjectPool() {
        for (size_t i = 0; i < PoolSize; ++i) {
            pool_[i].active = false;
        }
    }

    // Acquire an object from the pool. Returns nullptr if pool exhausted.
    T* acquire() noexcept {
        for (size_t i = 0; i < PoolSize; ++i) {
            bool expected = false;
            if (pool_[i].active.compare_exchange_strong(expected, true, std::memory_order_acquire)) {
                return &pool_[i].obj;
            }
        }
        return nullptr;
    }

    // Release an object back to the pool.
    void release(T* obj) noexcept {
        if (!obj) return;
        // Find the slot — linear scan is fine for small pools
        for (size_t i = 0; i < PoolSize; ++i) {
            if (&pool_[i].obj == obj) {
                pool_[i].active.store(false, std::memory_order_release);
                return;
            }
        }
    }

    size_t available() const noexcept {
        size_t count = 0;
        for (size_t i = 0; i < PoolSize; ++i) {
            if (!pool_[i].active.load(std::memory_order_relaxed)) ++count;
        }
        return count;
    }

private:
    struct Slot {
        std::atomic<bool> active{false};
        T obj{};
    };
    std::array<Slot, PoolSize> pool_;
};

// ─────────────────────────────────────────────────────────────────────────────
// ScopedLatency — microsecond-precision timer with histogram recording
// ─────────────────────────────────────────────────────────────────────────────
class LatencyHistogram {
public:
    static constexpr size_t NUM_BUCKETS = 35;
    // Buckets: 0-1μs, 1-2μs, 2-4μs, 4-8μs, ... up to ~17s
    // Each bucket i covers [2^(i/2) μs, 2^((i+1)/2) μs) — 35 μs-buckets

    void record(double microseconds) noexcept {
        total_count_.fetch_add(1, std::memory_order_relaxed);

        // Find bucket
        if (microseconds < 1.0) {
            buckets_[0].fetch_add(1, std::memory_order_relaxed);
            return;
        }
        // log2(microseconds) * 2 → bucket index
        double log_val = std::log2(microseconds) * 2.0;
        size_t bucket = static_cast<size_t>(log_val);
        if (bucket >= NUM_BUCKETS) bucket = NUM_BUCKETS - 1;
        buckets_[bucket].fetch_add(1, std::memory_order_relaxed);

        // Track min/max
        double current_min = min_.load(std::memory_order_relaxed);
        while (microseconds < current_min && !min_.compare_exchange_weak(current_min, microseconds)) {}
        double current_max = max_.load(std::memory_order_relaxed);
        while (microseconds > current_max && !max_.compare_exchange_weak(current_max, microseconds)) {}
    }

    struct Stats {
        double p50{};
        double p95{};
        double p99{};
        double p999{};
        double min{};
        double max{};
        uint64_t count{};
    };

    Stats get_stats() const noexcept {
        Stats stats;
        stats.count = total_count_.load(std::memory_order_relaxed);
        if (stats.count == 0) return stats;

        stats.min = min_.load(std::memory_order_relaxed);
        stats.max = max_.load(std::memory_order_relaxed);

        // Compute percentiles from histogram
        uint64_t cumulative = 0;
        double p50_target = stats.count * 0.50;
        double p95_target = stats.count * 0.95;
        double p99_target = stats.count * 0.99;
        double p999_target = stats.count * 0.999;

        for (size_t i = 0; i < NUM_BUCKETS; ++i) {
            uint64_t count = buckets_[i].load(std::memory_order_relaxed);
            cumulative += count;
            double bucket_upper = std::pow(2.0, (i + 1) / 2.0);  // upper bound in μs

            if (stats.p50 == 0 && cumulative >= p50_target) stats.p50 = bucket_upper;
            if (stats.p95 == 0 && cumulative >= p95_target) stats.p95 = bucket_upper;
            if (stats.p99 == 0 && cumulative >= p99_target) stats.p99 = bucket_upper;
            if (stats.p999 == 0 && cumulative >= p999_target) stats.p999 = bucket_upper;
        }

        return stats;
    }

    std::string format_stats() const {
        auto s = get_stats();
        if (s.count == 0) return "no samples";

        std::ostringstream oss;
        oss << std::fixed << std::setprecision(1)
            << "n=" << s.count
            << " min=" << s.min << "μs"
            << " P50=" << s.p50 << "μs"
            << " P95=" << s.p95 << "μs"
            << " P99=" << s.p99 << "μs"
            << " P99.9=" << s.p999 << "μs"
            << " max=" << s.max << "μs";
        return oss.str();
    }

    void reset() noexcept {
        total_count_.store(0, std::memory_order_relaxed);
        for (auto& b : buckets_) b.store(0, std::memory_order_relaxed);
        min_.store(1e18, std::memory_order_relaxed);
        max_.store(0.0, std::memory_order_relaxed);
    }

private:
    std::array<std::atomic<uint64_t>, NUM_BUCKETS> buckets_{};
    std::atomic<uint64_t> total_count_{0};
    std::atomic<double> min_{1e18};
    std::atomic<double> max_{0.0};
};

class ScopedLatency {
public:
    explicit ScopedLatency(LatencyHistogram& histogram)
        : histogram_(histogram)
        , start_(std::chrono::steady_clock::now()) {}

    ~ScopedLatency() {
        auto end = std::chrono::steady_clock::now();
        auto duration_us = std::chrono::duration<double, std::micro>(end - start_).count();
        histogram_.record(duration_us);
    }

    double elapsed_us() const {
        auto now = std::chrono::steady_clock::now();
        return std::chrono::duration<double, std::micro>(now - start_).count();
    }

    ScopedLatency(const ScopedLatency&) = delete;
    ScopedLatency& operator=(const ScopedLatency&) = delete;

private:
    LatencyHistogram& histogram_;
    std::chrono::steady_clock::time_point start_;
};

// ─────────────────────────────────────────────────────────────────────────────
// Thread pinning + priority — pin execution thread to dedicated core
// ─────────────────────────────────────────────────────────────────────────────
class ThreadAffinity {
public:
    // Pin current thread to specific CPU core
    static bool pin_to_core(int core_id) noexcept {
#if defined(_WIN32)
        DWORD_PTR mask = 1ULL << core_id;
        return SetThreadAffinityMask(GetCurrentThread(), mask) != 0;
#else
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        CPU_SET(core_id, &cpuset);
        return pthread_setaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset) == 0;
#endif
    }

    // Set thread priority to maximum
    static bool set_priority_max() noexcept {
#if defined(_WIN32)
        return SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL) != 0;
#else
        struct sched_param param;
        param.sched_priority = 99;
        return pthread_setschedparam(pthread_self(), SCHED_FIFO, &param) == 0;
#endif
    }

    // Get number of available CPU cores
    static int num_cores() noexcept {
#if defined(_WIN32)
        SYSTEM_INFO si;
        GetSystemInfo(&si);
        return static_cast<int>(si.dwNumberOfProcessors);
#else
        return static_cast<int>(sysconf(_SC_NPROCESSORS_ONLN));
#endif
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CircuitBreaker — 5 errors → 30s cooldown → half-open probe
// ─────────────────────────────────────────────────────────────────────────────
class CircuitBreaker {
public:
    enum class State { CLOSED, OPEN, HALF_OPEN };

    CircuitBreaker(int threshold = 5, int cooldown_seconds = 30)
        : threshold_(threshold), cooldown_seconds_(cooldown_seconds) {}

    bool allow_request() noexcept {
        State s = state_.load(std::memory_order_relaxed);
        if (s == State::CLOSED) return true;
        if (s == State::OPEN) {
            auto now = std::chrono::steady_clock::now();
            auto opened = opened_at_.load(std::memory_order_relaxed);
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - opened).count();
            if (elapsed >= cooldown_seconds_) {
                // Transition to half-open
                state_.store(State::HALF_OPEN, std::memory_order_relaxed);
                return true;  // Allow probe
            }
            return false;
        }
        // HALF_OPEN: allow one probe
        return true;
    }

    void record_success() noexcept {
        error_count_.store(0, std::memory_order_relaxed);
        state_.store(State::CLOSED, std::memory_order_relaxed);
    }

    void record_failure() noexcept {
        int count = error_count_.fetch_add(1, std::memory_order_relaxed) + 1;
        if (count >= threshold_) {
            state_.store(State::OPEN, std::memory_order_relaxed);
            opened_at_.store(std::chrono::steady_clock::now(), std::memory_order_relaxed);
        }
    }

    State get_state() const noexcept {
        return state_.load(std::memory_order_relaxed);
    }

    int error_count() const noexcept {
        return error_count_.load(std::memory_order_relaxed);
    }

private:
    int threshold_;
    int cooldown_seconds_;
    std::atomic<State> state_{State::CLOSED};
    std::atomic<int> error_count_{0};
    std::atomic<std::chrono::steady_clock::time_point> opened_at_{};
};

// ─────────────────────────────────────────────────────────────────────────────
// Retry with exponential backoff + jitter
// ─────────────────────────────────────────────────────────────────────────────
class RetryPolicy {
public:
    RetryPolicy(int max_attempts = 3, int base_delay_ms = 500, double jitter_pct = 0.3)
        : max_attempts_(max_attempts), base_delay_ms_(base_delay_ms), jitter_pct_(jitter_pct) {}

    template <typename Func>
    auto execute(Func&& func) -> decltype(func()) {
        for (int attempt = 0; attempt < max_attempts_; ++attempt) {
            try {
                return func();
            } catch (const std::exception& e) {
                if (attempt == max_attempts_ - 1) {
                    throw;  // Re-throw on last attempt
                }
                int delay = base_delay_ms_ * (1 << attempt);  // 500ms × 2^n
                // Add jitter: 0-30% random addition
                int jitter = static_cast<int>(delay * jitter_pct_ * (static_cast<double>(rand()) / RAND_MAX));
                delay += jitter;
                std::this_thread::sleep_for(std::chrono::milliseconds(delay));
            }
        }
        throw std::runtime_error("RetryPolicy: exhausted all attempts");
    }

private:
    int max_attempts_;
    int base_delay_ms_;
    double jitter_pct_;
};

} // namespace hft
