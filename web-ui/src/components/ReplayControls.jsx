import { useState, useRef } from 'react'
import { Pause, Play, Rewind, FastForward, History } from 'lucide-react'

export default function ReplayControls({ paused, onToggle, onScrub, candleCount }) {
  const [scrubOffset, setScrubOffset] = useState(0)
  const debounceRef = useRef(null)

  const handleScrub = (val) => {
    setScrubOffset(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onScrub(val)
    }, 200)
  }

  const maxOffset = Math.max(0, candleCount - 1)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <History size={12} className="text-accent-purple" />
        Replay Mode
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ' +
            (paused
              ? 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'
              : 'bg-accent-yellow/20 text-accent-yellow hover:bg-accent-yellow/30')}
        >
          {paused ? <Play size={10} /> : <Pause size={10} />}
          {paused ? 'Resume' : 'Pause'}
        </button>

        {paused && (
          <>
            <button
              onClick={() => handleScrub(Math.min(maxOffset, scrubOffset + 10))}
              className="p-1 text-gray-400 hover:text-gray-200 rounded bg-bg-600 transition-colors"
              title="Step back 10 candles"
            >
              <Rewind size={10} />
            </button>
            <button
              onClick={() => handleScrub(Math.max(0, scrubOffset - 10))}
              className="p-1 text-gray-400 hover:text-gray-200 rounded bg-bg-600 transition-colors"
              title="Step forward 10 candles"
            >
              <FastForward size={10} />
            </button>
          </>
        )}
      </div>

      {paused && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[9px] text-gray-500 mb-0.5">
            <span>Scrub: {scrubOffset} candles back</span>
            <span>max {maxOffset}</span>
          </div>
          <input
            type="range"
            min="0"
            max={maxOffset}
            value={scrubOffset}
            onChange={e => handleScrub(parseInt(e.target.value))}
            className="w-full accent-accent-purple"
          />
        </div>
      )}

      {paused && (
        <div className="mt-1 text-[9px] text-accent-yellow italic">
          Simulation paused — scrub to view history
        </div>
      )}
    </div>
  )
}
