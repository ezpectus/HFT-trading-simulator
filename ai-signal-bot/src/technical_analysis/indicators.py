"""Technical analysis indicators — RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP.

Pure functions operating on lists of candle dicts or Candle objects.
Returns lists aligned with input, NaN-padded where insufficient data.
Uses NumPy for vectorized computation when available (HFT-O20).
"""
import math

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False

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
    n = len(values)
    if n < period:
        return [NAN] * n
    if _HAS_NUMPY:
        arr = np.array(values, dtype=np.float64)
        result = np.full(n, NAN)
        cumsum = np.cumsum(arr)
        cumsum[period:] = cumsum[period:] - cumsum[:-period]
        result[period - 1:] = cumsum[period - 1:] / period
        return result.tolist()
    result = [NAN] * n
    for i in range(period - 1, n):
        result[i] = sum(values[i - period + 1 : i + 1]) / period
    return result


def ema(values: list[float], period: int) -> list[float]:
    n = len(values)
    if n < period:
        return [NAN] * n
    mult = 2 / (period + 1)
    if _HAS_NUMPY:
        arr = np.array(values, dtype=np.float64)
        result = np.full(n, NAN)
        result[period - 1] = arr[:period].mean()
        for i in range(period, n):
            result[i] = arr[i] * mult + result[i - 1] * (1 - mult)
        return result.tolist()
    result = [NAN] * n
    result[period - 1] = sum(values[:period]) / period
    for i in range(period, n):
        result[i] = values[i] * mult + result[i - 1] * (1 - mult)
    return result


def rsi(candles: list[dict], period: int = 14) -> list[float]:
    c = _closes(candles)
    n = len(c)
    if n < period + 1:
        return [NAN] * n
    if _HAS_NUMPY:
        arr = np.array(c, dtype=np.float64)
        diffs = np.diff(arr)
        gains = np.where(diffs > 0, diffs, 0.0)
        losses = np.where(diffs < 0, -diffs, 0.0)
        avg_gain = gains[:period].mean()
        avg_loss = losses[:period].mean()
        result = np.full(n, NAN)
        result[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
        for i in range(period + 1, n):
            avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period
            result[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
        return result.tolist()
    gains, losses = [], []
    for i in range(1, period + 1):
        change = c[i] - c[i - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    result = [NAN] * n
    result[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, n):
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
    n = len(c)
    mid = sma(c, period)
    upper = [NAN] * n
    lower = [NAN] * n
    if _HAS_NUMPY and n >= period:
        arr = np.array(c, dtype=np.float64)
        for i in range(period - 1, n):
            window = arr[i - period + 1 : i + 1]
            sd = window.std()
            upper[i] = mid[i] + std_dev * sd
            lower[i] = mid[i] - std_dev * sd
        return mid, upper, lower
    for i in range(period - 1, n):
        window = c[i - period + 1 : i + 1]
        mean = mid[i]
        variance = sum((x - mean) ** 2 for x in window) / period
        sd = math.sqrt(variance)
        upper[i] = mean + std_dev * sd
        lower[i] = mean - std_dev * sd
    return mid, upper, lower


def atr(candles: list[dict], period: int = 14) -> list[float]:
    n = len(candles)
    if n < period + 1:
        return [NAN] * n
    h = _highs(candles)
    low = _lows(candles)
    cl = _closes(candles)
    if _HAS_NUMPY:
        ha = np.array(h, dtype=np.float64)
        la = np.array(low, dtype=np.float64)
        ca = np.array(cl, dtype=np.float64)
        tr = np.full(n, NAN)
        tr[1:] = np.maximum(ha[1:] - la[1:], np.maximum(np.abs(ha[1:] - ca[:-1]), np.abs(la[1:] - ca[:-1])))
        result = np.full(n, NAN)
        result[period] = tr[1 : period + 1].sum() / period
        for i in range(period + 1, n):
            result[i] = (result[i - 1] * (period - 1) + tr[i]) / period
        return result.tolist()
    tr = [NAN] * n
    for i in range(1, n):
        tr[i] = max(h[i] - low[i], abs(h[i] - cl[i - 1]), abs(low[i] - cl[i - 1]))
    result = [NAN] * n
    result[period] = sum(tr[1 : period + 1]) / period
    for i in range(period + 1, n):
        result[i] = (result[i - 1] * (period - 1) + tr[i]) / period
    return result


def vwap(candles: list[dict]) -> list[float]:
    n = len(candles)
    if _HAS_NUMPY and n > 0:
        h = np.array(_highs(candles), dtype=np.float64)
        low = np.array(_lows(candles), dtype=np.float64)
        cl = np.array(_closes(candles), dtype=np.float64)
        v = np.array(_volumes(candles), dtype=np.float64)
        tp = (h + low + cl) / 3.0
        cum_pv = np.cumsum(tp * v)
        cum_v = np.cumsum(v)
        result = np.where(cum_v > 0, cum_pv / np.where(cum_v == 0, 1, cum_v), NAN)
        return result.tolist()
    result = [NAN] * n
    cum_pv, cum_v = 0.0, 0.0
    for i, c in enumerate(candles):
        h = c["high"] if isinstance(c, dict) else c.high
        low = c["low"] if isinstance(c, dict) else c.low
        cl = c["close"] if isinstance(c, dict) else c.close
        v = c["volume"] if isinstance(c, dict) else c.volume
        tp = (h + low + cl) / 3
        cum_pv += tp * v
        cum_v += v
        if cum_v > 0:
            result[i] = cum_pv / cum_v
    return result


def adx(candles: list[dict], period: int = 14) -> list[float]:
    n = len(candles)
    if n < period * 2 + 1:
        return [NAN] * n
    h = _highs(candles)
    low = _lows(candles)
    cl = _closes(candles)
    if _HAS_NUMPY:
        ha = np.array(h, dtype=np.float64)
        la = np.array(low, dtype=np.float64)
        ca = np.array(cl, dtype=np.float64)
        up = ha[1:] - ha[:-1]
        down = la[:-1] - la[1:]
        plus_dm = np.where((up > down) & (up > 0), up, 0.0)
        minus_dm = np.where((down > up) & (down > 0), down, 0.0)
        tr = np.maximum(ha[1:] - la[1:], np.maximum(np.abs(ha[1:] - ca[:-1]), np.abs(la[1:] - ca[:-1])))
        atr_w = np.full(n, NAN)
        pdm_w = np.full(n, NAN)
        mdm_w = np.full(n, NAN)
        atr_w[period] = tr[:period].sum()
        pdm_w[period] = plus_dm[:period].sum()
        mdm_w[period] = minus_dm[:period].sum()
        for i in range(period + 1, n):
            atr_w[i] = atr_w[i - 1] - atr_w[i - 1] / period + tr[i - 1]
            pdm_w[i] = pdm_w[i - 1] - pdm_w[i - 1] / period + plus_dm[i - 1]
            mdm_w[i] = mdm_w[i - 1] - mdm_w[i - 1] / period + minus_dm[i - 1]
        dx = np.full(n, NAN)
        for i in range(period, n):
            if not np.isnan(atr_w[i]) and atr_w[i] > 0:
                pdi = 100 * pdm_w[i] / atr_w[i]
                mdi = 100 * mdm_w[i] / atr_w[i]
                denom = pdi + mdi
                if denom > 0:
                    dx[i] = 100 * abs(pdi - mdi) / denom
        result = np.full(n, NAN)
        dx_start = next((i for i, v in enumerate(dx) if not (isinstance(v, float) and math.isnan(v))), -1)
        if dx_start >= 0 and dx_start + period <= n:
            result[dx_start + period - 1] = sum(dx[dx_start : dx_start + period]) / period
            for i in range(dx_start + period, n):
                if not (isinstance(dx[i], float) and math.isnan(dx[i])):
                    result[i] = (result[i - 1] * (period - 1) + dx[i]) / period
        return result.tolist()
    plus_dm = [0.0] * n
    minus_dm = [0.0] * n
    tr = [0.0] * n
    for i in range(1, n):
        up = h[i] - h[i - 1]
        down = low[i - 1] - low[i]
        plus_dm[i] = up if (up > down and up > 0) else 0
        minus_dm[i] = down if (down > up and down > 0) else 0
        tr[i] = max(h[i] - low[i], abs(h[i] - cl[i - 1]), abs(low[i] - cl[i - 1]))
    atr_w = [NAN] * n
    pdm_w = [NAN] * n
    mdm_w = [NAN] * n
    atr_w[period] = sum(tr[1 : period + 1])
    pdm_w[period] = sum(plus_dm[1 : period + 1])
    mdm_w[period] = sum(minus_dm[1 : period + 1])
    for i in range(period + 1, n):
        atr_w[i] = atr_w[i - 1] - atr_w[i - 1] / period + tr[i]
        pdm_w[i] = pdm_w[i - 1] - pdm_w[i - 1] / period + plus_dm[i]
        mdm_w[i] = mdm_w[i - 1] - mdm_w[i - 1] / period + minus_dm[i]
    dx = [NAN] * n
    for i in range(period, n):
        if not math.isnan(atr_w[i]) and atr_w[i] > 0:
            pdi = 100 * pdm_w[i] / atr_w[i]
            mdi = 100 * mdm_w[i] / atr_w[i]
            denom = pdi + mdi
            if denom > 0:
                dx[i] = 100 * abs(pdi - mdi) / denom
    result = [NAN] * n
    dx_start = next((i for i, v in enumerate(dx) if not math.isnan(v)), -1)
    if dx_start >= 0 and dx_start + period <= len(dx):
        result[dx_start + period - 1] = sum(dx[dx_start : dx_start + period]) / period
        for i in range(dx_start + period, len(dx)):
            if not math.isnan(dx[i]):
                result[i] = (result[i - 1] * (period - 1) + dx[i]) / period
    return result
