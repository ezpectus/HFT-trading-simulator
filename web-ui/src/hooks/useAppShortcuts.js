import { useUIStore } from '../stores/useUIStore'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

/** Global keyboard shortcuts — exchange/symbol switching, sim speed,
 * tab navigation, sidebar toggle. Extracted from App.jsx. */
export function useAppShortcuts() {
  const { setSelectedExchange, setSelectedSymbol, setActiveTab,
          EXCHANGES, SYMBOLS } = useUIStore()

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
    'shift+|': () => useUIStore.getState().setSidebarCollapsed(!useUIStore.getState().sidebarCollapsed),
  })
}
