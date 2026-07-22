// SHM signal consumer — reads Signal structs from Python via shared memory.
//
// C++ side: opens existing SHM segment created by Python, polls for signals.
// Runs in a dedicated thread, invokes callback on each received signal.
#pragma once

#include "../data/aligned_types.h"
#include "shm_protocol.h"
#include "shm_ring_buffer.h"
#include <atomic>
#include <chrono>
#include <functional>
#include <string>
#include <thread>

namespace hft::ipc {

class ShmSignalConsumer {
  public:
    using SignalCallback = std::function<void(const SignalMsg&)>;

    ShmSignalConsumer(const std::string& shm_name = "/hft_signals", uint64_t capacity = 4096)
        : shm_name_(shm_name), capacity_(capacity) {}

    ~ShmSignalConsumer() { stop(); }

    // Start consumer thread. Callback is invoked for each signal received.
    void start(SignalCallback callback) {
        if (running_.load(std::memory_order_relaxed)) return;

        // Open existing SHM segment (Python creates it)
        buffer_ = std::make_unique<ShmRingBuffer<SignalMsg>>(shm_name_, capacity_, false);

        callback_ = std::move(callback);
        running_.store(true, std::memory_order_relaxed);
        thread_ = std::thread(&ShmSignalConsumer::run, this);
    }

    // Stop consumer thread and close SHM
    void stop() {
        if (!running_.exchange(false)) return;
        if (thread_.joinable()) thread_.join();
        buffer_.reset();
    }

    // Try to pop a single signal without blocking (for polling mode)
    bool try_pop_signal(SignalMsg& out) {
        if (!buffer_) return false;
        return buffer_->try_pop(out);
    }

    // Number of pending signals
    uint64_t pending() const { return buffer_ ? buffer_->size() : 0; }

    bool is_running() const { return running_.load(std::memory_order_relaxed); }

  private:
    void run() {
        SignalMsg msg;
        while (running_.load(std::memory_order_relaxed)) {
            // Batch pop for efficiency
            while (buffer_->try_pop(msg)) {
                if (callback_) callback_(msg);
            }
            // Brief sleep when empty to avoid 100% CPU
            std::this_thread::sleep_for(std::chrono::microseconds(50));
        }
    }

    std::string                               shm_name_;
    uint64_t                                  capacity_;
    std::atomic<bool>                         running_{false};
    std::thread                               thread_;
    SignalCallback                            callback_;
    std::unique_ptr<ShmRingBuffer<SignalMsg>> buffer_;
};

} // namespace hft::ipc
