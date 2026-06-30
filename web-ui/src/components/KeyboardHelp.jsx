import { useState, useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['1', '2', '3'], desc: 'Switch exchange (Binance / Bybit / OKX)' },
  { keys: ['Q', 'W', 'E'], desc: 'Switch symbol (BTC / ETH / SOL)' },
  { keys: ['Space'], desc: 'Pause / resume simulation' },
  { keys: ['?'], desc: 'Toggle this help overlay' },
  { keys: ['Esc'], desc: 'Close overlays / dialogs' },
]

export default function KeyboardHelp() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setVisible(v => !v)
      } else if (e.key === 'Escape') {
        setVisible(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setVisible(false)}
    >
      <div
        className="bg-bg-800 rounded-xl border border-bg-600 p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-accent-blue" />
            <h2 className="text-sm font-semibold text-gray-200">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-bg-600/50 last:border-0">
              <span className="text-xs text-gray-400">{s.desc}</span>
              <div className="flex gap-1">
                {s.keys.map(k => (
                  <kbd
                    key={k}
                    className="px-2 py-0.5 text-[10px] font-mono rounded bg-bg-600 border border-bg-500 text-gray-300 shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-[10px] text-gray-600 text-center">
          Press <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-600 border border-bg-500">?</kbd> anytime to toggle this help
        </div>
      </div>
    </div>
  )
}
