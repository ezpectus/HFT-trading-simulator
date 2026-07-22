// FIX 4.4 session management — logon, logout, heartbeat, sequence numbers.
//
// Manages a FIX session with persistent sequence numbers (file-based).
// State machine: CONNECTING → LOGGED_IN → LOGGING_OUT → DISCONNECTED
//
// Handles ResendRequest (gap detection), TestRequest (heartbeat timeout).
#pragma once

#include "fix_message.h"
#include "fix_encoder.h"
#include "fix_decoder.h"
#include <string>
#include <fstream>
#include <atomic>
#include <chrono>
#include <functional>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <cstring>

namespace hft::fix {

enum class SessionState {
    DISCONNECTED,
    CONNECTING,
    LOGGED_IN,
    LOGGING_OUT,
};

class FixSession {
public:
    // Callback for sending raw bytes over the transport (TCP/TLS)
    using SendCallback = std::function<bool(const char* data, size_t len)>;
    // Callback for incoming application messages (ExecutionReport, etc.)
    using AppMessageCallback = std::function<void(const FixDecoder&)>;

    FixSession(const std::string& sender_comp_id,
               const std::string& target_comp_id,
               const std::string& seq_file_path,
               int heart_bt_int = 30)
        : sender_comp_id_(sender_comp_id)
        , target_comp_id_(target_comp_id)
        , seq_file_path_(seq_file_path)
        , heart_bt_int_(heart_bt_int)
    {
        load_seq_nums();
    }

    ~FixSession() {
        if (state_.load(std::memory_order_acquire) != SessionState::DISCONNECTED) {
            logout();
        }
        stop_heartbeat();
        save_seq_nums();
    }

    // Set the send callback (must be set before logon)
    void set_send_callback(SendCallback cb) { send_cb_ = std::move(cb); }
    void set_app_message_callback(AppMessageCallback cb) { app_msg_cb_ = std::move(cb); }

    // Initiate logon
    bool logon(const std::string& username = "", const std::string& password = "",
               bool reset_seq = false) {
        SessionState expected = SessionState::DISCONNECTED;
        if (!state_.compare_exchange_strong(expected, SessionState::CONNECTING,
                std::memory_order_acq_rel)) return false;

        if (reset_seq) {
            outgoing_seq_ = 1;
            incoming_seq_ = 1;
        }

        auto msg = FixEncoder::build_logon(
            sender_comp_id_.c_str(), target_comp_id_.c_str(),
            outgoing_seq_++, heart_bt_int_,
            username.c_str(), password.c_str(), reset_seq
        );
        bool sent = send_cb_ ? send_cb_(msg.data(), msg.size()) : false;
        if (sent) {
            save_seq_nums();
        } else {
            state_.store(SessionState::DISCONNECTED, std::memory_order_release);
        }
        return sent;
    }

    // Initiate logout
    bool logout(const std::string& text = "") {
        SessionState expected = SessionState::LOGGED_IN;
        if (!state_.compare_exchange_strong(expected, SessionState::LOGGING_OUT,
                std::memory_order_acq_rel)) return false;

        auto msg = FixEncoder::build_logout(
            sender_comp_id_.c_str(), target_comp_id_.c_str(),
            outgoing_seq_++, text.c_str()
        );
        bool sent = send_cb_ ? send_cb_(msg.data(), msg.size()) : false;
        save_seq_nums();
        stop_heartbeat();
        return sent;
    }

    // Process incoming raw FIX message
    void on_message(const char* data, size_t len) {
        FixDecoder decoder;
        if (!decoder.decode(data, len)) {
            return; // Invalid message
        }

        uint64_t incoming_seq = decoder.seq_num();

        // Check for sequence gap
        if (incoming_seq > incoming_seq_) {
            // Gap detected — send ResendRequest
            auto resend = FixEncoder::build_resend_request(
                sender_comp_id_.c_str(), target_comp_id_.c_str(),
                outgoing_seq_++, static_cast<uint32_t>(incoming_seq_),
                static_cast<uint32_t>(incoming_seq - 1)
            );
            if (send_cb_) send_cb_(resend.data(), resend.size());
            save_seq_nums();
        }

        // Update expected incoming seq
        incoming_seq_ = incoming_seq + 1;
        save_seq_nums();

        // Handle session-level messages
        if (decoder.is_logon()) {
            state_.store(SessionState::LOGGED_IN, std::memory_order_release);
            {
                std::lock_guard<std::mutex> lk(hb_mutex_);
                last_heartbeat_ = std::chrono::steady_clock::now();
            }
            start_heartbeat();
        } else if (decoder.is_logout()) {
            state_.store(SessionState::DISCONNECTED, std::memory_order_release);
            stop_heartbeat();
        } else if (decoder.is_heartbeat()) {
            {
                std::lock_guard<std::mutex> lk(hb_mutex_);
                last_heartbeat_ = std::chrono::steady_clock::now();
            }
            // If TestReqID present, we already responded via heartbeat
        } else if (decoder.is_test_request()) {
            // Respond with Heartbeat containing same TestReqID
            auto test_id = decoder.get(112);
            char test_id_buf[64] = {};
            size_t n = test_id.size() < 63 ? test_id.size() : 63;
            std::memcpy(test_id_buf, test_id.data(), n);
            auto hb = FixEncoder::build_heartbeat(
                sender_comp_id_.c_str(), target_comp_id_.c_str(),
                outgoing_seq_++, test_id_buf
            );
            if (send_cb_) send_cb_(hb.data(), hb.size());
            save_seq_nums();
            {
                std::lock_guard<std::mutex> lk(hb_mutex_);
                last_heartbeat_ = std::chrono::steady_clock::now();
            }
        } else if (decoder.is_resend_request()) {
            // We don't store messages for resend — send SequenceReset with GapFillFlag=Y
            // For simplicity, just acknowledge the gap
            uint32_t begin = static_cast<uint32_t>(decoder.get_int(7));
            uint32_t end = static_cast<uint32_t>(decoder.get_int(16));
            // Send SequenceReset (35=4) with NewSeqNo=end+1
            FixMessage reset_msg;
            reset_msg.add_tag(tag::MsgType, '4');
            reset_msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id_));
            reset_msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id_));
            reset_msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(outgoing_seq_++));
            reset_msg.add_tag(123, 'Y');  // GapFillFlag
            reset_msg.add_tag(36, static_cast<uint64_t>(end > 0 ? end + 1 : outgoing_seq_));
            reset_msg.finalize();
            if (send_cb_) send_cb_(reset_msg.data(), reset_msg.size());
            save_seq_nums();
        } else {
            // Application message — invoke callback
            if (app_msg_cb_) app_msg_cb_(decoder);
            {
                std::lock_guard<std::mutex> lk(hb_mutex_);
                last_heartbeat_ = std::chrono::steady_clock::now();
            }
        }
    }

    // Send a NewOrderSingle (35=D)
    bool send_new_order(const std::string& cl_ord_id, const std::string& symbol,
                        char side, double qty, char ord_type,
                        double price = 0.0, char tif = '0', double stop_px = 0.0) {
        if (state_.load(std::memory_order_acquire) != SessionState::LOGGED_IN) return false;
        auto msg = FixEncoder::build_new_order_single(
            sender_comp_id_.c_str(), target_comp_id_.c_str(),
            outgoing_seq_++, cl_ord_id.c_str(), symbol.c_str(),
            side, qty, ord_type, price, tif, stop_px
        );
        bool sent = send_cb_ ? send_cb_(msg.data(), msg.size()) : false;
        save_seq_nums();
        return sent;
    }

    // Send an OrderCancel (35=F)
    bool send_cancel(const std::string& orig_cl_ord_id, const std::string& cl_ord_id,
                     const std::string& symbol, char side) {
        if (state_.load(std::memory_order_acquire) != SessionState::LOGGED_IN) return false;
        auto msg = FixEncoder::build_order_cancel(
            sender_comp_id_.c_str(), target_comp_id_.c_str(),
            outgoing_seq_++, orig_cl_ord_id.c_str(), cl_ord_id.c_str(),
            symbol.c_str(), side
        );
        bool sent = send_cb_ ? send_cb_(msg.data(), msg.size()) : false;
        save_seq_nums();
        return sent;
    }

    SessionState state() const { return state_.load(std::memory_order_acquire); }
    bool is_logged_in() const { return state_.load(std::memory_order_acquire) == SessionState::LOGGED_IN; }
    uint32_t outgoing_seq() const { return outgoing_seq_; }
    uint32_t incoming_seq() const { return incoming_seq_; }

    // Check for heartbeat timeout (call periodically)
    bool check_timeout() {
        if (state_.load(std::memory_order_acquire) != SessionState::LOGGED_IN) return false;
        std::chrono::steady_clock::time_point hb;
        {
            std::lock_guard<std::mutex> lk(hb_mutex_);
            hb = last_heartbeat_;
        }
        auto elapsed = std::chrono::steady_clock::now() - hb;
        auto seconds = std::chrono::duration_cast<std::chrono::seconds>(elapsed).count();
        return seconds > (heart_bt_int_ * 2);
    }

private:
    void start_heartbeat() {
        heartbeat_running_ = true;
        heartbeat_thread_ = std::thread([this]() {
            while (heartbeat_running_) {
                {
                    std::unique_lock<std::mutex> lk(hb_wake_mutex_);
                    hb_wake_cv_.wait_for(lk, std::chrono::seconds(heart_bt_int_),
                        [this]() { return !heartbeat_running_.load(std::memory_order_relaxed); });
                }
                if (!heartbeat_running_ || state_.load(std::memory_order_acquire) != SessionState::LOGGED_IN) break;

                auto msg = FixEncoder::build_heartbeat(
                    sender_comp_id_.c_str(), target_comp_id_.c_str(),
                    outgoing_seq_++
                );
                if (send_cb_) send_cb_(msg.data(), msg.size());
                save_seq_nums();
            }
        });
    }

    void stop_heartbeat() {
        heartbeat_running_ = false;
        hb_wake_cv_.notify_all();
        if (heartbeat_thread_.joinable()) heartbeat_thread_.join();
    }

    void load_seq_nums() {
        std::lock_guard<std::mutex> lk(seq_mutex_);
        std::ifstream f(seq_file_path_);
        if (f) {
            uint32_t out_seq = 1, in_seq = 1;
            f >> out_seq >> in_seq;
            outgoing_seq_.store(out_seq, std::memory_order_relaxed);
            incoming_seq_.store(in_seq, std::memory_order_relaxed);
        }
    }

    void save_seq_nums() {
        std::lock_guard<std::mutex> lk(seq_mutex_);
        std::ofstream f(seq_file_path_);
        if (f) {
            f << outgoing_seq_.load(std::memory_order_relaxed)
              << ' ' << incoming_seq_.load(std::memory_order_relaxed);
        }
    }

    std::string sender_comp_id_;
    std::string target_comp_id_;
    std::string seq_file_path_;
    int heart_bt_int_;

    std::atomic<uint32_t> outgoing_seq_{1};
    std::atomic<uint32_t> incoming_seq_{1};

    std::atomic<SessionState> state_{SessionState::DISCONNECTED};
    SendCallback send_cb_;
    AppMessageCallback app_msg_cb_;

    std::mutex hb_mutex_;
    std::chrono::steady_clock::time_point last_heartbeat_;

    std::mutex seq_mutex_;
    std::mutex hb_wake_mutex_;
    std::condition_variable hb_wake_cv_;
    std::atomic<bool> heartbeat_running_{false};
    std::thread heartbeat_thread_;
};

} // namespace hft::fix
