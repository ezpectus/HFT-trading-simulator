import { useState, useRef } from 'react'
import { Store, Download, Upload, Trash2, Search, FileJson, Check, X } from 'lucide-react'
import { useStrategyMarketplace } from '../hooks/useStrategyMarketplace'

const TAG_COLORS = {
  'beginner': 'bg-accent-green/20 text-accent-green',
  'intermediate': 'bg-accent-yellow/20 text-accent-yellow',
  'advanced': 'bg-accent-red/20 text-accent-red',
  'mean-reversion': 'bg-accent-blue/20 text-accent-blue',
  'trend-following': 'bg-accent-purple/20 text-accent-purple',
  'breakout': 'bg-accent-orange/20 text-accent-orange',
  'rsi': 'bg-accent-blue/20 text-accent-blue',
  'ema': 'bg-accent-purple/20 text-accent-purple',
  'volume': 'bg-accent-green/20 text-accent-green',
}

export default function StrategyMarketplace() {
  const { importedStrategies, allStrategies, downloadStrategy, uploadStrategy, deleteImported, importStrategy } = useStrategyMarketplace()
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState(null)
  const [importMsg, setImportMsg] = useState(null)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const fileRef = useRef(null)

  const filtered = allStrategies.filter(s => {
    if (filterTag && !s.tags.includes(filterTag)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false
    }
    return true
  })

  const allTags = [...new Set(allStrategies.flatMap(s => s.tags))]

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await uploadStrategy(file)
    setImportMsg({ ok: result.ok, text: result.ok ? 'Strategy imported!' : (result.error || 'Import failed') })
    setTimeout(() => setImportMsg(null), 3000)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleTextImport = () => {
    if (!importText.trim()) return
    const result = importStrategy(importText)
    setImportMsg({ ok: result.ok, text: result.ok ? 'Strategy imported!' : (result.error || 'Import failed') })
    if (result.ok) { setImportText(''); setShowImport(false) }
    setTimeout(() => setImportMsg(null), 3000)
  }

  const isImported = (id) => importedStrategies.some(s => s.id === id)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Store size={12} className="text-accent-purple" />
        Strategy Marketplace
        <span className="text-gray-600 ml-auto">{filtered.length}/{allStrategies.length}</span>
      </div>

      {importMsg && (
        <div className={`mb-2 px-2 py-1 rounded text-[9px] flex items-center gap-1 ${importMsg.ok ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
          {importMsg.ok ? <Check size={10} /> : <X size={10} />}
          {importMsg.text}
        </div>
      )}

      <div className="flex gap-1 mb-2">
        <div className="flex-1 relative">
          <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search strategies..."
            className="w-full bg-bg-800 border border-bg-600 rounded pl-6 pr-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple"
          />
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 px-2 py-0.5 text-[9px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30"
          title="Upload strategy JSON file"
        >
          <Upload size={10} />
          Import
        </button>
        <input ref={fileRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
      </div>

      <div className="flex flex-wrap gap-0.5 mb-2">
        {allTags.map(tag => (
          <button
            key={tag}
            onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            className={`px-1 py-0.5 text-[7px] rounded ${filterTag === tag ? 'bg-accent-purple/30 text-accent-purple' : (TAG_COLORS[tag] || 'bg-bg-600 text-gray-400')}`}
          >
            {tag}
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowImport(!showImport)}
        className="w-full text-[8px] text-gray-600 hover:text-gray-400 mb-2"
      >
        {showImport ? 'Cancel paste' : 'Or paste JSON directly...'}
      </button>
      {showImport && (
        <div className="mb-2 space-y-1">
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder='{"name": "My Strategy", "rules": [...], ...}'
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[9px] text-gray-200 font-mono outline-none focus:border-accent-purple resize-none"
            rows={4}
          />
          <button
            onClick={handleTextImport}
            className="w-full py-0.5 text-[9px] rounded bg-accent-purple/20 text-accent-purple"
          >
            Import from JSON
          </button>
        </div>
      )}

      <div className="space-y-1 max-h-[250px] overflow-y-auto scrollbar-thin">
        {filtered.map(s => (
          <div key={s.id} className="bg-bg-600/40 rounded p-1.5 group">
            <div className="flex items-start gap-1.5">
              <FileJson size={10} className="text-gray-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-gray-200 truncate">{s.name}</div>
                <div className="text-[8px] text-gray-600 truncate">{s.description}</div>
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {s.tags.map(tag => (
                    <span key={tag} className={`px-1 py-0.5 text-[7px] rounded ${TAG_COLORS[tag] || 'bg-bg-600 text-gray-400'}`}>
                      {tag}
                    </span>
                  ))}
                  <span className="px-1 py-0.5 text-[7px] rounded bg-bg-600 text-gray-600">
                    {s.rules.length} rules
                  </span>
                  {isImported(s.id) && (
                    <span className="px-1 py-0.5 text-[7px] rounded bg-accent-green/20 text-accent-green">imported</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => downloadStrategy(s)}
                  className="text-gray-600 hover:text-accent-blue"
                  title="Export as JSON"
                >
                  <Download size={10} />
                </button>
                {isImported(s.id) && (
                  <button
                    onClick={() => deleteImported(s.id)}
                    className="text-gray-600 hover:text-accent-red"
                    title="Delete imported strategy"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-[10px] text-gray-600 italic py-2 text-center">No strategies match filters</div>
        )}
      </div>
    </div>
  )
}
