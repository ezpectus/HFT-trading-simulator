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

_CFG_SURFACE = [
    'trend_enabled', 'trend_ema_fast', 'trend_ema_slow', 'trend_adx_threshold',
    'meanrev_enabled', 'meanrev_rsi_oversold', 'meanrev_rsi_overbought',
    'meanrev_bb_period', 'meanrev_bb_std', 'fft_enabled', 'sentiment_enabled',
    'sentiment_fade_threshold', 'sentiment_follow_threshold', 'sentiment_decay_rate',
    'market_making_enabled', 'mm_gamma', 'mm_sigma', 'mm_max_inventory', 'mm_min_spread',
    'ml_ensemble_enabled', 'ml_lookback', 'ml_prediction_horizon',
    'statarb_enabled', 'symbols', 'rsi_period', 'atr_period', 'fft_min_data',
]
_BOT_SURFACE = ['stat_arb', 'exchange', 'config', 'signal_publisher', 'llm_engine']
_SIGNAL_SURFACE = ['direction', 'entry_price', 'reason', 'assert_not_called']

# ─── Fixtures ───


@pytest.fixture
def mock_config():
    """Minimal mock config for build_strategies."""
    cfg = MagicMock(spec=_CFG_SURFACE)
    cfg.trend_enabled = True
    cfg.trend_ema_fast = 9
    cfg.trend_ema_slow = 21
    cfg.trend_adx_threshold = 25
    cfg.meanrev_enabled = True
    cfg.meanrev_rsi_oversold = 30
    cfg.meanrev_rsi_overbought = 70
    cfg.meanrev_bb_period = 20
    cfg.meanrev_bb_std = 2.0
    cfg.rsi_period = 14
    cfg.atr_period = 14
    cfg.fft_min_data = 100
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


def test_indicator_periods_reach_strategies(mock_config) -> None:
    """Regression indicators.* YAML values must reach strategy constructors."""
    mock_config.meanrev_enabled = True
    mock_config.fft_enabled = True
    mock_config.rsi_period = 21
    mock_config.atr_period = 7
    strategies = build_strategies(mock_config)
    mr = next(s for s in strategies if s.name == "mean_reversion")
    fft = next(s for s in strategies if s.name == "fft_cycle")
    assert mr.rsi_period == 21
    assert mr.atr_period == 7
    assert fft.atr_period == 7


def test_sentiment_tunables_reach_config(mock_config) -> None:
    """Regression sentiment YAML values must reach SentimentConfig."""
    mock_config.sentiment_enabled = True
    mock_config.sentiment_fade_threshold = 0.42
    mock_config.sentiment_follow_threshold = 0.11
    mock_config.sentiment_decay_rate = 0.5
    strategies = build_strategies(mock_config)
    sent = next(s for s in strategies if s.name == "sentiment")
    assert sent.config.fade_threshold == 0.42
    assert sent.config.follow_threshold == 0.11
    assert sent.config.decay_rate == 0.5


def test_market_making_tunables_reach_config(mock_config) -> None:
    """Regression market_making YAML values must reach MarketMakingConfig."""
    mock_config.market_making_enabled = True
    mock_config.mm_gamma = 0.25
    mock_config.mm_sigma = 0.05
    mock_config.mm_max_inventory = 9.0
    mock_config.mm_min_spread = 0.002
    strategies = build_strategies(mock_config)
    mm = next(s for s in strategies if s.name == "market_making")
    assert mm.config.gamma == 0.25
    assert mm.config.sigma == 0.05
    assert mm.config.max_inventory == 9.0
    assert mm.config.min_spread == 0.002


def test_ml_ensemble_tunables_reach_config(mock_config) -> None:
    """Regression ml_ensemble YAML values must reach MLConfig."""
    mock_config.ml_ensemble_enabled = True
    mock_config.ml_lookback = 77
    mock_config.ml_prediction_horizon = 9
    strategies = build_strategies(mock_config)
    ml = next(s for s in strategies if s.name == "ml_ensemble")
    assert ml.config.lookback == 77
    assert ml.config.prediction_horizon == 9


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
    bot = MagicMock(spec=_BOT_SURFACE)
    bot.stat_arb = None
    await generate_stat_arb_signals(bot, 12345)
    bot.exchange.candle_history.get.assert_not_called()


@pytest.mark.asyncio
async def test_stat_arb_signals_insufficient_data() -> None:
    """generate_stat_arb_signals with insufficient candles should skip."""
    bot = MagicMock(spec=_BOT_SURFACE)
    bot.stat_arb = MagicMock(spec=['should_close', 'positions'])
    bot.config.symbols = ["BTC/USDT", "ETH/USDT"]
    bot.config.statarb_min_data = 100
    bot.exchange.candle_history.get.return_value = []
    await generate_stat_arb_signals(bot, 12345)
    bot.signal_publisher.broadcast_signal.assert_not_called()


# ─── generate_llm_explanation ───


@pytest.mark.asyncio
async def test_llm_explanation_success() -> None:
    """generate_llm_explanation should return LLM response on success."""
    bot = MagicMock(spec=_BOT_SURFACE)
    bot.llm_engine.explain_signal = AsyncMock(return_value="Bullish trend detected")
    bot.config.rsi_period = 14
    bot.config.adx_period = 14
    signal = MagicMock(spec=_SIGNAL_SURFACE)
    signal.direction.value = "LONG"
    signal.entry_price = 50000
    signal.reason = "EMA crossover"
    candles = [{"close": 50000 + i * 100, "high": 50100 + i * 100, "low": 49900 + i * 100, "open": 50000 + i * 100 - 50} for i in range(30)]
    result = await generate_llm_explanation(bot, "BTC/USDT", signal, candles)
    assert result == "Bullish trend detected"


@pytest.mark.asyncio
async def test_llm_explanation_fallback_on_error() -> None:
    """generate_llm_explanation should fallback to signal.reason on error."""
    bot = MagicMock(spec=_BOT_SURFACE)
    bot.llm_engine.explain_signal = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    bot.config.rsi_period = 14
    bot.config.adx_period = 14
    signal = MagicMock(spec=_SIGNAL_SURFACE)
    signal.direction.value = "LONG"
    signal.entry_price = 50000
    signal.reason = "EMA crossover"
    candles = [{"close": 50000 + i * 100, "high": 50100 + i * 100, "low": 49900 + i * 100, "open": 50000 + i * 100 - 50} for i in range(30)]
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
