import { useState, useMemo } from 'react'
import { BookOpen, Tag, Search, X } from 'lucide-react'
import { formatUsd } from '../utils/format'
import { useTradeJournal, tradeKeyFromId, extractTradesFromAccounts } from '../hooks/useTradeJournal'

const TAG_COLORS = {
  'momentum': 'bg-accent-blue/20 text-accent-blue',
  'reversal': 'bg-accent-purple/20 text-accent-purple',
  'breakout': 'bg-accent-green/20 text-accent-green',
  'scalp': 'bg-accent-yellow/20 text-accent-yellow',
  'swing': 'bg-accent-orange/20 text-accent-orange',
  'hedge': 'bg-gray-500/20 text-gray-400',
  'news': 'bg-accent-red/20 text-accent-red',
  'fomo': 'bg-accent-red/20 text-accent-red',
  'good': 'bg-accent-green/20 text-accent-green',
  'bad': 'bg-accent-red/20 text-accent-red',
}

export default function TradeJournal({ accounts }) {
  const { data: entries, saveEntry, allTags: getAllTags } = useTradeJournal()
  const [filterTag, setFilterTag] = useState(null)
  const [filterWin, setFilterWin] = useState('all')
  const [search, setSearch] = useState('')
  const [activeTradeId, setActiveTradeId] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [noteTags, setNoteTags] = useState([])

  const allTrades = useMemo(() => extractTradesFromAccounts(accounts), [accounts])

  const filteredTrades = useMemo(() => {
    return allTrades.filter(t => {
      const key = tradeKeyFromId(t.id)
      const entry = entries[key]
      const entryTags = typeof entry === 'object' && entry !== null ? (entry.tags || []) : []
      const entryNote = typeof entry === 'object' && entry !== null ? entry.note : (typeof entry === 'string' ? entry : '')
      if (filterTag && !entryTags.includes(filterTag)) return false
      if (filterWin === 'win' && (t.pnl || 0) <= 0) return false
      if (filterWin === 'loss' && (t.pnl || 0) > 0) return false
      if (search) {
        const q = search.toLowerCase()
        const matchesSymbol = t.symbol?.toLowerCase().includes(q)
        const matchesNote = entryNote?.toLowerCase().includes(q)
        if (!matchesSymbol && !matchesNote) return false
      }
      return true
    })
  }, [allTrades, entries, filterTag, filterWin, search])

  const allTags = useMemo(() => getAllTags(), [getAllTags])

  const handleSaveNote = (tradeId) => {
    const key = tradeKeyFromId(tradeId)
    saveEntry(key, noteText, noteTags)
    setActiveTradeId(null)
    setNoteText('')
    setNoteTags([])
  }

  const toggleTag = (tag) => {
    setNoteTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BookOpen size={12} className="text-accent-blue" />
        Trade Journal
        <span className="text-gray-600 ml-auto">{filteredTrades.length}/{allTrades.length}</span>
      </div>

      {/* Search */}
      <div className="flex gap-1 mb-2">
        <div className="flex-1 relative">
          <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search symbol or note..."
            className="w-full bg-bg-800 border border-bg-600 rounded pl-6 pr-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setFilterWin('all')}
          className={'px-1.5 py-0.5 text-[8px] rounded ' + (filterWin === 'all' ? 'bg-bg-600 text-gray-200' : 'text-gray-600')}
        >All</button>
        <button
          onClick={() => setFilterWin('win')}
          className={'px-1.5 py-0.5 text-[8px] rounded ' + (filterWin === 'win' ? 'bg-accent-green/20 text-accent-green' : 'text-gray-600')}
        >Wins</button>
        <button
          onClick={() => setFilterWin('loss')}
          className={'px-1.5 py-0.5 text-[8px] rounded ' + (filterWin === 'loss' ? 'bg-accent-red/20 text-accent-red' : 'text-gray-600')}
        >Losses</button>
        {filterTag && (
          <button
            onClick={() => setFilterTag(null)}
            className="px-1.5 py-0.5 text-[8px] rounded bg-accent-blue/20 text-accent-blue flex items-center gap-0.5"
          >
            {filterTag} <X size={8} />
          </button>
        )}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className={'px-1 py-0.5 text-[7px] rounded ' + (TAG_COLORS[tag] || 'bg-bg-600 text-gray-400')}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Trade list */}
      <div className="max-h-[200px] overflow-y-auto scrollbar-thin space-y-0.5">
        {filteredTrades.slice(0, 20).map(t => {
          const key = tradeKeyFromId(t.id)
          const entry = entries[key]
          const entryNote = typeof entry === 'object' && entry !== null ? entry.note : (typeof entry === 'string' ? entry : '')
          const entryTags = typeof entry === 'object' && entry !== null ? (entry.tags || []) : []
          const isWin = (t.pnl || 0) > 0
          const isEditing = activeTradeId === t.id
          return (
            <div key={t.id} className="bg-bg-600/40 rounded p-1.5">
              <div className="flex items-center gap-1.5">
                <span className={'text-[9px] font-medium ' + (isWin ? 'text-accent-green' : 'text-accent-red')}>
                  {t.symbol?.split('/')[0]}
                </span>
                <span className="text-[8px] text-gray-600">{t.side}</span>
                <span className={'text-[9px] font-mono ml-auto ' + (isWin ? 'text-accent-green' : 'text-accent-red')}>
                  {isWin ? '+' : ''}{formatUsd(t.pnl || 0)}
                </span>
                <button
                  onClick={() => {
                    if (isEditing) { setActiveTradeId(null) }
                    else { setActiveTradeId(t.id); setNoteText(entryNote || ''); setNoteTags(entryTags) }
                  }}
                  className="text-gray-600 hover:text-accent-blue"
                >
                  <Tag size={9} />
                </button>
              </div>

              {/* Tags */}
              {entryTags.length > 0 && !isEditing && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {entryTags.map(tag => (
                    <span key={tag} className={'px-1 py-0.5 text-[7px] rounded ' + (TAG_COLORS[tag] || 'bg-bg-600 text-gray-400')}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Note preview */}
              {entryNote && !isEditing && (
                <div className="text-[8px] text-gray-500 mt-1 italic truncate">"{entryNote}"</div>
              )}

              {/* Edit mode */}
              {isEditing && (
                <div className="mt-1.5 space-y-1">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Add note..."
                    className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[9px] text-gray-200 outline-none focus:border-accent-blue resize-none"
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-0.5">
                    {Object.keys(TAG_COLORS).map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={'px-1 py-0.5 text-[7px] rounded ' +
                          (noteTags.includes(tag) ? TAG_COLORS[tag] : 'bg-bg-600 text-gray-600')}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSaveNote(t.id)}
                    className="w-full py-0.5 text-[9px] rounded bg-accent-blue/20 text-accent-blue"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredTrades.length === 0 && (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No trades match filters</div>
      )}
    </div>
  )
}
