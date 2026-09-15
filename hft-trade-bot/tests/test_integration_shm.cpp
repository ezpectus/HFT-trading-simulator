// Integration tests for the SHM IPC layer (POSIX only — see CMakeLists).
//
// Covers the real producer/consumer paths plus the wire-format contract with
// the Python peer (ai-signal-bot communication/shm_ring_buffer.py packs the
// identical little-endian layouts; drift here silently desyncs both sides).
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/ipc/shm_fill_producer.h"
#include "../src/ipc/shm_protocol.h"
#include "../src/ipc/shm_ring_buffer.h"
#include "../src/ipc/shm_signal_consumer.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <string>
#include <thread>

using namespace hft;
using namespace hft::ipc;

static int         test_counter = 0;
static std::string unique_name() {
    return "/hft_ipc_it_" + std::to_string(++test_counter);
}

// ═══════════════════════════════════════════════════════════════════════════
// Wire sizes — must match the Python struct.Struct layouts exactly
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("IPC wire sizes match the Python layouts") {
    CHECK(sizeof(SignalMsg) == 32);
    CHECK(sizeof(FillMsg) == 28);
    CHECK(sizeof(MarketSnapshotMsg) == 28);
    CHECK(sizeof(KillSwitchMsg) == 16);
}

// ═══════════════════════════════════════════════════════════════════════════
// ShmFillProducer → ring-buffer consumer (the Python-side read path)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmFillProducer: pushed fill is readable through the ring buffer") {
    const std::string name = unique_name();

    ShmFillProducer producer(name, 16);
    REQUIRE(producer.init());

    FillMsg fill{};
    fill.timestamp   = 1700000000;
    fill.symbol_id   = 0;
    fill.side        = static_cast<uint8_t>(ipc::Side::BUY);
    fill.qty         = 1.5f;
    fill.price       = 50000.0f;
    fill.fee         = 0.25f;
    fill.exchange_id = static_cast<uint8_t>(ExchangeId::SIMULATOR);
    REQUIRE(producer.push_fill(fill));
    CHECK(producer.pending() == 1);

    // Open the same segment the way the Python consumer does.
    ShmRingBuffer<FillMsg> consumer(name, 16, false);
    FillMsg                out{};
    REQUIRE(consumer.try_pop(out));
    CHECK(out.timestamp == 1700000000);
    CHECK(out.symbol_id == 0);
    CHECK(out.side == static_cast<uint8_t>(ipc::Side::BUY));
    CHECK(std::abs(out.qty - 1.5f) < 1e-6f);
    CHECK(std::abs(out.price - 50000.0f) < 1e-6f);
    CHECK(std::abs(out.fee - 0.25f) < 1e-6f);
    CHECK(out.exchange_id == static_cast<uint8_t>(ExchangeId::SIMULATOR));
    CHECK(consumer.try_pop(out) == false);
    // Producer dtor -> close() -> unlink() cleans the segment.
}

TEST_CASE("ShmFillProducer: full ring reports failure instead of dropping") {
    const std::string name = unique_name();

    ShmFillProducer producer(name, 4);
    REQUIRE(producer.init());

    FillMsg fill{};
    for (int i = 0; i < 4; ++i) {
        fill.timestamp = static_cast<uint64_t>(i);
        REQUIRE(producer.push_fill(fill));
    }
    CHECK(producer.pending() == 4);
    CHECK(producer.push_fill(fill) == false); // full — no silent overwrite
}

// ═══════════════════════════════════════════════════════════════════════════
// Ring-buffer producer → ShmSignalConsumer thread (the Python-side write path)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ShmSignalConsumer: start() delivers queued signals to the callback") {
    const std::string name = unique_name();

    // Producer side — the role Python plays when publishing signals.
    ShmRingBuffer<SignalMsg> producer(name, 16, true);
    SignalMsg                sig{};
    sig.timestamp  = 123456789;
    sig.symbol_id  = 0;
    sig.action     = static_cast<uint8_t>(Action::LONG);
    sig.confidence = 0.85f;
    sig.price      = 50000.0f;
    sig.sl         = 49000.0f;
    sig.tp         = 52000.0f;
    sig.leverage   = 10;
    REQUIRE(producer.try_push(sig));

    ShmSignalConsumer   consumer(name, 16);
    std::atomic<bool>   got{false};
    std::atomic<double> got_price{0.0};
    std::atomic<int>    got_action{-1};
    consumer.start([&](const SignalMsg& m) {
        got_price.store(m.price, std::memory_order_relaxed);
        got_action.store(m.action, std::memory_order_relaxed);
        got.store(true, std::memory_order_relaxed);
    });
    CHECK(consumer.is_running());

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (!got.load(std::memory_order_relaxed) && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    CHECK(got.load());
    CHECK(got_action.load() == static_cast<int>(Action::LONG));
    CHECK(std::abs(got_price.load() - 50000.0) < 1e-6);

    consumer.stop();
    CHECK(!consumer.is_running());
    producer.unlink();
}

// ═══════════════════════════════════════════════════════════════════════════
// Kill-switch segment — same SPSC ring, smallest wire struct
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitchMsg round-trips through the ring buffer") {
    const std::string            name = unique_name();
    ShmRingBuffer<KillSwitchMsg> rb(name, 8, true);

    KillSwitchMsg msg{};
    msg.timestamp = 777;
    msg.active    = 1;
    msg.reason    = 2; // max_drawdown
    REQUIRE(rb.try_push(msg));

    KillSwitchMsg out{};
    REQUIRE(rb.try_pop(out));
    CHECK(out.timestamp == 777);
    CHECK(out.active == 1);
    CHECK(out.reason == 2);

    rb.unlink();
}
