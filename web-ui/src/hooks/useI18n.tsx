import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage'

export type Locale = 'en' | 'ru'

type TranslationDict = Record<string, Record<Locale, string>>

const STORAGE_KEY = 'trading-sim-locale'

const translations: TranslationDict = {
  // Navigation
  'nav.dashboard': { en: 'Dashboard', ru: 'Панель' },
  'nav.trading': { en: 'Trading', ru: 'Торги' },
  'nav.analytics': { en: 'Analytics', ru: 'Аналитика' },
  'nav.backtest': { en: 'Backtest', ru: 'Бэктест' },
  'nav.settings': { en: 'Settings', ru: 'Настройки' },

  // Common
  'common.connecting': { en: 'Connecting...', ru: 'Подключение...' },
  'common.connected': { en: 'Connected', ru: 'Подключено' },
  'common.disconnected': { en: 'Disconnected', ru: 'Отключено' },
  'common.trading_active': { en: 'Trading Active', ru: 'Торги Активны' },
  'common.trading_stopped': { en: 'Trading Stopped', ru: 'Торги Остановлены' },
  'common.buy': { en: 'Buy', ru: 'Купить' },
  'common.sell': { en: 'Sell', ru: 'Продать' },
  'common.long': { en: 'Long', ru: 'Лонг' },
  'common.short': { en: 'Short', ru: 'Шорт' },
  'common.close': { en: 'Close', ru: 'Закрыть' },
  'common.cancel': { en: 'Cancel', ru: 'Отмена' },
  'common.save': { en: 'Save', ru: 'Сохранить' },
  'common.delete': { en: 'Delete', ru: 'Удалить' },
  'common.export': { en: 'Export', ru: 'Экспорт' },
  'common.search': { en: 'Search...', ru: 'Поиск...' },
  'common.loading': { en: 'Loading...', ru: 'Загрузка...' },
  'common.no_data': { en: 'No data', ru: 'Нет данных' },
  'common.error': { en: 'Error', ru: 'Ошибка' },
  'common.all': { en: 'All', ru: 'Все' },
  'common.wins': { en: 'Wins', ru: 'Прибыльные' },
  'common.losses': { en: 'Losses', ru: 'Убыточные' },

  // Panels
  'panel.order_book': { en: 'Order Book', ru: 'Стакан' },
  'panel.price_chart': { en: 'Price Chart', ru: 'График Цен' },
  'panel.positions': { en: 'Positions', ru: 'Позиции' },
  'panel.trade_history': { en: 'Trade History', ru: 'История Сделок' },
  'panel.signals': { en: 'Signals', ru: 'Сигналы' },
  'panel.signal_engine': { en: 'Signal Engine', ru: 'Сигнальный Движок' },
  'panel.account': { en: 'Account', ru: 'Счет' },
  'panel.performance': { en: 'Performance', ru: 'Эффективность' },
  'panel.risk': { en: 'Risk', ru: 'Риск' },
  'panel.journal': { en: 'Trade Journal', ru: 'Журнал Сделок' },
  'panel.backtest': { en: 'Backtest Runner', ru: 'Запуск Бэктеста' },
  'panel.comparison': { en: 'Comparison', ru: 'Сравнение' },
  'panel.options': { en: 'Options', ru: 'Опционы' },
  'panel.alerts': { en: 'Alerts', ru: 'Оповещения' },

  // Metrics
  'metric.balance': { en: 'Balance', ru: 'Баланс' },
  'metric.equity': { en: 'Equity', ru: 'Эквити' },
  'metric.pnl': { en: 'PnL', ru: 'PnL' },
  'metric.fees': { en: 'Fees', ru: 'Комиссии' },
  'metric.trades': { en: 'Trades', ru: 'Сделки' },
  'metric.win_rate': { en: 'Win Rate', ru: 'Винрейт' },
  'metric.sharpe': { en: 'Sharpe Ratio', ru: 'Коэф. Шарпа' },
  'metric.sortino': { en: 'Sortino Ratio', ru: 'Коэф. Сортино' },
  'metric.max_drawdown': { en: 'Max Drawdown', ru: 'Макс. Просадка' },
  'metric.profit_factor': { en: 'Profit Factor', ru: 'Прибыльность' },

  // Order form
  'order.quantity': { en: 'Quantity', ru: 'Количество' },
  'order.price': { en: 'Price', ru: 'Цена' },
  'order.type': { en: 'Order Type', ru: 'Тип Ордера' },
  'order.market': { en: 'Market', ru: 'Маркет' },
  'order.limit': { en: 'Limit', ru: 'Лимит' },
  'order.stop_loss': { en: 'Stop Loss', ru: 'Стоп-Лосс' },
  'order.take_profit': { en: 'Take Profit', ru: 'Тейк-Профит' },
  'order.leverage': { en: 'Leverage', ru: 'Плечо' },
  'order.submit': { en: 'Submit Order', ru: 'Отправить Ордер' },

  // Settings
  'settings.theme': { en: 'Theme', ru: 'Тема' },
  'settings.dark': { en: 'Dark', ru: 'Тёмная' },
  'settings.light': { en: 'Light', ru: 'Светлая' },
  'settings.language': { en: 'Language', ru: 'Язык' },
  'settings.sound': { en: 'Sound Alerts', ru: 'Звуковые Оповещения' },
  'settings.exchange': { en: 'Exchange', ru: 'Биржа' },
  'settings.symbol': { en: 'Symbol', ru: 'Символ' },
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, fallback?: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useLocalStorage<Locale>(STORAGE_KEY, 'en')

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
  }, [setLocaleState])

  const t = useCallback((key: string, fallback?: string): string => {
    const entry = translations[key]
    if (!entry) return fallback || key
    return entry[locale] || entry.en || key
  }, [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback for components outside provider
    return {
      locale: 'en',
      setLocale: () => {},
      t: (key: string, fallback?: string) => fallback || key,
    }
  }
  return ctx
}
