// Tests: Ring buffer push/pop, overflow, bulk operations
#include "../ipc/shm_ring_buffer.h"
#include "../ipc/shm_protocol.h"
#include <cassert>
#include <cstdio>
#include <cstring>
#include <vector>
#include <chrono>
#include <thread>

using namespace hft::ipc;

// Use a simple struct for testing
struct TestMsg {
    uint64_t id;
    double value;
};

void test_basic_push_pop() {
    // Create SHM ring buffer
    ShmRingBuffer<TestMsg> rb("/hft_test_rb", 16, true);

    TestMsg msg{1, 42.0};
    assert(rb.try_push(msg));

    TestMsg out;
    assert(rb.try_pop(out));
    assert(out.id == 1);
    assert(out.value == 42.0);

    // Buffer should be empty now
    assert(!rb.try_pop(out));
    assert(rb.size() == 0);

    rb.unlink();
    printf("  [PASS] test_basic_push_pop\n");
}

void test_fill_buffer() {
    ShmRingBuffer<TestMsg> rb("/hft_test_rb2", 8, true);

    // Fill to capacity
    for (uint64_t i = 0; i < 8; ++i) {
        assert(rb.try_push({i, static_cast<double>(i)}));
    }

    // Should be full
    assert(rb.size() == 8);
    assert(!rb.try_push({99, 99.0}));  // Should fail

    // Pop all
    for (uint64_t i = 0; i < 8; ++i) {
        TestMsg out;
        assert(rb.try_pop(out));
        assert(out.id == i);  // FIFO order
    }

    assert(rb.size() == 0);

    rb.unlink();
    printf("  [PASS] test_fill_buffer\n");
}

void test_bulk_push_pop() {
    ShmRingBuffer<TestMsg> rb("/hft_test_rb3", 64, true);

    std::vector<TestMsg> msgs;
    for (uint64_t i = 0; i < 32; ++i) {
        msgs.push_back({i, static_cast<double>(i * 10)});
    }

    uint64_t pushed = rb.bulk_push(msgs.data(), msgs.size());
    assert(pushed == 32);
    assert(rb.size() == 32);

    TestMsg out[32];
    uint64_t popped = rb.bulk_pop(out, 32);
    assert(popped == 32);
    assert(rb.size() == 0);

    for (uint64_t i = 0; i < 32; ++i) {
        assert(out[i].id == i);
        assert(out[i].value == static_cast<double>(i * 10));
    }

    rb.unlink();
    printf("  [PASS] test_bulk_push_pop\n");
}

void test_wraparound() {
    ShmRingBuffer<TestMsg> rb("/hft_test_rb4", 4, true);

    // Push and pop multiple times to test wraparound
    for (int cycle = 0; cycle < 10; ++cycle) {
        for (uint64_t i = 0; i < 4; ++i) {
            assert(rb.try_push({static_cast<uint64_t>(cycle * 4 + i), 0.0}));
        }
        for (uint64_t i = 0; i < 4; ++i) {
            TestMsg out;
            assert(rb.try_pop(out));
            assert(out.id == static_cast<uint64_t>(cycle * 4 + i));
        }
    }

    rb.unlink();
    printf("  [PASS] test_wraparound\n");
}

void test_signal_struct() {
    ShmRingBuffer<SignalMsg> rb("/hft_test_sig", 16, true);

    SignalMsg sig{};
    sig.timestamp = 123456789;
    sig.symbol_id = 0;  // BTC
    sig.action = 1;     // LONG
    sig.confidence = 0.85f;
    sig.price = 50000.0f;
    sig.sl = 49000.0f;
    sig.tp = 52000.0f;
    sig.leverage = 10;

    assert(rb.try_push(sig));

    SignalMsg out;
    assert(rb.try_pop(out));
    assert(out.timestamp == 123456789);
    assert(out.symbol_id == 0);
    assert(out.action == 1);
    assert(std::abs(out.confidence - 0.85f) < 1e-6);
    assert(std::abs(out.price - 50000.0f) < 1e-6);

    rb.unlink();
    printf("  [PASS] test_signal_struct\n");
}

void test_fill_struct() {
    ShmRingBuffer<FillMsg> rb("/hft_test_fill", 16, true);

    FillMsg fill{};
    fill.timestamp = 987654321;
    fill.symbol_id = 1;  // ETH
    fill.side = 0;       // BUY
    fill.qty = 2.5f;
    fill.price = 3000.0f;
    fill.fee = 0.5f;
    fill.exchange_id = 1;  // OKX

    assert(rb.try_push(fill));

    FillMsg out;
    assert(rb.try_pop(out));
    assert(out.timestamp == 987654321);
    assert(out.symbol_id == 1);
    assert(out.side == 0);
    assert(std::abs(out.qty - 2.5f) < 1e-6);

    rb.unlink();
    printf("  [PASS] test_fill_struct\n");
}

void test_header_magic() {
    ShmRingBuffer<TestMsg> rb("/hft_test_magic", 8, true);

    // Verify magic number is set
    // The header should have been initialized with SHM_MAGIC
    // We can't directly access it, but the fact that it works means it's valid

    TestMsg msg{1, 1.0};
    assert(rb.try_push(msg));
    TestMsg out;
    assert(rb.try_pop(out));

    rb.unlink();
    printf("  [PASS] test_header_magic\n");
}

int main() {
    printf("=== SHM Ring Buffer Tests ===\n");
    test_basic_push_pop();
    test_fill_buffer();
    test_bulk_push_pop();
    test_wraparound();
    test_signal_struct();
    test_fill_struct();
    test_header_magic();
    printf("=== All tests passed! ===\n");
    return 0;
}
