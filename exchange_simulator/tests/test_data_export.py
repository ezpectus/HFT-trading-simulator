"""Tests for data export module."""
import csv
import os

import pytest

from exchange_simulator.data_export import DataExporter
from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator


@pytest.fixture
def setup_market():
    """Create a market with some candle data."""
    market = MarketSimulator(
        symbols=["BTC/USDT", "ETH/USDT"],
        exchanges=["binance", "bybit"],
        initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
        volatility={"BTC/USDT": 0.75, "ETH/USDT": 0.85},
        seed=42,
        warmup_candles=50,
        order_book_depth=10,
    )
    exchanges = {
        "binance": SimulatedExchange("binance", "Binance", 0.04, 2.0, market, 10000),
        "bybit": SimulatedExchange("bybit", "Bybit", 0.06, 3.0, market, 10000),
    }
    # Generate some candles
    for _ in range(60):
        market.next_candle()
    return exchanges, market


class TestDataExporter:
    def test_export_candles_csv(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path), format="csv")
        filepath = exporter.export_candles()
        assert filepath != ""
        assert os.path.exists(filepath)
        assert filepath.endswith(".csv")

        # Verify CSV content
        with open(filepath) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) > 0
            assert "symbol" in rows[0]
            assert "close" in rows[0]

    def test_export_candles_specific_symbol(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        filepath = exporter.export_candles(symbol="BTC/USDT")
        assert filepath != ""
        with open(filepath) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            for row in rows:
                assert row["symbol"] == "BTC/USDT"

    def test_export_candles_specific_exchange(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        filepath = exporter.export_candles(exchange="binance")
        assert filepath != ""
        with open(filepath) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            for row in rows:
                assert row["exchange"] == "binance"

    def test_export_account_status(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        filepath = exporter.export_account_status()
        assert os.path.exists(filepath)
        with open(filepath) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) == 2  # 2 exchanges
            assert "balance" in rows[0]

    def test_export_positions_empty(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        filepath = exporter.export_positions()
        # No open positions — should return empty string
        assert filepath == ""

    def test_export_summary(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        filepath = exporter.export_summary()
        assert os.path.exists(filepath)
        with open(filepath) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) == 1
            assert "total_candles" in rows[0]

    def test_export_all(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        files = exporter.export_all()
        assert len(files) > 0
        for f in files:
            assert os.path.exists(f)

    def test_export_orders_empty(self, setup_market, tmp_path):
        exchanges, market = setup_market
        exporter = DataExporter(exchanges, market, output_dir=str(tmp_path))
        filepath = exporter.export_orders()
        # No orders placed
        assert filepath == ""

    def test_export_creates_directory(self, setup_market):
        exchanges, market = setup_market
        export_dir = "test_exports_tmp"
        DataExporter(exchanges, market, output_dir=export_dir)
        assert os.path.exists(export_dir)
        # Cleanup
        import shutil
        shutil.rmtree(export_dir, ignore_errors=True)
