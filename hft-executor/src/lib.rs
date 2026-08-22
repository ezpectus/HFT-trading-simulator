//! Order executor in Rust — FFI callable from C++.
//!
//! Connects to the exchange simulator via WebSocket and sends orders.
//! Rust provides memory safety + zero-cost abstractions + no GC pauses.
//!
//! Features:
//!   - Real WebSocket connection via tokio-tungstenite
//!   - Auto-reconnect with exponential backoff
//!   - Fill confirmation tracking
//!   - Batch order submission
//!   - FFI interface for C++ interop
//!
//! FFI interface (callable from C++):
//!   extern "C" {
//!       void* hft_executor_create(const char* ws_url);
//!       int32_t hft_executor_submit(void* exec, const char* symbol, const char* side,
//!                                   double qty, double price, const char* order_type);
//!       void hft_executor_destroy(void* exec);
//!   }

use std::ffi::{c_char, c_void, CStr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Serialize, Deserialize};
use smallvec::SmallVec;
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{SinkExt, StreamExt};

pub struct OrderExecutor {
    tx: mpsc::UnboundedSender<Order>,
    order_count: Arc<AtomicU64>,
    fill_count: Arc<AtomicU64>,
    error_count: Arc<AtomicU64>,
    _runtime: Option<tokio::runtime::Runtime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: u64,
    pub symbol: String,
    pub side: OrderSide,
    pub qty: f64,
    pub price: f64,
    pub order_type: OrderType,
    pub timestamp_ns: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OrderSide { Buy, Sell }

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum OrderType { Market, Limit, IOC, FOK, PostOnly }

#[derive(Debug, Clone)]
pub struct ExecStats {
    pub orders_sent: u64,
    pub fills_received: u64,
    pub errors: u64,
    pub avg_latency_ns: u64,
}

impl OrderExecutor {
    pub fn new(ws_url: &str) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let url = ws_url.to_string();

        let order_count = Arc::new(AtomicU64::new(0));
        let fill_count = Arc::new(AtomicU64::new(0));
        let error_count = Arc::new(AtomicU64::new(0));

        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .thread_name("hft-executor")
            .build()
            .expect("Failed to create tokio runtime");

        runtime.spawn(Self::run_loop(
            url,
            rx,
            fill_count.clone(),
            error_count.clone(),
        ));

        Self {
            tx,
            order_count,
            fill_count,
            error_count,
            _runtime: Some(runtime),
        }
    }

    pub fn submit(&self, order: Order) -> Result<(), String> {
        self.order_count.fetch_add(1, Ordering::Relaxed);
        self.tx.send(order).map_err(|e| e.to_string())
    }

    pub fn submit_batch(&self, orders: SmallVec<[Order; 16]>) -> Result<(), String> {
        self.order_count.fetch_add(orders.len() as u64, Ordering::Relaxed);
        for order in orders {
            self.tx.send(order).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn stats(&self) -> ExecStats {
        ExecStats {
            orders_sent: self.order_count.load(Ordering::Relaxed),
            fills_received: self.fill_count.load(Ordering::Relaxed),
            errors: self.error_count.load(Ordering::Relaxed),
            avg_latency_ns: 0,
        }
    }

    async fn run_loop(
        url: String,
        mut rx: mpsc::UnboundedReceiver<Order>,
        fill_count: Arc<AtomicU64>,
        error_count: Arc<AtomicU64>,
    ) {
        let mut seq: u64 = 0;
        let mut backoff = Duration::from_millis(500);

        loop {
            tracing::info!("Connecting to WebSocket: {}", url);
            let ws = match connect_async(&url).await {
                Ok((ws, _)) => {
                    tracing::info!("WebSocket connected to {}", url);
                    backoff = Duration::from_millis(500);
                    ws
                }
                Err(e) => {
                    tracing::warn!("WebSocket connect to {} failed: {} — retrying in {:?}", url, e, backoff);
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(Duration::from_secs(10));
                    continue;
                }
            };

            let (mut ws_sink, mut ws_stream) = ws.split();

            loop {
                tokio::select! {
                    order = rx.recv() => {
                        match order {
                            Some(mut order) => {
                                seq += 1;
                                order.id = seq;
                                order.timestamp_ns = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_nanos() as u64;

                                let json = serde_json::to_string(&order).unwrap_or_default();
                                let msg = Message::Text(json);

                                if let Err(e) = ws_sink.send(msg).await {
                                    tracing::warn!("WebSocket send error: {} — reconnecting", e);
                                    error_count.fetch_add(1, Ordering::Relaxed);
                                    break;
                                }
                                tracing::debug!("Order #{} sent", order.id);
                            }
                            None => {
                                tracing::info!("Order channel closed — shutting down executor");
                                return;
                            }
                        }
                    }
                    msg = ws_stream.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                if Self::is_fill_message(&text) {
                                    fill_count.fetch_add(1, Ordering::Relaxed);
                                    tracing::debug!("Fill received: {}", text);
                                }
                            }
                            Some(Ok(Message::Binary(data))) => {
                                if let Ok(text) = std::str::from_utf8(&data) {
                                    if Self::is_fill_message(text) {
                                        fill_count.fetch_add(1, Ordering::Relaxed);
                                    }
                                }
                            }
                            Some(Ok(_)) => {}
                            Some(Err(e)) => {
                                tracing::warn!("WebSocket stream error: {} — reconnecting", e);
                                error_count.fetch_add(1, Ordering::Relaxed);
                                break;
                            }
                            None => {
                                tracing::warn!("WebSocket closed by server — reconnecting");
                                break;
                            }
                        }
                    }
                }
            }

            tokio::time::sleep(backoff).await;
        }
    }

    fn is_fill_message(text: &str) -> bool {
        text.contains("\"fill\"")
            || text.contains("\"filled\"")
            || text.contains("\"order_fill\"")
            || text.contains("\"type\":\"fill\"")
    }

    /// Public wrapper for testing fill detection logic.
    pub fn is_fill_message_public(text: &str) -> bool {
        Self::is_fill_message(text)
    }
}

// ── FFI for C++ interop ──

#[repr(C)]
pub struct FfiExecStats {
    pub orders_sent: u64,
    pub fills_received: u64,
    pub errors: u64,
    pub avg_latency_ns: u64,
}

#[no_mangle]
pub extern "C" fn hft_executor_create(ws_url: *const c_char) -> *mut c_void {
    if ws_url.is_null() { return std::ptr::null_mut(); }
    let url = unsafe { CStr::from_ptr(ws_url) };
    let url_str = match url.to_str() { Ok(s) => s, Err(_) => return std::ptr::null_mut() };
    let exec = OrderExecutor::new(url_str);
    Box::into_raw(Box::new(exec)) as *mut c_void
}

#[no_mangle]
pub extern "C" fn hft_executor_submit(
    exec: *mut c_void,
    symbol: *const c_char,
    side: i32,
    qty: f64,
    price: f64,
    order_type: i32,
) -> i32 {
    if exec.is_null() || symbol.is_null() { return -1; }
    let exec = unsafe { &mut *(exec as *mut OrderExecutor) };
    let sym = unsafe { CStr::from_ptr(symbol) };
    let sym_str = sym.to_str().unwrap_or("UNKNOWN");

    let order = Order {
        id: 0,
        symbol: sym_str.to_string(),
        side: match side { 0 => OrderSide::Buy, _ => OrderSide::Sell },
        qty,
        price,
        order_type: match order_type {
            0 => OrderType::Market,
            1 => OrderType::Limit,
            2 => OrderType::IOC,
            3 => OrderType::FOK,
            _ => OrderType::PostOnly,
        },
        timestamp_ns: 0,
    };

    match exec.submit(order) {
        Ok(()) => 0,
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "C" fn hft_executor_stats(exec: *mut c_void) -> FfiExecStats {
    if exec.is_null() {
        return FfiExecStats { orders_sent: 0, fills_received: 0, errors: 0, avg_latency_ns: 0 };
    }
    let exec = unsafe { &*(exec as *const OrderExecutor) };
    let s = exec.stats();
    FfiExecStats {
        orders_sent: s.orders_sent,
        fills_received: s.fills_received,
        errors: s.errors,
        avg_latency_ns: s.avg_latency_ns,
    }
}

#[no_mangle]
pub extern "C" fn hft_executor_destroy(exec: *mut c_void) {
    if !exec.is_null() {
        unsafe { drop(Box::from_raw(exec as *mut OrderExecutor)); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_order() -> Order {
        Order {
            id: 0,
            symbol: "BTC/USDT".to_string(),
            side: OrderSide::Buy,
            qty: 0.5,
            price: 50000.0,
            order_type: OrderType::Limit,
            timestamp_ns: 0,
        }
    }

    #[test]
    fn test_order_creation() {
        let order = make_test_order();
        assert_eq!(order.symbol, "BTC/USDT");
        assert_eq!(order.side, OrderSide::Buy);
        assert_eq!(order.qty, 0.5);
        assert_eq!(order.price, 50000.0);
        assert_eq!(order.order_type, OrderType::Limit);
    }

    #[test]
    fn test_order_side_equality() {
        assert_ne!(OrderSide::Buy, OrderSide::Sell);
    }

    #[test]
    fn test_order_type_variants() {
        let types = [OrderType::Market, OrderType::Limit, OrderType::IOC, OrderType::FOK, OrderType::PostOnly];
        for i in 0..types.len() {
            for j in 0..types.len() {
                if i != j {
                    assert_ne!(types[i], types[j], "OrderType variants {} and {} should differ", i, j);
                }
            }
        }
    }

    #[test]
    fn test_submit_single_order() {
        let exec = OrderExecutor::new("ws://localhost:9999");
        let order = make_test_order();
        assert!(exec.submit(order).is_ok());
        assert_eq!(exec.order_count.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn test_submit_multiple_orders() {
        let exec = OrderExecutor::new("ws://localhost:9999");
        for _ in 0..10 {
            let order = make_test_order();
            assert!(exec.submit(order).is_ok());
        }
        assert_eq!(exec.order_count.load(Ordering::Relaxed), 10);
    }

    #[test]
    fn test_submit_batch_orders() {
        let exec = OrderExecutor::new("ws://localhost:9999");
        let mut batch = SmallVec::new();
        for _ in 0..5 {
            batch.push(make_test_order());
        }
        assert!(exec.submit_batch(batch).is_ok());
        assert_eq!(exec.order_count.load(Ordering::Relaxed), 5);
    }

    #[test]
    fn test_submit_batch_empty() {
        let exec = OrderExecutor::new("ws://localhost:9999");
        let batch: SmallVec<[Order; 16]> = SmallVec::new();
        assert!(exec.submit_batch(batch).is_ok());
        assert_eq!(exec.order_count.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn test_stats_initial_state() {
        let exec = OrderExecutor::new("ws://localhost:9999");
        let stats = exec.stats();
        assert_eq!(stats.orders_sent, 0);
        assert_eq!(stats.fills_received, 0);
        assert_eq!(stats.errors, 0);
    }

    #[test]
    fn test_stats_after_submit() {
        let exec = OrderExecutor::new("ws://localhost:9999");
        for _ in 0..3 {
            exec.submit(make_test_order()).unwrap();
        }
        let stats = exec.stats();
        assert_eq!(stats.orders_sent, 3);
    }

    #[test]
    fn test_ffi_create_and_destroy() {
        let url = std::ffi::CString::new("ws://localhost:9999").unwrap();
        let ptr = hft_executor_create(url.as_ptr());
        assert!(!ptr.is_null());
        hft_executor_destroy(ptr);
    }

    #[test]
    fn test_ffi_create_null_url() {
        let ptr = hft_executor_create(std::ptr::null());
        assert!(ptr.is_null());
    }

    #[test]
    fn test_ffi_submit_order() {
        let url = std::ffi::CString::new("ws://localhost:9999").unwrap();
        let ptr = hft_executor_create(url.as_ptr());
        assert!(!ptr.is_null());

        let symbol = std::ffi::CString::new("BTC/USDT").unwrap();
        let result = hft_executor_submit(ptr, symbol.as_ptr(), 0, 1.0, 50000.0, 1);
        assert_eq!(result, 0);

        hft_executor_destroy(ptr);
    }

    #[test]
    fn test_ffi_submit_sell_order() {
        let url = std::ffi::CString::new("ws://localhost:9999").unwrap();
        let ptr = hft_executor_create(url.as_ptr());
        assert!(!ptr.is_null());

        let symbol = std::ffi::CString::new("ETH/USDT").unwrap();
        let result = hft_executor_submit(ptr, symbol.as_ptr(), 1, 2.0, 3000.0, 0);
        assert_eq!(result, 0);

        hft_executor_destroy(ptr);
    }

    #[test]
    fn test_ffi_submit_all_order_types() {
        let url = std::ffi::CString::new("ws://localhost:9999").unwrap();
        let ptr = hft_executor_create(url.as_ptr());
        assert!(!ptr.is_null());

        let symbol = std::ffi::CString::new("BTC/USDT").unwrap();
        for order_type in 0..5 {
            let result = hft_executor_submit(ptr, symbol.as_ptr(), 0, 1.0, 50000.0, order_type);
            assert_eq!(result, 0, "Order type {} should succeed", order_type);
        }

        hft_executor_destroy(ptr);
    }

    #[test]
    fn test_ffi_submit_null_executor() {
        let symbol = std::ffi::CString::new("BTC/USDT").unwrap();
        let result = hft_executor_submit(std::ptr::null_mut(), symbol.as_ptr(), 0, 1.0, 50000.0, 0);
        assert_eq!(result, -1);
    }

    #[test]
    fn test_ffi_submit_null_symbol() {
        let url = std::ffi::CString::new("ws://localhost:9999").unwrap();
        let ptr = hft_executor_create(url.as_ptr());
        assert!(!ptr.is_null());

        let result = hft_executor_submit(ptr, std::ptr::null(), 0, 1.0, 50000.0, 0);
        assert_eq!(result, -1);

        hft_executor_destroy(ptr);
    }

    #[test]
    fn test_ffi_stats_null_executor() {
        let stats = hft_executor_stats(std::ptr::null());
        assert_eq!(stats.orders_sent, 0);
        assert_eq!(stats.fills_received, 0);
        assert_eq!(stats.errors, 0);
        assert_eq!(stats.avg_latency_ns, 0);
    }

    #[test]
    fn test_ffi_stats_after_submit() {
        let url = std::ffi::CString::new("ws://localhost:9999").unwrap();
        let ptr = hft_executor_create(url.as_ptr());
        assert!(!ptr.is_null());

        let symbol = std::ffi::CString::new("BTC/USDT").unwrap();
        hft_executor_submit(ptr, symbol.as_ptr(), 0, 1.0, 50000.0, 1);
        hft_executor_submit(ptr, symbol.as_ptr(), 1, 2.0, 51000.0, 0);

        let stats = hft_executor_stats(ptr);
        assert_eq!(stats.orders_sent, 2);

        hft_executor_destroy(ptr);
    }

    #[test]
    fn test_ffi_destroy_null_is_safe() {
        hft_executor_destroy(std::ptr::null_mut());
    }

    #[test]
    fn test_order_serialization() {
        let order = make_test_order();
        let json = serde_json::to_string(&order);
        assert!(json.is_ok());
        let json_str = json.unwrap();
        assert!(json_str.contains("BTC/USDT"));
        assert!(json_str.contains("Buy"));
        assert!(json_str.contains("Limit"));
    }

    #[test]
    fn test_order_deserialization() {
        let order = make_test_order();
        let json = serde_json::to_string(&order).unwrap();
        let parsed: Result<Order, _> = serde_json::from_str(&json);
        assert!(parsed.is_ok());
        let parsed_order = parsed.unwrap();
        assert_eq!(parsed_order.symbol, "BTC/USDT");
        assert_eq!(parsed_order.qty, 0.5);
        assert_eq!(parsed_order.price, 50000.0);
    }
}
