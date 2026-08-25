import { memo, useMemo, useState } from 'react'
import { Users, MessageSquare, Share2, UserCircle } from 'lucide-react'
import { statusColor } from '../utils/ui-helpers'

const MOCK_TEAM = [
  { id: 1, name: 'Alice', role: 'Admin', status: 'online', action: 'Reviewing BTC/USDT signals' },
  { id: 2, name: 'Bob', role: 'Trader', status: 'online', action: 'Managing SOL/USDT position' },
  { id: 3, name: 'Carol', role: 'Analyst', status: 'away', action: 'Running backtest comparison' },
  { id: 4, name: 'Dave', role: 'Trader', status: 'offline', action: 'Last active 2h ago' },
  { id: 5, name: 'Eve', role: 'Viewer', status: 'online', action: 'Watching dashboard' },
]

const MOCK_MESSAGES = [
  { id: 1, user: 'Alice', ts: '12:42', msg: 'BTC signal looking strong, confidence at 82%' },
  { id: 2, user: 'Bob', ts: '12:43', msg: 'Agreed, already entered 0.5 BTC long position' },
  { id: 3, user: 'Carol', ts: '12:44', msg: 'Backtest shows 64% win rate for this pattern' },
  { id: 4, user: 'Alice', ts: '12:45', msg: 'Good enough. Increasing position size to 0.8' },
  { id: 5, user: 'Eve', ts: '12:46', msg: 'Watching from the side, looks good' },
]

const MOCK_SHARED = [
  { id: 1, type: 'layout', name: 'Scalping Dashboard', sharedBy: 'Alice', ts: '2h ago' },
  { id: 2, type: 'strategy', name: 'Trend + MeanRev Ensemble', sharedBy: 'Bob', ts: '5h ago' },
  { id: 3, type: 'alert', name: 'BTC > $45k Alert', sharedBy: 'Carol', ts: '1d ago' },
]

const STATUS_MAP = {
  online: 'text-accent-green',
  away: 'text-accent-yellow',
  default: 'text-gray-600',
}

function statusDot(status) {
  if (status === 'online') return 'bg-accent-green'
  if (status === 'away') return 'bg-accent-yellow'
  return 'bg-gray-600'
}

const TeamCollab = memo(function TeamCollab({ addToast }) {
  const [messages, setMessages] = useState(MOCK_MESSAGES)
  const [input, setInput] = useState('')

  const onlineCount = useMemo(() => MOCK_TEAM.filter(m => m.status === 'online').length, [])

  const handleSend = () => {
    if (!input.trim()) return
    const newMsg = { id: messages.length + 1, user: 'You', ts: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }), msg: input.trim() }
    setMessages([...messages, newMsg])
    setInput('')
    if (addToast) addToast('success', 'Message sent to team')
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Team Collaboration</span>
        </div>
        <span className="text-[10px] text-gray-600">{onlineCount} online</span>
      </div>

      {/* Team members */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Members</div>
        <div className="space-y-0.5">
          {MOCK_TEAM.map(member => (
            <div key={member.id} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <div className="relative">
                <UserCircle size={14} className="text-gray-500" />
                <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${statusDot(member.status)} border border-bg-700`} />
              </div>
              <span className="text-[10px] text-gray-300 w-12">{member.name}</span>
              <span className="text-[9px] text-gray-600 w-12">{member.role}</span>
              <span className={`text-[9px] truncate flex-1 ${statusColor(member.status, STATUS_MAP)}`}>{member.action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <MessageSquare size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Team Chat</span>
        </div>
        <div className="bg-bg-900 border border-bg-600 rounded p-1.5 max-h-32 overflow-y-auto space-y-1">
          {messages.map(msg => (
            <div key={msg.id} className="flex items-start gap-1.5">
              <span className="text-[9px] text-gray-600 font-mono shrink-0">{msg.ts}</span>
              <span className="text-[10px] text-accent-blue font-medium shrink-0">{msg.user}:</span>
              <span className="text-[10px] text-gray-300 break-all">{msg.msg}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-bg-700 border border-bg-600 text-[10px] text-gray-200 px-2 py-1 rounded outline-none focus:border-accent-blue"
          />
          <button
            onClick={handleSend}
            className="px-2 py-1 bg-accent-blue/20 text-accent-blue text-[10px] rounded hover:bg-accent-blue/30 transition-colors"
          >
            Send
          </button>
        </div>
      </div>

      {/* Shared resources */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Share2 size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Shared Resources</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_SHARED.map(item => (
            <div key={item.id} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[8px] text-gray-600 uppercase px-1 rounded bg-bg-600 w-14 text-center">{item.type}</span>
              <span className="text-[10px] text-gray-300 flex-1 truncate">{item.name}</span>
              <span className="text-[9px] text-gray-600">by {item.sharedBy}</span>
              <span className="text-[9px] text-gray-600">{item.ts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default TeamCollab
