"""Tests for MarketSimulator multi-symbol correlation and funding rate history."""
import pytest
import math

from exchange_simulator.market_simulator import MarketSimulator


class TestCorrelation:
    def test_default_correlation_btc_eth(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT", "ETH/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
            volatility={"BTC/USDT": 0.8, "ETH/USDT": 1.2},
            warmup_candles=50,
        )
        assert sim.get_correlation("BTC/USDT", "ETH/USDT") == 0.85
        assert sim.get_correlation("ETH/USDT", "BTC/USDT") == 0.85

    def test_default_correlation_other_pairs(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT", "SOL/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000, "SOL/USDT": 150},
            volatility={"BTC/USDT": 0.8, "SOL/USDT": 1.5},
            warmup_candles=50,
        )
        assert sim.get_correlation("BTC/USDT", "SOL/USDT") == 0.3

    def test_custom_correlation(self):
        correlations = {("BTC/USDT", "ETH/USDT"): 0.95}
        sim = MarketSimulator(
            symbols=["BTC/USDT", "ETH/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
            volatility={"BTC/USDT": 0.8, "ETH/USDT": 1.2},
            warmup_candles=50,
            correlations=correlations,
        )
        assert sim.get_correlation("BTC/USDT", "ETH/USDT") == 0.95

    def test_self_correlation_is_one(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=50,
        )
        assert sim.get_correlation("BTC/USDT", "BTC/USDT") == 1.0

    def test_unknown_pair_returns_zero(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=50,
        )
        assert sim.get_correlation("BTC/USDT", "DOGE/USDT") == 0.0

    def test_correlated_prices_move_together(self):
        """High correlation should produce similar directional moves."""
        sim = MarketSimulator(
            symbols=["BTC/USDT", "ETH/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
            volatility={"BTC/USDT": 0.8, "ETH/USDT": 0.8},
            warmup_candles=200,
            correlations={("BTC/USDT", "ETH/USDT"): 0.95},
        )
        btc_history = sim.get_history("binance", "BTC/USDT", 100)
        eth_history = sim.get_history("binance", "ETH/USDT", 100)
        assert len(btc_history) == 100
        assert len(eth_history) == 100

        # Count directional agreement
        agreements = 0
        total = 0
        for i in range(1, min(len(btc_history), len(eth_history))):
            btc_up = btc_history[i].close > btc_history[i].open
            eth_up = eth_history[i].close > eth_history[i].open
            if btc_up == eth_up:
                agreements += 1
            total += 1

        # With 0.95 correlation, expect >70% directional agreement
        agreement_rate = agreements / total if total > 0 else 0
        assert agreement_rate > 0.6, f"Agreement rate {agreement_rate:.2f} too low for 0.95 correlation"


class TestFundingHistory:
    def test_funding_history_empty_initially(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=0,
        )
        assert sim.get_funding_history() == []

    def test_funding_history_populated_after_interval(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=0,
        )
        # Generate 96 candles (one funding interval)
        for _ in range(96):
            sim.next_candle()
        history = sim.get_funding_history()
        assert len(history) == 1
        assert history[0]["exchange"] == "binance"
        assert "rate" in history[0]
        assert "timestamp" in history[0]

    def test_funding_history_multiple_exchanges(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance", "bybit", "okx"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=0,
        )
        for _ in range(96):
            sim.next_candle()
        history = sim.get_funding_history()
        assert len(history) == 3
        exchanges = [h["exchange"] for h in history]
        assert "binance" in exchanges
        assert "bybit" in exchanges
        assert "okx" in exchanges

    def test_funding_history_filter_by_exchange(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance", "bybit"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=0,
        )
        for _ in range(96):
            sim.next_candle()
        binance_history = sim.get_funding_history(exchange="binance")
        assert len(binance_history) == 1
        assert binance_history[0]["exchange"] == "binance"

    def test_funding_history_limit(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=0,
        )
        # Generate enough candles for multiple funding intervals
        for _ in range(96 * 5):
            sim.next_candle()
        history = sim.get_funding_history(n=3)
        assert len(history) <= 3

    def test_funding_history_max_cap(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=0,
        )
        # Generate way more than max_funding_history
        for _ in range(96 * 600):
            sim.next_candle()
        history = sim.get_funding_history(n=10000)
        assert len(history) <= 500  # max_funding_history
