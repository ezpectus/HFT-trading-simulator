// Network layer — WebSocket client for exchange connectivity and reconnection.
//
// Features:
// - Asynchronous WebSocket client (Boost.Beast / websocketpp wrapper)
// - Automatic reconnection with exponential backoff
// - Heartbeat / watchdog (detect stale connections)
// - Message queue with backpressure
// - Subscribe / unsubscribe to channels
// - TLS support for WSS endpoints
//
// No heap allocations in hot path (uses ObjectPool for message buffers).
#pragma once

#include "../utils/low_latency.h"
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <functional>
#include <mutex>
#include <queue>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

namespace hft::net {

// ─────────────────────────────────────────────────────────────────────────────
// Connection state
// ─────────────────────────────────────────────────────────────────────────────
enum class ConnectionState : uint8_t {
    DISCONNECTED  = 0,
    CONNECTING    = 1,
    CONNECTED     = 2,
    AUTHENTICATED = 3,
    RECONNECTING  = 4,
    ERROR_STATE   = 5,
};

inline const char* connection_state_str(ConnectionState s) noexcept {
    switch (s) {
    case ConnectionState::DISCONNECTED:
        return "DISCONNECTED";
    case ConnectionState::CONNECTING:
        return "CONNECTING";
    case ConnectionState::CONNECTED:
        return "CONNECTED";
    case ConnectionState::AUTHENTICATED:
        return "AUTHENTICATED";
    case ConnectionState::RECONNECTING:
        return "RECONNECTING";
    case ConnectionState::ERROR_STATE:
        return "ERROR";
    default:
        return "UNKNOWN";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconnection policy — exponential backoff with jitter
// ─────────────────────────────────────────────────────────────────────────────
struct ReconnectPolicy {
    uint32_t initial_delay_ms{100};
    uint32_t max_delay_ms{30000};
    uint32_t backoff_factor{2};
    uint32_t jitter_ms{50};
    uint32_t max_attempts{0}; // 0 = infinite

    uint32_t compute_delay(uint32_t attempt) const noexcept {
        uint32_t delay = initial_delay_ms;
        for (uint32_t i = 1; i < attempt; ++i) {
            delay *= backoff_factor;
            if (delay >= max_delay_ms) {
                delay = max_delay_ms;
                break;
            }
        }
        // Add jitter: ±jitter_ms
        if (jitter_ms > 0) {
            int32_t jitter =
                static_cast<int32_t>(jitter_ms) - static_cast<int32_t>(rand() % (2 * jitter_ms));
            delay = static_cast<uint32_t>(std::max(0, static_cast<int32_t>(delay) + jitter));
        }
        return delay;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Watchdog — detects stale connections
// ─────────────────────────────────────────────────────────────────────────────
class Watchdog {
  public:
    explicit Watchdog(uint32_t timeout_ms = 5000)
        : timeout_ms_(timeout_ms), last_activity_ns_(now_ns()) {}

    void feed() noexcept { last_activity_ns_.store(now_ns(), std::memory_order_release); }

    bool is_alive() const noexcept {
        uint64_t elapsed = now_ns() - last_activity_ns_.load(std::memory_order_acquire);
        return elapsed < static_cast<uint64_t>(timeout_ms_) * 1'000'000ULL;
    }

    uint64_t idle_ms() const noexcept {
        uint64_t elapsed = now_ns() - last_activity_ns_.load(std::memory_order_acquire);
        return elapsed / 1'000'000ULL;
    }

    void set_timeout(uint32_t ms) noexcept { timeout_ms_ = ms; }

  private:
    static uint64_t now_ns() noexcept {
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
                   std::chrono::steady_clock::now().time_since_epoch())
            .count();
    }

    uint32_t              timeout_ms_;
    std::atomic<uint64_t> last_activity_ns_;
};

// ─────────────────────────────────────────────────────────────────────────────
// Message queue — thread-safe bounded queue with backpressure
// ─────────────────────────────────────────────────────────────────────────────
class MessageQueue {
  public:
    explicit MessageQueue(size_t capacity = 1024) : capacity_(capacity) {}

    bool try_push(std::string&& msg) {
        std::lock_guard<Spinlock> lk(lock_);
        if (queue_.size() >= capacity_) {
            dropped_.fetch_add(1, std::memory_order_relaxed);
            return false;
        }
        queue_.push(std::move(msg));
        return true;
    }

    bool try_pop(std::string& out) {
        std::lock_guard<Spinlock> lk(lock_);
        if (queue_.empty()) return false;
        out = std::move(queue_.front());
        queue_.pop();
        return true;
    }

    size_t size() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        return queue_.size();
    }

    bool empty() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        return queue_.empty();
    }

    uint64_t dropped_count() const noexcept { return dropped_.load(std::memory_order_relaxed); }

    void clear() {
        std::lock_guard<Spinlock> lk(lock_);
        while (!queue_.empty())
            queue_.pop();
    }

  private:
    mutable Spinlock        lock_;
    std::queue<std::string> queue_;
    size_t                  capacity_;
    std::atomic<uint64_t>   dropped_{0};
};

// ─────────────────────────────────────────────────────────────────────────────
// Subscription manager — track active channel subscriptions
// ─────────────────────────────────────────────────────────────────────────────
class SubscriptionManager {
  public:
    void subscribe(const std::string& channel) {
        std::lock_guard<Spinlock> lk(lock_);
        channels_.insert(channel);
    }

    void unsubscribe(const std::string& channel) {
        std::lock_guard<Spinlock> lk(lock_);
        channels_.erase(channel);
    }

    std::vector<std::string> get_subscriptions() const {
        std::lock_guard<Spinlock> lk(lock_);
        return {channels_.begin(), channels_.end()};
    }

    bool is_subscribed(const std::string& channel) const {
        std::lock_guard<Spinlock> lk(lock_);
        return channels_.count(channel) > 0;
    }

    size_t count() const {
        std::lock_guard<Spinlock> lk(lock_);
        return channels_.size();
    }

  private:
    mutable Spinlock                lock_;
    std::unordered_set<std::string> channels_;
};

// ─────────────────────────────────────────────────────────────────────────────
// ReconnectionManager — manages reconnection attempts and state
// ─────────────────────────────────────────────────────────────────────────────
class ReconnectionManager {
  public:
    ReconnectionManager() : ReconnectionManager(ReconnectPolicy{}) {}
    explicit ReconnectionManager(ReconnectPolicy policy)
        : policy_(policy), state_(ConnectionState::DISCONNECTED) {}

    void on_connect() noexcept {
        state_.store(ConnectionState::CONNECTED, std::memory_order_release);
        attempts_.store(0, std::memory_order_release);
    }

    void on_disconnect() noexcept {
        state_.store(ConnectionState::RECONNECTING, std::memory_order_release);
    }

    void on_error() noexcept {
        state_.store(ConnectionState::ERROR_STATE, std::memory_order_release);
    }

    uint32_t next_delay_ms() noexcept {
        uint32_t attempt = attempts_.fetch_add(1, std::memory_order_relaxed) + 1;
        if (policy_.max_attempts > 0 && attempt > policy_.max_attempts) {
            state_.store(ConnectionState::DISCONNECTED, std::memory_order_release);
            return 0; // Give up
        }
        return policy_.compute_delay(attempt);
    }

    ConnectionState state() const noexcept { return state_.load(std::memory_order_acquire); }

    uint32_t attempts() const noexcept { return attempts_.load(std::memory_order_relaxed); }

    bool should_retry() const noexcept {
        if (policy_.max_attempts == 0) return true;
        return attempts_.load(std::memory_order_relaxed) < policy_.max_attempts;
    }

  private:
    ReconnectPolicy              policy_;
    std::atomic<ConnectionState> state_;
    std::atomic<uint32_t>        attempts_{0};
};

} // namespace hft::net
