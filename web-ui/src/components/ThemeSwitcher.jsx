import { memo, useCallback } from 'react'
import { Moon, Sun, Palette, Check } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const THEMES = [
  { id: 'dark', name: 'Dark', description: 'Default dark theme', icon: Moon, bg: 'bg-bg-900', accent: 'text-accent-blue' },
  { id: 'light', name: 'Light', description: 'Bright light theme', icon: Sun, bg: 'bg-gray-100', accent: 'text-blue-600' },
  { id: 'midnight', name: 'Midnight', description: 'Deep blue dark theme', icon: Moon, bg: 'bg-slate-950', accent: 'text-indigo-400' },
  { id: 'forest', name: 'Forest', description: 'Green-tinted dark theme', icon: Palette, bg: 'bg-green-950', accent: 'text-emerald-400' },
]

const ACCENT_COLORS = [
  { id: 'blue', class: 'bg-accent-blue', name: 'Blue' },
  { id: 'green', class: 'bg-accent-green', name: 'Green' },
  { id: 'red', class: 'bg-accent-red', name: 'Red' },
  { id: 'yellow', class: 'bg-accent-yellow', name: 'Yellow' },
  { id: 'purple', class: 'bg-accent-purple', name: 'Purple' },
]

const ThemeSwitcher = memo(function ThemeSwitcher({ addToast }) {
  const [theme, setTheme] = useLocalStorage('trading-sim-theme', 'dark')
  const [accentColor, setAccentColor] = useLocalStorage('trading-accent-color', 'blue')

  const handleThemeChange = useCallback((themeId) => {
    setTheme(themeId)
    const root = document.documentElement
    root.classList.remove('dark', 'light', 'midnight', 'forest')
    root.classList.add(themeId)
    addToast?.('info', `Theme: ${THEMES.find(t => t.id === themeId)?.name}`)
  }, [setTheme, addToast])

  const handleAccentChange = useCallback((colorId) => {
    setAccentColor(colorId)
    addToast?.('info', `Accent color: ${ACCENT_COLORS.find(c => c.id === colorId)?.name}`)
  }, [setAccentColor, addToast])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Palette size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Theme Switcher</span>
        </div>
      </div>

      {/* Theme selection */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Theme</div>
        <div className="grid grid-cols-2 gap-1">
          {THEMES.map(t => {
            const Icon = t.icon
            const isActive = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => handleThemeChange(t.id)}
                className={`flex items-center gap-1.5 p-2 border transition-colors ${
                  isActive ? 'border-accent-blue bg-accent-blue/10' : 'border-bg-600 bg-bg-700 hover:bg-bg-600'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-accent-blue' : 'text-gray-500'} />
                <div className="flex flex-col items-start min-w-0">
                  <span className={`text-[10px] font-medium ${isActive ? 'text-accent-blue' : 'text-gray-300'}`}>
                    {t.name}
                  </span>
                  <span className="text-[9px] text-gray-600 truncate">{t.description}</span>
                </div>
                {isActive && <Check size={12} className="text-accent-blue ml-auto" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Accent color */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Accent Color</div>
        <div className="flex gap-1.5">
          {ACCENT_COLORS.map(color => (
            <button
              key={color.id}
              onClick={() => handleAccentChange(color.id)}
              className={`w-7 h-7 rounded ${color.class} transition-transform ${
                accentColor === color.id ? 'ring-2 ring-white scale-110' : ''
              }`}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="text-[10px] text-gray-600 mb-1">Preview</div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${THEMES.find(t => t.id === theme)?.accent || 'text-accent-blue'}`}>
            Sample Text
          </span>
          <span className="text-[11px] text-gray-400">Normal Text</span>
          <span className="text-[11px] text-gray-600">Muted Text</span>
        </div>
        <div className="flex gap-1 mt-1">
          <span className="text-[9px] px-1.5 py-0.5 bg-accent-green/20 text-accent-green">Buy</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-accent-red/20 text-accent-red">Sell</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-accent-yellow/20 text-accent-yellow">Warning</span>
        </div>
      </div>
    </div>
  )
})

export default memo(ThemeSwitcher)
