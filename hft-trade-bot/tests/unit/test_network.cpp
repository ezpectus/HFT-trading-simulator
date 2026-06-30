// Unit tests for network::WebSocket client utilities
#include <cassert>
#include <iostream>
#include <thread>
#include <chrono>
#include "../../src/network/ws_client.h"

using namespace hft::net;

void test_reconnect_policy() {
    ReconnectPolicy rp{100, 30000, 2, 0, 0};
    assert(rp.compute_delay(1) == 100);
    assert(rp.compute_delay(2) == 200);
    assert(rp.compute_delay(3) == 400);
    assert(rp.compute_delay(4) == 800);
    // Should cap at max_delay
    assert(rp.compute_delay(20) == 30000);
    std::cout << "  [PASS] test_reconnect_policy\n";
}

void test_reconnect_jitter() {
    ReconnectPolicy rp{100, 30000, 2, 50, 0};
    uint32_t d1 = rp.compute_delay(1);
    // With jitter=50, delay should be between 50 and 150
    assert(d1 >= 50 && d1 <= 150);
    std::cout << "  [PASS] test_reconnect_jitter\n";
}

void test_watchdog_alive() {
    Watchdog wd(100);  // 100ms timeout
    assert(wd.is_alive());
    std::this_thread::sleep_for(std::chrono::milliseconds(150));
    assert(!wd.is_alive());
    wd.feed();
    assert(wd.is_alive());
    std::cout << "  [PASS] test_watchdog_alive\n";
}

void test_watchdog_idle() {
    Watchdog wd(1000);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    uint64_t idle = wd.idle_ms();
    assert(idle >= 40 && idle <= 100);
    std::cout << "  [PASS] test_watchdog_idle\n";
}

void test_message_queue() {
    MessageQueue mq(10);
    assert(mq.empty());
    assert(mq.size() == 0);

    for (int i = 0; i < 5; ++i) {
        assert(mq.try_push("msg" + std::to_string(i)));
    }
    assert(mq.size() == 5);
    assert(!mq.empty());

    std::string out;
    assert(mq.try_pop(out));
    assert(out == "msg0");
    assert(mq.size() == 4);

    // Fill to capacity
    for (int i = 0; i < 10; ++i) {
        mq.try_push("overflow");
    }
    // Should have dropped some
    assert(mq.dropped_count() > 0);
    std::cout << "  [PASS] test_message_queue\n";
}

void test_message_queue_clear() {
    MessageQueue mq(100);
    for (int i = 0; i < 10; ++i) {
        mq.try_push("msg");
    }
    assert(mq.size() == 10);
    mq.clear();
    assert(mq.size() == 0);
    assert(mq.empty());
    std::cout << "  [PASS] test_message_queue_clear\n";
}

void test_subscription_manager() {
    SubscriptionManager sm;
    sm.subscribe("depth");
    sm.subscribe("trades");
    assert(sm.count() == 2);
    assert(sm.is_subscribed("depth"));
    assert(sm.is_subscribed("trades"));
    assert(!sm.is_subscribed("kline"));

    sm.unsubscribe("depth");
    assert(!sm.is_subscribed("depth"));
    assert(sm.count() == 1);

    auto subs = sm.get_subscriptions();
    assert(subs.size() == 1);
    assert(subs[0] == "trades");
    std::cout << "  [PASS] test_subscription_manager\n";
}

void test_reconnection_manager() {
    ReconnectionManager rm;
    assert(rm.state() == ConnectionState::DISCONNECTED);

    rm.on_disconnect();
    assert(rm.state() == ConnectionState::RECONNECTING);

    uint32_t delay1 = rm.next_delay_ms();
    assert(delay1 > 0);
    assert(rm.attempts() == 1);

    uint32_t delay2 = rm.next_delay_ms();
    assert(delay2 >= delay1);  // Should increase (without jitter)

    rm.on_connect();
    assert(rm.state() == ConnectionState::CONNECTED);
    assert(rm.attempts() == 0);
    std::cout << "  [PASS] test_reconnection_manager\n";
}

void test_reconnection_max_attempts() {
    ReconnectPolicy rp{10, 100, 2, 0, 3};  // max 3 attempts
    ReconnectionManager rm(rp);
    rm.on_disconnect();
    assert(rm.should_retry());
    rm.next_delay_ms();
    rm.next_delay_ms();
    rm.next_delay_ms();
    assert(!rm.should_retry());
    std::cout << "  [PASS] test_reconnection_max_attempts\n";
}

void test_connection_state_string() {
    assert(std::string(connection_state_str(ConnectionState::DISCONNECTED)) == "DISCONNECTED");
    assert(std::string(connection_state_str(ConnectionState::CONNECTED)) == "CONNECTED");
    assert(std::string(connection_state_str(ConnectionState::RECONNECTING)) == "RECONNECTING");
    std::cout << "  [PASS] test_connection_state_string\n";
}

int main() {
    std::cout << "=== Network Tests ===\n";
    test_reconnect_policy();
    test_reconnect_jitter();
    test_watchdog_alive();
    test_watchdog_idle();
    test_message_queue();
    test_message_queue_clear();
    test_subscription_manager();
    test_reconnection_manager();
    test_reconnection_max_attempts();
    test_connection_state_string();
    std::cout << "=== All tests passed! ===\n";
    return 0;
}
