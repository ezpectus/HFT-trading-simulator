// FIX 4.4 high-performance encoder — pre-allocated buffers, no allocations in hot path.
//
// Builds common FIX messages (Logon, Logout, Heartbeat, NewOrderSingle, OrderCancel)
// using stack-allocated buffers and snprintf for minimal overhead.
#pragma once

#include "fix_message.h"
#include <chrono>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <string>
#include <string_view>

namespace hft::fix {

class FixEncoder {
  public:
    // Build Logon (35=A)
    static FixMessage build_logon(const char* sender_comp_id, const char* target_comp_id,
                                  uint32_t seq_num, int heart_bt_int, const char* username = "",
                                  const char* password = "", bool reset_seq = false) {
        FixMessage msg;
        msg.add_tag(tag::MsgType, 'A');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        msg.add_tag(tag::EncryptMethod, 0);
        msg.add_tag(tag::HeartBtInt, heart_bt_int);
        if (reset_seq) {
            msg.add_tag(tag::ResetSeqNumFlag, 'Y');
        }
        if (username[0]) msg.add_tag(tag::Username, std::string_view(username));
        if (password[0]) msg.add_tag(tag::Password, std::string_view(password));
        msg.finalize();
        return msg;
    }

    // Build Logout (35=5)
    static FixMessage build_logout(const char* sender_comp_id, const char* target_comp_id,
                                   uint32_t seq_num, const char* text = "") {
        FixMessage msg;
        msg.add_tag(tag::MsgType, '5');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        if (text[0]) msg.add_tag(tag::Text, std::string_view(text));
        msg.finalize();
        return msg;
    }

    // Build Heartbeat (35=0)
    static FixMessage build_heartbeat(const char* sender_comp_id, const char* target_comp_id,
                                      uint32_t seq_num, const char* test_req_id = "") {
        FixMessage msg;
        msg.add_tag(tag::MsgType, '0');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        if (test_req_id[0]) {
            // Tag 112 = TestReqID (for heartbeat response to TestRequest)
            msg.add_tag(112, std::string_view(test_req_id));
        }
        msg.finalize();
        return msg;
    }

    // Build TestRequest (35=1)
    static FixMessage build_test_request(const char* sender_comp_id, const char* target_comp_id,
                                         uint32_t seq_num, const char* test_req_id) {
        FixMessage msg;
        msg.add_tag(tag::MsgType, '1');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        msg.add_tag(112, std::string_view(test_req_id));
        msg.finalize();
        return msg;
    }

    // Build ResendRequest (35=2)
    static FixMessage build_resend_request(const char* sender_comp_id, const char* target_comp_id,
                                           uint32_t seq_num, uint32_t begin_seq_no,
                                           uint32_t end_seq_no // 0 = "0" (infinite)
    ) {
        FixMessage msg;
        msg.add_tag(tag::MsgType, '2');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        msg.add_tag(7, static_cast<uint64_t>(begin_seq_no)); // BeginSeqNo
        msg.add_tag(16, static_cast<uint64_t>(end_seq_no));  // EndSeqNo
        msg.finalize();
        return msg;
    }

    // Build NewOrderSingle (35=D)
    static FixMessage
    build_new_order_single(const char* sender_comp_id, const char* target_comp_id, uint32_t seq_num,
                           const char* cl_ord_id, const char* symbol,
                           char   side, // '1'=Buy, '2'=Sell
                           double order_qty,
                           char   ord_type, // '1'=Market, '2'=Limit
                           double price         = 0.0,
                           char   time_in_force = '0', // '0'=Day, '1'=GTC, '3'=IOC, '4'=FOK
                           double stop_px       = 0.0) {
        FixMessage msg;
        msg.add_tag(tag::MsgType, 'D');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        msg.add_tag(tag::ClOrdID, std::string_view(cl_ord_id));
        msg.add_tag(tag::Symbol, std::string_view(symbol));
        msg.add_tag(tag::Side, side);
        msg.add_tag(tag::OrderQty, order_qty);
        msg.add_tag(tag::OrdType, ord_type);
        msg.add_tag(tag::HandlInst, '1'); // Automated execution
        if (ord_type == '2') {
            msg.add_tag(tag::Price, price);
        }
        msg.add_tag(tag::TimeInForce, time_in_force);
        if (stop_px > 0.0) {
            msg.add_tag(tag::StopPx, stop_px);
        }
        msg.finalize();
        return msg;
    }

    // Build OrderCancel (35=F)
    static FixMessage build_order_cancel(const char* sender_comp_id, const char* target_comp_id,
                                         uint32_t seq_num, const char* orig_cl_ord_id,
                                         const char* cl_ord_id, const char* symbol, char side) {
        FixMessage msg;
        msg.add_tag(tag::MsgType, 'F');
        msg.add_tag(tag::SenderCompID, std::string_view(sender_comp_id));
        msg.add_tag(tag::TargetCompID, std::string_view(target_comp_id));
        msg.add_tag(tag::MsgSeqNum, static_cast<uint64_t>(seq_num));
        add_sending_time(msg);
        msg.add_tag(tag::OrigClOrdID, std::string_view(orig_cl_ord_id));
        msg.add_tag(tag::ClOrdID, std::string_view(cl_ord_id));
        msg.add_tag(tag::Symbol, std::string_view(symbol));
        msg.add_tag(tag::Side, side);
        msg.add_tag(tag::OrderQty, 0.0);
        msg.finalize();
        return msg;
    }

  private:
    static void add_sending_time(FixMessage& msg) {
        auto now = std::chrono::system_clock::now();
        auto ts =
            std::chrono::duration_cast<std::chrono::microseconds>(now.time_since_epoch()).count();
        // FIX format: YYYYMMDD-HH:MM:SS.ssssss
        char        time_buf[32];
        std::time_t t = std::chrono::system_clock::to_time_t(now);
        std::tm     tm_val;
#ifdef _WIN32
        gmtime_s(&tm_val, &t);
#else
        gmtime_r(&t, &tm_val);
#endif
        auto us = ts % 1000000;
        std::snprintf(time_buf, sizeof(time_buf), "%04d%02d%02d-%02d:%02d:%02d.%06lld",
                      tm_val.tm_year + 1900, tm_val.tm_mon + 1, tm_val.tm_mday, tm_val.tm_hour,
                      tm_val.tm_min, tm_val.tm_sec, us);
        msg.add_tag(tag::SendingTime, std::string_view(time_buf));
    }
};

} // namespace hft::fix
