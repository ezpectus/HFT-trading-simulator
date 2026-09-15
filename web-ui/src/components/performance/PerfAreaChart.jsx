import { memo, useEffect, useRef } from 'react'
import { createChart, ColorType } from 'lightweight-charts'

/**
 * Shared lightweight-charts area series for the performance dashboard.
 * `mapPoint` converts a data point to { time, value }.
 */
function PerfAreaChart({ data, mapPoint, lineColor, topColor, bottomColor, height = 120, lineWidth = 2 }) {
  const containerRef = useRef(null)
  const seriesRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const w = containerRef.current.clientWidth
    const h = containerRef.current.clientHeight
    if (w < 10 || h < 10) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#121620' },
        textColor: '#848e9c',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#1e2530' },
        horzLines: { color: '#1e2530' },
      },
      rightPriceScale: { borderColor: '#1e2530' },
      timeScale: { borderColor: '#1e2530', timeVisible: true },
      width: w,
      height: h,
    })

    const series = chart.addAreaSeries({
      lineColor,
      topColor,
      bottomColor,
      lineWidth,
      priceLineVisible: false,
    })
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      seriesRef.current = null
    }
    // Chart is created once; series colors are mount-time config.
  }, [])

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      // lightweight-charts throws on non-finite values and on duplicate or
      // out-of-order times — sanitize before setData or the component crashes
      // into the error boundary on every data push.
      const seen = new Map()
      for (const p of data) {
        const pt = mapPoint(p)
        if (pt && Number.isFinite(pt.value) && pt.time != null) seen.set(pt.time, pt)
      }
      const pts = [...seen.values()].sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
      if (pts.length > 0) seriesRef.current.setData(pts)
    }
  }, [data, mapPoint])

  return <div ref={containerRef} style={{ height }} />
}

export default memo(PerfAreaChart)
