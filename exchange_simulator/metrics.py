# Prometheus Metrics for Exchange Simulator
#
# Implements Prometheus metrics collection with Counter, Gauge, and Histogram
# for order rate, fill rate, latency, error rate, and system resources.

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from typing import Optional
import time


class ExchangeSimulatorMetrics:
    """Prometheus metrics collector for exchange simulator."""
    
    def __init__(self, metrics_port: int = 8000):
        """
        Initialize metrics collector.
        
        Args:
            metrics_port: Port for metrics HTTP server (default 8000)
        """
        self.metrics_port = metrics_port
        
        # Order metrics
        self.orders_total = Counter(
            'exchange_simulator_orders_total',
            'Total number of orders processed',
            ['symbol', 'side', 'status']
        )
        
        self.order_rate = Gauge(
            'exchange_simulator_order_rate',
            'Current order rate (orders per second)',
            ['symbol']
        )
        
        # Fill metrics
        self.fills_total = Counter(
            'exchange_simulator_fills_total',
            'Total number of fills',
            ['symbol', 'side']
        )
        
        self.fill_rate = Gauge(
            'exchange_simulator_fill_rate',
            'Current fill rate (fills per second)',
            ['symbol']
        )
        
        # Latency metrics
        self.order_latency = Histogram(
            'exchange_simulator_order_latency_seconds',
            'Order processing latency',
            ['symbol'],
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
        )
        
        self.websocket_latency = Histogram(
            'exchange_simulator_websocket_latency_seconds',
            'WebSocket message latency',
            ['client_id'],
            buckets=(0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1)
        )
        
        # Error metrics
        self.errors_total = Counter(
            'exchange_simulator_errors_total',
            'Total number of errors',
            ['error_type', 'component']
        )
        
        self.error_rate = Gauge(
            'exchange_simulator_error_rate',
            'Current error rate (errors per second)',
            ['component']
        )
        
        # System resource metrics
        self.cpu_usage = Gauge(
            'exchange_simulator_cpu_usage_percent',
            'CPU usage percentage'
        )
        
        self.memory_usage = Gauge(
            'exchange_simulator_memory_usage_bytes',
            'Memory usage in bytes'
        )
        
        self.active_connections = Gauge(
            'exchange_simulator_active_connections',
            'Number of active WebSocket connections'
        )
        
        # Price feed metrics
        self.price_updates_total = Counter(
            'exchange_simulator_price_updates_total',
            'Total number of price updates',
            ['symbol', 'source']
        )
        
        self.price_update_rate = Gauge(
            'exchange_simulator_price_update_rate',
            'Current price update rate (updates per second)',
            ['symbol']
        )
        
        self.price_feed_latency = Histogram(
            'exchange_simulator_price_feed_latency_seconds',
            'Price feed latency',
            ['symbol', 'source'],
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5)
        )
    
    def start_metrics_server(self):
        """Start the Prometheus metrics HTTP server."""
        start_http_server(self.metrics_port)
    
    def record_order(self, symbol: str, side: str, status: str, latency: float):
        """
        Record an order.
        
        Args:
            symbol: Trading symbol
            side: Order side (BUY/SELL)
            status: Order status (FILLED, REJECTED, etc.)
            latency: Order processing latency in seconds
        """
        self.orders_total.labels(symbol=symbol, side=side, status=status).inc()
        self.order_latency.labels(symbol=symbol).observe(latency)
    
    def record_fill(self, symbol: str, side: str):
        """
        Record a fill.
        
        Args:
            symbol: Trading symbol
            side: Fill side (BUY/SELL)
        """
        self.fills_total.labels(symbol=symbol, side=side).inc()
    
    def record_error(self, error_type: str, component: str):
        """
        Record an error.
        
        Args:
            error_type: Type of error
            component: Component where error occurred
        """
        self.errors_total.labels(error_type=error_type, component=component).inc()
    
    def record_price_update(self, symbol: str, source: str, latency: float):
        """
        Record a price update.
        
        Args:
            symbol: Trading symbol
            source: Price source (binance, coinbase, etc.)
            latency: Price feed latency in seconds
        """
        self.price_updates_total.labels(symbol=symbol, source=source).inc()
        self.price_feed_latency.labels(symbol=symbol, source=source).observe(latency)
    
    def record_websocket_latency(self, client_id: str, latency: float):
        """
        Record WebSocket latency.
        
        Args:
            client_id: Client identifier
            latency: WebSocket latency in seconds
        """
        self.websocket_latency.labels(client_id=client_id).observe(latency)
    
    def update_system_metrics(self, cpu_usage: float, memory_usage: float, active_connections: int):
        """
        Update system resource metrics.
        
        Args:
            cpu_usage: CPU usage percentage
            memory_usage: Memory usage in bytes
            active_connections: Number of active connections
        """
        self.cpu_usage.set(cpu_usage)
        self.memory_usage.set(memory_usage)
        self.active_connections.set(active_connections)
    
    def update_order_rate(self, symbol: str, rate: float):
        """
        Update order rate gauge.
        
        Args:
            symbol: Trading symbol
            rate: Orders per second
        """
        self.order_rate.labels(symbol=symbol).set(rate)
    
    def update_fill_rate(self, symbol: str, rate: float):
        """
        Update fill rate gauge.
        
        Args:
            symbol: Trading symbol
            rate: Fills per second
        """
        self.fill_rate.labels(symbol=symbol).set(rate)
    
    def update_price_update_rate(self, symbol: str, rate: float):
        """
        Update price update rate gauge.
        
        Args:
            symbol: Trading symbol
            rate: Updates per second
        """
        self.price_update_rate.labels(symbol=symbol).set(rate)
    
    def update_error_rate(self, component: str, rate: float):
        """
        Update error rate gauge.
        
        Args:
            component: Component name
            rate: Errors per second
        """
        self.error_rate.labels(component=component).set(rate)


# Global metrics instance
_metrics_instance: Optional[ExchangeSimulatorMetrics] = None


def get_metrics() -> ExchangeSimulatorMetrics:
    """Get or create the global metrics instance."""
    global _metrics_instance
    if _metrics_instance is None:
        _metrics_instance = ExchangeSimulatorMetrics()
    return _metrics_instance


def init_metrics(metrics_port: int = 8000) -> ExchangeSimulatorMetrics:
    """
    Initialize and start the metrics server.
    
    Args:
        metrics_port: Port for metrics HTTP server
    
    Returns:
        Metrics instance
    """
    global _metrics_instance
    _metrics_instance = ExchangeSimulatorMetrics(metrics_port)
    _metrics_instance.start_metrics_server()
    return _metrics_instance
