import { useMemo, useState } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function PointAndFigure({ candles, symbol, exchange }) {
  const [boxSize, setBoxSize] = useState(0)
  const [reverseBoxes, setReverseBoxes] = useState(3)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)
    if (symCandles.length < 10) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)

    // Auto box size: ATR-based
    const atrPeriod = Math.min(14, symCandles.length - 1)
    let atr = 0
    for (let i = 1; i <= atrPeriod; i++) {
      atr += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    }
    atr /= atrPeriod
    const autoBox = atr / 3 || closes[0] * 0.002
    const size = boxSize > 0 ? boxSize : autoBox
    const reverseThreshold = size * reverseBoxes

    // Build P&F columns
    const columns = []
    let currentDir = 0 // 1 = up (X), -1 = down (O)
    let currentPrice = closes[0]
    let colStart = currentPrice

    // First column
    const firstBox = Math.floor(currentPrice / size) * size
    columns.push({ dir: 0, boxes: [firstBox], startIdx: 0 })

    for (let i = 1; i < closes.length; i++) {
      const price = closes[i]
      const lastCol = columns[columns.length - 1]

      if (lastCol.dir === 0) {
        // Determine initial direction
        if (price - currentPrice >= reverseThreshold) {
          lastCol.dir = 1
          let box = Math.floor(currentPrice / size) * size + size
          while (box <= price) {
            lastCol.boxes.push(box)
            box += size
          }
          currentPrice = price
        } else if (currentPrice - price >= reverseThreshold) {
          lastCol.dir = -1
          let box = Math.floor(currentPrice / size) * size - size
          while (box >= price) {
            lastCol.boxes.push(box)
            box -= size
          }
          currentPrice = price
        }
      } else if (lastCol.dir === 1) {
        // Up trend — add X boxes
        if (price - currentPrice >= size) {
          let box = currentPrice + size
          while (box <= price) {
            lastCol.boxes.push(Math.floor(box / size) * size)
            box += size
          }
          currentPrice = price
        } else if (currentPrice - price >= reverseThreshold) {
          // Reversal to O
          columns.push({ dir: -1, boxes: [], startIdx: i })
          const newCol = columns[columns.length - 1]
          let box = currentPrice - size
          while (box >= price) {
            newCol.boxes.push(Math.floor(box / size) * size)
            box -= size
          }
          currentPrice = price
        }
      } else if (lastCol.dir === -1) {
        // Down trend — add O boxes
        if (currentPrice - price >= size) {
          let box = currentPrice - size
          while (box >= price) {
            lastCol.boxes.push(Math.floor(box / size) * size)
            box -= size
          }
          currentPrice = price
        } else if (price - currentPrice >= reverseThreshold) {
          // Reversal to X
          columns.push({ dir: 1, boxes: [], startIdx: i })
          const newCol = columns[columns.length - 1]
          let box = currentPrice + size
          while (box <= price) {
            newCol.boxes.push(Math.floor(box / size) * size)
            box += size
          }
          currentPrice = price
        }
      }
    }

    if (columns.length === 0) return null

    // Show last 15 columns
    const visible = columns.slice(-15)
    const allBoxes = visible.flatMap(c => c.boxes)
    const minBox = Math.min(...allBoxes)
    const maxBox = Math.max(...allBoxes)
    const boxCount = Math.floor((maxBox - minBox) / size) + 1

    // Build grid
    const grid = []
    for (let row = 0; row < Math.min(boxCount, 25); row++) {
      const price = maxBox - row * size
      const cells = visible.map(col => {
        if (col.boxes.includes(Math.floor(price / size) * size)) {
          return col.dir === 1 ? 'X' : 'O'
        }
        return null
      })
      grid.push({ price, cells })
    }

    // Signals
    const lastCol = visible[visible.length - 1]
    const prevCol = visible[visible.length - 2]
    const reversal = prevCol && lastCol.dir !== prevCol.dir && lastCol.dir !== 0

    // Double top / double bottom
    const xCols = visible.filter(c => c.dir === 1)
    const oCols = visible.filter(c => c.dir === -1)
    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (xCols.length >= 2) {
      const tops = xCols.map(c => Math.max(...c.boxes))
      const lastTop = tops[tops.length - 1]
      const prevTop = tops[tops.length - 2]
      if (lastTop > prevTop) { signal = 'Double Top Breakout'; signalColor = 'text-accent-green' }
    }
    if (oCols.length >= 2) {
      const bottoms = oCols.map(c => Math.min(...c.boxes))
      const lastBot = bottoms[bottoms.length - 1]
      const prevBot = bottoms[bottoms.length - 2]
      if (lastBot < prevBot && signal === 'Neutral') { signal = 'Double Bottom Breakdown'; signalColor = 'text-accent-red' }
    }

    return { grid, visible, size, autoBox, reversal, signal, signalColor, lastDir: lastCol.dir }
  }, [candles, symbol, exchange, boxSize, reverseBoxes])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-teal" />
          Point & Figure
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { grid, visible, size, autoBox, reversal, signal, signalColor, lastDir } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-teal" />
        Point & Figure Chart
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-2 text-[8px]">
        <span className="text-gray-600">Box:</span>
        <input
          type="number"
          value={boxSize || ''}
          placeholder={autoBox.toFixed(2)}
          onChange={e => setBoxSize(Number(e.target.value) || 0)}
          className="w-14 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none focus:border-accent-blue"
        />
        <span className="text-gray-600">Rev:</span>
        <input
          type="number"
          value={reverseBoxes}
          onChange={e => setReverseBoxes(Number(e.target.value) || 3)}
          className="w-10 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none focus:border-accent-blue"
        />
      </div>

      {/* P&F Grid */}
      <div className="overflow-x-auto scrollbar-thin">
        <div className="inline-block">
          {grid.map((row, ri) => (
            <div key={ri} className="flex items-center text-[8px] font-mono">
              <span className="text-gray-700 w-12 text-right pr-1">{formatPrice(row.price)}</span>
              {row.cells.map((cell, ci) => (
                <span
                  key={ci}
                  className={
                    'w-3 h-3 flex items-center justify-center ' +
                    (cell === 'X' ? 'text-accent-green' : cell === 'O' ? 'text-accent-red' : 'text-gray-800')
                  }
                >
                  {cell || '·'}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Signal */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {lastDir === 1 ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
          <span className="text-[8px] text-gray-600">{lastDir === 1 ? 'Up column' : 'Down column'}</span>
        </div>
        <span className={'text-[9px] font-medium ' + signalColor}>{signal}</span>
      </div>

      {reversal && (
        <div className="mt-1 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5">
          <span className="text-[8px] text-accent-yellow">Column reversal detected</span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        P&F filters noise. X = rising, O = falling. Reversal needs {reverseBoxes} boxes.
      </div>
    </div>
  )
}
