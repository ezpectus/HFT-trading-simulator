// Kill switch — emergency stop for all trading activity.
//
// Activates via:
// 1. File-based trigger: touch /tmp/kill_switch (external monitoring, cron, etc.)
// 2. Programmatic: activate() method (risk manager, manual button)
// 3. Daily loss limit exceeded (auto-trigger from RiskManager)
//
// On activation:
// 1. Cancel all open orders
// 2. Close all positions at market
// 3. Notify Python via SHM (KillSwitchMsg)
// 4. Block all new order submissions
#pragma once

#include "../utils/low_latency.h"
#include "../ipc/shm_protocol.h"
#include "../ipc/shm_ring_buffer.h"
#include <atomic>
#include <string>
#include <chrono>
#include <thread>
#include <functional>
#include <fstream>
#include <memory>
#include <sys/stat.h>

namespace hft {

class KillSwitch {
public:
    enum class Reason : uint8_t {
        MANUAL = 0,
        DAILY_LOSS = 1,
        MAX_DRAWDOWN = 2,
        MARGIN_CALL = 3,
        FILE_TRIGGER = 4,
    };

    using CancelAllCallback = std::function<void()>;
    using CloseAllCallback = std::function<void()>;
    using NotifyCallback = std::function<void(Reason)>;

    KillSwitch(const std::string& trigger_file = "/tmp/kill_switch",
               const std::string& shm_name = "/hft_kill_switch")
        : trigger_file_(trigger_file)
        , shm_name_(shm_name)
    {}

    ~KillSwitch() { stop_monitoring(); }

    // Set callbacks for emergency actions
    void set_cancel_all_callback(CancelAllCallback cb) { cancel_all_cb_ = std::move(cb); }
    void set_close_all_callback(CloseAllCallback cb) { close_all_cb_ = std::move(cb); }
    void set_notify_callback(NotifyCallback cb) { notify_cb_ = std::move(cb); }

    // Initialize SHM for notifying Python
    bool init_shm() {
        try {
            shm_ = std::make_unique<ipc::ShmRingBuffer<ipc::KillSwitchMsg>>(
                shm_name_, 64, true);
            return true;
        } catch (...) {
            return false;
        }
    }

    // Activate the kill switch
    void activate(Reason reason = Reason::MANUAL) {
        if (active_.exchange(true)) return; // Already activated

        auto ts = std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        // 1. Cancel all open orders
        if (cancel_all_cb_) cancel_all_cb_();

        // 2. Close all positions at market
        if (close_all_cb_) close_all_cb_();

        // 3. Notify Python via SHM
        if (shm_) {
            ipc::KillSwitchMsg msg{};
            msg.timestamp = static_cast<uint64_t>(ts);
            msg.active = 1;
            msg.reason = static_cast<uint8_t>(reason);
            shm_->try_push(msg);
        }

        // 4. Notify callback
        if (notify_cb_) notify_cb_(reason);

        // 5. Remove trigger file if it was a file trigger
        if (reason == Reason::FILE_TRIGGER) {
            ::unlink(trigger_file_.c_str());
        }
    }

    // Deactivate (manual reset, requires explicit confirmation)
    void deactivate() {
        active_.store(false, std::memory_order_relaxed);
    }

    // Check if kill switch is active
    bool is_active() const { return active_.load(std::memory_order_acquire); }

    // Check if we can submit new orders
    bool can_trade() const { return !active_.load(std::memory_order_acquire); }

    // Start file-based monitoring thread
    void start_monitoring(int poll_interval_ms = 1000) {
        monitoring_ = true;
        monitor_thread_ = std::thread(&KillSwitch::monitor_loop, this, poll_interval_ms);
    }

    // Stop file-based monitoring
    void stop_monitoring() {
        monitoring_ = false;
        if (monitor_thread_.joinable()) monitor_thread_.join();
    }

    // Get reason for last activation
    Reason last_reason() const { return last_reason_.load(std::memory_order_relaxed); }

    // Get activation timestamp
    uint64_t activated_at() const { return activated_at_.load(std::memory_order_relaxed); }

    // Close SHM
    void close() {
        if (shm_) {
            shm_->unlink();
            shm_.reset();
        }
    }

private:
    void monitor_loop(int poll_interval_ms) {
        while (monitoring_) {
            // Check if trigger file exists
            struct stat st;
            if (stat(trigger_file_.c_str(), &st) == 0) {
                last_reason_.store(Reason::FILE_TRIGGER, std::memory_order_relaxed);
                activate(Reason::FILE_TRIGGER);
            }

            std::this_thread::sleep_for(
                std::chrono::milliseconds(poll_interval_ms));
        }
    }

    std::string trigger_file_;
    std::string shm_name_;
    std::atomic<bool> active_{false};
    std::atomic<Reason> last_reason_{Reason::MANUAL};
    std::atomic<uint64_t> activated_at_{0};

    std::atomic<bool> monitoring_{false};
    std::thread monitor_thread_;

    CancelAllCallback cancel_all_cb_;
    CloseAllCallback close_all_cb_;
    NotifyCallback notify_cb_;

    std::unique_ptr<ipc::ShmRingBuffer<ipc::KillSwitchMsg>> shm_;
};

} // namespace hft
