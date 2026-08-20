# Prometheus Metrics for AI Signal Bot
#
# Implements Prometheus metrics collection with Counter, Gauge, and Histogram
# for signal generation, PnL, win rate, and system resources.

from prometheus_client import Counter, Gauge, Histogram, start_http_server


class AISignalBotMetrics:
    """Prometheus metrics collector for AI signal bot."""

    def __init__(self, metrics_port: int = 8001):
        """
        Initialize metrics collector.

        Args:
            metrics_port: Port for metrics HTTP server (default 8001)
        """
        self.metrics_port = metrics_port

        # Signal metrics
        self.signals_generated_total = Counter(
            'ai_signal_bot_signals_generated_total',
            'Total number of signals generated',
            ['strategy', 'signal_type']
        )

        self.signal_rate = Gauge(
            'ai_signal_bot_signal_rate',
            'Current signal generation rate (signals per second)',
            ['strategy']
        )

        # Signal latency metrics
        self.signal_generation_latency = Histogram(
            'ai_signal_bot_signal_generation_latency_seconds',
            'Signal generation latency',
            ['strategy'],
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0)
        )

        # Trading metrics
        self.trades_total = Counter(
            'ai_signal_bot_trades_total',
            'Total number of trades executed',
            ['symbol', 'side']
        )

        self.trade_rate = Gauge(
            'ai_signal_bot_trade_rate',
            'Current trade rate (trades per second)',
            ['symbol']
        )

        # PnL metrics
        self.pnl_total = Gauge(
            'ai_signal_bot_pnl_total',
            'Total PnL',
            ['symbol', 'strategy']
        )

        self.pnl_daily = Gauge(
            'ai_signal_bot_pnl_daily',
            'Daily PnL',
            ['symbol', 'strategy']
        )

        # Performance metrics
        self.win_rate = Gauge(
            'ai_signal_bot_win_rate',
            'Win rate (percentage)',
            ['strategy']
        )

        self.sharpe_ratio = Gauge(
            'ai_signal_bot_sharpe_ratio',
            'Sharpe ratio',
            ['strategy']
        )

        self.drawdown = Gauge(
            'ai_signal_bot_drawdown',
            'Current drawdown (percentage)',
            ['strategy']
        )

        # Error metrics
        self.errors_total = Counter(
            'ai_signal_bot_errors_total',
            'Total number of errors',
            ['error_type', 'component']
        )

        self.error_rate = Gauge(
            'ai_signal_bot_error_rate',
            'Current error rate (errors per second)',
            ['component']
        )

        # System resource metrics
        self.cpu_usage = Gauge(
            'ai_signal_bot_cpu_usage_percent',
            'CPU usage percentage'
        )

        self.memory_usage = Gauge(
            'ai_signal_bot_memory_usage_bytes',
            'Memory usage in bytes'
        )

        # Model metrics
        self.model_predictions_total = Counter(
            'ai_signal_bot_model_predictions_total',
            'Total number of model predictions',
            ['model_type']
        )

        self.model_accuracy = Gauge(
            'ai_signal_bot_model_accuracy',
            'Model accuracy (percentage)',
            ['model_type']
        )

        # Portfolio metrics
        self.portfolio_value = Gauge(
            'ai_signal_bot_portfolio_value',
            'Current portfolio value',
            ['currency']
        )

        self.position_count = Gauge(
            'ai_signal_bot_position_count',
            'Number of open positions',
            ['symbol']
        )

    def start_metrics_server(self) -> None:
        """Start the Prometheus metrics HTTP server."""
        start_http_server(self.metrics_port)

    def record_signal(self, strategy: str, signal_type: str, latency: float) -> None:
        """
        Record a signal generation.

        Args:
            strategy: Strategy name
            signal_type: Signal type (LONG, SHORT, HOLD)
            latency: Signal generation latency in seconds
        """
        self.signals_generated_total.labels(strategy=strategy, signal_type=signal_type).inc()
        self.signal_generation_latency.labels(strategy=strategy).observe(latency)

    def record_trade(self, symbol: str, side: str) -> None:
        """
        Record a trade execution.

        Args:
            symbol: Trading symbol
            side: Trade side (BUY/SELL)
        """
        self.trades_total.labels(symbol=symbol, side=side).inc()

    def update_pnl(self, symbol: str, strategy: str, total_pnl: float, daily_pnl: float) -> None:
        """
        Update PnL metrics.

        Args:
            symbol: Trading symbol
            strategy: Strategy name
            total_pnl: Total PnL
            daily_pnl: Daily PnL
        """
        self.pnl_total.labels(symbol=symbol, strategy=strategy).set(total_pnl)
        self.pnl_daily.labels(symbol=symbol, strategy=strategy).set(daily_pnl)

    def update_performance_metrics(self, strategy: str, win_rate: float, sharpe_ratio: float, drawdown: float) -> None:
        """
        Update performance metrics.

        Args:
            strategy: Strategy name
            win_rate: Win rate percentage
            sharpe_ratio: Sharpe ratio
            drawdown: Drawdown percentage
        """
        self.win_rate.labels(strategy=strategy).set(win_rate)
        self.sharpe_ratio.labels(strategy=strategy).set(sharpe_ratio)
        self.drawdown.labels(strategy=strategy).set(drawdown)

    def record_error(self, error_type: str, component: str) -> None:
        """
        Record an error.

        Args:
            error_type: Type of error
            component: Component where error occurred
        """
        self.errors_total.labels(error_type=error_type, component=component).inc()

    def record_model_prediction(self, model_type: str) -> None:
        """
        Record a model prediction.

        Args:
            model_type: Type of model (LSTM, Transformer, etc.)
        """
        self.model_predictions_total.labels(model_type=model_type).inc()

    def update_model_accuracy(self, model_type: str, accuracy: float) -> None:
        """
        Update model accuracy.

        Args:
            model_type: Type of model
            accuracy: Accuracy percentage
        """
        self.model_accuracy.labels(model_type=model_type).set(accuracy)

    def update_portfolio_metrics(self, portfolio_value: float, currency: str, positions: dict[str, float]) -> None:
        """
        Update portfolio metrics.

        Args:
            portfolio_value: Current portfolio value
            currency: Currency (USD, BTC, etc.)
            positions: Dictionary of symbol to position count
        """
        self.portfolio_value.labels(currency=currency).set(portfolio_value)

        for symbol, count in positions.items():
            self.position_count.labels(symbol=symbol).set(count)

    def update_system_metrics(self, cpu_usage: float, memory_usage: float) -> None:
        """
        Update system resource metrics.

        Args:
            cpu_usage: CPU usage percentage
            memory_usage: Memory usage in bytes
        """
        self.cpu_usage.set(cpu_usage)
        self.memory_usage.set(memory_usage)

    def update_signal_rate(self, strategy: str, rate: float) -> None:
        """
        Update signal rate gauge.

        Args:
            strategy: Strategy name
            rate: Signals per second
        """
        self.signal_rate.labels(strategy=strategy).set(rate)

    def update_trade_rate(self, symbol: str, rate: float) -> None:
        """
        Update trade rate gauge.

        Args:
            symbol: Trading symbol
            rate: Trades per second
        """
        self.trade_rate.labels(symbol=symbol).set(rate)

    def update_error_rate(self, component: str, rate: float) -> None:
        """
        Update error rate gauge.

        Args:
            component: Component name
            rate: Errors per second
        """
        self.error_rate.labels(component=component).set(rate)


# Global metrics instance
_metrics_instance: AISignalBotMetrics | None = None


def get_metrics() -> AISignalBotMetrics:
    """Get or create the global metrics instance."""
    global _metrics_instance  # singleton pattern, module-level state
    if _metrics_instance is None:
        _metrics_instance = AISignalBotMetrics()
    return _metrics_instance


def init_metrics(metrics_port: int = 8001) -> AISignalBotMetrics:
    """Initialize and start the metrics server."""
    global _metrics_instance  # singleton pattern, module-level state
    _metrics_instance = AISignalBotMetrics(metrics_port)
    _metrics_instance.start_metrics_server()
    return _metrics_instance
