import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Activity, Radio, TrendingUp, AlertTriangle, BarChart3, FlaskConical, History, ArrowRightLeft, Bot } from 'lucide-react'
import { useExchangeData, useSignalData } from './hooks/useExchangeData'
import { useMockExchangeData, useMockSignalData, IS_MOCK } from './hooks/useMockData'
import { useToasts, ToastContainer } from './components/Toast'
import MockModeBanner from './components/MockModeBanner'
import Header from './components/Header'
import CandleChart from './components/CandleChart'
import OrderBook from './components/OrderBook'
import OrderForm from './components/OrderForm'
import AccountPanel from './components/AccountPanel'
import PositionsPanel from './components/PositionsPanel'
import SignalFeed from './components/SignalFeed'
import ArbitragePanel from './components/ArbitragePanel'
import PriceComparison from './components/PriceComparison'
import FillsPanel from './components/FillsPanel'
import PerformanceDashboard from './components/PerformanceDashboard'
import BacktestRunner from './components/BacktestRunner'
import TradeHistory from './components/TradeHistory'
import BotStatus from './components/BotStatus'
import StatusBar from './components/StatusBar'
import SignalPerformance from './components/SignalPerformance'
import OnboardingTutorial from './components/OnboardingTutorial'
import DetachablePanel from './components/DetachablePanel'
import KeyboardHelp from './components/KeyboardHelp'
import PanelContainer from './panels/PanelContainer'
import { useDetachablePanels } from './hooks/useDetachablePanels'
import { useIsMobile } from './hooks/useMediaQuery'
import { aggregateCandles, TIMEFRAMES } from './utils/timeframes'
import { useSoundAlerts } from './hooks/useSoundAlerts'
import { useTheme } from './hooks/useTheme'

const EXCHANGES = ['binance', 'bybit', 'okx']
const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

export default function App() {
  const [selectedExchange, setSelectedExchange] = useState('binance')
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT')
  const [activeTab, setActiveTab] = useState('account') // account | bots | signals | arbitrage | fills | history | performance | backtest | prices
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0])
  const [simSpeed, setSimSpeed] = useState(1)
  const isMobile = useIsMobile()
  const [mobilePanel, setMobilePanel] = useState('chart') // chart | sidebar
  const { detachPanel, updateDetached, isDetached } = useDetachablePanels()

  const exchange = IS_MOCK ? useMockExchangeData() : useExchangeData()
  const signals = IS_MOCK ? useMockSignalData() : useSignalData()
  const { toasts, addToast, removeToast } = useToasts()
  const { play: playSound, setEnabled: setSoundEnabled } = useSoundAlerts(true)
  const [soundOn, setSoundOn] = useState(true)
  const { theme, toggleTheme } = useTheme()

  // Track previous connection states for connection notifications
  const prevExConn = useRef(false)
  const prevSigConn = useRef(false)

  // Connection change notifications
  useEffect(() => {
    if (exchange.connected && !prevExConn.current) {
      addToast('success', 'Exchange Simulator connected')
      playSound('connect')
    } else if (!exchange.connected && prevExConn.current) {
      addToast('error', 'Exchange Simulator disconnected')
      playSound('disconnect')
    }
    prevExConn.current = exchange.connected
  }, [exchange.connected, addToast, playSound])

  useEffect(() => {
    if (signals.connected && !prevSigConn.current) {
      addToast('success', 'AI Signal Bot connected')
      playSound('connect')
    } else if (!signals.connected && prevSigConn.current) {
      addToast('warning', 'AI Signal Bot disconnected — retrying...')
      playSound('disconnect')
    }
    prevSigConn.current = signals.connected
  }, [signals.connected, addToast, playSound])

  // Notify on new fills (bot trades)
  const prevFillCount = useRef(0)
  useEffect(() => {
    const newFills = exchange.fills.length - prevFillCount.current
    if (newFills > 0 && prevFillCount.current > 0) {
      const recentFill = exchange.fills[0]
      if (recentFill && recentFill.status === 'FILLED') {
        addToast('info', `Fill: ${recentFill.side} ${recentFill.filled_quantity} ${recentFill.symbol} @ $${recentFill.filled_price} (${recentFill.exchange})`, 4000)
        playSound('fill')
      }
    }
    prevFillCount.current = exchange.fills.length
  }, [exchange.fills, addToast])

  // Notify on strong AI signals
  const prevSignalCount = useRef(0)
  useEffect(() => {
    if (signals.signals.length > prevSignalCount.current && prevSignalCount.current > 0) {
      const sig = signals.signals[0]
      if (sig && sig.confidence >= 75) {
        addToast('info', `Strong signal: ${sig.direction} ${sig.symbol} (${sig.confidence?.toFixed(0)}% confidence)`, 4000)
        playSound('alert')
      }
    }
    prevSignalCount.current = signals.signals.length
  }, [signals.signals, addToast])

  // News event notification
  const prevNewsRef = useRef(null)
  useEffect(() => {
    const news = exchange.newsEvent
    if (news && (!prevNewsRef.current || prevNewsRef.current.symbol !== news.symbol || prevNewsRef.current.remaining < news.remaining)) {
      addToast('warning', `News event: ${news.symbol} ${news.intensity}x volatility spike (${news.direction})`, 5000)
      playSound('alert')
    }
    prevNewsRef.current = news
  }, [exchange.newsEvent, addToast, playSound])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      switch (e.key) {
        case '1': setSelectedExchange(EXCHANGES[0]); break
        case '2': setSelectedExchange(EXCHANGES[1]); break
        case '3': setSelectedExchange(EXCHANGES[2]); break
        case 'q': case 'Q': setSelectedSymbol(SYMBOLS[0]); break
        case 'w': case 'W': setSelectedSymbol(SYMBOLS[1]); break
        case 'e': case 'E': setSelectedSymbol(SYMBOLS[2]); break
        case ' ': e.preventDefault(); setSimSpeed(s => s === 0 ? 1 : 0); break
        default: break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Handle sim speed change
  const handleSpeedChange = useCallback((speed) => {
    setSimSpeed(speed)
    exchange.sendSpeedChange(speed)
  }, [exchange])

  // Filter candles for selected exchange + symbol, then aggregate by timeframe
  const chartCandles = useMemo(() => {
    const raw = exchange.candles
      .filter(c => c.exchange === selectedExchange && c.symbol === selectedSymbol)
      .map(c => ({
        time: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))
    return aggregateCandles(raw, timeframe.factor)
  }, [exchange.candles, selectedExchange, selectedSymbol, timeframe])

  const currentPrice = exchange.prices[selectedExchange]?.[selectedSymbol] || 0

  // Calculate price change from recent candles
  const priceChange = useMemo(() => {
    const candles = chartCandles
    if (candles.length < 2) return 0
    const first = candles[0].close
    const last = candles[candles.length - 1].close
    if (first === 0) return 0
    return ((last - first) / first) * 100
  }, [chartCandles])

  // Update detached panels with live data
  useEffect(() => {
    if (isDetached('orderbook')) {
      updateDetached('orderbook', {
        orderbookData: exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`],
        currentPrice,
      })
    }
    if (isDetached('account')) {
      updateDetached('account', { account: exchange.accounts[selectedExchange] })
    }
    if (isDetached('signals')) {
      updateDetached('signals', { signals: signals.signals })
    }
    if (isDetached('arbitrage')) {
      updateDetached('arbitrage', { arbitrage: exchange.arbitrage })
    }
    if (isDetached('chart')) {
      updateDetached('chart', {
        candles: chartCandles.slice(-50),
        symbol: selectedSymbol,
        exchange: selectedExchange,
      })
    }
  }, [exchange, signals, chartCandles, currentPrice, selectedExchange, selectedSymbol, isDetached, updateDetached])

  const handleDetach = useCallback((panelId) => {
    if (isDetached(panelId)) return
    const dataMap = {
      orderbook: {
        orderbookData: exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`],
        currentPrice,
      },
      account: { account: exchange.accounts[selectedExchange] },
      signals: { signals: signals.signals },
      arbitrage: { arbitrage: exchange.arbitrage },
      chart: { candles: chartCandles.slice(-50), symbol: selectedSymbol, exchange: selectedExchange },
    }
    detachPanel(panelId, dataMap[panelId])
  }, [exchange, signals, chartCandles, currentPrice, selectedExchange, selectedSymbol, isDetached, detachPanel])

  return (
    <div className="h-screen flex flex-col bg-bg-900 overflow-hidden">
      <MockModeBanner />
      <OnboardingTutorial />
      <KeyboardHelp />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <Header
        exchanges={EXCHANGES}
        symbols={SYMBOLS}
        selectedExchange={selectedExchange}
        selectedSymbol={selectedSymbol}
        onExchangeChange={setSelectedExchange}
        onSymbolChange={setSelectedSymbol}
        currentPrice={currentPrice}
        priceChange={priceChange}
        allPrices={exchange.prices}
        exchangeConnected={exchange.connected}
        signalConnected={signals.connected}
        simSpeed={simSpeed}
        onSpeedChange={handleSpeedChange}
        soundOn={soundOn}
        onSoundToggle={() => {
          const next = !soundOn
          setSoundOn(next)
          setSoundEnabled(next)
        }}
        theme={theme}
        onThemeToggle={toggleTheme}
        timeframes={TIMEFRAMES}
        selectedTimeframe={timeframe}
        onTimeframeChange={setTimeframe}
      />

      {/* Mobile panel toggle */}
      {isMobile && (
        <div className="flex gap-1 p-1 bg-bg-800 border-b border-bg-600 shrink-0">
          <button
            onClick={() => setMobilePanel('chart')}
            className={'flex-1 py-1.5 text-xs font-medium rounded transition-colors ' +
              (mobilePanel === 'chart' ? 'bg-accent-blue text-white' : 'bg-bg-600 text-gray-400')}
          >
            Chart
          </button>
          <button
            onClick={() => setMobilePanel('sidebar')}
            className={'flex-1 py-1.5 text-xs font-medium rounded transition-colors ' +
              (mobilePanel === 'sidebar' ? 'bg-accent-blue text-white' : 'bg-bg-600 text-gray-400')}
          >
            Tools
          </button>
        </div>
      )}

      <div id="main-content" role="main" className={'flex-1 flex gap-1 p-1 overflow-hidden ' + (isMobile ? 'flex-col' : 'flex-row')}>
        {/* Left: Chart + Order Form */}
        <div className={'flex flex-col gap-1 min-w-0 ' + (isMobile ? (mobilePanel === 'chart' ? 'flex-1' : 'hidden') : 'flex-1')}>
          <DetachablePanel panelId="chart" onDetach={handleDetach} isDetached={isDetached('chart')}>
            <div className="h-full">
              <CandleChart candles={chartCandles} symbol={selectedSymbol} regime={signals.regime} fills={exchange.fills} selectedExchange={selectedExchange} />
            </div>
          </DetachablePanel>
          <div className={'bg-bg-800 rounded-lg overflow-hidden ' + (isMobile ? 'h-[180px]' : 'h-[200px]')}>
            <OrderForm
              exchange={selectedExchange}
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              onSubmit={exchange.submitOrder}
              connected={exchange.connected}
              balance={exchange.accounts[selectedExchange]?.balance}
            />
          </div>
        </div>

        {/* Right: Order Book + Tabs */}
        <div className={'flex flex-col gap-1 shrink-0 ' + (isMobile ? (mobilePanel === 'sidebar' ? 'flex-1 overflow-y-auto' : 'hidden') : 'w-[340px]')}>
          <div className="h-[400px]">
            <DetachablePanel panelId="orderbook" onDetach={handleDetach} isDetached={isDetached('orderbook')}>
              <OrderBook
                exchange={selectedExchange}
                symbol={selectedSymbol}
                currentPrice={currentPrice}
                orderbookData={exchange.orderbooks[`${selectedExchange}|${selectedSymbol}`]}
              />
            </DetachablePanel>
          </div>

          {/* Panel Registry — all analytic/strategy panels */}
          <PanelContainer context={{
            exchange,
            signals,
            selectedExchange,
            selectedSymbol,
            chartCandles,
            currentPrice,
            SYMBOLS,
            EXCHANGES,
            toasts,
            addToast,
            setSelectedSymbol,
          }} />

          {/* Tabbed panels */}
          <div className="flex-1 bg-bg-800 rounded-lg overflow-hidden flex flex-col">
            <div className="flex border-b border-bg-600 shrink-0">
              <TabButton active={activeTab === 'account'} onClick={() => setActiveTab('account')} icon={<Activity size={14} />}>
                Account
              </TabButton>
              <TabButton active={activeTab === 'bots'} onClick={() => setActiveTab('bots')} icon={<Bot size={14} />}>
                Bots
              </TabButton>
              <TabButton active={activeTab === 'signals'} onClick={() => setActiveTab('signals')} icon={<Radio size={14} />}>
                Signals
              </TabButton>
              <TabButton active={activeTab === 'arbitrage'} onClick={() => setActiveTab('arbitrage')} icon={<TrendingUp size={14} />}>
                Arb
              </TabButton>
              <TabButton active={activeTab === 'prices'} onClick={() => setActiveTab('prices')} icon={<ArrowRightLeft size={14} />}>
                Prices
              </TabButton>
              <TabButton active={activeTab === 'fills'} onClick={() => setActiveTab('fills')} icon={<AlertTriangle size={14} />}>
                Fills
              </TabButton>
              <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={14} />}>
                History
              </TabButton>
              <TabButton active={activeTab === 'performance'} onClick={() => setActiveTab('performance')} icon={<BarChart3 size={14} />}>
                Perf
              </TabButton>
              <TabButton active={activeTab === 'backtest'} onClick={() => setActiveTab('backtest')} icon={<FlaskConical size={14} />}>
                BT
              </TabButton>
            </div>
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'account' && (
                <>
                  <AccountPanel accounts={exchange.accounts} />
                  <PositionsPanel
                    accounts={exchange.accounts}
                    onClose={exchange.closePosition}
                    currentPrices={exchange.prices}
                  />
                </>
              )}
              {activeTab === 'bots' && (
                <BotStatus
                  signals={signals.signals}
                  fills={exchange.fills}
                  accounts={exchange.accounts}
                  signalConnected={signals.connected}
                  exchangeConnected={exchange.connected}
                />
              )}
              {activeTab === 'signals' && (
                <>
                  <SignalPerformance signals={signals.signals} fills={exchange.fills} />
                  <SignalFeed signals={signals.signals} regime={signals.regime} />
                </>
              )}
              {activeTab === 'arbitrage' && <ArbitragePanel arbitrage={exchange.arbitrage} />}
              {activeTab === 'prices' && (
                <PriceComparison
                  prices={exchange.prices}
                  symbols={SYMBOLS}
                  selectedSymbol={selectedSymbol}
                  exchanges={EXCHANGES}
                />
              )}
              {activeTab === 'fills' && <FillsPanel fills={exchange.fills} />}
              {activeTab === 'history' && <TradeHistory accounts={exchange.accounts} />}
              {activeTab === 'performance' && (
                <PerformanceDashboard
                  accounts={exchange.accounts}
                  fills={exchange.fills}
                  signals={signals.signals}
                />
              )}
              {activeTab === 'backtest' && (
                <BacktestRunner
                  symbol={selectedSymbol}
                  connected={signals.connected}
                  sendSignalMessage={signals.sendSignalMessage}
                  backtestResult={signals.backtestResult}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        exchange={exchange}
        signals={signals}
        selectedExchange={selectedExchange}
        selectedSymbol={selectedSymbol}
        candleCount={chartCandles.length}
        exchangeLatency={exchange.latency}
        signalLatency={signals.latency}
      />
    </div>
  )
}

function TabButton({ active, onClick, icon, children }) {
  const Icon = icon
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue rounded-sm ${
        active
          ? 'text-accent-blue border-b-2 border-accent-blue bg-bg-700'
          : 'text-gray-400 hover:text-gray-200 hover:bg-bg-700'
      }`}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </button>
  )
}
