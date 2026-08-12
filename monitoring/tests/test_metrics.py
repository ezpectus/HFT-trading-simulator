# Tests for Monitoring Metrics
# Tests Prometheus metrics endpoints, metric values, and metric types

import pytest
from prometheus_client import REGISTRY
import time


class TestExchangeSimulatorMetrics:
    """Test exchange simulator metrics."""
    
    def test_metrics_initialization(self):
        """Test metrics collector initialization."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics(metrics_port=8000)
        
        assert metrics.metrics_port == 8000
        assert metrics.orders_total is not None
        assert metrics.fills_total is not None
        assert metrics.order_latency is not None
    
    def test_record_order(self):
        """Test order recording."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        
        metrics.record_order('BTC/USDT', 'BUY', 'FILLED', 0.01)
        
        # Check counter was incremented
        assert metrics.orders_total.labels(symbol='BTC/USDT', side='BUY', status='FILLED')._value.get() > 0
    
    def test_record_fill(self):
        """Test fill recording."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        
        metrics.record_fill('BTC/USDT', 'BUY')
        
        assert metrics.fills_total.labels(symbol='BTC/USDT', side='BUY')._value.get() > 0
    
    def test_record_error(self):
        """Test error recording."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        
        metrics.record_error('timeout', 'websocket')
        
        assert metrics.errors_total.labels(error_type='timeout', component='websocket')._value.get() > 0
    
    def test_record_price_update(self):
        """Test price update recording."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        
        metrics.record_price_update('BTC/USDT', 'binance', 0.005)
        
        assert metrics.price_updates_total.labels(symbol='BTC/USDT', source='binance')._value.get() > 0
    
    def test_update_system_metrics(self):
        """Test system metrics update."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        
        metrics.update_system_metrics(50.0, 1000000000, 10)
        
        assert metrics.cpu_usage._value.get() == 50.0
        assert metrics.memory_usage._value.get() == 1000000000
        assert metrics.active_connections._value.get() == 10
    
    def test_update_order_rate(self):
        """Test order rate update."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        
        metrics.update_order_rate('BTC/USDT', 100.0)
        
        assert metrics.order_rate.labels(symbol='BTC/USDT')._value.get() == 100.0


class TestAISignalBotMetrics:
    """Test AI signal bot metrics."""
    
    def test_metrics_initialization(self):
        """Test metrics collector initialization."""
        from ai_signal_bot.metrics import AISignalBotMetrics
        
        metrics = AISignalBotMetrics(metrics_port=8001)
        
        assert metrics.metrics_port == 8001
        assert metrics.signals_generated_total is not None
        assert metrics.trades_total is not None
        assert metrics.pnl_total is not None
    
    def test_record_signal(self):
        """Test signal recording."""
        from ai_signal_bot.metrics import AISignalBotMetrics
        
        metrics = AISignalBotMetrics()
        
        metrics.record_signal('lstm', 'LONG', 0.05)
        
        assert metrics.signals_generated_total.labels(strategy='lstm', signal_type='LONG')._value.get() > 0
    
    def test_record_trade(self):
        """Test trade recording."""
        from ai_signal_bot.metrics import AISignalBotMetrics
        
        metrics = AISignalBotMetrics()
        
        metrics.record_trade('BTC/USDT', 'BUY')
        
        assert metrics.trades_total.labels(symbol='BTC/USDT', side='BUY')._value.get() > 0
    
    def test_update_pnl(self):
        """Test PnL update."""
        from ai_signal_bot.metrics import AISignalBotMetrics
        
        metrics = AISignalBotMetrics()
        
        metrics.update_pnl('BTC/USDT', 'lstm', 1000.0, 100.0)
        
        assert metrics.pnl_total.labels(symbol='BTC/USDT', strategy='lstm')._value.get() == 1000.0
        assert metrics.pnl_daily.labels(symbol='BTC/USDT', strategy='lstm')._value.get() == 100.0
    
    def test_update_performance_metrics(self):
        """Test performance metrics update."""
        from ai_signal_bot.metrics import AISignalBotMetrics
        
        metrics = AISignalBotMetrics()
        
        metrics.update_performance_metrics('lstm', 60.0, 1.5, 5.0)
        
        assert metrics.win_rate.labels(strategy='lstm')._value.get() == 60.0
        assert metrics.sharpe_ratio.labels(strategy='lstm')._value.get() == 1.5
        assert metrics.drawdown.labels(strategy='lstm')._value.get() == 5.0
    
    def test_update_portfolio_metrics(self):
        """Test portfolio metrics update."""
        from ai_signal_bot.metrics import AISignalBotMetrics
        
        metrics = AISignalBotMetrics()
        
        metrics.update_portfolio_metrics(100000.0, 'USD', {'BTC/USDT': 1.0, 'ETH/USDT': 2.0})
        
        assert metrics.portfolio_value.labels(currency='USD')._value.get() == 100000.0
        assert metrics.position_count.labels(symbol='BTC/USDT')._value.get() == 1.0


class TestMetricsEndpoint:
    """Test metrics HTTP endpoint."""
    
    def test_metrics_endpoint_content(self):
        """Test that metrics endpoint returns valid Prometheus format."""
        from exchange_simulator.metrics import ExchangeSimulatorMetrics
        
        metrics = ExchangeSimulatorMetrics()
        metrics.record_order('BTC/USDT', 'BUY', 'FILLED', 0.01)
        
        # In production, this would test the actual HTTP endpoint
        # For now, we verify the metrics are registered
        from prometheus_client import exposition
        
        output = exposition.generate_latest(REGISTRY)
        
        assert b'exchange_simulator_orders_total' in output
        assert b'exchange_simulator_fills_total' in output
