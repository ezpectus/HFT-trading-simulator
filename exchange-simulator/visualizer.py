"""Terminal visualizer — tabbed interface with candle charts, order book, and account dashboard.

Tab switching: 1=BTC, 2=ETH, 3=SOL, A=Account, Q=Quit
Animated real-time market data using ANSI escape codes.
Pure Python — no external GUI dependencies.
"""
import os
import sys
import time
import platform
from typing import Optional

from exchange_simulator.models import Account, Candle, OrderBook, Position, Side
from exchange_simulator.exchange import SimulatedExchange

# Non-blocking input
if platform.system() == "Windows":
    import msvcrt
else:
    import select
    import tty
    import termios


class TabbedVisualizer:
    """Real-time terminal dashboard with tabbed interface.

    Tabs:
    - 1/2/3: BTC/USDT, ETH/USDT, SOL/USDT — candle chart + order book + indicators
    - A:     Account overview — balance, positions, trade history
    - Q:     Quit

    Controls:
    - 1, 2, 3 — Switch to symbol tab
    - A       — Switch to account tab
    - Q / Ctrl+C — Quit
    - Left/Right arrows — Cycle through tabs
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
        self._equity_history: dict[str, list[float]] = {}  # {exchange_id: [equity...]}
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
        except Exception:
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
            # Escape sequence — arrow keys
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
                    sys.stdin.read(1)  # skip [
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

        # Track equity history for sparkline
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
        print("╔" + "═" * 82 + "╗")
        print("║" + "  ◆ CRYPTO TRADING SIMULATOR  —  Paper Trading Mode  ◆".center(82) + "║")
        print("╠" + "═" * 82 + "╣")
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
            tabs += "│"

        tabs = tabs.rstrip("│")
        print(f"  {tabs}")
        print(f"  {'─' * 82}")
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
            change_pct = ((current_price - prev.close) / prev.close) * 100
        else:
            change_pct = 0.0

        color = self.GREEN if change_pct >= 0 else self.RED
        arrow = "▲" if change_pct >= 0 else "▼"

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

    def _render_candle_chart(self, candles: list[Candle]) -> None:
        """Render ASCII candle chart with price axis."""
        visible = candles[-self.chart_width:]
        if len(visible) < 2:
            return

        min_price = min(c.low for c in visible)
        max_price = max(c.high for c in visible)
        price_range = max_price - min_price
        if price_range == 0:
            price_range = 1

        height = self.chart_height

        for row in range(height, 0, -1):
            row_price = min_price + (price_range * row / height)
            line = f"  {self.DIM}{row_price:>10.2f} │{self.RESET}"

            for c in visible:
                candle_range = price_range
                if candle_range == 0:
                    candle_range = 1

                open_pos = int((c.open - min_price) / candle_range * height)
                close_pos = int((c.close - min_price) / candle_range * height)
                high_pos = int((c.high - min_price) / candle_range * height)
                low_pos = int((c.low - min_price) / candle_range * height)

                if low_pos <= row <= high_pos:
                    if row == close_pos and row == open_pos:
                        char = "━"
                    elif min(open_pos, close_pos) < row < max(open_pos, close_pos):
                        char = "┃"
                    elif row == high_pos or row == low_pos:
                        char = "│"
                    elif row == close_pos:
                        char = "╮" if c.close > c.open else "╯"
                    elif row == open_pos:
                        char = "╰" if c.close > c.open else "╭"
                    else:
                        char = "│"

                    color = self.GREEN if c.close >= c.open else self.RED
                    line += f"{color}{char}{self.RESET}"
                else:
                    line += " "

            print(line)

        print(f"  {'':>10} └{'─' * len(visible)}")
        print()

    def _render_volume_bars(self, candles: list[Candle]) -> None:
        """Render volume bars below candle chart."""
        visible = candles[-self.chart_width:]
        if not visible:
            return

        max_vol = max(c.volume for c in visible) if visible else 1
        if max_vol == 0:
            max_vol = 1

        bar_height = 3
        for row in range(bar_height, 0, -1):
            threshold = max_vol * row / bar_height
            line = f"  {self.DIM}{'Vol':>10} │{self.RESET}"
            for c in visible:
                if c.volume >= threshold:
                    color = self.GREEN if c.close >= c.open else self.RED
                    line += f"{color}█{self.RESET}"
                else:
                    line += " "
            print(line)
        print()

    def _render_indicators(self, exchange: SimulatedExchange, candles: list[Candle], symbol: str) -> None:
        """Render indicator values + mini-charts (RSI, MACD, FFT regime)."""
        closes = [c.close for c in candles]

        def ema_calc(values, period):
            if len(values) < period:
                return 0
            mult = 2 / (period + 1)
            result = sum(values[:period]) / period
            for v in values[period:]:
                result = v * mult + result * (1 - mult)
            return result

        def ema_series(values, period):
            if len(values) < period:
                return [0] * len(values)
            mult = 2 / (period + 1)
            result = [0.0] * len(values)
            result[period - 1] = sum(values[:period]) / period
            for i in range(period, len(values)):
                result[i] = values[i] * mult + result[i - 1] * (1 - mult)
            return result

        ema9 = ema_calc(closes, 9)
        ema21 = ema_calc(closes, 21)
        ema_trend = "BULL" if ema9 > ema21 else "BEAR"
        ema_color = self.GREEN if ema9 > ema21 else self.RED

        def rsi_calc(values, period=14):
            if len(values) < period + 1:
                return 50
            gains, losses = [], []
            for i in range(1, period + 1):
                change = values[i] - values[i - 1]
                gains.append(max(change, 0))
                losses.append(max(-change, 0))
            avg_gain = sum(gains) / period
            avg_loss = sum(losses) / period
            if avg_loss == 0:
                return 100
            rs = avg_gain / avg_loss
            return 100 - 100 / (1 + rs)

        def rsi_series(values, period=14):
            if len(values) < period + 1:
                return [50.0] * len(values)
            result = [50.0] * len(values)
            avg_gain = 0.0
            avg_loss = 0.0
            for i in range(1, period + 1):
                change = values[i] - values[i - 1]
                avg_gain += max(change, 0)
                avg_loss += max(-change, 0)
            avg_gain /= period
            avg_loss /= period
            result[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
            for i in range(period + 1, len(values)):
                change = values[i] - values[i - 1]
                avg_gain = (avg_gain * (period - 1) + max(change, 0)) / period
                avg_loss = (avg_loss * (period - 1) + max(-change, 0)) / period
                result[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
            return result

        rsi_val = rsi_calc(closes)
        if rsi_val >= 70:
            rsi_color = self.RED
            rsi_label = "OVERBOUGHT"
        elif rsi_val <= 30:
            rsi_color = self.GREEN
            rsi_label = "OVERSOLD"
        else:
            rsi_color = self.YELLOW
            rsi_label = "NEUTRAL"

        def atr_calc(candles_list, period=14):
            if len(candles_list) < period + 1:
                return 0
            trs = []
            for i in range(1, len(candles_list)):
                tr = max(
                    candles_list[i].high - candles_list[i].low,
                    abs(candles_list[i].high - candles_list[i - 1].close),
                    abs(candles_list[i].low - candles_list[i - 1].close),
                )
                trs.append(tr)
            return sum(trs[-period:]) / period

        atr_val = atr_calc(candles)

        # MACD
        def macd_calc(values, fast=12, slow=26, signal=9):
            if len(values) < slow + signal:
                return 0, 0, 0
            ema_f = ema_series(values, fast)
            ema_s = ema_series(values, slow)
            macd_line = [ema_f[i] - ema_s[i] for i in range(len(values))]
            sig = ema_series(macd_line[slow - 1:], signal)
            sig_full = [0.0] * (slow - 1) + sig
            hist = [macd_line[i] - sig_full[i] for i in range(len(values))]
            return macd_line[-1], sig_full[-1], hist[-1]

        macd_line, macd_sig, macd_hist = macd_calc(closes)
        macd_color = self.GREEN if macd_hist >= 0 else self.RED

        # Bollinger Bands
        def bb_calc(values, period=20, std_dev=2.0):
            if len(values) < period:
                return 0, 0, 0
            window = values[-period:]
            mean = sum(window) / period
            variance = sum((x - mean) ** 2 for x in window) / period
            sd = variance ** 0.5
            return mean + std_dev * sd, mean, mean - std_dev * sd

        bb_upper, bb_mid, bb_lower = bb_calc(closes)
        bb_pos = "UPPER" if closes[-1] >= bb_upper else "LOWER" if closes[-1] <= bb_lower else "MID"
        bb_color = self.RED if bb_pos == "UPPER" else self.GREEN if bb_pos == "LOWER" else self.DIM

        # FFT regime detection (simplified)
        fft_regime = "—"
        fft_color = self.DIM
        if len(closes) >= 64:
            # Simple spectral analysis: compare low-freq vs high-freq energy
            import math as m
            n = len(closes)
            mean_price = sum(closes) / n
            detrended = [c - mean_price for c in closes]
            # Simple DFT for first few frequencies
            low_energy = 0.0
            high_energy = 0.0
            for k in range(1, min(n // 2, 32)):
                real = sum(detrended[i] * m.cos(2 * m.pi * k * i / n) for i in range(n))
                imag = sum(detrended[i] * m.sin(2 * m.pi * k * i / n) for i in range(n))
                energy = (real ** 2 + imag ** 2) / n ** 2
                if k < n // 8:
                    low_energy += energy
                else:
                    high_energy += energy
            total = low_energy + high_energy
            if total > 0:
                trend_score = (low_energy - high_energy) / total
                if trend_score > 0.3:
                    fft_regime = "TRENDING"
                    fft_color = self.GREEN
                elif trend_score < -0.2:
                    fft_regime = "RANGING"
                    fft_color = self.YELLOW
                else:
                    fft_regime = "MIXED"
                    fft_color = self.CYAN

        # Indicator summary line
        print(f"  {self.BOLD}Indicators:{self.RESET}")
        print(f"    EMA9: {ema_color}{ema9:.2f}{self.RESET}  "
              f"EMA21: {ema_color}{ema21:.2f}{self.RESET}  "
              f"Trend: {ema_color}{ema_trend}{self.RESET}  "
              f"│  RSI: {rsi_color}{rsi_val:.1f} ({rsi_label}){self.RESET}  "
              f"│  ATR: {self.CYAN}{atr_val:.2f}{self.RESET}  "
              f"│  MACD: {macd_color}{macd_hist:+.4f}{self.RESET}")
        print(f"    BB: {bb_color}{bb_pos}{self.RESET} "
              f"(U:{bb_upper:.2f} M:{bb_mid:.2f} L:{bb_lower:.2f})  "
              f"│  FFT Regime: {fft_color}{fft_regime}{self.RESET}")
        print()

        # RSI mini-chart (8 rows)
        if len(closes) >= 15:
            rsi_vals = rsi_series(closes)
            visible_rsi = rsi_vals[-self.chart_width:]
            print(f"  {self.DIM}RSI (14):{self.RESET}")
            rsi_rows = 7
            for row in range(rsi_rows, 0, -1):
                row_val = 100 * row / rsi_rows
                if row_val == 70:
                    line = f"  {self.DIM}  70 │{self.RED}{'─' * len(visible_rsi)}{self.RESET}"
                elif row_val == 30:
                    line = f"  {self.DIM}  30 │{self.GREEN}{'─' * len(visible_rsi)}{self.RESET}"
                else:
                    line = f"  {self.DIM}{row_val:>4.0f} │{self.RESET}"
                    for rv in visible_rsi:
                        rv_pos = int(rv / 100 * rsi_rows)
                        if rv_pos == row:
                            if rv >= 70:
                                line += f"{self.RED}●{self.RESET}"
                            elif rv <= 30:
                                line += f"{self.GREEN}●{self.RESET}"
                            else:
                                line += f"{self.YELLOW}●{self.RESET}"
                        else:
                            line += " "
                print(line)
            print()

        # MACD mini-chart (5 rows)
        if len(closes) >= 40:
            ema_f = ema_series(closes, 12)
            ema_s = ema_series(closes, 26)
            macd_full = [ema_f[i] - ema_s[i] for i in range(len(closes))]
            sig_full = ema_series(macd_full[25:], 9) if len(macd_full) > 34 else [0]
            sig_padded = [0.0] * 25 + sig_full
            hist_full = [macd_full[i] - sig_padded[i] if i < len(sig_padded) else 0 for i in range(len(closes))]
            visible_macd = macd_full[-self.chart_width:]
            visible_hist = hist_full[-self.chart_width:]
            max_macd = max(abs(v) for v in visible_macd) if visible_macd else 1
            if max_macd == 0:
                max_macd = 1

            print(f"  {self.DIM}MACD (12/26/9):{self.RESET}")
            macd_rows = 5
            for row in range(macd_rows, -macd_rows, -1):
                row_val = max_macd * row / macd_rows
                if row == 0:
                    line = f"  {self.DIM}   0 │{'─' * len(visible_hist)}{self.RESET}"
                else:
                    line = f"  {self.DIM}{row_val:>4.1f} │{self.RESET}"
                    for i, h in enumerate(visible_hist):
                        h_pos = int(h / max_macd * macd_rows) if max_macd > 0 else 0
                        if h_pos == row and h > 0:
                            line += f"{self.GREEN}█{self.RESET}"
                        elif h_pos == row and h < 0:
                            line += f"{self.RED}█{self.RESET}"
                        else:
                            line += " "
                print(line)
            print()

    def _render_order_book(self, exchange: SimulatedExchange, symbol: str) -> None:
        """Render order book depth visualization."""
        ob = exchange.get_order_book(symbol)
        if not ob.bids or not ob.asks:
            return

        print(f"  {self.BOLD}Order Book:{self.RESET}")
        print(f"    {'Price':>12}  {'Quantity':>12}  │  {'Price':>12}  {'Quantity':>12}")
        print(f"    {'─' * 12}  {'─' * 12}  │  {'─' * 12}  {'─' * 12}")

        rows = min(10, len(ob.bids), len(ob.asks))
        for i in range(rows):
            bid = ob.bids[i]
            ask = ob.asks[i]
            print(
                f"    {self.GREEN}{bid.price:>12.2f}{self.RESET}  "
                f"{self.GREEN}{bid.quantity:>12.4f}{self.RESET}  │  "
                f"{self.RED}{ask.price:>12.2f}{self.RESET}  "
                f"{self.RED}{ask.quantity:>12.4f}{self.RESET}"
            )

        spread = ob.spread
        spread_bps = (spread / ob.mid_price * 10000) if ob.mid_price > 0 else 0
        print()
        print(f"    {self.DIM}Spread: {spread:.2f} ({spread_bps:.1f} bps)  "
              f"Mid: {ob.mid_price:.2f}{self.RESET}")
        print()

    def _render_account_tab(self) -> None:
        """Render account overview: balance, positions, trades."""
        print(f"  {self.BOLD}Account Overview{self.RESET}\n")

        for ex_id, exchange in self.exchanges.items():
            status = exchange.get_account_status()
            balance = status["balance"]
            equity = status["equity"]
            pnl = status["total_pnl"]
            fees = status["total_fees"]
            trades = status["total_trades"]
            win_rate = status["win_rate"]
            positions = status["positions"]

            pnl_color = self.GREEN if pnl >= 0 else self.RED
            eq_color = self.CYAN

            print(f"  {self.BOLD}{self.BG_GRAY} {ex_id.upper()} {self.RESET}  "
                  f"Balance: {self.YELLOW}${balance:,.2f}{self.RESET}  "
                  f"Equity: {eq_color}${equity:,.2f}{self.RESET}  "
                  f"PnL: {pnl_color}${pnl:+,.2f}{self.RESET}  "
                  f"Fees: {self.DIM}${fees:.2f}{self.RESET}")
            print(f"  Trades: {trades}  Win Rate: {win_rate:.1f}%  "
                  f"Open Positions: {len(positions)}")

            # Equity curve sparkline
            eq_history = self._equity_history.get(ex_id, [])
            if len(eq_history) >= 5:
                self._render_equity_sparkline(eq_history, balance)

            print()

            if positions:
                print(f"    {self.BOLD}Open Positions:{self.RESET}")
                print(f"    {'Symbol':<12} {'Side':<6} {'Qty':>10} {'Entry':>12} "
                      f"{'SL':>12} {'TP':>12} {'uPnL':>12} {'uPnL%':>8}")
                print(f"    {'─' * 90}")

                for p in positions:
                    side_color = self.GREEN if p["side"] == "BUY" else self.RED
                    upnl = p["unrealized_pnl"]
                    upnl_color = self.GREEN if upnl >= 0 else self.RED
                    upnl_pct = (upnl / (p["entry_price"] * p["quantity"]) * 100) if p["quantity"] > 0 else 0

                    print(
                        f"    {p['symbol']:<12} {side_color}{p['side']:<6}{self.RESET} "
                        f"{p['quantity']:>10.4f} {p['entry_price']:>12.2f} "
                        f"{p['stop_loss']:>12.2f} {p['take_profit']:>12.2f} "
                        f"{upnl_color}{upnl:>+12.2f}{self.RESET} "
                        f"{upnl_color}{upnl_pct:>+7.2f}%{self.RESET}"
                    )
            else:
                print(f"    {self.DIM}No open positions{self.RESET}")

            orders = exchange.get_order_history(10)
            if orders:
                print()
                print(f"    {self.BOLD}Recent Orders:{self.RESET}")
                print(f"    {'Symbol':<12} {'Side':<6} {'Type':<8} {'Qty':>10} "
                      f"{'Fill Price':>12} {'Fee':>8} {'Status':<10}")
                print(f"    {'─' * 80}")

                for o in reversed(orders):
                    side_color = self.GREEN if o.side.value == "BUY" else self.RED
                    status_color = self.GREEN if o.status.value == "FILLED" else self.RED
                    print(
                        f"    {o.symbol:<12} {side_color}{o.side.value:<6}{self.RESET} "
                        f"{o.order_type.value:<8} {o.filled_quantity:>10.4f} "
                        f"{o.filled_price:>12.2f} {o.fee:>8.4f} "
                        f"{status_color}{o.status.value:<10}{self.RESET}"
                    )

            print()
            print(f"  {'─' * 82}")
            print()

    def _render_equity_sparkline(self, history: list[float], initial_balance: float) -> None:
        """Render an ASCII equity curve sparkline."""
        n = len(history)
        if n < 2:
            return

        eq_min = min(history)
        eq_max = max(history)
        eq_range = eq_max - eq_min if eq_max > eq_min else 1

        spark_height = 5
        spark_width = min(n, 70)

        # Sample history to fit spark_width
        if n > spark_width:
            step = n / spark_width
            sampled = []
            for i in range(spark_width):
                idx = int(i * step)
                sampled.append(history[idx])
            sampled.append(history[-1])
            history = sampled
            n = len(history)

        # Determine color based on trend
        trend = history[-1] - history[0]
        if trend > 0:
            line_color = self.GREEN
        elif trend < 0:
            line_color = self.RED
        else:
            line_color = self.YELLOW

        # Build sparkline grid
        print(f"    {self.DIM}Equity Curve:{self.RESET}  "
              f"{line_color}${history[-1]:,.2f}{self.RESET}  "
              f"{self.DIM}({('▲' if trend > 0 else '▼' if trend < 0 else '─')} "
              f"{abs(trend):+.2f}){self.RESET}")

        for row in range(spark_height, 0, -1):
            row_val = eq_min + eq_range * row / spark_height
            line = f"    {self.DIM}{row_val:>10.2f} │{self.RESET}"

            for i in range(n):
                point_val = history[i]
                point_row = int((point_val - eq_min) / eq_range * spark_height) if eq_range > 0 else 0
                point_row = max(0, min(spark_height, point_row))

                if point_row == row:
                    line += f"{line_color}●{self.RESET}"
                elif point_row == row and i == n - 1:
                    line += f"{line_color}◉{self.RESET}"
                else:
                    line += " "

            print(line)

        # X-axis baseline
        print(f"    {'':>10} └{'─' * n}")
        print(f"    {self.DIM}Initial: ${initial_balance:,.2f}  "
              f"Min: ${eq_min:,.2f}  Max: ${eq_max:,.2f}  "
              f"Current: ${history[-1]:,.2f}{self.RESET}")

    def _render_footer(self) -> None:
        tickers = []
        for ex_id, exchange in self.exchanges.items():
            for symbol in exchange.symbols:
                price = exchange.get_price(symbol)
                tickers.append(f"{symbol.split('/')[0]}: ${price:,.2f}")

        ticker_str = "  │  ".join(tickers)
        print(f"  {self.DIM}{'─' * 82}{self.RESET}")
        print(f"  {self.CYAN}{ticker_str}{self.RESET}")
        print()
        print(f"  {self.DIM}[1] BTC  [2] ETH  [3] SOL  [A] Account  [Q] Quit  "
              f"│  ← → Switch tabs  │  Frame: {self._frame}{self.RESET}")


# Backward compatibility alias
TerminalVisualizer = TabbedVisualizer
