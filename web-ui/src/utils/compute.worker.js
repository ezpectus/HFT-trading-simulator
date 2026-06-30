/**
 * Web Worker for heavy mathematical computations.
 * Offloads indicator calculations and matrix operations from the main thread.
 *
 * Usage:
 *   const worker = new Worker(new URL('./compute.worker.js', import.meta.url), { type: 'module' })
 *   worker.postMessage({ type: 'ema', data: closes, period: 14 })
 *   worker.onmessage = (e) => console.log(e.data.result)
 */

self.addEventListener('message', (e) => {
  const { type, data, id } = e.data
  let result

  try {
    switch (type) {
      case 'ema':
        result = calcEMA(data.closes, data.period)
        break
      case 'rsi':
        result = calcRSI(data.closes, data.period || 14)
        break
      case 'sma':
        result = calcSMA(data.closes, data.period)
        break
      case 'macd':
        result = calcMACD(data.closes, data.fast || 12, data.slow || 26, data.signal || 9)
        break
      case 'bollinger':
        result = calcBollingerBands(data.closes, data.period || 20, data.stdDev || 2)
        break
      case 'atr':
        result = calcATR(data.highs, data.lows, data.closes, data.period || 14)
        break
      case 'matrix_multiply':
        result = matmul(data.a, data.b)
        break
      case 'correlation':
        result = correlationMatrix(data.series)
        break
      case 'log_returns':
        result = calcLogReturns(data.closes)
        break
      default:
        result = null
    }

    self.postMessage({ id, type, result, error: null })
  } catch (err) {
    self.postMessage({ id, type, result: null, error: err.message })
  }
})

function calcEMA(closes, period) {
  const k = 2 / (period + 1)
  const ema = new Array(closes.length).fill(NaN)
  if (closes.length < period) return ema
  let sma = 0
  for (let i = 0; i < period; i++) sma += closes[i]
  sma /= period
  ema[period - 1] = sma
  for (let i = period; i < closes.length; i++) {
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k)
  }
  return ema
}

function calcRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(NaN)
  if (closes.length < period + 1) return rsi
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
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

function calcSMA(closes, period) {
  const sma = new Array(closes.length).fill(NaN)
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]
    sma[i] = sum / period
  }
  return sma
}

function calcMACD(closes, fast, slow, signal) {
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
    for (let i = 0; i < signalLine.length; i++) signalArr[firstValid + i] = signalLine[i]
  }
  const histogram = new Array(closes.length).fill(NaN)
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macd[i]) && !isNaN(signalArr[i])) histogram[i] = macd[i] - signalArr[i]
  }
  return { macd, signal: signalArr, histogram }
}

function calcBollingerBands(closes, period = 20, stdDev = 2) {
  const middle = calcSMA(closes, period)
  const upper = new Array(closes.length).fill(NaN)
  const lower = new Array(closes.length).fill(NaN)
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - middle[i]) ** 2
    const sd = Math.sqrt(sumSq / period)
    upper[i] = middle[i] + stdDev * sd
    lower[i] = middle[i] - stdDev * sd
  }
  return { upper, middle, lower }
}

function calcATR(highs, lows, closes, period = 14) {
  const n = closes.length
  const atr = new Array(n).fill(NaN)
  if (n < 2) return atr
  const tr = new Array(n).fill(0)
  tr[0] = highs[0] - lows[0]
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
  }
  if (n < period) return atr
  let sum = 0
  for (let i = 0; i < period; i++) sum += tr[i]
  atr[period - 1] = sum / period
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  return atr
}

function matmul(a, b) {
  const rows = a.length, cols = b[0].length, inner = b.length
  const result = new Array(rows)
  for (let i = 0; i < rows; i++) {
    result[i] = new Array(cols).fill(0)
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < inner; k++) {
        result[i][j] += a[i][k] * b[k][j]
      }
    }
  }
  return result
}

function correlationMatrix(series) {
  const n = series.length
  const m = series[0].length
  const means = series.map(s => s.reduce((a, b) => a + b, 0) / m)
  const stds = series.map((s, i) => {
    const variance = s.reduce((sum, v) => sum + (v - means[i]) ** 2, 0) / m
    return Math.sqrt(variance)
  })
  const corr = new Array(n)
  for (let i = 0; i < n; i++) {
    corr[i] = new Array(n).fill(0)
    for (let j = 0; j < n; j++) {
      if (i === j) { corr[i][j] = 1; continue }
      if (stds[i] === 0 || stds[j] === 0) { corr[i][j] = 0; continue }
      let cov = 0
      for (let k = 0; k < m; k++) cov += (series[i][k] - means[i]) * (series[j][k] - means[j])
      cov /= m
      corr[i][j] = cov / (stds[i] * stds[j])
    }
  }
  return corr
}

function calcLogReturns(closes) {
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]))
    }
  }
  return returns
}
