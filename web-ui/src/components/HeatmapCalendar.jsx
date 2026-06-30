import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { formatUsd } from '../utils/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pnlColor(pnl) {
  if (pnl === 0) return 'bg-bg-600 text-gray-600'
  if (pnl > 100) return 'bg-accent-green text-white'
  if (pnl > 50) return 'bg-accent-green/70 text-white'
  if (pnl > 10) return 'bg-accent-green/40 text-gray-200'
  if (pnl > 0) return 'bg-accent-green/20 text-gray-300'
  if (pnl > -10) return 'bg-accent-red/20 text-gray-300'
  if (pnl > -50) return 'bg-accent-red/40 text-gray-200'
  if (pnl > -100) return 'bg-accent-red/70 text-white'
  return 'bg-accent-red text-white'
}

export default function HeatmapCalendar({ accounts }) {
  const dailyPnl = useMemo(() => {
    const byDay = {}
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        const d = new Date((t.closed_at || 0) * 1000)
        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        byDay[dateKey] = (byDay[dateKey] || 0) + (t.pnl || 0)
      }
    }
    return byDay
  }, [accounts])

  // Build calendar grid for current month
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = (firstDay.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = lastDay.getDate()

  const weeks = []
  let currentWeek = []
  for (let i = 0; i < startWeekday; i++) currentWeek.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${month}-${day}`
    currentWeek.push({ day, pnl: dailyPnl[dateKey] || 0 })
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null)
    weeks.push(currentWeek)
  }

  const totalPnl = Object.values(dailyPnl).reduce((s, v) => s + v, 0)
  const bestDay = Object.entries(dailyPnl).sort((a, b) => b[1] - a[1])[0]
  const worstDay = Object.entries(dailyPnl).sort((a, b) => a[1] - b[1])[0]

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Calendar size={12} className="text-accent-green" />
        PnL Heatmap — {MONTHS[month]} {year}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-[8px] text-gray-600 text-center">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((cell, ci) => (
              <div
                key={ci}
                className={'aspect-square rounded flex flex-col items-center justify-center text-[8px] font-mono ' +
                  (cell ? pnlColor(cell.pnl) : 'bg-transparent')}
                title={cell ? `${cell.day} ${MONTHS[month]}: ${cell.pnl >= 0 ? '+' : ''}${formatUsd(cell.pnl)}` : ''}
              >
                {cell && (
                  <>
                    <span className="opacity-60">{cell.day}</span>
                    {cell.pnl !== 0 && (
                      <span className="font-bold">{cell.pnl > 0 ? '+' : ''}{Math.abs(cell.pnl) > 999 ? `${(cell.pnl / 1000).toFixed(1)}k` : cell.pnl.toFixed(0)}</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-2 pt-2 border-t border-bg-600 grid grid-cols-3 gap-2 text-[9px]">
        <div>
          <div className="text-gray-600">Month PnL</div>
          <div className={'font-mono font-medium ' + (totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
          </div>
        </div>
        <div>
          <div className="text-gray-600">Best Day</div>
          <div className="font-mono text-accent-green">
            {bestDay ? `+${formatUsd(bestDay[1])}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-gray-600">Worst Day</div>
          <div className="font-mono text-accent-red">
            {worstDay ? formatUsd(worstDay[1]) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
