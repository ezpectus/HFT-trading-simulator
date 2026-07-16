// Unit tests for ShmRingBuffer bulk_push/bulk_pop optimization with wrap-around
// Tests: bulk push/pop contiguous, bulk push/pop with wrap-around, partial fill, full buffer
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/ipc/shm_ring_buffer.h"
#include "../src/ipc/shm_protocol.h"

#include <vector>
#include <string>

using namespace hft;
using namespace hft::ipc;

// ═══════════════════════════════════════════════════════════════════════════
// Helper — unique SHM name per test
// ═══════════════════════════════════════════════════════════════════════════
static int test_counter = 0;
static std::string unique_name() {
    return "/hft_rb_test_" + std::to_string(++test_counter);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk push — contiguous (no wrap-around)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk_push contiguous") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 16, true);

    std::vector<SignalMsg> items(4);
    for (int i = 0; i < 4; ++i) {
        items[i].timestamp = 1000 + i;
        items[i].symbol_id = i;
        items[i].action = 1;
    }

    uint64_t pushed = rb.bulk_push(items.data(), 4);
    CHECK(pushed == 4);
    CHECK(rb.size() == 4);

    // Verify items
    for (int i = 0; i < 4; ++i) {
        SignalMsg out;
        CHECK(rb.try_pop(out));
        CHECK(out.timestamp == 1000 + i);
        CHECK(out.symbol_id == i);
    }
}

TEST_CASE("ShmRingBuffer: bulk_pop contiguous") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 16, true);

    // Push items one by one
    for (int i = 0; i < 6; ++i) {
        SignalMsg msg{};
        msg.timestamp = 2000 + i;
        rb.try_push(msg);
    }

    std::vector<SignalMsg> out(6);
    uint64_t popped = rb.bulk_pop(out.data(), 6);
    CHECK(popped == 6);
    CHECK(rb.size() == 0);

    for (int i = 0; i < 6; ++i) {
        CHECK(out[i].timestamp == 2000 + i);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk push — wrap-around
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk_push with wrap-around") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 8, true);

    // Push 6 items, pop 6 items — head is now at slot 6
    for (int i = 0; i < 6; ++i) {
        SignalMsg msg{};
        msg.timestamp = 100 + i;
        rb.try_push(msg);
    }
    for (int i = 0; i < 6; ++i) {
        SignalMsg out;
        rb.try_pop(out);
    }

    // Now push 5 items — this will wrap around (start at slot 6, need slots 6,7,0,1,2)
    std::vector<SignalMsg> items(5);
    for (int i = 0; i < 5; ++i) {
        items[i].timestamp = 200 + i;
        items[i].symbol_id = i + 10;
    }

    uint64_t pushed = rb.bulk_push(items.data(), 5);
    CHECK(pushed == 5);
    CHECK(rb.size() == 5);

    // Verify items in order
    for (int i = 0; i < 5; ++i) {
        SignalMsg out;
        CHECK(rb.try_pop(out));
        CHECK(out.timestamp == 200 + i);
        CHECK(out.symbol_id == i + 10);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk pop — wrap-around
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk_pop with wrap-around") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 8, true);

    // Push 6, pop 4 — tail is now at slot 4
    for (int i = 0; i < 6; ++i) {
        SignalMsg msg{};
        msg.timestamp = 300 + i;
        rb.try_push(msg);
    }
    for (int i = 0; i < 4; ++i) {
        SignalMsg out;
        rb.try_pop(out);
    }

    // Push 6 more — head wraps around (start at slot 6, fills 6,7,0,1,2,3)
    for (int i = 0; i < 6; ++i) {
        SignalMsg msg{};
        msg.timestamp = 400 + i;
        rb.try_push(msg);
    }

    // Now bulk_pop 8 — should wrap around (tail at 4, reads 4,5,6,7,0,1,2,3)
    std::vector<SignalMsg> out(8);
    uint64_t popped = rb.bulk_pop(out.data(), 8);
    CHECK(popped == 8);

    // Expected order: 304, 305, 400, 401, 402, 403, 404, 405
    CHECK(out[0].timestamp == 304);
    CHECK(out[1].timestamp == 305);
    CHECK(out[2].timestamp == 400);
    CHECK(out[3].timestamp == 401);
    CHECK(out[4].timestamp == 402);
    CHECK(out[5].timestamp == 403);
    CHECK(out[6].timestamp == 404);
    CHECK(out[7].timestamp == 405);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk push — partial fill (more items than available)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk_push partial when nearly full") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 4, true);

    // Fill 3 of 4 slots
    for (int i = 0; i < 3; ++i) {
        SignalMsg msg{};
        msg.timestamp = 500 + i;
        rb.try_push(msg);
    }

    // Try to push 5 items — only 1 slot available
    std::vector<SignalMsg> items(5);
    for (int i = 0; i < 5; ++i) {
        items[i].timestamp = 600 + i;
    }

    uint64_t pushed = rb.bulk_push(items.data(), 5);
    CHECK(pushed == 1);
    CHECK(rb.size() == 4);
    CHECK(rb.full());
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk pop — empty buffer
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk_pop on empty returns 0") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 8, true);

    std::vector<SignalMsg> out(4);
    uint64_t popped = rb.bulk_pop(out.data(), 4);
    CHECK(popped == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk push — zero items
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk_push zero items") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 8, true);

    uint64_t pushed = rb.bulk_push(nullptr, 0);
    CHECK(pushed == 0);
    CHECK(rb.size() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Full cycle: push, pop, push, pop with wrap-around
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: full cycle with wrap-around") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 4, true);

    // Cycle 1: push 4, pop 4
    std::vector<SignalMsg> batch1(4);
    for (int i = 0; i < 4; ++i) {
        batch1[i].timestamp = 1000 + i;
        batch1[i].symbol_id = i;
    }
    CHECK(rb.bulk_push(batch1.data(), 4) == 4);

    std::vector<SignalMsg> out1(4);
    CHECK(rb.bulk_pop(out1.data(), 4) == 4);
    for (int i = 0; i < 4; ++i) {
        CHECK(out1[i].timestamp == 1000 + i);
    }

    // Cycle 2: push 4 more — wraps around
    std::vector<SignalMsg> batch2(4);
    for (int i = 0; i < 4; ++i) {
        batch2[i].timestamp = 2000 + i;
        batch2[i].symbol_id = i + 100;
    }
    CHECK(rb.bulk_push(batch2.data(), 4) == 4);

    std::vector<SignalMsg> out2(4);
    CHECK(rb.bulk_pop(out2.data(), 4) == 4);
    for (int i = 0; i < 4; ++i) {
        CHECK(out2[i].timestamp == 2000 + i);
        CHECK(out2[i].symbol_id == i + 100);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk push then bulk pop with wrap-around in both
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmRingBuffer: bulk push and pop both wrap") {
    std::string name = unique_name();
    ShmRingBuffer<SignalMsg> rb(name, 4, true);

    // Push 3, pop 3 — head and tail at slot 3
    for (int i = 0; i < 3; ++i) {
        SignalMsg msg{};
        msg.timestamp = 100 + i;
        rb.try_push(msg);
    }
    SignalMsg tmp;
    for (int i = 0; i < 3; ++i) {
        rb.try_pop(tmp);
    }

    // Bulk push 3 — starts at slot 3, fills 3,0,1 (wraps)
    std::vector<SignalMsg> items(3);
    for (int i = 0; i < 3; ++i) {
        items[i].timestamp = 200 + i;
        items[i].symbol_id = i + 50;
    }
    CHECK(rb.bulk_push(items.data(), 3) == 3);

    // Bulk pop 3 — starts at slot 3, reads 3,0,1 (wraps)
    std::vector<SignalMsg> out(3);
    CHECK(rb.bulk_pop(out.data(), 3) == 3);

    CHECK(out[0].timestamp == 200);
    CHECK(out[0].symbol_id == 50);
    CHECK(out[1].timestamp == 201);
    CHECK(out[1].symbol_id == 51);
    CHECK(out[2].timestamp == 202);
    CHECK(out[2].symbol_id == 52);
}
