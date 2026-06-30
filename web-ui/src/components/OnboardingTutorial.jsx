import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Zap, CandlestickChart, Bot, Newspaper, Check } from 'lucide-react'

const STORAGE_KEY = 'trading-sim-onboarded'

const STEPS = [
  {
    icon: Zap,
    title: 'Welcome to Trading Sim',
    body: 'A full-featured crypto trading simulator with 3 exchanges, 3 symbols, live AI signals, and real-time order execution.',
  },
  {
    icon: CandlestickChart,
    title: 'Charts & Timeframes',
    body: 'View candlestick charts with VWAP overlay. Switch between 5m, 15m, 1h, and 4h timeframes using the purple buttons in the header.',
  },
  {
    icon: Bot,
    title: 'AI Signals & Bots',
    body: 'The AI Signal Bot generates trade signals with confidence scores. Check the "Signals" tab to see signal performance tracking. The HFT bot executes automatically.',
  },
  {
    icon: Newspaper,
    title: 'News Events & Volatility',
    body: 'Watch for red flame indicators in the status bar — news events cause sudden volatility spikes. Weekend mode reduces volatility automatically.',
  },
  {
    icon: Check,
    title: 'You\'re All Set!',
    body: 'Place orders via the order form, set price alerts, detect candle patterns, run backtests, and monitor arbitrage opportunities. Use keyboard shortcuts 1/2/3 for exchanges, Q/W/E for symbols.',
  },
]

export default function OnboardingTutorial() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY)
      if (!done) setVisible(true)
    } catch {
      // ignore
    }
  }, [])

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-800 rounded-xl border border-bg-600 p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent-blue/20 flex items-center justify-center">
            <Icon size={20} className="text-accent-blue" />
          </div>
          <h2 className="text-base font-semibold text-gray-200">{current.title}</h2>
        </div>

        {/* Body */}
        <p className="text-sm text-gray-400 leading-relaxed mb-6">{current.body}</p>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={'h-1.5 rounded-full transition-all ' +
                (i === step ? 'w-6 bg-accent-blue' : i < step ? 'w-1.5 bg-accent-blue/40' : 'w-1.5 bg-bg-600')}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleClose}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip tutorial
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-bg-600 text-gray-300 hover:bg-bg-500 transition-colors"
              >
                <ChevronLeft size={12} />
                Back
              </button>
            )}
            <button
              onClick={() => isLast ? handleClose() : setStep(step + 1)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors"
            >
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
