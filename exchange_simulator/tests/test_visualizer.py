"""Unit tests for exchange_simulator/visualizer.py — TabbedVisualizer constants and key handling."""

import pytest

from exchange_simulator.visualizer import TabbedVisualizer

# ─── ANSI Color Constants ───


def test_visualizer_has_color_constants() -> None:
    """TabbedVisualizer should define ANSI color constants."""
    assert TabbedVisualizer.RESET == "\033[0m"
    assert TabbedVisualizer.BOLD == "\033[1m"
    assert TabbedVisualizer.RED == "\033[31m"
    assert TabbedVisualizer.GREEN == "\033[32m"
    assert TabbedVisualizer.YELLOW == "\033[33m"
    assert TabbedVisualizer.CYAN == "\033[36m"


def test_visualizer_has_bg_constants() -> None:
    """TabbedVisualizer should define background color constants."""
    assert TabbedVisualizer.BG_RED == "\033[41m"
    assert TabbedVisualizer.BG_GREEN == "\033[42m"
    assert TabbedVisualizer.BG_BLUE == "\033[44m"


# ─── Key Handling ───


def test_handle_key_1_switches_to_tab_0() -> None:
    """Pressing '1' should switch to tab 0."""
    viz = _create_mock_visualizer()
    viz._handle_key(b"1")
    assert viz.current_tab == 0


def test_handle_key_2_switches_to_tab_1() -> None:
    """Pressing '2' should switch to tab 1."""
    viz = _create_mock_visualizer()
    viz._handle_key(b"2")
    assert viz.current_tab == 1


def test_handle_key_3_switches_to_tab_2() -> None:
    """Pressing '3' should switch to tab 2."""
    viz = _create_mock_visualizer()
    viz._handle_key(b"3")
    assert viz.current_tab == 2


def test_handle_key_a_switches_to_account_tab() -> None:
    """Pressing 'A' should switch to the last tab (Account)."""
    viz = _create_mock_visualizer()
    viz._handle_key(b"A")
    assert viz.current_tab == len(viz.tab_names) - 1


def test_handle_key_a_lowercase() -> None:
    """Pressing 'a' should also switch to Account tab."""
    viz = _create_mock_visualizer()
    viz._handle_key(b"a")
    assert viz.current_tab == len(viz.tab_names) - 1


def test_handle_key_q_stops() -> None:
    """Pressing 'Q' should stop the visualizer."""
    viz = _create_mock_visualizer()
    viz._active = True
    viz._handle_key(b"Q")
    assert viz._active is False


def test_handle_key_q_lowercase_stops() -> None:
    """Pressing 'q' should also stop the visualizer."""
    viz = _create_mock_visualizer()
    viz._active = True
    viz._handle_key(b"q")
    assert viz._active is False


# ─── Stop / Active State ───


def test_stop_sets_inactive() -> None:
    """stop() should set _active to False."""
    viz = _create_mock_visualizer()
    viz._active = True
    viz.stop()
    assert viz._active is False


# ─── Backward Compatibility ───


def test_terminal_visualizer_alias() -> None:
    """TerminalVisualizer should be an alias for TabbedVisualizer."""
    from exchange_simulator.visualizer import TerminalVisualizer
    assert TerminalVisualizer is TabbedVisualizer


# ─── Helpers ───


def _create_mock_visualizer() -> TabbedVisualizer:
    """Create a TabbedVisualizer with a mock exchanges dict."""
    class MockExchange:
        symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
        def get_account_status(self) -> dict:
            return {"equity": 100000.0}
        def get_candles(self, symbol: str, count: int) -> list:
            return []
        def get_price(self, symbol: str) -> float:
            return 50000.0

    exchanges = {"binance": MockExchange()}
    viz = TabbedVisualizer.__new__(TabbedVisualizer)
    viz.exchanges = exchanges
    viz.refresh_interval = 0.3
    viz.chart_width = 70
    viz.chart_height = 18
    viz.symbols = list(exchanges["binance"].symbols)
    viz.tab_names = viz.symbols + ["Account"]
    viz.current_tab = 0
    viz._active = False
    viz._frame = 0
    viz._old_termios = None
    viz._equity_history = {}
    viz._max_equity_points = 80
    return viz
