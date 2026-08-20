"""Unit tests for backtesting/plotter.py.

Covers: BacktestPlotter.
"""
import os
import tempfile

import pytest


class TestBacktestPlotter:
    @pytest.fixture
    def plotter(self):
        from src.backtesting.plotter import BacktestPlotter
        return BacktestPlotter()

    @pytest.fixture
    def mock_result(self):
        from src.backtesting.backtester import BacktestResult
        from src.strategies.strategies import Signal, SignalDirection

        trades = []
        for i in range(5):
            trades.append(type("Trade", (), {
                "entry_bar": i, "exit_bar": i + 2,
                "entry_price": 50000, "exit_price": 50000 + (i - 2) * 100,
                "pnl": (i - 2) * 100, "direction": SignalDirection.LONG,
                "bars_held": 2,
            })())
        return BacktestResult(
            initial_balance=10000.0,
            final_balance=10500.0,
            total_return_pct=5.0,
            total_trades=5,
            winning_trades=3,
            losing_trades=2,
            win_rate=60.0,
            profit_factor=1.5,
            max_drawdown_pct=3.0,
            sharpe_ratio=1.2,
            sortino_ratio=1.5,
            calmar_ratio=2.0,
            recovery_factor=1.67,
            equity_curve=[10000, 10100, 10200, 10150, 10300, 10400, 10350, 10500],
            trades=trades,
        )

    def test_init(self, plotter):
        assert plotter.figsize == (12, 7)
        assert plotter.dpi == 100

    def test_plot_equity_curve(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        fig = plotter.plot_equity_curve(mock_result, "Test Equity")
        assert fig is not None

    def test_plot_trade_pnl(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        fig = plotter.plot_trade_pnl(mock_result, "Test PnL")
        assert fig is not None

    def test_plot_trade_pnl_no_trades(self, plotter):
        import matplotlib
        matplotlib.use("Agg")
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, profit_factor=0.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        fig = plotter.plot_trade_pnl(result)
        assert fig is not None

    def test_plot_comparison(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        results = {"Strategy A": mock_result}
        fig = plotter.plot_comparison(results)
        assert fig is not None

    def test_plot_metrics_radar(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        results = {"Strategy A": mock_result}
        fig = plotter.plot_metrics_radar(results)
        assert fig is not None

    def test_save_all(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        with tempfile.TemporaryDirectory() as tmpdir:
            results = {"Strategy A": mock_result}
            plotter.save_all(results, tmpdir)
            files = os.listdir(tmpdir)
            assert len(files) > 0
            assert any(f.endswith(".png") for f in files)
