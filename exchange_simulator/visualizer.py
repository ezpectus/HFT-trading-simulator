"""Terminal visualizer -- tabbed interface with candle charts, order book, and account dashboard.

Tab switching: 1=BTC, 2=ETH, 3=SOL, A=Account, Q=Quit
Animated real-time market data using ANSI escape codes.
Pure Python -- no external GUI dependencies.

Refactored: chart rendering -> visualizer_charts.py,
account/order book rendering -> visualizer_account.py.
"""
import platform
import sys
import time

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import Candle
from exchange_simulator.visualizer_account import AccountMixin
from exchange_simulator.visualizer_charts import ChartMixin

# Non-blocking input
if platform.system() == "Windows":
    import msvcrt
else:
    import select
    import termios
    import tty


class TabbedVisualizer(ChartMixin, AccountMixin):
    """Real-time terminal dashboard with tabbed interface.

    Tabs:
    - 1/2/3: BTC/USDT, ETH/USDT, SOL/USDT -- candle chart + order book + indicators
    - A:     Account overview -- balance, positions, trade history
    - Q:     Quit

    Controls:
    - 1, 2, 3 -- Switch to symbol tab
    - A       -- Switch to account tab
    - Q / Ctrl+C -- Quit
    - Left/Right arrows -- Cycle through tabs
    """

    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    BLINK = "\033[5m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_BLUE = "\033[44m"
    BG_BLACK = "\033[40m"
    BG_GRAY = "\033[48;5;236m"

    def __init__(
        self,
        exchanges: dict[str, SimulatedExchange],
        refresh_interval: float = 0.3,
        chart_width: int = 70,
        chart_height: int = 18,
    ):
        self.exchanges = exchanges
        self.refresh_interval = refresh_interval
        self.chart_width = chart_width
        self.chart_height = chart_height

        self.symbols = list(exchanges.get("binance").symbols) if "binance" in exchanges else []
        self.tab_names = self.symbols + ["Account"]
        self.current_tab = 0
        self._active = False
        self._frame = 0
        self._old_termios = None
        self._equity_history: dict[str, list[float]] = {}
        self._max_equity_points = 80

    def start(self) -> None:
        self._active = True
        if platform.system() != "Windows":
            fd = sys.stdin.fileno()
            self._old_termios = termios.tcgetattr(fd)
            tty.setraw(fd, termios.TCSANOW)
        try:
            self._run_loop()
        except KeyboardInterrupt:
            self.stop()
        finally:
            self._restore_terminal()

    def stop(self) -> None:
        self._active = False

    def _restore_terminal(self) -> None:
        if platform.system() != "Windows" and self._old_termios:
            fd = sys.stdin.fileno()
            termios.tcsetattr(fd, termios.TCSANOW, self._old_termios)
        print(f"\n{self.RESET}", end="")
        sys.stdout.flush()

    def _run_loop(self) -> None:
        while self._active:
            self._check_input()
            self._render()
            self._frame += 1
            time.sleep(self.refresh_interval)

    def _check_input(self) -> None:
        """Non-blocking key press detection."""
        try:
            if platform.system() == "Windows":
                if msvcrt.kbhit():
                    key = msvcrt.getch()
                    self._handle_key(key)
            else:
                rlist, _, _ = select.select([sys.stdin], [], [], 0)
                if rlist:
                    key = sys.stdin.read(1).encode()
                    self._handle_key(key)
        except (OSError, ValueError, TypeError):
            pass

    def _handle_key(self, key: bytes) -> None:
        if key == b'1' and len(self.symbols) >= 1:
            self.current_tab = 0
        elif key == b'2' and len(self.symbols) >= 2:
            self.current_tab = 1
        elif key == b'3' and len(self.symbols) >= 3:
            self.current_tab = 2
        elif key in (b'a', b'A'):
            self.current_tab = len(self.tab_names) - 1
        elif key in (b'q', b'Q'):
            self.stop()
        elif key == b'\x1b':
            self._handle_arrow_key()

    def _handle_arrow_key(self) -> None:
        """Handle escape sequence for arrow keys."""
        if platform.system() == "Windows":
            if msvcrt.kbhit():
                msvcrt.getch()
                if msvcrt.kbhit():
                    arrow = msvcrt.getch()
                    if arrow == b'D':
                        self.current_tab = (self.current_tab - 1) % len(self.tab_names)
                    elif arrow == b'C':
                        self.current_tab = (self.current_tab + 1) % len(self.tab_names)
        else:
            import select as sel
            rlist, _, _ = sel.select([sys.stdin], [], [], 0.1)
            if rlist:
                sys.stdin.read(1)
                rlist2, _, _ = sel.select([sys.stdin], [], [], 0.1)
                if rlist2:
                    arrow = sys.stdin.read(1).encode()
                    if arrow == b'D':
                        self.current_tab = (self.current_tab - 1) % len(self.tab_names)
                    elif arrow == b'C':
                        self.current_tab = (self.current_tab + 1) % len(self.tab_names)

    def _clear(self) -> None:
        print("\033[2J\033[H", end="")
        sys.stdout.flush()

    def _render(self) -> None:
        self._clear()
        self._render_header()
        self._render_tabs()

        for ex_id, exchange in self.exchanges.items():
            status = exchange.get_account_status()
            if ex_id not in self._equity_history:
                self._equity_history[ex_id] = []
            self._equity_history[ex_id].append(status["equity"])
            if len(self._equity_history[ex_id]) > self._max_equity_points:
                self._equity_history[ex_id] = self._equity_history[ex_id][-self._max_equity_points:]

        if self.current_tab < len(self.symbols):
            self._render_symbol_tab(self.symbols[self.current_tab])
        else:
            self._render_account_tab()

        self._render_footer()
        sys.stdout.flush()

    def _render_header(self) -> None:
        print(f"{self.CYAN}{self.BOLD}", end="")
        print("+" + "=" * 82 + "+")
        print("|" + "  HFT TRADING SIMULATOR  --  Paper Trading Mode  ".center(82) + "|")
        print("+" + "=" * 82 + "+")
        print(f"{self.RESET}", end="")

    def _render_tabs(self) -> None:
        """Render tab bar with highlighted active tab."""
        tabs = ""
        for i, name in enumerate(self.tab_names):
            if i == self.current_tab:
                if i < len(self.symbols):
                    tabs += f" {self.BG_BLUE}{self.BOLD} [{i+1}] {name} {self.RESET}"
                else:
                    tabs += f" {self.BG_BLUE}{self.BOLD} [A] {name} {self.RESET}"
            else:
                if i < len(self.symbols):
                    tabs += f" {self.DIM} [{i+1}] {name} {self.RESET}"
                else:
                    tabs += f" {self.DIM} [A] {name} {self.RESET}"
            tabs += "|"

        tabs = tabs.rstrip("|")
        print(f"  {tabs}")
        print(f"  {'-' * 82}")
        print()

    def _render_symbol_tab(self, symbol: str) -> None:
        """Render a symbol tab: candle chart + indicators + order book."""
        ex = self.exchanges.get("binance")
        if not ex:
            return

        candles = ex.get_candles(symbol, self.chart_width)
        if not candles:
            print(f"  {self.DIM}Waiting for data...{self.RESET}")
            return

        current = candles[-1]
        current_price = current.close

        if len(candles) >= 2:
            prev = candles[-2]
            change_pct = ((current_price - prev.close) / prev.close) * 100 if prev.close != 0 else 0.0
        else:
            change_pct = 0.0

        color = self.GREEN if change_pct >= 0 else self.RED
        arrow = "^" if change_pct >= 0 else "v"

        print(f"  {self.BOLD}{symbol}{self.RESET}  "
              f"{self.YELLOW}${current_price:,.2f}{self.RESET}  "
              f"{color}{arrow} {abs(change_pct):.2f}%{self.RESET}  "
              f"{self.DIM}Vol: {current.volume:,.0f}{self.RESET}  "
              f"{self.DIM}H: {current.high:,.2f}  L: {current.low:,.2f}{self.RESET}")
        print()

        self._render_candle_chart(candles)
        self._render_volume_bars(candles)
        self._render_indicators(ex, candles, symbol)
        self._render_order_book(ex, symbol)

    def _render_footer(self) -> None:
        tickers = []
        for _ex_id, exchange in self.exchanges.items():
            for symbol in exchange.symbols:
                price = exchange.get_price(symbol)
                tickers.append(f"{symbol.split('/')[0]}: ${price:,.2f}")

        ticker_str = "  |  ".join(tickers)
        print(f"  {self.DIM}{'-' * 82}{self.RESET}")
        print(f"  {self.CYAN}{ticker_str}{self.RESET}")
        print()
        print(f"  {self.DIM}[1] BTC  [2] ETH  [3] SOL  [A] Account  [Q] Quit  "
              f"|  <- -> Switch tabs  |  Frame: {self._frame}{self.RESET}")


# Backward compatibility alias
TerminalVisualizer = TabbedVisualizer
