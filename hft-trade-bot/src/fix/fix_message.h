// FIX 4.4 message builder/parser — tag-value encoding with SOH delimiter.
//
// FIX message format: 8=BeginString|9=BodyLength|35=MsgType|...body...|10=Checksum|
// SOH (0x01) is the field delimiter. Checksum is 3-digit modulo 256.
//
// No heap allocations in hot path: uses pre-allocated buffers.
#pragma once

#include <cstdint>
#include <cstring>
#include <cstdio>
#include <string_view>
#include <array>
#include <string>

namespace hft::fix {

constexpr char SOH = '\x01';

// Common FIX 4.4 tags
namespace tag {
    constexpr int BeginString      = 8;
    constexpr int BodyLength       = 9;
    constexpr int MsgType          = 35;
    constexpr int SenderCompID     = 49;
    constexpr int TargetCompID     = 56;
    constexpr int MsgSeqNum        = 34;
    constexpr int SendingTime      = 52;
    constexpr int CheckSum         = 10;

    // Session
    constexpr int EncryptMethod    = 98;
    constexpr int HeartBtInt       = 108;
    constexpr int ResetSeqNumFlag  = 141;
    constexpr int Username         = 553;
    constexpr int Password         = 554;

    // Order
    constexpr int ClOrdID          = 11;
    constexpr int Symbol           = 55;
    constexpr int Side             = 54;
    constexpr int OrderQty         = 38;
    constexpr int OrdType          = 40;
    constexpr int Price            = 44;
    constexpr int TimeInForce      = 59;
    constexpr int StopPx           = 99;
    constexpr int ExpireTime       = 126;
    constexpr int HandlInst        = 21;

    // Execution report
    constexpr int ExecID           = 17;
    constexpr int ExecType         = 150;
    constexpr int OrdStatus        = 39;
    constexpr int LeavesQty        = 151;
    constexpr int CumQty           = 14;
    constexpr int AvgPx            = 6;
    constexpr int LastQty          = 32;
    constexpr int LastPx           = 31;
    constexpr int Text             = 58;

    // Market data
    constexpr int MDReqID          = 262;
    constexpr int SubscriptionReqType = 263;
    constexpr int MarketDepth      = 264;
    constexpr int NoMDEntryTypes   = 267;
    constexpr int NoRelatedSym     = 146;
    constexpr int MDUpdateType     = 345;
    constexpr int MDEntryType      = 269;
    constexpr int MDEntryPx        = 270;
    constexpr int MDEntrySize      = 271;

    // Order cancel
    constexpr int OrigClOrdID      = 41;
    constexpr int ListID           = 66;
}

// MsgType values
namespace msg_type {
    constexpr std::string_view Heartbeat       = "0";
    constexpr std::string_view TestRequest     = "1";
    constexpr std::string_view ResendRequest   = "2";
    constexpr std::string_view Reject          = "3";
    constexpr std::string_view SequenceReset   = "4";
    constexpr std::string_view Logout          = "5";
    constexpr std::string_view Indication      = "6";
    constexpr std::string_view ExecutionReport = "8";
    constexpr std::string_view OrderCancelReject = "9";
    constexpr std::string_view Logon           = "A";
    constexpr std::string_view News            = "B";
    constexpr std::string_view Email           = "C";
    constexpr std::string_view NewOrderSingle  = "D";
    constexpr std::string_view OrderCancel     = "F";
    constexpr std::string_view OrderCancelReplace = "G";
    constexpr std::string_view MarketDataSnapshot = "W";
    constexpr std::string_view MarketDataIncremental = "X";
    constexpr std::string_view MarketDataRequest = "V";
}

// FIX message — holds raw buffer and provides parse/build helpers
class FixMessage {
public:
    static constexpr size_t MAX_SIZE = 4096;

    FixMessage() : len_(0) { buf_[0] = '\0'; }

    // Clear buffer for building a new message
    void clear() { len_ = 0; }

    // Append a tag=value pair (SOH is appended automatically)
    // Returns false if buffer overflow would occur.
    bool add_tag(int tag, std::string_view value) {
        // Calculate needed space: tag digits + '=' + value + SOH
        char tag_buf[16];
        int tag_len = int_to_chars(tag, tag_buf);
        size_t needed = static_cast<size_t>(tag_len) + 1 + value.size() + 1;
        if (len_ + needed > MAX_SIZE) return false;

        char* p = buf_ + len_;
        std::memcpy(p, tag_buf, static_cast<size_t>(tag_len));
        p += tag_len;
        *p++ = '=';
        p += copy_sv(value, p);
        *p++ = SOH;
        len_ = static_cast<size_t>(p - buf_);
        return true;
    }

    bool add_tag(int tag, int value) {
        char tmp[16];
        int n = int_to_chars(value, tmp);
        return add_tag(tag, std::string_view(tmp, n));
    }

    bool add_tag(int tag, uint64_t value) {
        char tmp[24];
        int n = uint_to_chars(value, tmp);
        return add_tag(tag, std::string_view(tmp, n));
    }

    bool add_tag(int tag, double value, int precision = 8) {
        char tmp[32];
        int n = std::snprintf(tmp, sizeof(tmp), "%.*f", precision, value);
        return add_tag(tag, std::string_view(tmp, static_cast<size_t>(n)));
    }

    bool add_tag(int tag, char value) {
        char tag_buf[16];
        int tag_len = int_to_chars(tag, tag_buf);
        size_t needed = static_cast<size_t>(tag_len) + 1 + 1 + 1;
        if (len_ + needed > MAX_SIZE) return false;

        char* p = buf_ + len_;
        std::memcpy(p, tag_buf, static_cast<size_t>(tag_len));
        p += tag_len;
        *p++ = '=';
        *p++ = value;
        *p++ = SOH;
        len_ = static_cast<size_t>(p - buf_);
        return true;
    }

    // Finalize message: prepend BeginString + BodyLength, append CheckSum
    // Returns the complete message as a string_view, or empty view on overflow
    std::string_view finalize(const char* begin_string = "FIX.4.4") {
        // Calculate needed size: header + body + checksum tag
        // Header: "8=FIX.4.4\x01" + "9=NNN\x01" (max ~20 bytes)
        // Checksum: "10=NNN\x01" (7 bytes)
        size_t header_len = 2 + std::strlen(begin_string) + 1;  // "8=" + begin + SOH
        char body_len_buf[24];
        int bl_len = std::snprintf(body_len_buf, sizeof(body_len_buf), "%zu", len_);
        header_len += 2 + static_cast<size_t>(bl_len) + 1;  // "9=" + len + SOH
        size_t checksum_len = 7;  // "10=NNN" + SOH

        if (header_len + len_ + checksum_len > MAX_SIZE) {
            return {};  // Overflow
        }

        // Build the complete message in a temp buffer
        char temp[MAX_SIZE];
        int pos = 0;

        // 8=BeginString|9=BodyLength|
        pos += std::snprintf(temp + pos, MAX_SIZE - pos, "8=%s%c", begin_string, SOH);

        // Body length = everything from tag 35 to end of current buffer
        size_t body_len = len_;

        pos += std::snprintf(temp + pos, MAX_SIZE - pos, "9=%zu%c", body_len, SOH);

        // Copy body (bounds-checked above)
        std::memcpy(temp + pos, buf_, len_);
        pos += static_cast<int>(len_);

        // Calculate checksum (modulo 256, 3 digits)
        unsigned char checksum = 0;
        for (int i = 0; i < pos; ++i) {
            checksum += static_cast<unsigned char>(temp[i]);
        }
        checksum %= 256;

        pos += std::snprintf(temp + pos, MAX_SIZE - pos, "10=%03d%c", checksum, SOH);

        // Copy to final buffer (bounds-checked above)
        std::memcpy(buf_, temp, static_cast<size_t>(pos));
        len_ = static_cast<size_t>(pos);

        return std::string_view(buf_, len_);
    }

    // Parse a raw FIX message buffer
    bool parse(const char* data, size_t len) {
        if (len > MAX_SIZE) return false;
        std::memcpy(buf_, data, len);
        len_ = len;

        // Verify checksum
        // Find last SOH before "10="
        int checksum = 0;
        const char* p = data;
        const char* end = data + len;

        // Find "10=" tag
        const char* cs_pos = nullptr;
        for (const char* q = end - 1; q > data; --q) {
            if (q[0] == SOH && q + 3 < end && q[1] == '1' && q[2] == '0' && q[3] == '=') {
                cs_pos = q + 4;
                break;
            }
        }
        if (!cs_pos) return false;

        // Calculate checksum up to and including the SOH before "10="
        size_t cs_start = static_cast<size_t>(cs_pos - data - 4); // -4 for "10="
        unsigned char calc = 0;
        for (size_t i = 0; i <= cs_start; ++i) {
            calc += static_cast<unsigned char>(data[i]);
        }
        calc %= 256;

        // Parse expected checksum (max 3 digits, modulo 256)
        int expected = 0;
        int digits = 0;
        while (cs_pos < end && *cs_pos >= '0' && *cs_pos <= '9' && digits < 3) {
            expected = expected * 10 + (*cs_pos - '0');
            ++cs_pos;
            ++digits;
        }

        return calc == expected;
    }

    // Get field value by tag. Returns empty string_view if not found.
    std::string_view get_field(int tag) const {
        char tag_str[16];
        int tag_len = int_to_chars(tag, tag_str);

        const char* p = buf_;
        const char* end = buf_ + len_;

        while (p < end) {
            // Find next SOH
            const char* soh = static_cast<const char*>(memchr(p, SOH, end - p));
            if (!soh) break;

            // Check if this field matches our tag
            if (static_cast<size_t>(soh - p) > static_cast<size_t>(tag_len) &&
                memcmp(p, tag_str, tag_len) == 0 && p[tag_len] == '=') {
                return std::string_view(p + tag_len + 1, soh - p - tag_len - 1);
            }
            p = soh + 1;
        }
        return {};
    }

    // Get MsgType (tag 35)
    std::string_view msg_type() const { return get_field(tag::MsgType); }

    // Get MsgSeqNum (tag 34)
    uint64_t seq_num() const {
        auto sv = get_field(tag::MsgSeqNum);
        if (sv.empty()) return 0;
        uint64_t v = 0;
        for (char c : sv) v = v * 10 + (c - '0');
        return v;
    }

    const char* data() const { return buf_; }
    size_t size() const { return len_; }

private:
    static int int_to_chars(int val, char* buf) {
        if (val == 0) { buf[0] = '0'; return 1; }
        int n = 0;
        bool negative = false;
        unsigned int uval;
        if (val < 0) {
            negative = true;
            uval = static_cast<unsigned int>(-(val + 1)) + 1;  // Safe negation
        } else {
            uval = static_cast<unsigned int>(val);
        }
        unsigned int v = uval;
        while (v > 0) { v /= 10; ++n; }
        if (negative) ++n;  // Space for '-'
        for (int i = n - 1; i >= 0; --i) {
            buf[i] = '0' + (uval % 10);
            uval /= 10;
        }
        if (negative) buf[0] = '-';
        return n;
    }

    static int uint_to_chars(uint64_t val, char* buf) {
        if (val == 0) { buf[0] = '0'; return 1; }
        int n = 0;
        uint64_t v = val;
        while (v > 0) { v /= 10; ++n; }
        for (int i = n - 1; i >= 0; --i) { buf[i] = '0' + (val % 10); val /= 10; }
        return n;
    }

    static int copy_sv(std::string_view sv, char* dst) {
        int n = static_cast<int>(sv.size());
        std::memcpy(dst, sv.data(), n);
        return n;
    }

    char buf_[MAX_SIZE];
    size_t len_;
};

} // namespace hft::fix
