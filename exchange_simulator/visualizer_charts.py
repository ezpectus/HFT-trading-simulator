"""Chart rendering mixin for TabbedVisualizer.

Extracted from visualizer.py for file-size compliance.
Contains candle chart, volume bars, and technical indicator rendering.
"""
from exchange_simulator.models import Candle


class ChartMixin:
    """Mixin providing chart and indicator rendering for TabbedVisualizer."""

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

    def _render_indicators(self, exchange, candles: list[Candle], symbol: str) -> None:
        """Render indicator values + mini-charts (RSI, MACD, FFT regime)."""
        closes = [c.close for c in candles]

        ema9 = self._ema_calc(closes, 9)
        ema21 = self._ema_calc(closes, 21)
        ema_trend = "BULL" if ema9 > ema21 else "BEAR"
        ema_color = self.GREEN if ema9 > ema21 else self.RED

        rsi_val = self._rsi_calc(closes)
        if rsi_val >= 70:
            rsi_color = self.RED
            rsi_label = "OVERBOUGHT"
        elif rsi_val <= 30:
            rsi_color = self.GREEN
            rsi_label = "OVERSOLD"
        else:
            rsi_color = self.YELLOW
            rsi_label = "NEUTRAL"

        atr_val = self._atr_calc(candles)

        macd_line, macd_sig, macd_hist = self._macd_calc(closes)
        macd_color = self.GREEN if macd_hist >= 0 else self.RED

        bb_upper, bb_mid, bb_lower = self._bb_calc(closes)
        bb_pos = "UPPER" if closes[-1] >= bb_upper else "LOWER" if closes[-1] <= bb_lower else "MID"
        bb_color = self.RED if bb_pos == "UPPER" else self.GREEN if bb_pos == "LOWER" else self.DIM

        fft_regime, fft_color = self._fft_regime(closes)

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

        self._render_rsi_mini_chart(closes)
        self._render_macd_mini_chart(closes)

    @staticmethod
    def _ema_calc(values, period):
        if len(values) < period:
            return 0
        mult = 2 / (period + 1)
        result = sum(values[:period]) / period
        for v in values[period:]:
            result = v * mult + result * (1 - mult)
        return result

    @staticmethod
    def _ema_series(values, period):
        if len(values) < period:
            return [0] * len(values)
        mult = 2 / (period + 1)
        result = [0.0] * len(values)
        result[period - 1] = sum(values[:period]) / period
        for i in range(period, len(values)):
            result[i] = values[i] * mult + result[i - 1] * (1 - mult)
        return result

    @staticmethod
    def _rsi_calc(values, period=14):
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

    @staticmethod
    def _rsi_series(values, period=14):
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

    @staticmethod
    def _atr_calc(candles_list, period=14):
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

    def _macd_calc(self, values, fast=12, slow=26, signal=9):
        if len(values) < slow + signal:
            return 0, 0, 0
        ema_f = self._ema_series(values, fast)
        ema_s = self._ema_series(values, slow)
        macd_line = [ema_f[i] - ema_s[i] for i in range(len(values))]
        sig = self._ema_series(macd_line[slow - 1:], signal)
        sig_full = [0.0] * (slow - 1) + sig
        hist = [macd_line[i] - sig_full[i] for i in range(len(values))]
        return macd_line[-1], sig_full[-1], hist[-1]

    @staticmethod
    def _bb_calc(values, period=20, std_dev=2.0):
        if len(values) < period:
            return 0, 0, 0
        window = values[-period:]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        sd = variance ** 0.5
        return mean + std_dev * sd, mean, mean - std_dev * sd

    def _fft_regime(self, closes):
        """Simplified FFT regime detection."""
        fft_regime = "—"
        fft_color = self.DIM
        if len(closes) >= 64:
            import math as m
            n = len(closes)
            mean_price = sum(closes) / n
            detrended = [c - mean_price for c in closes]
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
        return fft_regime, fft_color

    def _render_rsi_mini_chart(self, closes):
        """Render RSI mini-chart."""
        if len(closes) < 15:
            return
        rsi_vals = self._rsi_series(closes)
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

    def _render_macd_mini_chart(self, closes):
        """Render MACD mini-chart."""
        if len(closes) < 40:
            return
        ema_f = self._ema_series(closes, 12)
        ema_s = self._ema_series(closes, 26)
        macd_full = [ema_f[i] - ema_s[i] for i in range(len(closes))]
        sig_full = self._ema_series(macd_full[25:], 9) if len(macd_full) > 34 else [0]
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
                for _i, h in enumerate(visible_hist):
                    h_pos = int(h / max_macd * macd_rows) if max_macd > 0 else 0
                    if h_pos == row and h > 0:
                        line += f"{self.GREEN}█{self.RESET}"
                    elif h_pos == row and h < 0:
                        line += f"{self.RED}█{self.RESET}"
                    else:
                        line += " "
            print(line)
        print()
