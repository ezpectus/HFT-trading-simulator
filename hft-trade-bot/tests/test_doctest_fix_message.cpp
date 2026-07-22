// Unit tests for FixMessage — build, finalize, parse, checksum validation, field access
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/fix/fix_message.h"

using namespace hft::fix;

// ═══════════════════════════════════════════════════════════════════════════
// FixMessage — build and finalize
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("FixMessage: default constructor has zero length") {
    FixMessage msg;
    CHECK(msg.size() == 0);
}

TEST_CASE("FixMessage: add_tag string_view") {
    FixMessage msg;
    msg.add_tag(35, std::string_view("A"));
    CHECK(msg.size() > 0u);
}

TEST_CASE("FixMessage: add_tag char") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    CHECK(msg.size() > 0u);
}

TEST_CASE("FixMessage: add_tag int") {
    FixMessage msg;
    msg.add_tag(34, 42);
    CHECK(msg.size() > 0u);
}

TEST_CASE("FixMessage: add_tag uint64") {
    FixMessage msg;
    msg.add_tag(34, static_cast<uint64_t>(123456));
    CHECK(msg.size() > 0u);
}

TEST_CASE("FixMessage: add_tag double") {
    FixMessage msg;
    msg.add_tag(44, 50000.5);
    CHECK(msg.size() > 0u);
}

TEST_CASE("FixMessage: clear resets length") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    CHECK(msg.size() > 0u);
    msg.clear();
    CHECK(msg.size() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// FixMessage — finalize produces valid FIX message
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("FixMessage: finalize produces BeginString") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    auto sv = msg.finalize();
    CHECK(sv.substr(0, 2) == "8=");
    CHECK(sv.find("FIX.4.4") != std::string_view::npos);
}

TEST_CASE("FixMessage: finalize produces BodyLength") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    auto sv = msg.finalize();
    CHECK(sv.find("9=") != std::string_view::npos);
}

TEST_CASE("FixMessage: finalize produces CheckSum") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    auto sv = msg.finalize();
    CHECK(sv.find("10=") != std::string_view::npos);
}

TEST_CASE("FixMessage: finalize ends with SOH") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    auto sv = msg.finalize();
    CHECK(sv.back() == SOH);
}

// ═══════════════════════════════════════════════════════════════════════════
// FixMessage — finalize + parse round-trip (checksum regression)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("FixMessage: finalize+parse round-trip validates checksum") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("SENDER"));
    msg.add_tag(56, std::string_view("TARGET"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    auto sv = msg.finalize();

    FixMessage parser;
    bool       ok = parser.parse(sv.data(), sv.size());
    CHECK(ok == true);
}

TEST_CASE("FixMessage: round-trip preserves MsgType") {
    FixMessage msg;
    msg.add_tag(35, 'D');
    msg.add_tag(49, std::string_view("SENDER"));
    msg.add_tag(56, std::string_view("TARGET"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    auto sv = msg.finalize();

    FixMessage parser;
    parser.parse(sv.data(), sv.size());
    CHECK(parser.msg_type() == "D");
}

TEST_CASE("FixMessage: round-trip preserves SeqNum") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("SENDER"));
    msg.add_tag(56, std::string_view("TARGET"));
    msg.add_tag(34, static_cast<uint64_t>(42));
    auto sv = msg.finalize();

    FixMessage parser;
    parser.parse(sv.data(), sv.size());
    CHECK(parser.seq_num() == 42);
}

TEST_CASE("FixMessage: round-trip preserves string fields") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("MYSENDER"));
    msg.add_tag(56, std::string_view("MYTARGET"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    auto sv = msg.finalize();

    FixMessage parser;
    parser.parse(sv.data(), sv.size());
    CHECK(parser.get_field(49) == "MYSENDER");
    CHECK(parser.get_field(56) == "MYTARGET");
}

TEST_CASE("FixMessage: round-trip with multiple tags") {
    FixMessage msg;
    msg.add_tag(35, 'D');
    msg.add_tag(49, std::string_view("SENDER"));
    msg.add_tag(56, std::string_view("TARGET"));
    msg.add_tag(34, static_cast<uint64_t>(5));
    msg.add_tag(11, std::string_view("ORDER123"));
    msg.add_tag(55, std::string_view("BTCUSDT"));
    msg.add_tag(54, '1');
    msg.add_tag(38, 1.5);
    msg.add_tag(40, '2');
    msg.add_tag(44, 50000.0);
    auto sv = msg.finalize();

    FixMessage parser;
    bool       ok = parser.parse(sv.data(), sv.size());
    CHECK(ok == true);
    CHECK(parser.msg_type() == "D");
    CHECK(parser.seq_num() == 5);
    CHECK(parser.get_field(11) == "ORDER123");
    CHECK(parser.get_field(55) == "BTCUSDT");
}

// ═══════════════════════════════════════════════════════════════════════════
// FixMessage — parse edge cases
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("FixMessage: parse invalid data returns false") {
    FixMessage parser;
    CHECK(parser.parse("garbage", 7) == false);
}

TEST_CASE("FixMessage: parse empty data returns false") {
    FixMessage parser;
    CHECK(parser.parse("", 0) == false);
}

TEST_CASE("FixMessage: parse data exceeding MAX_SIZE returns false") {
    FixMessage parser;
    char       huge[FixMessage::MAX_SIZE + 100];
    std::memset(huge, 'A', sizeof(huge));
    CHECK(parser.parse(huge, sizeof(huge)) == false);
}

TEST_CASE("FixMessage: parse with wrong checksum returns false") {
    // Build a valid message then corrupt the checksum
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("S"));
    msg.add_tag(56, std::string_view("T"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    auto sv = msg.finalize();

    // Copy and corrupt the checksum (change last 3 digits before final SOH)
    std::string copy(sv.data(), sv.size());
    // Find "10=" and change the checksum value
    auto pos = copy.find("10=");
    if (pos != std::string::npos && pos + 6 < copy.size()) {
        // Flip the checksum digits
        if (copy[pos + 3] == '0')
            copy[pos + 3] = '1';
        else
            copy[pos + 3] = '0';
    }

    FixMessage parser;
    CHECK(parser.parse(copy.data(), copy.size()) == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// FixMessage — get_field
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("FixMessage: get_field returns empty for missing tag") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("SENDER"));
    msg.add_tag(56, std::string_view("TARGET"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    msg.finalize();

    auto field = msg.get_field(999);
    CHECK(field.empty());
}

TEST_CASE("FixMessage: get_field returns correct value after finalize") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("SENDER"));
    msg.add_tag(56, std::string_view("TARGET"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    msg.finalize();

    CHECK(msg.get_field(35) == "A");
    CHECK(msg.get_field(49) == "SENDER");
}

TEST_CASE("FixMessage: msg_type returns correct value") {
    FixMessage msg;
    msg.add_tag(35, '0');
    msg.add_tag(49, std::string_view("S"));
    msg.add_tag(56, std::string_view("T"));
    msg.add_tag(34, static_cast<uint64_t>(1));
    msg.finalize();

    CHECK(msg.msg_type() == "0");
}

TEST_CASE("FixMessage: seq_num returns correct value") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.add_tag(49, std::string_view("S"));
    msg.add_tag(56, std::string_view("T"));
    msg.add_tag(34, static_cast<uint64_t>(99));
    msg.finalize();

    CHECK(msg.seq_num() == 99);
}

TEST_CASE("FixMessage: seq_num returns 0 for missing tag") {
    FixMessage msg;
    msg.add_tag(35, 'A');
    msg.finalize();

    CHECK(msg.seq_num() == 0);
}
