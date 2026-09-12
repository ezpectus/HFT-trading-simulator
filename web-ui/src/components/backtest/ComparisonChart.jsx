import { useEffect, useRef } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { COLORS } from './constants'

export default function ComparisonChart({ curves }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1521' },
        textColor: '#8b95a7',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#161b26' },
        horzLines: { color: '#161b26' },
      },
      rightPriceScale: { borderColor: '#1e2433' },
      timeScale: { borderColor: '#1e2433' },
      width: containerRef.current.clientWidth,
      height: 120,
    })
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !curves) return
    for (const key of Object.keys(seriesRef.current)) {
      try { chartRef.current.removeSeries(seriesRef.current[key]) } catch { /* */ }
    }
    seriesRef.current = {}

    Object.entries(curves).forEach(([name, data], idx) => {
      const color = COLORS[idx % COLORS.length]
      const series = chartRef.current.addLineSeries({
        color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: name,
      })
      series.setData((data || []).map((v, i) => ({ time: i, value: v })))
      seriesRef.current[name] = series
    })
  }, [curves])

  return <div ref={containerRef} className="h-[120px]" />
}
