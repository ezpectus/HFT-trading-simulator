// Integration test: Signal → SHM → Execution → Fill flow
// Tests the full pipeline from signal reception to order fill recording.
#include <cassert>
#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include "../src/ipc/shm_ring_buffer.h"
#include "../src/monitoring/system_monitor.h"
#include "../src/network/ws_client.h"
#include "../src/data/aligned_types.h"

using namespace hft;

void test_signal_to_fill_pipeline() {
    std::cout << "  Testing signal → SHM → execution → fill pipeline...\n";

    // 1. Create SHM ring buffers
    ShmRingBuffer<FastSignal, 1024> signal_buf("/hft_test_signals", true);
    ShmRingBuffer<FastOrder, 1024> order_buf("/hft_test_orders", true);

    assert(signal_buf.size() == 0);
    assert(order_buf.size() == 0);

    // 2. Push a signal (simulating AI bot writing)
    FastSignal sig{};
    sig.symbol_id = 1;
    sig.direction = 1;  // LONG
    sig.confidence = 85.0;
    sig.entry_price = 50000.0;
    sig.stop_loss = 49000.0;
    sig.take_profit = 52000.0;
    sig.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();

    assert(signal_buf.try_push(sig));
    assert(signal_buf.size() == 1);

    // 3. Pop signal (simulating C++ bot reading)
    FastSignal received{};
    assert(signal_buf.try_pop(received));
    assert(received.symbol_id == 1);
    assert(received.direction == 1);
    assert(received.confidence == 85.0);
    assert(received.entry_price == 50000.0);

    // 4. Create order from signal
    FastOrder order{};
    order.symbol_id = received.symbol_id;
    order.side = 1;  // BUY
    order.quantity = 0.1;
    order.price = received.entry_price;
    order.type = 0;  // MARKET
    order.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();

    assert(order_buf.try_push(order));
    assert(order_buf.size() == 1);

    // 5. Pop order (simulating exchange adapter)
    FastOrder executed{};
    assert(order_buf.try_pop(executed));
    assert(executed.symbol_id == 1);
    assert(executed.side == 1);
    assert(executed.quantity == 0.1);

    // 6. Update monitoring
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::SIGNALS_RECEIVED);
    mon.increment(SystemMonitor::Metric::SIGNALS_PROCESSED);
    mon.increment(SystemMonitor::Metric::ORDERS_SENT);
    mon.increment(SystemMonitor::Metric::ORDERS_FILLED);

    assert(mon.get(SystemMonitor::Metric::SIGNALS_RECEIVED) == 1);
    assert(mon.get(SystemMonitor::Metric::ORDERS_FILLED) == 1);
    assert(mon.fill_rate() == 1.0);

    std::cout << "  [PASS] Signal → fill pipeline test\n";
}

void test_reconnection_flow() {
    std::cout << "  Testing reconnection flow...\n";

    net::ReconnectionManager rm(net::ReconnectPolicy{50, 1000, 2, 10, 5});
    assert(rm.state() == net::ConnectionState::DISCONNECTED);

    // Simulate disconnect
    rm.on_disconnect();
    assert(rm.state() == net::ConnectionState::RECONNECTING);

    // Wait for reconnect delay
    uint32_t delay = rm.next_delay_ms();
    assert(delay > 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(delay + 10));

    // Simulate successful reconnect
    rm.on_connect();
    assert(rm.state() == net::ConnectionState::CONNECTED);
    assert(rm.attempts() == 0);

    std::cout << "  [PASS] Reconnection flow test\n";
}

void test_watchdog_timeout_flow() {
    std::cout << "  Testing watchdog timeout flow...\n";

    net::Watchdog wd(50);  // 50ms timeout
    assert(wd.is_alive());

    // Simulate no activity
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    assert(!wd.is_alive());

    // Feed and check alive again
    wd.feed();
    assert(wd.is_alive());

    std::cout << "  [PASS] Watchdog timeout flow test\n";
}

void test_message_queue_backpressure() {
    std::cout << "  Testing message queue backpressure...\n";

    net::MessageQueue mq(5);
    for (int i = 0; i < 5; ++i) {
        assert(mq.try_push("msg" + std::to_string(i)));
    }
    // Queue is full, next push should fail
    assert(!mq.try_push("overflow"));
    assert(mq.dropped_count() == 1);

    // Pop one and push again
    std::string out;
    assert(mq.try_pop(out));
    assert(out == "msg0");
    assert(mq.try_push("new_msg"));
    assert(mq.dropped_count() == 1);  // Dropped count unchanged

    std::cout << "  [PASS] Message queue backpressure test\n";
}

int main() {
    std::cout << "=== Integration Tests ===\n";
    test_signal_to_fill_pipeline();
    test_reconnection_flow();
    test_watchdog_timeout_flow();
    test_message_queue_backpressure();
    std::cout << "=== All integration tests passed! ===\n";
    return 0;
}
