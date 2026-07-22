import { useState, useRef, useCallback, useEffect } from 'react'
import { PlayCircle, StopCircle, Download, Upload, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSessionRecorder } from '../hooks/useSessionRecorder'

export default function SessionReplay({ accounts, fills, signals, candles, prices, orderbooks, symbol, exchange }) {
  const {
    isRecording, snapshotCount, savedRecordings,
    startRecording, updateData, captureSnapshot, stopRecording,
    deleteRecording, exportRecording, importRecording,
  } = useSessionRecorder()

  const [recName, setRecName] = useState('')
  const [viewing, setViewing] = useState(null)
  const [seekIdx, setSeekIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1)
  const [importMsg, setImportMsg] = useState(null)
  const playRef = useRef(null)
  const fileRef = useRef(null)

  const handleStart = () => {
    startRecording(recName || `Session ${new Date().toLocaleString()}`, symbol, exchange)
    setRecName('')
  }

  const handleStop = () => {
    const rec = stopRecording()
    if (rec) {
      setViewing(rec)
      setSeekIdx(0)
    }
  }

  useEffect(() => {
    updateData({ accounts, fills, signals, candles, prices, orderbooks })
  }, [accounts, fills, signals, candles, prices, orderbooks, updateData])

  useEffect(() => {
    if (!isRecording) return
    const interval = setInterval(() => {
      captureSnapshot()
    }, 1000)
    return () => clearInterval(interval)
  }, [isRecording, captureSnapshot])

  const handlePlay = useCallback(() => {
    if (!viewing || viewing.snapshots.length === 0) return
    setIsPlaying(true)
  }, [viewing])

  useEffect(() => {
    if (!isPlaying || !viewing) return
    const stepMs = 1000 / playSpeed
    playRef.current = setInterval(() => {
      setSeekIdx(prev => {
        if (prev >= viewing.snapshots.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, stepMs)
    return () => { if (playRef.current) clearInterval(playRef.current) }
  }, [isPlaying, viewing, playSpeed])

  const handlePause = () => setIsPlaying(false)

  const handleSeek = (idx) => {
    setSeekIdx(Math.max(0, Math.min(idx, (viewing?.snapshots.length || 1) - 1)))
  }

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = importRecording(text)
    setImportMsg({ ok: result.ok, text: result.ok ? 'Recording imported!' : (result.error || 'Import failed') })
    setTimeout(() => setImportMsg(null), 3000)
    if (fileRef.current) fileRef.current.value = ''
  }

  const currentSnapshot = viewing && viewing.snapshots[seekIdx]
  const progress = viewing ? ((seekIdx / Math.max(1, viewing.snapshots.length - 1)) * 100).toFixed(1) : 0

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <PlayCircle size={12} className="text-accent-blue" />
        Session Replay
      </div>

      {importMsg && (
        <div className={`mb-2 px-2 py-1 rounded text-[9px] ${importMsg.ok ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
          {importMsg.text}
        </div>
      )}

      {!isRecording ? (
        <div className="space-y-1.5 mb-2">
          <input
            type="text"
            value={recName}
            onChange={e => setRecName(e.target.value)}
            placeholder="Recording name (optional)"
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-blue"
          />
          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded bg-accent-red/20 text-accent-red hover:bg-accent-red/30"
          >
            <StopCircle size={10} />
            Start Recording
          </button>
        </div>
      ) : (
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-1 text-[9px] text-accent-red">
            <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
            REC {snapshotCount} snapshots
          </div>
          <button
            onClick={handleStop}
            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30"
          >
            <StopCircle size={10} />
            Stop & Save
          </button>
        </div>
      )}

      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-1 py-0.5 text-[9px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 mb-2"
      >
        <Upload size={10} />
        Import Recording
      </button>
      <input ref={fileRef} type="file" accept=".json" onChange={handleFileImport} className="hidden" />

      {savedRecordings.length > 0 && (
        <div className="border-t border-bg-600 pt-2">
          <div className="text-[8px] text-gray-600 uppercase mb-1">Saved Recordings</div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto scrollbar-thin">
            {savedRecordings.map(rec => (
              <div key={rec.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-bg-600/50 group">
                <button
                  onClick={() => { setViewing(rec); setSeekIdx(0) }}
                  className="flex-1 text-left text-[9px] text-gray-400 hover:text-gray-200"
                >
                  <div className="truncate">{rec.name}</div>
                  <div className="text-[7px] text-gray-600">
                    {rec.snapshots.length} snaps | {rec.metadata.totalTrades} trades | {(rec.metadata.maxDrawdown * 100).toFixed(1)}% DD
                  </div>
                </button>
                <button onClick={() => exportRecording(rec)} className="text-gray-600 hover:text-accent-blue opacity-0 group-hover:opacity-100">
                  <Download size={9} />
                </button>
                <button onClick={() => deleteRecording(rec.id)} className="text-gray-600 hover:text-accent-red opacity-0 group-hover:opacity-100">
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewing && currentSnapshot && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-bg-800 rounded-lg p-4 max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-gray-200">{viewing.name}</div>
                <div className="text-[10px] text-gray-600">
                  {new Date(viewing.startTime).toLocaleString()} | {viewing.snapshots.length} snapshots |
                  {viewing.metadata.totalTrades} trades | Peak: ${viewing.metadata.peakEquity.toFixed(2)} |
                  MaxDD: {(viewing.metadata.maxDrawdown * 100).toFixed(1)}%
                </div>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-600 hover:text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="bg-bg-700 rounded p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => isPlaying ? handlePause() : handlePlay()} className="text-accent-blue hover:text-accent-blue/80">
                  {isPlaying ? <StopCircle size={16} /> : <PlayCircle size={16} />}
                </button>
                <button onClick={() => handleSeek(seekIdx - 1)} className="text-gray-400 hover:text-gray-200">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => handleSeek(seekIdx + 1)} className="text-gray-400 hover:text-gray-200">
                  <ChevronRight size={14} />
                </button>
                <span className="text-[10px] text-gray-500 font-mono">
                  {seekIdx + 1}/{viewing.snapshots.length} ({progress}%)
                </span>
                <select value={playSpeed} onChange={e => setPlaySpeed(Number(e.target.value))} className="bg-bg-600 text-[9px] text-gray-300 rounded px-1 py-0.5">
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={5}>5x</option>
                  <option value={10}>10x</option>
                </select>
              </div>
              <input
                type="range"
                min={0}
                max={viewing.snapshots.length - 1}
                value={seekIdx}
                onChange={e => handleSeek(Number(e.target.value))}
                className="w-full accent-accent-blue"
              />
              <div className="text-[8px] text-gray-600 mt-1">
                {new Date(currentSnapshot.t).toLocaleTimeString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(currentSnapshot.accounts).map(([exId, acc]) => (
                <div key={exId} className="bg-bg-700 rounded p-2">
                  <div className="text-[9px] text-gray-500 uppercase mb-1">{exId}</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div><span className="text-gray-600">Balance:</span> <span className="text-gray-200 font-mono">${(acc.balance || 0).toFixed(2)}</span></div>
                    <div><span className="text-gray-600">Equity:</span> <span className="text-gray-200 font-mono">${(acc.equity || 0).toFixed(2)}</span></div>
                    <div><span className="text-gray-600">PnL:</span> <span className={`font-mono ${(acc.total_pnl || 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{(acc.total_pnl || 0) >= 0 ? '+' : ''}${(acc.total_pnl || 0).toFixed(2)}</span></div>
                    <div><span className="text-gray-600">Pos:</span> <span className="text-gray-200 font-mono">{Object.keys(acc.positions || {}).length}</span></div>
                  </div>
                  {acc.positions && Object.keys(acc.positions).length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {Object.values(acc.positions).slice(0, 5).map((p, i) => (
                        <div key={i} className="text-[8px] text-gray-400 flex justify-between">
                          <span>{p.symbol} {p.side}</span>
                          <span className={p.unrealized_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                            {p.unrealized_pnl >= 0 ? '+' : ''}${p.unrealized_pnl.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {currentSnapshot.fills.length > 0 && (
              <div className="mt-2 bg-bg-700 rounded p-2">
                <div className="text-[9px] text-gray-500 uppercase mb-1">Recent Fills ({currentSnapshot.fills.length})</div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                  {currentSnapshot.fills.slice(-10).map((f, i) => (
                    <div key={i} className="text-[8px] text-gray-400 flex justify-between">
                      <span>{f.symbol} {f.side} {f.quantity}</span>
                      <span className="font-mono">${f.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
