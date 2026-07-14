import { Wifi, WifiOff, TrendingUp, TrendingDown, Zap, Pause, Play, FastForward, Volume2, VolumeX, Sun, Moon, Power } from 'lucide-react'
import { formatPrice } from '../utils/format'

const SYMBOL_SHORT = {
  'BTC/USDT': 'BTC',
  'ETH/USDT': 'ETH',
  'SOL/USDT': 'SOL',
}

const SPEED_OPTIONS = [
  { value: 0, label: 'Pause', icon: Pause },
  { value: 1, label: '1x', icon: Play },
  { value: 2, label: '2x', icon: FastForward },
  { value: 5, label: '5x', icon: FastForward },
]

export default function Header({
  exchanges,
  symbols,
  selectedExchange,
  selectedSymbol,
  onExchangeChange,
  onSymbolChange,
  currentPrice,
  priceChange,
  allPrices,
  exchangeConnected,
  signalConnected,
  simSpeed,
  onSpeedChange,
  tradingActive,
  onStartTrading,
  onStopTrading,
  soundOn,
  onSoundToggle,
  theme,
  onThemeToggle,
  timeframes,
  selectedTimeframe,
  onTimeframeChange,
}) {
  const change = priceChange || 0
  const isUp = change >= 0

  return (
    <header className="flex flex-col bg-bg-800 border-b border-bg-600 shrink-0" role="banner">
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-1.5 focus:bg-accent-blue focus:text-white focus:rounded focus:text-sm"
      >
        Skip to main content
      </a>
      {/* Main header row */}
      <div className="flex items-center gap-2 px-2 py-2 sm:gap-4 sm:px-4 flex-wrap">
        {/* Logo */}
        <div className="flex items-center gap-2" aria-label="HFT Trading System">
          <Zap className="w-5 h-5 text-accent-yellow" aria-hidden="true" />
          <span className="font-bold text-sm">Trading Sim</span>
        </div>

        {/* Exchange selector */}
        <div className="flex gap-1" role="group" aria-label="Exchange selector">
          {exchanges.map(ex => (
            <button
              key={ex}
              onClick={() => onExchangeChange(ex)}
              aria-pressed={selectedExchange === ex}
              aria-label={`Select ${ex} exchange`}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                selectedExchange === ex
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-600 text-gray-400 hover:bg-bg-500'
              }`}
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-bg-600" />

        {/* Symbol selector */}
        <div className="flex gap-1" role="group" aria-label="Symbol selector">
          {symbols.map(s => (
            <button
              key={s}
              onClick={() => onSymbolChange(s)}
              aria-pressed={selectedSymbol === s}
              aria-label={`Select ${s}`}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-yellow ${
                selectedSymbol === s
                  ? 'bg-accent-yellow text-bg-900'
                  : 'bg-bg-600 text-gray-400 hover:bg-bg-500'
              }`}
            >
              {SYMBOL_SHORT[s] || s}
            </button>
          ))}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-0.5" role="group" aria-label="Timeframe selector">
          {timeframes.map(tf => (
            <button
              key={tf.label}
              onClick={() => onTimeframeChange(tf)}
              aria-pressed={selectedTimeframe.label === tf.label}
              className={'px-2 py-1 text-[10px] font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple ' +
                (selectedTimeframe.label === tf.label
                  ? 'bg-accent-purple text-white'
                  : 'bg-bg-600 text-gray-400 hover:bg-bg-500')}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Price + change */}
        <div className="flex items-center gap-2" aria-label={`Current price: $${formatPrice(currentPrice)}, ${isUp ? 'up' : 'down'} ${Math.abs(change).toFixed(2)} percent`}>
          <span className="font-mono text-lg font-semibold" aria-hidden="true">
            ${formatPrice(currentPrice)}
          </span>
          <span className={`flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-accent-green' : 'text-accent-red'}`} aria-hidden="true">
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isUp ? '+' : ''}{change.toFixed(2)}%
          </span>
        </div>

        {/* Sim speed control */}
        <div className="flex items-center gap-0.5 bg-bg-700 rounded p-0.5" role="group" aria-label="Simulation speed">
          {SPEED_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isActive = simSpeed === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onSpeedChange(opt.value)}
                aria-pressed={isActive}
                aria-label={`Set speed to ${opt.label}`}
                className={`flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                  isActive
                    ? opt.value === 0
                      ? 'bg-accent-red/20 text-accent-red'
                      : 'bg-accent-blue text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                title={opt.label}
              >
                <Icon size={10} />
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Start/Stop Trading master control */}
        <button
          onClick={tradingActive ? onStopTrading : onStartTrading}
          disabled={!exchangeConnected}
          aria-pressed={tradingActive}
          aria-label={tradingActive ? 'Stop trading' : 'Start trading'}
          title={tradingActive ? 'Trading is ON — click to stop' : 'Trading is OFF — click to start'}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green disabled:opacity-40 disabled:cursor-not-allowed ${
            tradingActive
              ? 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'
              : 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30'
          }`}
        >
          <Power size={12} />
          {tradingActive ? 'TRADING' : 'STOPPED'}
        </button>

        {/* Sound toggle */}
        <button
          onClick={onSoundToggle}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
          className={'p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green ' + (soundOn ? 'text-accent-green hover:bg-bg-700' : 'text-gray-600 hover:bg-bg-700')}
          title={soundOn ? 'Sound on' : 'Sound off'}
        >
          {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-1 rounded transition-colors text-gray-400 hover:bg-bg-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-yellow"
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Connection status */}
        <div className="flex items-center gap-3 text-xs" role="status" aria-live="polite">
          <div className={`flex items-center gap-1.5 ${exchangeConnected ? 'text-accent-green' : 'text-accent-red'}`} aria-label={`Exchange ${exchangeConnected ? 'connected' : 'disconnected'}`}>
            {exchangeConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:inline">Exchange</span>
            {exchangeConnected && <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot" />}
          </div>
          <div className={`flex items-center gap-1.5 ${signalConnected ? 'text-accent-green' : 'text-gray-500'}`} aria-label={`AI Signals ${signalConnected ? 'connected' : 'disconnected'}`}>
            {signalConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:inline">AI Signals</span>
            {signalConnected && <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot" />}
          </div>
        </div>
      </div>

      {/* Ticker tape — all prices across exchanges */}
      {allPrices && exchangeConnected && (
        <div className="flex items-center gap-0 px-4 py-1 border-t border-bg-700 overflow-x-auto scrollbar-thin">
          {exchanges.map(ex => (
            <div key={ex} className="flex items-center gap-2 px-2 shrink-0">
              <span className="text-[9px] text-gray-600 uppercase">{ex}</span>
              {symbols.map(sym => {
                const price = allPrices[ex]?.[sym]
                if (!price) return null
                const isActive = ex === selectedExchange && sym === selectedSymbol
                return (
                  <button
                    key={`${ex}|${sym}`}
                    onClick={() => { onExchangeChange(ex); onSymbolChange(sym) }}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      isActive ? 'bg-bg-600 text-gray-200' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className="text-gray-600">{SYMBOL_SHORT[sym] || sym}</span>
                    <span>${formatPrice(price, 0)}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
