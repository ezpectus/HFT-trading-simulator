// FIX 4.4 zero-copy parser — pointer-based parsing, no string copies.
//
// Parses raw FIX message buffers into a tag→pointer map for O(1) field lookup.
// All string_view fields point into the original buffer (zero-copy).
#pragma once

#include "fix_message.h"
#include <string_view>
#include <array>
#include <algorithm>

namespace hft::fix {

class FixDecoder {
public:
    static constexpr size_t MAX_FIELDS = 64;

    // Parse a raw FIX message buffer (zero-copy — views point into buffer)
    bool decode(const char* data, size_t len) {
        field_count_ = 0;
        data_ = data;
        len_ = len;

        const char* p = data;
        const char* end = data + len;

        while (p < end) {
            // Find '='
            const char* eq = static_cast<const char*>(memchr(p, '=', end - p));
            if (!eq) break;

            // Parse tag number
            int tag = 0;
            for (const char* q = p; q < eq; ++q) {
                if (*q < '0' || *q > '9') { tag = -1; break; }
                tag = tag * 10 + (*q - '0');
            }
            if (tag < 0) break;

            // Find SOH
            const char* soh = static_cast<const char*>(memchr(eq + 1, SOH, end - eq - 1));
            if (!soh) break;

            // Store pointer to value (zero-copy, flat array)
            if (field_count_ < MAX_FIELDS) {
                fields_[field_count_].tag = tag;
                fields_[field_count_].value = std::string_view(eq + 1, soh - eq - 1);
                ++field_count_;
            }

            p = soh + 1;
        }

        // Validate required fields
        if (!has_field(tag::BeginString) || !has_field(tag::MsgType)) {
            return false;
        }

        return true;
    }

    // Check if a field exists
    bool has_field(int tag) const {
        for (size_t i = 0; i < field_count_; ++i)
            if (fields_[i].tag == tag) return true;
        return false;
    }

    // Get field value as string_view (zero-copy, points into original buffer)
    std::string_view get(int tag) const {
        for (size_t i = 0; i < field_count_; ++i)
            if (fields_[i].tag == tag) return fields_[i].value;
        return {};
    }

    // Get field as integer (handles negative numbers)
    int64_t get_int(int tag) const {
        auto sv = get(tag);
        if (sv.empty()) return 0;
        int64_t v = 0;
        bool negative = false;
        size_t start = 0;
        if (sv[0] == '-') { negative = true; start = 1; }
        for (size_t i = start; i < sv.size(); ++i) {
            if (sv[i] < '0' || sv[i] > '9') break;
            v = v * 10 + (sv[i] - '0');
        }
        return negative ? -v : v;
    }

    // Get field as double
    double get_double(int tag) const {
        auto sv = get(tag);
        if (sv.empty()) return 0.0;
        // Simple atof on string_view
        char buf[32];
        size_t n = sv.size() < 31 ? sv.size() : 31;
        std::memcpy(buf, sv.data(), n);
        buf[n] = '\0';
        return std::strtod(buf, nullptr);
    }

    // Get field as char
    char get_char(int tag) const {
        auto sv = get(tag);
        return sv.empty() ? '\0' : sv[0];
    }

    // Convenience accessors
    std::string_view msg_type() const { return get(tag::MsgType); }
    uint64_t seq_num() const { return static_cast<uint64_t>(get_int(tag::MsgSeqNum)); }
    std::string_view sender_comp_id() const { return get(tag::SenderCompID); }
    std::string_view target_comp_id() const { return get(tag::TargetCompID); }

    // Is this a Logon message?
    bool is_logon() const { return msg_type() == msg_type::Logon; }
    bool is_logout() const { return msg_type() == msg_type::Logout; }
    bool is_heartbeat() const { return msg_type() == msg_type::Heartbeat; }
    bool is_test_request() const { return msg_type() == msg_type::TestRequest; }
    bool is_resend_request() const { return msg_type() == msg_type::ResendRequest; }
    bool is_execution_report() const { return msg_type() == msg_type::ExecutionReport; }
    bool is_new_order_single() const { return msg_type() == msg_type::NewOrderSingle; }
    bool is_order_cancel() const { return msg_type() == msg_type::OrderCancel; }
    bool is_market_data() const { return msg_type() == msg_type::MarketDataSnapshot; }

    // Execution report fields
    std::string_view cl_ord_id() const { return get(tag::ClOrdID); }
    std::string_view symbol() const { return get(tag::Symbol); }
    char side() const { return get_char(tag::Side); }
    double last_qty() const { return get_double(tag::LastQty); }
    double last_px() const { return get_double(tag::LastPx); }
    double avg_px() const { return get_double(tag::AvgPx); }
    double cum_qty() const { return get_double(tag::CumQty); }
    double leaves_qty() const { return get_double(tag::LeavesQty); }
    char ord_status() const { return get_char(tag::OrdStatus); }
    char exec_type() const { return get_char(tag::ExecType); }
    std::string_view text() const { return get(tag::Text); }

    const char* raw_data() const { return data_; }
    size_t raw_size() const { return len_; }

private:
    struct Field {
        int tag{0};
        std::string_view value;
    };

    const char* data_{nullptr};
    size_t len_{0};
    size_t field_count_{0};
    std::array<Field, MAX_FIELDS> fields_;
};

} // namespace hft::fix
