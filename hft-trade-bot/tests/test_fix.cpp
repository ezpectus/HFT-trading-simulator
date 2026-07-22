// Tests: FIX message encode/decode, checksum, session states
#include "../src/fix/fix_decoder.h"
#include "../src/fix/fix_encoder.h"
#include "../src/fix/fix_message.h"
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <string_view>

using namespace hft::fix;

void test_message_build_and_parse() {
    FixMessage msg;
    msg.add_tag(tag::MsgType, 'D');
    msg.add_tag(tag::Symbol, std::string_view("BTCUSDT"));
    msg.add_tag(tag::Side, '1');
    msg.add_tag(tag::OrderQty, 1.5);
    msg.add_tag(tag::Price, 50000.0);
    auto raw = msg.finalize();

    // Parse it back
    FixMessage parsed;
    assert(parsed.parse(raw.data(), raw.size()));

    // Verify fields
    assert(parsed.msg_type() == "D");
    auto sym = parsed.get_field(tag::Symbol);
    assert(sym == "BTCUSDT");

    printf("  [PASS] test_message_build_and_parse\n");
}

void test_checksum_validation() {
    FixMessage msg;
    msg.add_tag(tag::MsgType, '0');
    auto raw = msg.finalize();

    // Verify checksum is correct
    FixMessage parsed;
    assert(parsed.parse(raw.data(), raw.size()));

    // Corrupt the message — should fail checksum
    char bad_data[256];
    std::memcpy(bad_data, raw.data(), raw.size());
    bad_data[10] = 'X'; // Corrupt a byte

    FixMessage bad_parsed;
    assert(!bad_parsed.parse(bad_data, raw.size()));

    printf("  [PASS] test_checksum_validation\n");
}

void test_new_order_single() {
    auto msg = FixEncoder::build_new_order_single("HFTBOT", "EXCHANGE", 1, "ORD001", "BTCUSDT", '1',
                                                  1.5, '2', 50000.0, '0');

    assert(msg.size() > 0u);

    // Parse
    FixDecoder decoder;
    assert(decoder.decode(msg.data(), msg.size()));

    assert(decoder.is_new_order_single());
    assert(decoder.get(tag::ClOrdID) == "ORD001");
    assert(decoder.get(tag::Symbol) == "BTCUSDT");
    assert(decoder.get_char(tag::Side) == '1');
    assert(decoder.get_double(tag::OrderQty) == 1.5);
    assert(decoder.get_double(tag::Price) == 50000.0);

    printf("  [PASS] test_new_order_single\n");
}

void test_logon_message() {
    auto msg = FixEncoder::build_logon("HFTBOT", "EXCHANGE", 1, 30, "user", "pass", true);

    FixDecoder decoder;
    assert(decoder.decode(msg.data(), msg.size()));

    assert(decoder.is_logon());
    assert(decoder.get(tag::SenderCompID) == "HFTBOT");
    assert(decoder.get(tag::TargetCompID) == "EXCHANGE");
    assert(decoder.get_int(tag::HeartBtInt) == 30);
    assert(decoder.get(tag::Username) == "user");
    assert(decoder.get_char(tag::ResetSeqNumFlag) == 'Y');

    printf("  [PASS] test_logon_message\n");
}

void test_logout_message() {
    auto msg = FixEncoder::build_logout("HFTBOT", "EXCHANGE", 5, "Session ending");

    FixDecoder decoder;
    assert(decoder.decode(msg.data(), msg.size()));

    assert(decoder.is_logout());
    assert(decoder.get(tag::Text) == "Session ending");

    printf("  [PASS] test_logout_message\n");
}

void test_heartbeat_message() {
    auto msg = FixEncoder::build_heartbeat("HFTBOT", "EXCHANGE", 10);

    FixDecoder decoder;
    assert(decoder.decode(msg.data(), msg.size()));

    assert(decoder.is_heartbeat());
    assert(decoder.seq_num() == 10);

    printf("  [PASS] test_heartbeat_message\n");
}

void test_order_cancel() {
    auto msg =
        FixEncoder::build_order_cancel("HFTBOT", "EXCHANGE", 2, "ORD001", "ORD002", "BTCUSDT", '1');

    FixDecoder decoder;
    assert(decoder.decode(msg.data(), msg.size()));

    assert(decoder.is_order_cancel());
    assert(decoder.get(tag::OrigClOrdID) == "ORD001");
    assert(decoder.get(tag::ClOrdID) == "ORD002");

    printf("  [PASS] test_order_cancel\n");
}

void test_decoder_zero_copy() {
    auto msg = FixEncoder::build_new_order_single("HFTBOT", "EXCHANGE", 1, "ORD001", "BTCUSDT", '1',
                                                  1.0, '2', 50000.0);

    FixDecoder decoder;
    assert(decoder.decode(msg.data(), msg.size()));

    // String views should point into original buffer
    auto sym = decoder.get(tag::Symbol);
    assert(sym.data() >= msg.data());
    assert(sym.data() < msg.data() + msg.size());

    printf("  [PASS] test_decoder_zero_copy\n");
}

void test_field_types() {
    FixDecoder decoder;
    auto msg = FixEncoder::build_new_order_single("HFTBOT", "EXCHANGE", 42, "ORD001", "ETHUSDT",
                                                  '2', 10.5, '2', 3000.5);

    assert(decoder.decode(msg.data(), msg.size()));

    // Integer field
    assert(decoder.get_int(tag::MsgSeqNum) == 42);

    // Double field
    assert(std::abs(decoder.get_double(tag::OrderQty) - 10.5) < 1e-10);
    assert(std::abs(decoder.get_double(tag::Price) - 3000.5) < 1e-10);

    // Char field
    assert(decoder.get_char(tag::Side) == '2');

    printf("  [PASS] test_field_types\n");
}

int main() {
    printf("=== FIX 4.4 Protocol Tests ===\n");
    test_message_build_and_parse();
    test_checksum_validation();
    test_new_order_single();
    test_logon_message();
    test_logout_message();
    test_heartbeat_message();
    test_order_cancel();
    test_decoder_zero_copy();
    test_field_types();
    printf("=== All tests passed! ===\n");
    return 0;
}
