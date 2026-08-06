import { useEffect, useRef } from 'react'

const IGNORED_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA'])

interface KeyboardShortcutOptions {
  ignoreInputs?: boolean
  deps?: unknown[]
}

type ShortcutMap = Record<string, (e: KeyboardEvent) => void>

/**
 * Register global keyboard shortcuts.
 *
 * @param shortcuts - Map of key → handler function
 *   Keys are matched case-insensitively. Use ' ' for space, 'Escape', etc.
 *   Modifier prefixes: 'ctrl+a', 'shift+s', 'alt+1', 'ctrl+shift+k'
 * @param options
 *   - ignoreInputs: if true (default), shortcuts are skipped when typing in input/select/textarea
 *   - deps: dependency array for the effect (default [])
 *
 * @example
 * useKeyboardShortcuts({
 *   '1': () => setExchange('binance'),
 *   'ctrl+s': () => save(),
 *   ' ': (e) => { e.preventDefault(); togglePause() },
 * }, { deps: [setExchange] })
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  options: KeyboardShortcutOptions = {}
): void {
  const { ignoreInputs = true, deps = [] } = options

  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (ignoreInputs && target.tagName && IGNORED_TAGS.has(target.tagName)) return

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')
      parts.push(e.key.toLowerCase())
      const combo = parts.join('+')

      const fn = shortcutsRef.current[combo] || shortcutsRef.current[e.key]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ignoreInputs, ...deps])
}
