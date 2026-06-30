import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode, ColorType } from 'lightweight-charts'
import { CandlestickChart, Activity, Eye, EyeOff, MapPin } from 'lucide-react'
import { calcEMA, calcRSI, calcBollingerBands } from '../utils/indicators'

const INDICATORS = [
  { id: 'ema9', label: 'EMA 9', color: '#3b82f6' },
  { id: 'ema21', label: 'EMA 21', color: '#eab308' },
  { id: 'ema50', label: 'EMA 50', color: '#a855f7' },
  { id: 'bb', label: 'Bollinger', color: '#64748b' },
  { id: 'vwap', label: 'VWAP', color: '#f97316' },
  { id: 'rsi', label: 'RSI 14', color: '#22c55e' },
]

export default function CandleChart({ candles, symbol, regime, fills, selectedExchange }) {
  const chartContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const emaSeriesRef = useRef({ ema9: null, ema21: null, ema50: null })
  const bbSeriesRef = useRef({ upper: null, lower: null })
  const rsiSeriesRef = useRef(null)
  const vwapSeriesRef = useRef(null)
  const markersSeriesRef = useRef(null)
  const [showMarkers, setShowMarkers] = useState(true)

  const [activeIndicators, setActiveIndicators] = useState({
    ema9: true,
    ema21: true,
    ema50: false,
    bb: false,
    vwap: false,
    rsi: false,
  })

  const toggleIndicator = (id) => {
    setActiveIndicators(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Create main chart once
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1521' },
        textColor: '#8b95a7',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: '#161b26' },
        horzLines: { color: '#161b26' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3b82f6', width: 1, style: 3 },
        horzLine: { color: '#3b82f6', width: 1, style: 3 },
      },
      rightPriceScale: { borderColor: '#1e2433' },
      timeScale: { borderColor: '#1e2433', timeVisible: true, secondsVisible: false },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: '#2a3142',
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    // EMA series
    emaSeriesRef.current.ema9 = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    emaSeriesRef.current.ema21 = chart.addLineSeries({ color: '#eab308', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    emaSeriesRef.current.ema50 = chart.addLineSeries({ color: '#a855f7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })

    // Bollinger Bands
    bbSeriesRef.current.upper = chart.addLineSeries({ color: 'rgba(100, 116, 139, 0.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 })
    bbSeriesRef.current.lower = chart.addLineSeries({ color: 'rgba(100, 116, 139, 0.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 })

    // VWAP
    vwapSeriesRef.current = chart.addLineSeries({ color: '#f97316', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, lineStyle: 0 })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
    markersSeriesRef.current = candleSeries

    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({
          width: rsiContainerRef.current.clientWidth,
          height: rsiContainerRef.current.clientHeight,
        })
      }
    })
    resizeObserver.observe(chartContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      if (rsiChartRef.current) {
        rsiChartRef.current.remove()
        rsiChartRef.current = null
      }
    }
  }, [])

  // Create/destroy RSI chart when toggled
  useEffect(() => {
    if (activeIndicators.rsi && rsiContainerRef.current && !rsiChartRef.current) {
      const rsiChart = createChart(rsiContainerRef.current, {
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
        timeScale: { borderColor: '#1e2433', timeVisible: true, secondsVisible: false },
        width: rsiContainerRef.current.clientWidth,
        height: rsiContainerRef.current.clientHeight,
      })

      const rsiSeries = rsiChart.addLineSeries({
        color: '#22c55e', lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
      })

      rsiChartRef.current = rsiChart
      rsiSeriesRef.current = rsiSeries
    } else if (!activeIndicators.rsi && rsiChartRef.current) {
      rsiChartRef.current.remove()
      rsiChartRef.current = null
      rsiSeriesRef.current = null
    }
  }, [activeIndicators.rsi])

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !candles.length) return

    const candleData = candles.map(c => ({
      time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
    }))
    const volumeData = candles.map(c => ({
      time: c.time, value: c.volume,
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    }))

    candleSeriesRef.current.setData(candleData)
    volumeSeriesRef.current.setData(volumeData)

    const closes = candles.map(c => c.close)
    const times = candles.map(c => c.time)

    const setLineData = (series, values) => {
      if (!series) return
      const data = values.map((v, i) => ({ time: times[i], value: v })).filter(d => !isNaN(d.value))
      series.setData(data)
    }

    if (activeIndicators.ema9) setLineData(emaSeriesRef.current.ema9, calcEMA(closes, 9))
    else emaSeriesRef.current.ema9?.setData([])

    if (activeIndicators.ema21) setLineData(emaSeriesRef.current.ema21, calcEMA(closes, 21))
    else emaSeriesRef.current.ema21?.setData([])

    if (activeIndicators.ema50) setLineData(emaSeriesRef.current.ema50, calcEMA(closes, 50))
    else emaSeriesRef.current.ema50?.setData([])

    if (activeIndicators.bb) {
      const bb = calcBollingerBands(closes, 20, 2)
      setLineData(bbSeriesRef.current.upper, bb.upper)
      setLineData(bbSeriesRef.current.lower, bb.lower)
    } else {
      bbSeriesRef.current.upper?.setData([])
      bbSeriesRef.current.lower?.setData([])
    }

    // VWAP (cumulative volume-weighted average price)
    if (activeIndicators.vwap && vwapSeriesRef.current) {
      let cumPV = 0, cumV = 0
      const vwapData = []
      for (const c of candles) {
        const typicalPrice = (c.high + c.low + c.close) / 3
        cumPV += typicalPrice * c.volume
        cumV += c.volume
        vwapData.push({ time: c.time, value: cumV > 0 ? cumPV / cumV : c.close })
      }
      vwapSeriesRef.current.setData(vwapData)
    } else {
      vwapSeriesRef.current?.setData([])
    }

    if (activeIndicators.rsi && rsiSeriesRef.current) {
      const rsiValues = calcRSI(closes, 14)
      const rsiData = rsiValues.map((v, i) => ({ time: times[i], value: v })).filter(d => !isNaN(d.value))
      rsiSeriesRef.current.setData(rsiData)
    }

    // Sync time scales between main chart and RSI
    if (rsiChartRef.current && chartRef.current) {
      const ts = chartRef.current.timeScale()
      const rs = rsiChartRef.current.timeScale()
      ts.subscribeVisibleLogicalRangeChange(range => rs.setVisibleLogicalRange(range))
      rs.subscribeVisibleLogicalRangeChange(range => ts.setVisibleLogicalRange(range))
    }

    // Set trade markers from fills
    if (showMarkers && markersSeriesRef.current && fills?.length) {
      const candleTimes = new Set(candles.map(c => c.time))
      const markers = fills
        .filter(f => f.status === 'FILLED' && f.symbol === symbol && (!selectedExchange || f.exchange === selectedExchange))
        .map(f => {
          const fillTime = Math.floor(f.timestamp / 300) * 300
          if (!candleTimes.has(fillTime)) return null
          const isBuy = f.side === 'BUY'
          return {
            time: fillTime,
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: isBuy ? '#22c55e' : '#ef4444',
            shape: isBuy ? 'arrowUp' : 'arrowDown',
            text: isBuy ? 'B' : 'S',
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time)
        .slice(-30)

      markersSeriesRef.current.setMarkers(markers)
    } else if (markersSeriesRef.current) {
      markersSeriesRef.current.setMarkers([])
    }
  }, [candles, activeIndicators, fills, showMarkers, symbol, selectedExchange])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-bg-600 flex-wrap">
        <CandlestickChart size={16} className="text-accent-blue" />
        <span className="text-sm font-medium">{symbol}</span>
        <span className="text-xs text-gray-500">· {candles.length} candles</span>
        {regime && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            regime.regime === 'TRENDING' ? 'bg-blue-500/20 text-accent-blue' :
            regime.regime === 'RANGING' ? 'bg-yellow-500/20 text-accent-yellow' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {regime.regime}
          </span>
        )}
        <div className="flex-1" />
        {/* Trade markers toggle */}
        <button
          onClick={() => setShowMarkers(!showMarkers)}
          className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
            showMarkers ? 'bg-accent-green/20 text-accent-green' : 'text-gray-500 hover:text-gray-300'
          }`}
          title="Toggle trade markers"
        >
          <MapPin size={10} />
          Markers
        </button>
        <div className="flex items-center gap-1">
          <Activity size={12} className="text-gray-500" />
          {INDICATORS.map(ind => (
            <button
              key={ind.id}
              onClick={() => toggleIndicator(ind.id)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
                activeIndicators[ind.id] ? '' : 'text-gray-500 hover:text-gray-300'
              }`}
              style={activeIndicators[ind.id] ? { backgroundColor: ind.color + '33', color: ind.color } : {}}
            >
              {activeIndicators[ind.id] ? <Eye size={10} /> : <EyeOff size={10} />}
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={chartContainerRef} className="flex-1" style={{ minHeight: 0 }} />

      {activeIndicators.rsi && (
        <div className="h-[100px] border-t border-bg-600" style={{ flexShrink: 0 }}>
          <div ref={rsiContainerRef} className="h-full" />
        </div>
      )}
    </div>
  )
}
