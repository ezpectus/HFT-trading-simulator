import { useState, useEffect } from 'react'
import { FlaskConical, X } from 'lucide-react'

export default function MockModeBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [isMock, setIsMock] = useState(false)

  useEffect(() => {
    setIsMock(
      import.meta.env.VITE_MOCK_MODE === 'true' ||
      localStorage.getItem('mock-mode') === 'true'
    )
  }, [])

  if (!isMock || dismissed) return null

  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-3 py-1.5 bg-accent-yellow/10 border-b border-accent-yellow/30 text-[10px] text-accent-yellow"
    >
      <FlaskConical size={12} />
      <span className="font-medium">DEMO MODE</span>
      <span className="text-gray-500">— Using simulated market data. No live connection required.</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo mode banner"
        className="ml-auto text-gray-600 hover:text-gray-400 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  )
}
