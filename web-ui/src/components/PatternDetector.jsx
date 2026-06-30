import { useMemo } from 'react'
import { Scan, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { detectCandlePatterns } from '../utils/patterns'
import { formatTime } from '../utils/format'

const PATTERN_COLORS = {
  DOJI: { color: 'text-gray-400', bg: 'bg-gray-500/10', icon: Minus },
  HAMMER: { color: 'text-accent-green', bg: 'bg-accent-green/10', icon: TrendingUp },
  SHOOTING_STAR: { color: 'text-accent-red', bg: 'bg-accent-red/10', icon: TrendingDown },
  BULLISH_ENGULFING: { color: 'text-accent-green', bg: 'bg-accent-green/10', icon: TrendingUp },
  BEARISH_ENGULFING: { color: 'text-accent-red', bg: 'bg-accent-red/10', icon: TrendingDown },
  THREE_SOLDIERS: { color: 'text-accent-green', bg: 'bg-accent-green/15', icon: TrendingUp },
  THREE_CROWS: { color: 'text-accent-red', bg: 'bg-accent-red/15', icon: TrendingDown },
}

const PATTERN_LABELS = {
  DOJI: 'Doji',
  HAMMER: 'Hammer',
  SHOOTING_STAR: 'Shooting Star',
  BULLISH_ENGULFING: 'Bullish Engulfing',
  BEARISH_ENGULFING: 'Bearish Engulfing',
  THREE_SOLDIERS: 'Three Soldiers',
  THREE_CROWS: 'Three Crows',
}

export default function PatternDetector({ candles, symbol }) {
  const patterns = useMemo(() => detectCandlePatterns(candles), [candles])

  const stats = useMemo(() => {
    const bullish = patterns.filter(p => p.direction === 'bullish').length
    const bearish = patterns.filter(p => p.direction === 'bearish').length
    const neutral = patterns.filter(p => p.direction === 'neutral').length
    return { bullish, bearish, neutral, total: patterns.length }
  }, [patterns])

  if (!candles || candles.length < 5) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Scan size={12} className="text-accent-purple" />
          Candle Patterns
        </div>
        <div className="text-center text-gray-600 text-[10px] py-2">
          Not enough data
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase">
          <Scan size={12} className="text-accent-purple" />
          Candle Patterns
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-accent-green">{stats.bullish}B</span>
          <span className="text-accent-red">{stats.bearish}S</span>
          <span className="text-gray-500">{stats.neutral}N</span>
        </div>
      </div>

      {patterns.length === 0 ? (
        <div className="text-center text-gray-600 text-[10px] py-2">
          No patterns detected
        </div>
      ) : (
        <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
          {patterns.slice(-10).reverse().map((p, i) => {
            const config = PATTERN_COLORS[p.type] || PATTERN_COLORS.DOJI
            const Icon = config.icon
            return (
              <div key={i} className={'flex items-center gap-2 rounded px-2 py-1 text-[10px] ' + config.bg}>
                <Icon size={10} className={config.color + ' shrink-0'} />
                <span className={config.color + ' font-medium'}>
                  {PATTERN_LABELS[p.type] || p.type}
                </span>
                <span className="text-gray-500 flex-1 truncate">
                  {p.confidence}%
                </span>
                <span className="text-gray-600 text-[9px]">
                  {formatTime(p.time)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
