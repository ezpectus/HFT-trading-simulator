/**
 * Candle selection helpers for the flat candle array.
 *
 * The exchange WS feed produces candles as a FLAT array:
 *   [{ exchange, symbol, timestamp, open, high, low, close, volume }, ...]
 *
 * Math/analysis panels receive it via the `candles` prop and must select
 * their exchange+symbol slice before computing.
 */

/** Select candles for one exchange+symbol pair from the flat array. */
export const selectCandles = (candles, exchange, symbol) =>
  (candles || []).filter(c => c.exchange === exchange && c.symbol === symbol)

/**
 * Group the flat candle array into { symbol: [candles] } for one exchange.
 * Use for multi-symbol panels that iterate over several symbols.
 */
export const groupCandles = (candles, exchange) => {
  const out = {}
  for (const c of candles || []) {
    if (c.exchange !== exchange) continue
    ;(out[c.symbol] ||= []).push(c)
  }
  return out
}
