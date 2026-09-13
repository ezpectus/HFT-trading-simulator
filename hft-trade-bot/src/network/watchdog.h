// Connection activity watchdog — detects stale WebSocket connections.
// Wired into SignalReceiver and OrderExecutor: inbound frames (data or
// protocol ping/pong) feed it; a monitor thread force-closes the connection
// when it goes silent, which drives the existing close→reconnect path.
#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>

namespace hft::net {

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

} // namespace hft::net
