"""Technical analysis indicators — RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP.

Pure functions operating on lists of candle dicts or Candle objects.
Returns lists aligned with input, NaN-padded where insufficient data.
"""
import math
from typing import Any

NAN = float("nan")


def _closes(candles: list[dict]) -> list[float]:
    return [c["close"] if isinstance(c, dict) else c.close for c in candles]


def _highs(candles: list[dict]) -> list[float]:
    return [c["high"] if isinstance(c, dict) else c.high for c in candles]


def _lows(candles: list[dict]) -> list[float]:
    return [c["low"] if isinstance(c, dict) else c.low for c in candles]


def _volumes(candles: list[dict]) -> list[float]:
    return [c["volume"] if isinstance(c, dict) else c.volume for c in candles]


def sma(values: list[float], period: int) -> list[float]:
    result = [NAN] * len(values)
    for i in range(period - 1, len(values)):
        result[i] = sum(values[i - period + 1 : i + 1]) / period
    return result


def ema(values: list[float], period: int) -> list[float]:
    result = [NAN] * len(values)
    if len(values) < period:
        return result
    mult = 2 / (period + 1)
    result[period - 1] = sum(values[:period]) / period
    for i in range(period, len(values)):
        result[i] = values[i] * mult + result[i - 1] * (1 - mult)
    return result


def rsi(candles: list[dict], period: int = 14) -> list[float]:
    c = _closes(candles)
    result = [NAN] * len(c)
    if len(c) < period + 1:
        return result

    gains, losses = [], []
    for i in range(1, period + 1):
        change = c[i] - c[i - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    result[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)

    for i in range(period + 1, len(c)):
        change = c[i] - c[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(change, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-change, 0)) / period
        result[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)

    return result


def macd(
    candles: list[dict], fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[list[float], list[float], list[float]]:
    c = _closes(candles)
    ema_fast = ema(c, fast)
    ema_slow = ema(c, slow)

    macd_line = [NAN] * len(c)
    for i in range(len(c)):
        if not math.isnan(ema_fast[i]) and not math.isnan(ema_slow[i]):
            macd_line[i] = ema_fast[i] - ema_slow[i]

    valid_start = next((i for i, v in enumerate(macd_line) if not math.isnan(v)), len(c))
    valid = macd_line[valid_start:]
    sig_valid = ema(valid, signal) if len(valid) >= signal else [NAN] * len(valid)

    signal_line = [NAN] * len(c)
    signal_line[valid_start:] = sig_valid

    histogram = [NAN] * len(c)
    for i in range(len(c)):
        if not math.isnan(macd_line[i]) and not math.isnan(signal_line[i]):
            histogram[i] = macd_line[i] - signal_line[i]

    return macd_line, signal_line, histogram


def bollinger_bands(
    candles: list[dict], period: int = 20, std_dev: float = 2.0
) -> tuple[list[float], list[float], list[float]]:
    c = _closes(candles)
    mid = sma(c, period)
    upper = [NAN] * len(c)
    lower = [NAN] * len(c)

    for i in range(period - 1, len(c)):
        window = c[i - period + 1 : i + 1]
        mean = mid[i]
        variance = sum((x - mean) ** 2 for x in window) / period
        sd = math.sqrt(variance)
        upper[i] = mean + std_dev * sd
        lower[i] = mean - std_dev * sd

    return mid, upper, lower


def atr(candles: list[dict], period: int = 14) -> list[float]:
    if len(candles) < period + 1:
        return [NAN] * len(candles)

    h = _highs(candles)
    l = _lows(candles)
    cl = _closes(candles)

    tr = [NAN] * len(candles)
    for i in range(1, len(candles)):
        tr[i] = max(
            h[i] - l[i],
            abs(h[i] - cl[i - 1]),
            abs(l[i] - cl[i - 1]),
        )

    result = [NAN] * len(candles)
    result[period] = sum(tr[1 : period + 1]) / period
    for i in range(period + 1, len(candles)):
        result[i] = (result[i - 1] * (period - 1) + tr[i]) / period

    return result


def vwap(candles: list[dict]) -> list[float]:
    result = [NAN] * len(candles)
    cum_pv, cum_v = 0.0, 0.0
    for i, c in enumerate(candles):
        h = c["high"] if isinstance(c, dict) else c.high
        l = c["low"] if isinstance(c, dict) else c.low
        cl = c["close"] if isinstance(c, dict) else c.close
        v = c["volume"] if isinstance(c, dict) else c.volume
        tp = (h + l + cl) / 3
        cum_pv += tp * v
        cum_v += v
        if cum_v > 0:
            result[i] = cum_pv / cum_v
    return result


def adx(candles: list[dict], period: int = 14) -> list[float]:
    if len(candles) < period * 2 + 1:
        return [NAN] * len(candles)

    h = _highs(candles)
    l = _lows(candles)
    cl = _closes(candles)

    plus_dm = [0.0] * len(candles)
    minus_dm = [0.0] * len(candles)
    tr = [0.0] * len(candles)

    for i in range(1, len(candles)):
        up = h[i] - h[i - 1]
        down = l[i - 1] - l[i]
        plus_dm[i] = up if (up > down and up > 0) else 0
        minus_dm[i] = down if (down > up and down > 0) else 0
        tr[i] = max(h[i] - l[i], abs(h[i] - cl[i - 1]), abs(l[i] - cl[i - 1]))

    atr_w = [NAN] * len(candles)
    pdm_w = [NAN] * len(candles)
    mdm_w = [NAN] * len(candles)

    atr_w[period] = sum(tr[1 : period + 1])
    pdm_w[period] = sum(plus_dm[1 : period + 1])
    mdm_w[period] = sum(minus_dm[1 : period + 1])

    for i in range(period + 1, len(candles)):
        atr_w[i] = atr_w[i - 1] - atr_w[i - 1] / period + tr[i]
        pdm_w[i] = pdm_w[i - 1] - pdm_w[i - 1] / period + plus_dm[i]
        mdm_w[i] = mdm_w[i - 1] - mdm_w[i - 1] / period + minus_dm[i]

    dx = [NAN] * len(candles)
    for i in range(period, len(candles)):
        if not math.isnan(atr_w[i]) and atr_w[i] > 0:
            pdi = 100 * pdm_w[i] / atr_w[i]
            mdi = 100 * mdm_w[i] / atr_w[i]
            denom = pdi + mdi
            if denom > 0:
                dx[i] = 100 * abs(pdi - mdi) / denom

    result = [NAN] * len(candles)
    dx_start = next((i for i, v in enumerate(dx) if not math.isnan(v)), -1)
    if dx_start >= 0 and dx_start + period <= len(dx):
        result[dx_start + period - 1] = sum(dx[dx_start : dx_start + period]) / period
        for i in range(dx_start + period, len(dx)):
            if not math.isnan(dx[i]):
                result[i] = (result[i - 1] * (period - 1) + dx[i]) / period

    return result
