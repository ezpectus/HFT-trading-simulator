/** Technical indicator calculations for chart overlays. */

/**
 * Calculate EMA (Exponential Moving Average) for a series of closes.
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - EMA period
 * @returns {number[]} EMA values (same length, NaN for first period-1)
 */
export function calcEMA(closes, period) {
  const k = 2 / (period + 1)
  const ema = new Array(closes.length).fill(NaN)
  if (closes.length < period) return ema

  // SMA seed
  let sma = 0
  for (let i = 0; i < period; i++) sma += closes[i]
  sma /= period
  ema[period - 1] = sma

  for (let i = period; i < closes.length; i++) {
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k)
  }
  return ema
}

/**
 * Calculate RSI (Relative Strength Index).
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number[]} RSI values (0-100, NaN for first period)
 */
export function calcRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(NaN)
  if (closes.length < period + 1) return rsi

  let avgGain = 0
  let avgLoss = 0

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  // Smoothed RSI
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change >= 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }

  return rsi
}

/**
 * Calculate SMA (Simple Moving Average).
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - SMA period
 * @returns {number[]} SMA values
 */
export function calcSMA(closes, period) {
  const sma = new Array(closes.length).fill(NaN)
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]
    sma[i] = sum / period
  }
  return sma
}

/**
 * Calculate Bollinger Bands.
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - SMA period (default 20)
 * @param {number} stdDev - Standard deviation multiplier (default 2)
 * @returns {{upper: number[], middle: number[], lower: number[]}}
 */
export function calcBollingerBands(closes, period = 20, stdDev = 2) {
  const middle = calcSMA(closes, period)
  const upper = new Array(closes.length).fill(NaN)
  const lower = new Array(closes.length).fill(NaN)

  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (closes[j] - middle[i]) ** 2
    }
    const sd = Math.sqrt(sumSq / period)
    upper[i] = middle[i] + stdDev * sd
    lower[i] = middle[i] - stdDev * sd
  }

  return { upper, middle, lower }
}

/**
 * Calculate On-Balance Volume (OBV).
 * @param {number[]} closes - Closing prices
 * @param {number[]} volumes - Volume values
 * @returns {number[]} OBV values
 */
export function calcOBV(closes, volumes) {
  const obv = new Array(closes.length).fill(0)
  if (closes.length < 2) return obv
  obv[0] = volumes[0] || 0
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv[i] = obv[i - 1] + (volumes[i] || 0)
    else if (closes[i] < closes[i - 1]) obv[i] = obv[i - 1] - (volumes[i] || 0)
    else obv[i] = obv[i - 1]
  }
  return obv
}

/**
 * Calculate Money Flow Index (MFI).
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @param {number[]} volumes - Volume values
 * @param {number} period - MFI period (default 14)
 * @returns {number[]} MFI values (0-100)
 */
export function calcMFI(highs, lows, closes, volumes, period = 14) {
  const mfi = new Array(closes.length).fill(NaN)
  if (closes.length < period + 1) return mfi

  const tp = []
  for (let i = 0; i < closes.length; i++) {
    tp.push((highs[i] + lows[i] + closes[i]) / 3)
  }

  const mf = tp.map((v, i) => v * (volumes[i] || 0))

  for (let i = period; i < closes.length; i++) {
    let posFlow = 0, negFlow = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) posFlow += mf[j]
      else if (tp[j] < tp[j - 1]) negFlow += mf[j]
    }
    mfi[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow)
  }
  return mfi
}

/**
 * Calculate Williams %R.
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @param {number} period - Lookback period (default 14)
 * @returns {number[]} Williams %R values (-100 to 0)
 */
export function calcWilliamsR(highs, lows, closes, period = 14) {
  const wr = new Array(closes.length).fill(NaN)
  for (let i = period - 1; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j]
      if (lows[j] < ll) ll = lows[j]
    }
    const range = hh - ll || 1
    wr[i] = ((hh - closes[i]) / range) * -100
  }
  return wr
}

/**
 * Calculate Ichimoku Cloud components.
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @returns {{tenkan: number[], kijun: number[], senkouA: number[], senkouB: number[], chikou: number[]}}
 */
export function calcIchimoku(highs, lows, closes) {
  const n = closes.length
  const tenkan = new Array(n).fill(NaN)
  const kijun = new Array(n).fill(NaN)
  const senkouA = new Array(n).fill(NaN)
  const senkouB = new Array(n).fill(NaN)
  const chikou = new Array(n).fill(NaN)

  const midpoint = (h, l) => (h + l) / 2

  for (let i = 0; i < n; i++) {
    // Tenkan-sen (9): highest high + lowest low / 2
    if (i >= 8) {
      let hh = -Infinity, ll = Infinity
      for (let j = i - 8; j <= i; j++) { if (highs[j] > hh) hh = highs[j]; if (lows[j] < ll) ll = lows[j] }
      tenkan[i] = midpoint(hh, ll)
    }
    // Kijun-sen (26): highest high + lowest low / 2
    if (i >= 25) {
      let hh = -Infinity, ll = Infinity
      for (let j = i - 25; j <= i; j++) { if (highs[j] > hh) hh = highs[j]; if (lows[j] < ll) ll = lows[j] }
      kijun[i] = midpoint(hh, ll)
    }
    // Senkou Span A (Tenkan + Kijun) / 2, shifted +26
    if (i >= 25 && i + 26 < n) {
      senkouA[i + 26] = midpoint(tenkan[i], kijun[i])
    }
    // Senkou Span B (52): highest high + lowest low / 2, shifted +26
    if (i >= 51 && i + 26 < n) {
      let hh = -Infinity, ll = Infinity
      for (let j = i - 51; j <= i; j++) { if (highs[j] > hh) hh = highs[j]; if (lows[j] < ll) ll = lows[j] }
      senkouB[i + 26] = midpoint(hh, ll)
    }
    // Chikou Span: close shifted -26
    if (i + 26 < n) {
      chikou[i + 26] = closes[i]
    }
  }
  return { tenkan, kijun, senkouA, senkouB, chikou }
}

/**
 * Calculate Stochastic Oscillator (%K and %D).
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @param {number} kPeriod - %K period (default 14)
 * @param {number} dPeriod - %D smoothing period (default 3)
 * @returns {{k: number[], d: number[]}}
 */
export function calcStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  const n = closes.length
  const k = new Array(n).fill(NaN)
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j]
      if (lows[j] < ll) ll = lows[j]
    }
    const range = hh - ll || 1
    k[i] = ((closes[i] - ll) / range) * 100
  }
  const d = calcSMA(k.map(v => isNaN(v) ? 0 : v), dPeriod)
  for (let i = 0; i < n; i++) {
    if (isNaN(k[i])) d[i] = NaN
  }
  return { k, d }
}

/**
 * Calculate Average True Range (ATR).
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @param {number} period - ATR period (default 14)
 * @returns {number[]} ATR values
 */
export function calcATR(highs, lows, closes, period = 14) {
  const n = closes.length
  const atr = new Array(n).fill(NaN)
  if (n < 2) return atr

  const tr = new Array(n).fill(0)
  tr[0] = highs[0] - lows[0]
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
  }

  // Wilder's smoothing
  if (n < period) return atr
  let sum = 0
  for (let i = 0; i < period; i++) sum += tr[i]
  atr[period - 1] = sum / period
  for (let i = period; i < n; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  }
  return atr
}

/**
 * Calculate Parabolic SAR (Stop and Reverse).
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number} step - AF step (default 0.02)
 * @param {number} maxStep - Max AF (default 0.2)
 * @returns {number[]} SAR values
 */
export function calcParabolicSAR(highs, lows, step = 0.02, maxStep = 0.2) {
  const n = highs.length
  const sar = new Array(n).fill(NaN)
  if (n < 2) return sar

  let bull = true
  let af = step
  let ep = lows[0]
  let sarVal = highs[0]

  for (let i = 1; i < n; i++) {
    sarVal = sarVal + af * (ep - sarVal)

    if (bull) {
      if (lows[i] < sarVal) {
        bull = false
        sarVal = ep
        af = step
        ep = lows[i]
      } else {
        if (highs[i] > ep) {
          ep = highs[i]
          af = Math.min(af + step, maxStep)
        }
        sarVal = Math.min(sarVal, lows[i - 1], lows[Math.max(i - 2, 0)])
      }
    } else {
      if (highs[i] > sarVal) {
        bull = true
        sarVal = ep
        af = step
        ep = highs[i]
      } else {
        if (lows[i] < ep) {
          ep = lows[i]
          af = Math.min(af + step, maxStep)
        }
        sarVal = Math.max(sarVal, highs[i - 1], highs[Math.max(i - 2, 0)])
      }
    }
    sar[i] = sarVal
  }
  return sar
}

/**
 * Calculate ADX with +DI and -DI (trend strength).
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @param {number} period - ADX period (default 14)
 * @returns {{adx: number[], pdi: number[], mdi: number[]}}
 */
export function calcADX(highs, lows, closes, period = 14) {
  const n = closes.length
  const adx = new Array(n).fill(NaN)
  const pdi = new Array(n).fill(NaN)
  const mdi = new Array(n).fill(NaN)
  if (n < period * 2) return { adx, pdi, mdi }

  const plusDM = new Array(n).fill(0)
  const minusDM = new Array(n).fill(0)
  const tr = new Array(n).fill(0)

  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1]
    const downMove = lows[i - 1] - lows[i]
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
  }

  // Wilder's smoothing
  let atr = 0, aPlusDM = 0, aMinusDM = 0
  for (let i = 1; i <= period; i++) {
    atr += tr[i]; aPlusDM += plusDM[i]; aMinusDM += minusDM[i]
  }
  atr /= period; aPlusDM /= period; aMinusDM /= period

  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period
    aPlusDM = (aPlusDM * (period - 1) + plusDM[i]) / period
    aMinusDM = (aMinusDM * (period - 1) + minusDM[i]) / period

    pdi[i] = atr > 0 ? (aPlusDM / atr) * 100 : 0
    mdi[i] = atr > 0 ? (aMinusDM / atr) * 100 : 0

    const dx = (pdi[i] + mdi[i]) > 0
      ? Math.abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i]) * 100 : 0

    if (i >= period * 2) {
      // Simple smoothing for ADX
      let dxSum = 0
      for (let j = i - period + 1; j <= i; j++) {
        const p = pdi[j], m = mdi[j]
        const d = (p + m) > 0 ? Math.abs(p - m) / (p + m) * 100 : 0
        dxSum += d
      }
      adx[i] = dxSum / period
    }
  }
  return { adx, pdi, mdi }
}

/**
 * Calculate Commodity Channel Index (CCI).
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @param {number[]} closes - Close prices
 * @param {number} period - CCI period (default 20)
 * @returns {number[]} CCI values
 */
export function calcCCI(highs, lows, closes, period = 20) {
  const n = closes.length
  const cci = new Array(n).fill(NaN)
  if (n < period) return cci

  for (let i = period - 1; i < n; i++) {
    let tpSum = 0
    const tps = []
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (highs[j] + lows[j] + closes[j]) / 3
      tps.push(tp)
      tpSum += tp
    }
    const tpMean = tpSum / period
    let meanDev = 0
    for (const tp of tps) meanDev += Math.abs(tp - tpMean)
    meanDev /= period
    const currentTP = (highs[i] + lows[i] + closes[i]) / 3
    cci[i] = meanDev !== 0 ? (currentTP - tpMean) / (0.015 * meanDev) : 0
  }
  return cci
}

/**
 * Calculate Awesome Oscillator.
 * @param {number[]} highs - High prices
 * @param {number[]} lows - Low prices
 * @returns {number[]} AO values
 */
export function calcAwesomeOscillator(highs, lows) {
  const n = highs.length
  const ao = new Array(n).fill(NaN)
  const midpoint = new Array(n).fill(0)
  for (let i = 0; i < n; i++) midpoint[i] = (highs[i] + lows[i]) / 2

  for (let i = 4; i < n; i++) {
    const fast = (midpoint[i] + midpoint[i - 1] + midpoint[i - 2] + midpoint[i - 3] + midpoint[i - 4]) / 5
    const slow = i >= 33
      ? (midpoint.slice(i - 33, i + 1).reduce((s, v) => s + v, 0)) / 34
      : NaN
    if (!isNaN(slow)) ao[i] = fast - slow
  }
  return ao
}

/**
 * Calculate MACD (Moving Average Convergence Divergence).
 * @param {number[]} closes - Close prices
 * @param {number} fast - Fast EMA period (default 12)
 * @param {number} slow - Slow EMA period (default 26)
 * @param {number} signal - Signal EMA period (default 9)
 * @returns {{macd: number[], signal: number[], histogram: number[]}}
 */
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const fastEMA = calcEMA(closes, fast)
  const slowEMA = calcEMA(closes, slow)
  const macd = new Array(closes.length).fill(NaN)
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) macd[i] = fastEMA[i] - slowEMA[i]
  }

  const validMacd = macd.filter(v => !isNaN(v))
  const signalLine = calcEMA(validMacd, signal)
  const signalArr = new Array(closes.length).fill(NaN)
  const firstValid = macd.findIndex(v => !isNaN(v))
  if (firstValid >= 0) {
    for (let i = 0; i < signalLine.length; i++) {
      signalArr[firstValid + i] = signalLine[i]
    }
  }

  const histogram = new Array(closes.length).fill(NaN)
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macd[i]) && !isNaN(signalArr[i])) histogram[i] = macd[i] - signalArr[i]
  }

  return { macd, signal: signalArr, histogram }
}

/**
 * Calculate Volume-Weighted MACD.
 * @param {number[]} closes - Close prices
 * @param {number[]} volumes - Volume values
 * @param {number} fast - Fast period (default 12)
 * @param {number} slow - Slow period (default 26)
 * @param {number} signal - Signal period (default 9)
 * @returns {{macd: number[], signal: number[], histogram: number[]}}
 */
export function calcVWAPMACD(closes, volumes, fast = 12, slow = 26, signal = 9) {
  const n = closes.length
  // Volume-weighted EMA
  function vwEMA(values, volumes, period) {
    const result = new Array(values.length).fill(NaN)
    if (values.length < period) return result
    let sumV = 0, sumPV = 0
    for (let i = 0; i < period; i++) {
      sumV += volumes[i] || 0
      sumPV += values[i] * (volumes[i] || 0)
    }
    result[period - 1] = sumV > 0 ? sumPV / sumV : values[period - 1]
    const k = 2 / (period + 1)
    for (let i = period; i < values.length; i++) {
      const v = volumes[i] || 0
      if (v > 0) {
        result[i] = values[i] * k + result[i - 1] * (1 - k)
      } else {
        result[i] = result[i - 1]
      }
    }
    return result
  }

  const fastEMA = vwEMA(closes, volumes, fast)
  const slowEMA = vwEMA(closes, volumes, slow)
  const macd = new Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) macd[i] = fastEMA[i] - slowEMA[i]
  }

  const validMacd = macd.filter(v => !isNaN(v))
  const signalLine = calcEMA(validMacd, signal)
  const signalArr = new Array(n).fill(NaN)
  const firstValid = macd.findIndex(v => !isNaN(v))
  if (firstValid >= 0) {
    for (let i = 0; i < signalLine.length; i++) {
      signalArr[firstValid + i] = signalLine[i]
    }
  }

  const histogram = new Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    if (!isNaN(macd[i]) && !isNaN(signalArr[i])) histogram[i] = macd[i] - signalArr[i]
  }

  return { macd, signal: signalArr, histogram }
}

/**
 * Convert candles to Heikin-Ashi format.
 * @param {Array} candles - Array of {open, high, low, close, volume}
 * @returns {Array} Heikin-Ashi candles
 */
export function toHeikinAshi(candles) {
  if (candles.length === 0) return []
  const ha = []
  ha[0] = {
    open: (candles[0].open + candles[0].close) / 2,
    close: (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4,
    high: candles[0].high,
    low: candles[0].low,
    volume: candles[0].volume,
    time: candles[0].time,
  }
  ha[0].high = Math.max(ha[0].open, ha[0].close, candles[0].high)
  ha[0].low = Math.min(ha[0].open, ha[0].close, candles[0].low)

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const prev = ha[i - 1]
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haOpen = (prev.open + prev.close) / 2
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)
    ha[i] = { open: haOpen, close: haClose, high: haHigh, low: haLow, volume: c.volume, time: c.time }
  }
  return ha
}
