import { useMemo, useEffect, useRef, useCallback } from 'react'
import { Activity, Radio, TrendingUp, AlertTriangle, BarChart3, FlaskConical, History, ArrowRightLeft, Bot, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useExchangeData, useSignalData } from './hooks/useExchangeData'
import { useMockExchangeData, useMockSignalData, IS_MOCK } from './hooks/useMockData'
import { ToastContainer } from './components/Toast'
import MockModeBanner from './components/MockModeBanner'
import { ReconnectBanner } from './components/ReconnectBanner'
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
import { useIsMobile, useIsTablet } from './hooks/useMediaQuery'
import { aggregateCandles, TIMEFRAMES } from './utils/timeframes'
import { useSoundAlerts } from './hooks/useSoundAlerts'
import { useTheme } from './hooks/useTheme'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useUIStore } from './stores/useUIStore'
import { useTradingStore } from './stores/useTradingStore'
import { useToastStore } from './stores/useToastStore'

export default function App() {
  // UI state from Zustand store
  const { selectedExchange, selectedSymbol, setSelectedExchange, setSelectedSymbol,
          activeTab, setActiveTab, timeframe, setTimeframe,
          simSpeed, setSimSpeed, sidebarCollapsed, setSidebarCollapsed,
          mobilePanel, setMobilePanel, soundOn, setSoundOn,
          EXCHANGES, SYMBOLS } = useUIStore()

  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const { detachPanel, updateDetached, isDetached } = useDetachablePanels()

  const realExchange = useExchangeData()
  const realSignals = useSignalData()
  const mockExchange = useMockExchangeData()
  const mockSignals = useMockSignalData()
  const exchange = IS_MOCK ? mockExchange : realExchange
  const signals = IS_MOCK ? mockSignals : realSignals

  // Toast store
  const { toasts, addToast, removeToast, clearAll } = useToastStore()

  const { play: playSound, setEnabled: setSoundEnabled } = useSoundAlerts(true)
  const { theme, toggleTheme } = useTheme()

  // Sync exchange + signals data to Zustand trading store
  const setExchangeData = useTradingStore((s) => s.setExchangeData)
  const setSignalData = useTradingStore((s) => s.setSignalData)
  const setDerivedData = useTradingStore((s) => s.setDerivedData)

  useEffect(() => {
    setExchangeData({
      candles: exchange.candles,
      prices: exchange.prices,
      accounts: exchange.accounts,
      arbitrage: exchange.arbitrage,
      fills: exchange.fills,
      orderbooks: exchange.orderbooks,
      fundingRates: exchange.fundingRates,
      candlesToFunding: exchange.candlesToFunding,
      newsEvent: exchange.newsEvent,
      weekendMode: exchange.weekendMode,
      replayPaused: exchange.replayPaused,
      tradingActive: exchange.tradingActive,
      exchangeConnected: exchange.connected,
      exchangeLatency: exchange.latency,
      submitOrder: exchange.submitOrder,
      closePosition: exchange.closePosition,
      sendSpeedChange: exchange.sendSpeedChange,
      sendConfigUpdate: exchange.sendConfigUpdate,
      toggleReplay: exchange.toggleReplay,
      scrubReplay: exchange.scrubReplay,
      startTrading: exchange.startTrading,
      stopTrading: exchange.stopTrading,
    })
  }, [exchange, setExchangeData])

  useEffect(() => {
    setSignalData({
      signals: signals.signals,
      regime: signals.regime,
      backtestResult: signals.backtestResult,
      circuitBreaker: signals.circuitBreaker,
      signalConnected: signals.connected,
      signalLatency: signals.latency,
      sendSignalMessage: signals.sendSignalMessage,
    })
  }, [signals, setSignalData])

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
  useKeyboardShortcuts({
    '1': () => setSelectedExchange(EXCHANGES[0]),
    '2': () => setSelectedExchange(EXCHANGES[1]),
    '3': () => setSelectedExchange(EXCHANGES[2]),
    'q': () => setSelectedSymbol(SYMBOLS[0]),
    'w': () => setSelectedSymbol(SYMBOLS[1]),
    'e': () => setSelectedSymbol(SYMBOLS[2]),
    ' ': () => useUIStore.getState().setSimSpeed(useUIStore.getState().simSpeed === 0 ? 1 : 0),
    'a': () => setActiveTab('account'),
    'b': () => setActiveTab('bots'),
    's': () => setActiveTab('signals'),
    'r': () => setActiveTab('arbitrage'),
    'p': () => setActiveTab('prices'),
    'f': () => setActiveTab('fills'),
    'h': () => setActiveTab('history'),
    't': () => setActiveTab('performance'),
    'shift+\\': () => useUIStore.getState().setSidebarCollapsed(!useUIStore.getState().sidebarCollapsed),
  })

  // Handle sim speed change
  const handleSpeedChange = useCallback((speed) => {
    setSimSpeed(speed)
    exchange.sendSpeedChange(speed)
  }, [exchange])

  // Sync simSpeed when replay is paused/resumed from ReplayControls panel
  useEffect(() => {
    if (exchange.replayPaused && simSpeed !== 0) {
      setSimSpeed(0)
    } else if (!exchange.replayPaused && simSpeed === 0) {
      setSimSpeed(1)
    }
  }, [exchange.replayPaused, simSpeed])

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

  // Sync derived data to Zustand store (for PanelContainer + registry)
  useEffect(() => {
    setDerivedData({ chartCandles, currentPrice, priceChange })
  }, [chartCandles, currentPrice, priceChange, setDerivedData])

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
      {!IS_MOCK && (
        <div className="flex flex-col gap-1 px-2 pt-1">
          <ReconnectBanner
            label="Exchange Simulator"
            connected={exchange.connected}
            nextReconnectIn={exchange.nextReconnectIn}
            onReconnect={() => exchange.connect()}
          />
          <ReconnectBanner
            label="AI Signal Bot"
            connected={signals.connected}
            nextReconnectIn={signals.nextReconnectIn}
            onReconnect={() => signals.connect()}
          />
        </div>
      )}
      <OnboardingTutorial />
      <KeyboardHelp />
      <ToastContainer toasts={toasts} onRemove={removeToast} onClearAll={clearAll} />
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
        tradingActive={exchange.tradingActive}
        onStartTrading={exchange.startTrading}
        onStopTrading={exchange.stopTrading}
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
        <div className="flex gap-1 p-1 bg-bg-800 border-b border-bg-600 shrink-0" role="tablist" aria-label="Mobile panel toggle">
          <button
            onClick={() => setMobilePanel('chart')}
            aria-label="Show chart panel"
            className={'flex-1 py-1.5 text-xs font-medium rounded transition-colors ' +
              (mobilePanel === 'chart' ? 'bg-accent-blue text-white' : 'bg-bg-600 text-gray-400')}
          >
            Chart
          </button>
          <button
            onClick={() => setMobilePanel('sidebar')}
            aria-label="Show tools panel"
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
          <div className={'bg-bg-800 rounded-lg overflow-hidden ' + (isMobile ? 'h-[180px]' : isTablet ? 'h-[160px]' : 'h-[200px]')}>
            <OrderForm
              exchange={selectedExchange}
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              onSubmit={exchange.submitOrder}
              connected={exchange.connected}
              tradingActive={exchange.tradingActive}
              balance={exchange.accounts[selectedExchange]?.balance}
            />
          </div>
        </div>

        {/* Right: Order Book + Tabs */}
        <div className={'flex flex-col gap-1 shrink-0 transition-all duration-200 ' + (isMobile ? (mobilePanel === 'sidebar' ? 'flex-1 overflow-y-auto' : 'hidden') : (sidebarCollapsed ? 'w-0 overflow-hidden' : (isTablet ? 'w-[300px]' : 'w-[340px]')))}>
          {/* Collapse toggle button (desktop only) */}
          {!isMobile && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="absolute right-1 top-1 z-10 p-1 rounded bg-bg-700 text-gray-500 hover:text-gray-300 hover:bg-bg-600 transition-colors"
              title="Collapse sidebar (Shift+\)"
              aria-label="Collapse sidebar"
            >
              <PanelRightClose size={14} />
            </button>
          )}
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

          {/* Panel Registry — reads from Zustand stores directly */}
          <PanelContainer />

          {/* Tabbed panels */}
          <div className="flex-1 bg-bg-800 rounded-lg overflow-hidden flex flex-col">
            <div className="flex border-b border-bg-600 shrink-0" role="tablist" aria-label="Trading panels">
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
            <div className="flex-1 overflow-y-auto tab-content" key={activeTab}>
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
                  circuitBreaker={signals.circuitBreaker}
                  tradingActive={exchange.tradingActive}
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

        {/* Floating expand button when sidebar collapsed (desktop only) */}
        {!isMobile && sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="fixed right-2 top-20 z-50 p-2 rounded-lg bg-bg-700 border border-bg-600 text-gray-400 hover:text-gray-200 hover:bg-bg-600 transition-all shadow-lg"
            title="Expand sidebar (Shift+\)"
            aria-label="Expand sidebar"
          >
            <PanelRightOpen size={16} />
          </button>
        )}
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
