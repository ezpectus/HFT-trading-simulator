// Unit tests for ShmMarketData SHM market data writer/reader using doctest
// Tests: write/read round-trip, seq consistency, num_slots header, multiple symbols, bounds check
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/ipc/shm_market_data.h"

#include <cstring>

using namespace hft::ipc;

// ═══════════════════════════════════════════════════════════════════════════
// Helper — unique SHM name per test
// ═══════════════════════════════════════════════════════════════════════════
static int         test_counter = 0;
static std::string unique_name() {
    return "/hft_md_test_" + std::to_string(++test_counter);
}

// ═══════════════════════════════════════════════════════════════════════════
// Write and read round-trip
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: write and read snapshot") {
    std::string   name = unique_name();
    ShmMarketData md(name, 10, true);

    MarketSnapshotMsg snap{};
    snap.timestamp = 1234567890;
    snap.symbol_id = 0;
    snap.bid       = 50000.0f;
    snap.ask       = 50001.0f;
    snap.last      = 50000.5f;
    snap.volume    = 1000000.0f;
    md.write_snapshot(0, snap);

    MarketSnapshotMsg out{};
    bool              ok = md.read_snapshot(0, out);
    CHECK(ok == true);
    CHECK(out.timestamp == 1234567890);
    CHECK(out.bid == 50000.0f);
    CHECK(out.ask == 50001.0f);
    CHECK(out.last == 50000.5f);
    CHECK(out.volume == 1000000.0f);
}

TEST_CASE("ShmMarketData: read returns false before any write") {
    std::string   name = unique_name();
    ShmMarketData md(name, 10, true);

    MarketSnapshotMsg out{};
    CHECK(md.read_snapshot(0, out) == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// Num_slots header
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: num_slots header is written on create") {
    std::string   name = unique_name();
    ShmMarketData md(name, 10, true);

    // Open as reader to verify header
    ShmMarketData reader(name, 10, false);
    // If the header is correct, the reader should work with the same slot layout
    MarketSnapshotMsg snap{};
    snap.timestamp = 999;
    snap.symbol_id = 5;
    snap.bid       = 100.0f;
    md.write_snapshot(5, snap);

    MarketSnapshotMsg out{};
    CHECK(reader.read_snapshot(5, out) == true);
    CHECK(out.timestamp == 999);
    CHECK(out.bid == 100.0f);
}

// ═══════════════════════════════════════════════════════════════════════════
// Multiple symbols
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: multiple symbols are independent") {
    std::string   name = unique_name();
    ShmMarketData md(name, 10, true);

    MarketSnapshotMsg snap0{};
    snap0.timestamp = 100;
    snap0.symbol_id = 0;
    snap0.bid       = 50000.0f;
    md.write_snapshot(0, snap0);

    MarketSnapshotMsg snap1{};
    snap1.timestamp = 200;
    snap1.symbol_id = 1;
    snap1.bid       = 3000.0f;
    md.write_snapshot(1, snap1);

    MarketSnapshotMsg out0{}, out1{};
    CHECK(md.read_snapshot(0, out0) == true);
    CHECK(md.read_snapshot(1, out1) == true);
    CHECK(out0.timestamp == 100);
    CHECK(out0.bid == 50000.0f);
    CHECK(out1.timestamp == 200);
    CHECK(out1.bid == 3000.0f);
}

TEST_CASE("ShmMarketData: overwrite previous snapshot") {
    std::string   name = unique_name();
    ShmMarketData md(name, 10, true);

    MarketSnapshotMsg snap1{};
    snap1.timestamp = 100;
    snap1.bid       = 50000.0f;
    md.write_snapshot(0, snap1);

    MarketSnapshotMsg snap2{};
    snap2.timestamp = 200;
    snap2.bid       = 51000.0f;
    md.write_snapshot(0, snap2);

    MarketSnapshotMsg out{};
    CHECK(md.read_snapshot(0, out) == true);
    CHECK(out.timestamp == 200);
    CHECK(out.bid == 51000.0f);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bounds checking
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: write out of bounds is ignored") {
    std::string   name = unique_name();
    ShmMarketData md(name, 5, true);

    MarketSnapshotMsg snap{};
    snap.timestamp = 100;
    md.write_snapshot(10, snap); // Out of bounds

    MarketSnapshotMsg out{};
    CHECK(md.read_snapshot(10, out) == false);
}

TEST_CASE("ShmMarketData: read out of bounds returns false") {
    std::string   name = unique_name();
    ShmMarketData md(name, 5, true);

    MarketSnapshotMsg out{};
    CHECK(md.read_snapshot(10, out) == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// Convenience write_price
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: write_price convenience method") {
    std::string   name = unique_name();
    ShmMarketData md(name, 10, true);

    md.write_price(2, 12345, 100.0f, 101.0f, 100.5f, 500.0f);

    MarketSnapshotMsg out{};
    CHECK(md.read_snapshot(2, out) == true);
    CHECK(out.timestamp == 12345);
    CHECK(out.symbol_id == 2);
    CHECK(out.bid == 100.0f);
    CHECK(out.ask == 101.0f);
    CHECK(out.last == 100.5f);
    CHECK(out.volume == 500.0f);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reader/writer in same process (open existing)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: writer and reader share data") {
    std::string   name = unique_name();
    ShmMarketData writer(name, 10, true);
    ShmMarketData reader(name, 10, false);

    MarketSnapshotMsg snap{};
    snap.timestamp = 42;
    snap.symbol_id = 3;
    snap.bid       = 25000.0f;
    snap.ask       = 25001.0f;
    writer.write_snapshot(3, snap);

    MarketSnapshotMsg out{};
    CHECK(reader.read_snapshot(3, out) == true);
    CHECK(out.timestamp == 42);
    CHECK(out.bid == 25000.0f);
    CHECK(out.ask == 25001.0f);
}

// ═══════════════════════════════════════════════════════════════════════════
// Slot size
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: SnapshotSlot fits in one cache line") {
    CHECK(sizeof(SnapshotSlot) <= 64);
}

// ═══════════════════════════════════════════════════════════════════════════
// max_symbols accessor
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmMarketData: max_symbols returns configured value") {
    std::string   name = unique_name();
    ShmMarketData md(name, 7, true);
    CHECK(md.max_symbols() == 7);
}
