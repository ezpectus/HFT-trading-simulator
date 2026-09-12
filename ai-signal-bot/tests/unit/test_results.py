"""Contract tests for backtesting.results — Trade/BacktestResult domain types."""
from src.backtesting.results import BacktestResult, Trade


def _trade(**kw):
    base = dict(symbol="BTC/USDT", side="LONG", entry_price=100.0,
                exit_price=110.0, quantity=1.0, entry_time=0,
                exit_time=300, pnl=10.0, pnl_pct=10.0, exit_reason="END")
    base.update(kw)
    return Trade(**base)


class TestTrade:
    def test_fields(self):
        t = _trade(exit_reason="STOP_LOSS")
        assert t.side == "LONG"
        assert t.exit_reason == "STOP_LOSS"
        assert t.fee == 0.0  # default


class TestBacktestResult:
    def test_final_equity_alias(self):
        r = BacktestResult(final_balance=12345.5)
        assert r.final_equity == 12345.5

    def test_to_dict_rounds_and_shape(self):
        r = BacktestResult(
            total_return_pct=12.3456, total_trades=3, winning_trades=2,
            losing_trades=1, win_rate=66.666, avg_win=15.555, avg_loss=-8.888,
            profit_factor=2.3333, max_drawdown_pct=4.567, sharpe_ratio=1.234,
            final_balance=11234.56, equity_curve=[10000, 11000, 11234.56],
            signals_generated=10, signals_valid=7,
        )
        d = r.to_dict()
        assert d["total_return_pct"] == 12.35
        assert d["win_rate"] == 66.67
        assert d["profit_factor"] == 2.33
        assert d["final_balance"] == 11234.56
        assert d["equity_curve"] == [10000, 11000, 11234.56]
        assert d["signals_valid"] == 7
        assert len(d) == 14

    def test_to_dict_inf_profit_factor_capped(self):
        r = BacktestResult(profit_factor=float("inf"))
        assert r.to_dict()["profit_factor"] == 999.99

    def test_default_state(self):
        r = BacktestResult()
        assert r.initial_balance == 10000.0
        assert r.trades == []
        assert r.equity_curve == []
        assert r.calmar_ratio == 0.0 and r.sortino_ratio == 0.0
