import { useEffect, useRef } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { COLORS } from '../components/backtest/constants'

/** Equity-curve chart lifecycle: create once, resize via ResizeObserver,
 *  sync line series when `result` changes. Extracted from
 * BacktestRunner.jsx. Returns the container ref to attach. */
export function useBacktestChart(result) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
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
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    })
    ro.observe(chartContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  // Update chart when results change
  useEffect(() => {
    if (!chartRef.current || !result || result.error) return

    for (const key of Object.keys(seriesRef.current)) {
      try {
        chartRef.current.removeSeries(seriesRef.current[key])
      } catch {
        // series already removed
      }
    }
    seriesRef.current = {}

    const entries = Object.entries(result.results || {})
    entries.forEach(([name, data], idx) => {
      const color = COLORS[idx % COLORS.length]
      const series = chartRef.current.addLineSeries({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: name,
      })
      const equityData = (data.equity_curve || []).map((v, i) => ({
        time: i,
        value: v,
      }))
      series.setData(equityData)
      seriesRef.current[name] = series
    })
  }, [result])

  return chartContainerRef
}
