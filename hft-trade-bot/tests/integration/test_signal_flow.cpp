// Integration test: Signal → SHM → Execution → Fill flow
// Tests the full pipeline from signal reception to order fill recording.
#include "../src/data/aligned_types.h"
#include "../src/ipc/shm_ring_buffer.h"
#include "../src/monitoring/system_monitor.h"
#include "../src/network/watchdog.h"
#include <atomic>
#include <cassert>
#include <chrono>
#include <iostream>
#include <thread>

using namespace hft;

void test_signal_to_fill_pipeline() {
    std::cout << "  Testing signal → SHM → execution → fill pipeline...\n";

    // 1. Create SHM ring buffers
    ShmRingBuffer<FastSignal> signal_buf("/hft_test_signals", 1024, true);
    ShmRingBuffer<FastOrder>  order_buf("/hft_test_orders", 1024, true);

    assert(signal_buf.size() == 0);
    assert(order_buf.size() == 0);

    // 2. Push a signal (simulating AI bot writing)
    FastSignal sig{};
    sig.set_symbol("BTC/USDT");
    sig.direction   = FastSignal::Direction::LONG;
    sig.confidence  = 85;
    sig.entry_price = 50000.0;
    sig.stop_loss   = 49000.0;
    sig.take_profit = 52000.0;
    sig.timestamp   = FastSignal::now_epoch_ns();

    assert(signal_buf.try_push(sig));
    assert(signal_buf.size() == 1);

    // 3. Pop signal (simulating C++ bot reading)
    FastSignal received{};
    assert(signal_buf.try_pop(received));
    assert(received.direction == FastSignal::Direction::LONG);
    assert(received.confidence == 85);
    assert(received.entry_price == 50000.0);

    // 4. Create order from signal
    FastOrder order{};
    order.set_symbol(received.symbol);
    order.side      = FastOrder::Side::BUY;
    order.kind      = FastOrder::OrderKind::MARKET;
    order.quantity  = 0.1;
    order.price     = received.entry_price;
    order.timestamp = FastSignal::now_epoch_ns();

    assert(order_buf.try_push(order));
    assert(order_buf.size() == 1);

    // 5. Pop order (simulating exchange adapter)
    FastOrder executed{};
    assert(order_buf.try_pop(executed));
    assert(executed.side == FastOrder::Side::BUY);
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

void test_watchdog_timeout_flow() {
    std::cout << "  Testing watchdog timeout flow...\n";

    net::Watchdog wd(50); // 50ms timeout
    assert(wd.is_alive());

    // Simulate no activity
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    assert(!wd.is_alive());

    // Feed and check alive again
    wd.feed();
    assert(wd.is_alive());

    std::cout << "  [PASS] Watchdog timeout flow test\n";
}

int main() {
    std::cout << "=== Integration Tests ===\n";
    test_signal_to_fill_pipeline();
    test_watchdog_timeout_flow();
    std::cout << "=== All integration tests passed! ===\n";
    return 0;
}
