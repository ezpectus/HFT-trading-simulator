"""Unit tests for utils/bot_helpers.py — build_strategies, stat_arb, LLM, CSV loading."""

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.utils.bot_helpers import (
    build_stat_arb,
    build_strategies,
    generate_llm_explanation,
    generate_stat_arb_signals,
    load_candles_from_csv,
)

# ─── Fixtures ───


@pytest.fixture
def mock_config():
    """Minimal mock config for build_strategies."""
    cfg = MagicMock()
    cfg.trend_enabled = True
    cfg.trend_ema_fast = 9
    cfg.trend_ema_slow = 21
    cfg.trend_adx_threshold = 25
    cfg.meanrev_enabled = True
    cfg.meanrev_rsi_oversold = 30
    cfg.meanrev_rsi_overbought = 70
    cfg.meanrev_bb_period = 20
    cfg.meanrev_bb_std = 2.0
    cfg.fft_enabled = False
    cfg.sentiment_enabled = False
    cfg.market_making_enabled = False
    cfg.ml_ensemble_enabled = False
    cfg.statarb_enabled = False
    cfg.symbols = ["BTC/USDT", "ETH/USDT"]
    return cfg


# ─── build_strategies ───


def test_build_strategies_trend_only(mock_config) -> None:
    """build_strategies with only trend enabled should return 1 strategy."""
    mock_config.meanrev_enabled = False
    strategies = build_strategies(mock_config)
    assert len(strategies) == 1


def test_build_strategies_all_disabled(mock_config) -> None:
    """build_strategies with all disabled should return empty list."""
    mock_config.trend_enabled = False
    mock_config.meanrev_enabled = False
    strategies = build_strategies(mock_config)
    assert len(strategies) == 0


def test_build_strategies_multiple_enabled(mock_config) -> None:
    """build_strategies with trend + meanrev should return 2 strategies."""
    strategies = build_strategies(mock_config)
    assert len(strategies) == 2


# ─── build_stat_arb ───


def test_build_stat_arb_disabled_returns_none(mock_config) -> None:
    """build_stat_arb with statarb disabled should return None."""
    mock_config.statarb_enabled = False
    logger = logging.getLogger("test")
    result = build_stat_arb(mock_config, logger)
    assert result is None


def test_build_stat_arb_single_symbol_returns_none(mock_config) -> None:
    """build_stat_arb with < 2 symbols should return None."""
    mock_config.statarb_enabled = True
    mock_config.symbols = ["BTC/USDT"]
    logger = logging.getLogger("test")
    result = build_stat_arb(mock_config, logger)
    assert result is None


def test_build_stat_arb_enabled_returns_instance(mock_config) -> None:
    """build_stat_arb with enabled + 2 symbols should return StatisticalArbitrage."""
    mock_config.statarb_enabled = True
    mock_config.statarb_zscore_entry = 2.0
    mock_config.statarb_zscore_exit = 0.5
    mock_config.statarb_recompute_interval = 100
    logger = logging.getLogger("test")
    result = build_stat_arb(mock_config, logger)
    assert result is not None


# ─── generate_stat_arb_signals ───


@pytest.mark.asyncio
async def test_stat_arb_signals_no_stat_arb() -> None:
    """generate_stat_arb_signals with no stat_arb should return early."""
    bot = MagicMock()
    bot.stat_arb = None
    await generate_stat_arb_signals(bot, 12345)
    bot.exchange.candle_history.get.assert_not_called()


@pytest.mark.asyncio
async def test_stat_arb_signals_insufficient_data() -> None:
    """generate_stat_arb_signals with insufficient candles should skip."""
    bot = MagicMock()
    bot.stat_arb = MagicMock()
    bot.config.symbols = ["BTC/USDT", "ETH/USDT"]
    bot.config.statarb_min_data = 100
    bot.exchange.candle_history.get.return_value = []
    await generate_stat_arb_signals(bot, 12345)
    bot.signal_publisher.broadcast_signal.assert_not_called()


# ─── generate_llm_explanation ───


@pytest.mark.asyncio
async def test_llm_explanation_success() -> None:
    """generate_llm_explanation should return LLM response on success."""
    bot = MagicMock()
    bot.llm_engine.explain_signal = AsyncMock(return_value="Bullish trend detected")
    signal = MagicMock()
    signal.direction.value = "LONG"
    signal.entry_price = 50000
    signal.reason = "EMA crossover"
    candles = [{"close": 50000 + i * 100} for i in range(30)]
    result = await generate_llm_explanation(bot, "BTC/USDT", signal, candles)
    assert result == "Bullish trend detected"


@pytest.mark.asyncio
async def test_llm_explanation_fallback_on_error() -> None:
    """generate_llm_explanation should fallback to signal.reason on error."""
    bot = MagicMock()
    bot.llm_engine.explain_signal = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    signal = MagicMock()
    signal.direction.value = "LONG"
    signal.entry_price = 50000
    signal.reason = "EMA crossover"
    candles = [{"close": 50000 + i * 100} for i in range(30)]
    result = await generate_llm_explanation(bot, "BTC/USDT", signal, candles)
    assert result == "EMA crossover"


# ─── load_candles_from_csv ───


def test_load_candles_no_files_returns_empty() -> None:
    """load_candles_from_csv with no matching files should return empty list."""
    with patch("src.utils.bot_helpers.glob.glob", return_value=[]):
        result = load_candles_from_csv("NONEXIST/USDT")
    assert result == []


def test_load_candles_parses_csv() -> None:
    """load_candles_from_csv should parse CSV rows into candle dicts."""
    import io
    from unittest.mock import mock_open

    csv_content = "timestamp,open,high,low,close,volume\n1000,50000,50100,49900,50050,100\n1001,50050,50200,50000,50150,200\n"
    with patch("src.utils.bot_helpers.glob.glob", return_value=["data/exports/candles_BTC_USDT.csv"]):
        with patch("builtins.open", mock_open(read_data=csv_content)):
            result = load_candles_from_csv("BTC/USDT")
    assert len(result) == 2
    assert result[0]["close"] == 50050.0
    assert result[1]["volume"] == 200.0
