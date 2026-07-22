// Unit tests for ShmHeartbeatWriter and ShmHeartbeatReader using doctest
// Tests: write/read round-trip, seq consistency, is_alive, age_ms, auto heartbeat, edge cases
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/ipc/shm_heartbeat.h"

#include <chrono>
#include <cstring>
#include <thread>

using namespace hft::ipc;

// ═══════════════════════════════════════════════════════════════════════════
// Helper — unique SHM name per test to avoid collisions
// ═══════════════════════════════════════════════════════════════════════════
static int         test_counter = 0;
static std::string unique_name() {
    return "/hft_hb_test_" + std::to_string(++test_counter);
}

// ═══════════════════════════════════════════════════════════════════════════
// Writer creation and write
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: writer creates SHM and writes") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write(100, 2, "OK");

    // Reader should be able to read it
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    bool               ok = reader.read(hb);
    CHECK(ok == true);
    CHECK(hb.message_count == 100);
    CHECK(hb.error_count == 2);
    CHECK(std::string(hb.status) == "OK");
    CHECK(hb.timestamp_ns > 0);
    CHECK(hb.pid > 0);
}

TEST_CASE("ShmHeartbeat: write updates seq to even") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    CHECK(reader.read(hb) == true);
    // seq should be even (2) after first write
    CHECK(hb.seq == 2);
}

TEST_CASE("ShmHeartbeat: multiple writes increment seq") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    writer.write();
    writer.write();
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    CHECK(reader.read(hb) == true);
    CHECK(hb.seq == 6); // 3 writes × 2 increments each
}

// ═══════════════════════════════════════════════════════════════════════════
// Reader edge cases
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: read returns false before any write") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    // Don't write anything
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    CHECK(reader.read(hb) == false);
}

TEST_CASE("ShmHeartbeat: is_alive returns false before any write") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    ShmHeartbeatReader reader(name);
    CHECK(reader.is_alive(5000) == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// is_alive and age_ms
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: is_alive true after fresh write") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    CHECK(reader.is_alive(5000) == true);
}

TEST_CASE("ShmHeartbeat: is_alive false after stale write") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    // Use 1ms timeout — heartbeat was written ~instantly ago, but with sleep it'll be stale
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    CHECK(reader.is_alive(1) == false);
}

TEST_CASE("ShmHeartbeat: age_ms returns reasonable value") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    uint64_t           age = reader.age_ms();
    CHECK(age < 1000); // Should be well under 1 second
}

TEST_CASE("ShmHeartbeat: age_ms returns UINT64_MAX when no heartbeat") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    ShmHeartbeatReader reader(name);
    CHECK(reader.age_ms() == UINT64_MAX);
}

// ═══════════════════════════════════════════════════════════════════════════
// Status values
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: status DEGRADED") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write(50, 10, "DEGRADED");
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(std::string(hb.status) == "DEGRADED");
}

TEST_CASE("ShmHeartbeat: status ERROR") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write(0, 99, "ERROR");
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(std::string(hb.status) == "ERROR");
}

TEST_CASE("ShmHeartbeat: default status is OK") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(std::string(hb.status) == "OK");
}

// ═══════════════════════════════════════════════════════════════════════════
// Message and error counts
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: message and error counts preserved") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write(12345, 67, "OK");
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(hb.message_count == 12345);
    CHECK(hb.error_count == 67);
}

TEST_CASE("ShmHeartbeat: zero counts by default") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(hb.message_count == 0);
    CHECK(hb.error_count == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// PID
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: pid is nonzero") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write();
    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(hb.pid > 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto heartbeat
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: auto heartbeat writes periodically") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.start_auto(10); // 10ms interval

    // Wait for a few heartbeats
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    CHECK(reader.read(hb) == true);
    CHECK(hb.seq > 2); // More than one write happened
    CHECK(reader.is_alive(1000) == true);

    writer.stop_auto();
}

TEST_CASE("ShmHeartbeat: stop_auto stops writing") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.start_auto(10);
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    writer.stop_auto();

    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb1;
    reader.read(hb1);
    uint64_t seq_after_stop = hb1.seq;

    // Wait and check seq doesn't change
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    HeartbeatSlot hb2;
    reader.read(hb2);
    CHECK(hb2.seq == seq_after_stop);
}

// ═══════════════════════════════════════════════════════════════════════════
// Overwrite behavior
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: second write overwrites first") {
    std::string        name = unique_name();
    ShmHeartbeatWriter writer(name, true);
    writer.write(100, 0, "OK");
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
    writer.write(200, 5, "DEGRADED");

    ShmHeartbeatReader reader(name);
    HeartbeatSlot      hb;
    reader.read(hb);
    CHECK(hb.message_count == 200);
    CHECK(hb.error_count == 5);
    CHECK(std::string(hb.status) == "DEGRADED");
}

// ═══════════════════════════════════════════════════════════════════════════
// HeartbeatSlot size
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmHeartbeat: HeartbeatSlot fits in one cache line") {
    CHECK(sizeof(HeartbeatSlot) <= 64);
}
