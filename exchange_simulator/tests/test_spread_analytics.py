"""Tests for spread analytics module."""
import pytest
import numpy as np

from exchange_simulator.spread_analytics import (
    SpreadAnalytics,
    SpreadRecord,
    SpreadStats,
)


class TestRecordSpread:
    def test_record_single_spread(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats is not None
        assert stats.count == 1
        assert stats.mean_spread == pytest.approx(5.0)

    def test_spread_bps_calculation(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        # 5.0 / 50000 * 10000 = 1.0 bps
        assert stats.mean_spread_bps == pytest.approx(1.0)

    def test_multiple_spreads_accumulate(self):
        sa = SpreadAnalytics()
        for i in range(10):
            sa.record_spread("binance", "BTC/USDT", 1.0 + i, 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.count == 10
        assert stats.mean_spread == pytest.approx(5.5)  # mean of 1..10

    def test_different_exchanges_tracked_separately(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 1.0, 50000.0)
        sa.record_spread("bybit", "BTC/USDT", 3.0, 50000.0)
        binance_stats = sa.get_stats("binance", "BTC/USDT")
        bybit_stats = sa.get_stats("bybit", "BTC/USDT")
        assert binance_stats.mean_spread == pytest.approx(1.0)
        assert bybit_stats.mean_spread == pytest.approx(3.0)

    def test_different_symbols_tracked_separately(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        sa.record_spread("binance", "ETH/USDT", 0.3, 3000.0)
        btc_stats = sa.get_stats("binance", "BTC/USDT")
        eth_stats = sa.get_stats("binance", "ETH/USDT")
        assert btc_stats.mean_spread == pytest.approx(5.0)
        assert eth_stats.mean_spread == pytest.approx(0.3)

    def test_zero_mid_price_ignored(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 0.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats is None

    def test_window_size_limits_records(self):
        sa = SpreadAnalytics(window_size=5)
        for i in range(10):
            sa.record_spread("binance", "BTC/USDT", float(i), 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.count == 5
        # Last 5 values: 5, 6, 7, 8, 9 → mean = 7.0
        assert stats.mean_spread == pytest.approx(7.0)


class TestPercentiles:
    def test_p50_spread(self):
        sa = SpreadAnalytics()
        for i in range(1, 101):
            sa.record_spread("binance", "BTC/USDT", float(i), 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.p50_spread == pytest.approx(50.5, rel=0.01)

    def test_p90_spread(self):
        sa = SpreadAnalytics()
        for i in range(1, 101):
            sa.record_spread("binance", "BTC/USDT", float(i), 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.p90_spread == pytest.approx(90.1, rel=0.01)

    def test_p99_spread(self):
        sa = SpreadAnalytics()
        for i in range(1, 101):
            sa.record_spread("binance", "BTC/USDT", float(i), 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.p99_spread == pytest.approx(99.01, rel=0.01)

    def test_max_spread(self):
        sa = SpreadAnalytics()
        for i in range(1, 11):
            sa.record_spread("binance", "BTC/USDT", float(i), 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.max_spread == pytest.approx(10.0)

    def test_min_spread(self):
        sa = SpreadAnalytics()
        for i in range(1, 11):
            sa.record_spread("binance", "BTC/USDT", float(i), 50000.0)
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.min_spread == pytest.approx(1.0)


class TestSlippage:
    def test_buy_slippage_positive(self):
        sa = SpreadAnalytics()
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 50010.0, "BUY")
        stats = sa.get_stats("binance", "BTC/USDT")
        # No spread records → stats is None for get_stats
        # But slippage is tracked separately
        assert stats is None

    def test_buy_slippage_with_spread(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 50010.0, "BUY")
        stats = sa.get_stats("binance", "BTC/USDT")
        # (50010 - 50000) / 50000 * 10000 = 2.0 bps
        assert stats.mean_slippage_bps == pytest.approx(2.0)
        assert stats.slippage_count == 1

    def test_sell_slippage_positive(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        # Sell: expected 50000, got 49990 → slippage = (50000-49990)/50000*10000 = 2.0 bps
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 49990.0, "SELL")
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.mean_slippage_bps == pytest.approx(2.0)

    def test_negative_slippage_better_than_expected(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        # Buy: expected 50000, got 49990 → slippage = (49990-50000)/50000*10000 = -2.0 bps
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 49990.0, "BUY")
        stats = sa.get_stats("binance", "BTC/USDT")
        assert stats.mean_slippage_bps == pytest.approx(-2.0)

    def test_multiple_slippages_averaged(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 50010.0, "BUY")
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 50005.0, "BUY")
        stats = sa.get_stats("binance", "BTC/USDT")
        # (2.0 + 1.0) / 2 = 1.5 bps
        assert stats.mean_slippage_bps == pytest.approx(1.5)
        assert stats.slippage_count == 2

    def test_zero_expected_price_ignored(self):
        sa = SpreadAnalytics()
        sa.record_slippage("binance", "BTC/USDT", 0.0, 100.0, "BUY")
        # Should not crash, just ignored
        summary = sa.get_summary()
        assert summary["total_slippage_records"] == 0


class TestSummary:
    def test_empty_summary(self):
        sa = SpreadAnalytics()
        summary = sa.get_summary()
        assert summary["tracked_pairs"] == 0
        assert summary["total_observations"] == 0

    def test_summary_after_records(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        sa.record_spread("bybit", "ETH/USDT", 0.3, 3000.0)
        summary = sa.get_summary()
        assert summary["tracked_pairs"] == 2
        assert summary["total_observations"] == 2
        assert "binance:BTC/USDT" in summary["pairs"]
        assert "bybit:ETH/USDT" in summary["pairs"]

    def test_summary_includes_slippage_count(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        sa.record_slippage("binance", "BTC/USDT", 50000.0, 50010.0, "BUY")
        summary = sa.get_summary()
        assert summary["total_slippage_records"] == 1


class TestGetAllStats:
    def test_empty(self):
        sa = SpreadAnalytics()
        assert sa.get_all_stats() == []

    def test_multiple_pairs(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        sa.record_spread("bybit", "ETH/USDT", 0.3, 3000.0)
        all_stats = sa.get_all_stats()
        assert len(all_stats) == 2
        exchanges = [s.exchange for s in all_stats]
        assert "binance" in exchanges
        assert "bybit" in exchanges


class TestRenderTerminal:
    def test_empty_render(self):
        sa = SpreadAnalytics()
        result = sa.render_terminal()
        assert "No spread data" in result

    def test_render_with_data(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0)
        result = sa.render_terminal()
        assert "Spread Analytics" in result
        assert "binance" in result
        assert "BTC/USDT" in result


class TestEdgeCases:
    def test_get_stats_for_untracked_pair(self):
        sa = SpreadAnalytics()
        assert sa.get_stats("unknown", "UNKNOWN") is None

    def test_custom_timestamp(self):
        sa = SpreadAnalytics()
        sa.record_spread("binance", "BTC/USDT", 5.0, 50000.0, timestamp=12345.0)
        records = list(sa._spreads["binance:BTC/USDT"])
        assert records[0].timestamp == 12345.0

    def test_spread_record_dataclass(self):
        record = SpreadRecord(
            exchange="binance", symbol="BTC/USDT",
            spread=5.0, mid_price=50000.0, spread_bps=1.0, timestamp=123.0,
        )
        assert record.exchange == "binance"
        assert record.spread == 5.0
        assert record.spread_bps == 1.0

    def test_spread_stats_dataclass_defaults(self):
        stats = SpreadStats(exchange="binance", symbol="BTC/USDT")
        assert stats.count == 0
        assert stats.mean_spread == 0.0
        assert stats.slippage_count == 0
