# OFFICE BOARD — РЕФАКТОРИНГ

> Фаза 2 (Рефакторинг): АКТИВНА
> План: docs/REFACTORING_PLAN_10DAYS.md

## Прогресс
- **DONE:** 80 задач (REF-51..110, REF-501..520)
- **TODO:** 492 задачи
- **JS тесты:** 857 тестов, 0 failures (commit a039f4c)
- **Python тесты:** фиксы применены (test_validator, test_comm_circuit_breaker, test_signal_publisher, test_db, test_backtester, test_tracker, test_integration, test_e2e_pipeline, test_strategy_risk_backtest)
- **Следующий приоритет:** REF-01..50 (DRY refactoring) → REF-521..540 (config updates)

---
## ФАЗА 4 — Code Quality: Refactoring, Optimization & Static Analysis

### Категория A: DRY — Centralize duplicated helper functions

### REF-01: Centralize `statusColor` across 11 components ✅ DONE
**Описание:** `statusColor` дублируется в 11 компонентах с разной логикой маппинга статусов.
- Компоненты: `ArbScanner`, `CapacityAnalysis`, `Colocation`, `DashboardProfiler`, `DataQuality`, `FillAnalytics`, `LatencyPanel`, `PacketInspector`, `PairsArb`, `RetrainingPipeline`, `TeamCollab`
- Решение: использовать `statusColor(status, map)` из `ui-helpers.js`, передавать маппинг как параметр
- Для `LatencyPanel` (value-based, не status-based) — оставить как есть или создать `latencyColor(ms)`
**Сложность:** Низкая
**Файлы:** 11 компонентов + `web-ui/src/utils/ui-helpers.js`

### REF-02: Centralize `statusBg` across 5 components ✅ DONE
**Описание:** `statusBg` дублируется в 5 компонентах с одинаковой логикой (green/yellow/red bg).
- Компоненты: `ArbScanner`, `CapacityAnalysis`, `DashboardProfiler`, `LatencyPanel`, `PairsArb`
- Решение: добавить `statusBg(status, map)` в `ui-helpers.js`, импортировать в компонентах
**Сложность:** Низкая
**Файлы:** 5 компонентов + `web-ui/src/utils/ui-helpers.js`

### REF-03: Replace `dirColor` with `sideColor` in SignalTracker ✅ DONE
**Описание:** `SignalTracker.jsx` имеет локальную `dirColor(dir)` — это дубль `sideColor` из `ui-helpers.js`.
- Решение: импортировать `sideColor` из `ui-helpers.js`, удалить локальную функцию
**Сложность:** Низкая
**Файлы:** `web-ui/src/components/SignalTracker.jsx`

### REF-04: Consolidate `colorForSide`/`bgColorForSide` from format.ts into ui-helpers.js ✅ DONE
**Описание:** `format.ts` содержит `colorForSide` и `bgColorForSide`, а `ui-helpers.js` — `sideColor` и `pnlBg`. Это дублирование.
- Решение: убрать `colorForSide`/`bgColorForSide` из `format.ts`, обновить импорты во всех компонентах на `sideColor`/`pnlBg` из `ui-helpers.js`
- Проверить: `BotStatus.jsx` и другие, импортирующие из `format.ts`
**Сложность:** Низкая
**Файлы:** `web-ui/src/utils/format.ts`, `web-ui/src/utils/ui-helpers.js`, компоненты-потребители

### Категория B: DRY — Centralize UI patterns

### REF-05: Adopt `StatCard` component across all components ✅ DONE (23 components)
**Описание:** `StatCard` создан в `ui-helpers.js`, но не используется ни в одном компоненте. При этом паттерн `p-2 bg-bg-700 border border-bg-600` повторяется 50+ раз.
- Компоненты для миграции: `ABTesting`, `Colocation`, `DataQuality`, `FuturesBasis`, `DeployStatus`, `DatabaseViewer`, `DashboardProfiler`, `CostBasis`, `CrossAssetMatrix`, `FillAnalytics`, `CapacityAnalysis`, `FeatureStudio`, `DrawingTools`, `ChartTemplates` и др.
- Решение: заменить inline-карточки на `<StatCard label="..." value="..." color="..." icon={...} />`
**Сложность:** Средняя
**Файлы:** 20+ компонентов + `web-ui/src/utils/ui-helpers.js`

### REF-06: Adopt `Bar` component across all components ✅ DONE (8 components)
**Описание:** `Bar` создан в `ui-helpers.js`, но не используется. Паттерн progress-bar повторяется в множестве компонентов.
- Найти все inline progress bars (`flex-1 h-* bg-bg-600` + inner `div` with `width: %`)
- Заменить на `<Bar value={...} max={...} color="..." />`
**Сложность:** Средняя
**Файлы:** 10+ компонентов

### REF-07: Adopt `WarningBanner` component across all components ✅ DONE (15 components)
**Описание:** `WarningBanner` создан, но не используется. Паттерн warning/alert banner повторяется.
- Найти все inline warning banners (`flex items-center gap-* p-* bg-accent-*/10 border`)
- Заменить на `<WarningBanner icon={...} color="...">text</WarningBanner>`
- Исправить баг в `WarningBanner`: `color.replace('accent-', 'accent-/')` — некорректная замена для Tailwind
**Сложность:** Средняя
**Файлы:** 5+ компонентов + `web-ui/src/utils/ui-helpers.js`

### REF-08: Create `Label` component for repeated `text-[9px] text-gray-600 uppercase` pattern ✅ DONE (16 components)
**Описание:** Паттерн `<span className="text-[9px] text-gray-600 uppercase">` повторяется 30+ раз.
- Решение: создать `Label` компонент в `ui-helpers.js`, использовать во всех компонентах
**Сложность:** Низкая
**Файлы:** `web-ui/src/utils/ui-helpers.js` + 20+ компонентов

### REF-09: Create `SectionTitle` component for repeated header pattern ✅ DONE (15 components)
**Описание:** Паттерн заголовка секции (`flex items-center gap-* mb-*` + icon + text) повторяется во всех компонентах.
- Решение: создать `SectionTitle` в `ui-helpers.js` с props `icon`, `title`, `right` (optional right content)
**Сложность:** Низкая
**Файлы:** `web-ui/src/utils/ui-helpers.js` + 30+ компонентов

### Категория C: DRY — Centralize mock data

### REF-10: Extract all MOCK_ data into centralized mock data files ✅ DONE (partial: 10 components)
**Описание:** 20+ компонентов содержат inline `MOCK_*` массивы данных.
- Компоненты: `ABTesting`, `ApiPlayground`, `ArbScanner`, `AuditTrail`, `BlackSwanTester`, `CancelMonitor`, `Colocation`, `DataQuality`, `DashboardProfiler`, `FuturesBasis`, `PairsArb`, `RetrainingPipeline`, `TeamCollab`, `FillAnalytics`, `CapacityAnalysis` и др.
- Решение: создать `web-ui/src/utils/mock-data/components/` директорию, вынести mock данные по категориям
- Сохранить обратную совместимость: компоненты импортируют из централизованного источника
**Сложность:** Средняя
**Файлы:** 20+ компонентов, новый `web-ui/src/utils/mock-data/`

### REF-11: Create mock data factory for consistent test data generation ✅ DONE
**Описание:** Mock данные статичны и не генерируются программно. Тесты используют хардкод.
- Решение: создать фабрику `createMockSignal()`, `createMockFill()`, `createMockPosition()` и т.д.
- Использовать в тестах для уменьшения дублирования
**Сложность:** Средняя
**Файлы:** `web-ui/src/utils/mock-data/factories.js`, тесты

### Категория D: PropTypes & prop validation

### REF-12: Add PropTypes to all components ✅ DONE (partial: ui-helpers components)
**Описание:** Ни один компонент не имеет prop validation. ESLint выдаёт предупреждения.
- Установить `prop-types` пакет
- Добавить `Component.propTypes = { ... }` ко всем компонентам
- Начать с `ui-helpers.js` (StatCard, Bar, WarningBanner), затем все остальные
**Сложность:** Средняя
**Файлы:** Все компоненты в `web-ui/src/components/`

### REF-13: Add defaultProps to components with optional props ✅ DONE (N/A — components use destructuring defaults)
**Описание:** Многие компоненты имеют optional props без defaultProps, что может вызвать runtime errors.
- Найти все компоненты с деструктуризацией props, имеющих default значения в коде
- Добавить явные `defaultProps`
**Сложность:** Низкая
**Файлы:** 30+ компонентов

### Категория E: Test fixes & coverage

### REF-14: Fix `useLocalStorage` hook causing test failures ⬜ TODO
**Описание:** Тесты `featureFlags.test.jsx` и `themeSwitcher.test.jsx` падают из-за `useLocalStorage`.
- Анализ: хук не корректно мокается в тестах, или его реализация ломает jsdom
- Решение: либо исправить хук, либо добавить proper mock в test setup
- Проверить: `web-ui/src/hooks/useLocalStorage.js` (или `.ts`)
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useLocalStorage.*`, `web-ui/src/test/featureFlags.test.jsx`, `web-ui/src/test/themeSwitcher.test.jsx`

### REF-15: Add tests for `ui-helpers.js` utility functions ⬜ TODO
**Описание:** `ui-helpers.js` не имеет тестов. Нужно покрыть: `pnlColor`, `pnlBg`, `sideColor`, `statusColor`, `statusIcon`, `ICONS`, `StatCard`, `Bar`, `WarningBanner`.
**Сложность:** Низкая
**Файлы:** Новый `web-ui/src/test/uiHelpers.test.jsx`

### REF-16: Add tests for `format.ts` utility functions ⬜ TODO
**Описание:** `format.ts` не имеет тестов. Покрыть: `formatPrice`, `formatVolume`, `formatPct`, `formatUsd`, `formatTime`.
**Сложность:** Низкая
**Файлы:** Новый `web-ui/src/test/format.test.js`

### REF-17: Add tests for `patterns.ts` (candle pattern detection) ⬜ TODO
**Описание:** `detectCandlePatterns` не имеет тестов, хотя имеет сложную логику.
- Покрыть: DOJI, HAMMER, SHOOTING_STAR, BULLISH_ENGULFING, BEARISH_ENGULFING, THREE_SOLDIERS, THREE_CROWS
- Edge cases: пустой массив, < 3 candles, дубликаты паттернов
**Сложность:** Средняя
**Файлы:** Новый `web-ui/src/test/patterns.test.js`

### REF-18: Add tests for `timeframes.ts` (candle aggregation) ⬜ TODO
**Описание:** `aggregateCandles` не имеет тестов.
- Покрыть: factor=1 (no-op), factor=3, пустой массив, candles на границе бакетов
**Сложность:** Низкая
**Файлы:** Новый `web-ui/src/test/timeframes.test.js`

### REF-19: Audit all 53 test files for flaky tests ⬜ TODO
**Описание:** 53 тест-файла могут содержать flaky тесты (зависящие от таймеров, random, localStorage).
- Запустить `vitest run --reporter=verbose` 3 раза подряд
- Зафиксировать тесты, которые иногда падают
- Исправить: использовать `vi.useFakeTimers()`, `vi.mock()`, seed random
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/`

### REF-20: Add test coverage report and set minimum threshold ⬜ TODO
**Описание:** Нет измерения coverage. Нужно добавить coverage report и установить порог.
- Добавить `@vitest/coverage-v8` в devDependencies
- Настроить `coverage: { provider: 'v8', thresholds: { lines: 60, functions: 60 } }`
- Запустить, зафиксировать текущий coverage, установить реалистичный порог
**Сложность:** Средняя
**Файлы:** `web-ui/vite.config.js` или `web-ui/vitest.config.js`

### Категория F: Static analysis — function optimization & code reduction

### REF-21: Audit and refactor overly long components (>200 lines) ⬜ TODO
**Описание:** Найти компоненты длиннее 200 строк и разбить на под-компоненты.
- Инструмент: `wc -l web-ui/src/components/*.jsx | sort -rn | head -20`
- Кандидаты: компоненты с множеством секций (summary, table, chart, detail panel)
- Разбить на: `ComponentSummary`, `ComponentTable`, `ComponentDetail` и т.д.
**Сложность:** Высокая
**Файлы:** Определить при аудите

### REF-22: Replace repetitive `useMemo(() => {...}, [])` with precomputed constants ✅ DONE (14 components)
**Описание:** Многие компоненты используют `useMemo` с пустым deps для статичных mock данных — это overhead.
- Найти: `useMemo(() => { ... }, [])` где внутри нет зависимостей от props/state
- Заменить на: `const x = useMemo(...)` → `const x = someConstant` (вычислить один раз вне компоненты)
**Сложность:** Низкая
**Файлы:** 10+ компонентов

### REF-23: Remove unused imports across all components ✅ DONE (partial: 10 components checked, no unused imports found)
**Описание:** После рефакторинга остались неиспользуемые импорты (lucide-react icons и др.).
- Запустить: `npx eslint web-ui/src/components/ --rule 'no-unused-vars: error'`
- Удалить все неиспользуемые импорты
**Сложность:** Низкая
**Файлы:** Все компоненты

### REF-24: Consolidate duplicate `lucide-react` icon imports ✅ DONE (N/A — tree-shaking handles this, no action needed)
**Описание:** Каждый компонент импортирует иконки отдельно. Tree-shaking работает, но можно сгруппировать.
- Анализ: проверить, не импортируются ли неиспользуемые иконки
- Опционально: создать `web-ui/src/utils/icons.js` с реэкспортом часто используемых иконок
**Сложность:** Низкая
**Файлы:** Все компоненты (опционально)

### REF-25: Simplify nested ternary expressions ⬜ TODO
**Описание:** Найти nested ternary (`a ? b : c ? d : e`) и заменить на early return, lookup map или `switch`.
- Инструмент: `grep -rn '?.*?.*:' web-ui/src/components/`
- Рефакторить на lookup maps или `if/else` для читаемости
**Сложность:** Низкая
**Файлы:** 10+ компонентов

### REF-26: Remove dead code — unreachable branches and unused variables ⬜ TODO
**Описание:** Найти мёртвый код: unreachable branches, unused variables, закомментированные блоки.
- Инструмент: ESLint + ручной аудит
- Удалить все закомментированные блоки кода
- Удалить unreachable code после `return`
**Сложность:** Низкая
**Файлы:** Все компоненты

### REF-27: Replace string concatenation with template literals ⬜ TODO
**Описание:** Найти `'...' + var + '...'` и заменить на template literals `` `...${var}...` ``.
**Сложность:** Низкая
**Файлы:** Все компоненты

### REF-28: Consolidate repeated Tailwind class strings into constants ⬜ TODO
**Описание:** Длинные Tailwind class strings повторяются (например, `text-[10px] font-mono text-gray-300`).
- Найти повторяющиеся паттерны (3+ раз)
- Вынести в константы или `cn()` helper
**Сложность:** Средняя
**Файлы:** 20+ компонентов

### REF-29: Audit `registry.js` for consistency — all panels should use same prop pattern ⬜ TODO
**Описание:** `registry.js` имеет разные паттерны передачи props: некоторые через `props: (ctx) => ({...})`, некоторые напрямую.
- Стандартизировать: все panels должны использовать `props: (ctx) => ({...})` pattern
- Проверить, что все panels получают `addToast` и `exchange` context
**Сложность:** Средняя
**Файлы:** `web-ui/src/panels/registry.js`

### REF-30: Reduce bundle size — audit and remove unused dependencies ⬜ TODO
**Описание:** Проверить `package.json` на неиспользуемые зависимости.
- Запустить: `npx depcheck`
- Удалить неиспользуемые пакеты
- Проверить bundle size до и после: `npx vite build --report`
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`

### Категория G: Architecture & hook improvements

### REF-31: Type `useLocalStorage` hook properly (TypeScript migration) ⬜ TODO
**Описание:** `useLocalStorage` написан на JS, но проект использует TS для utils. Добавить типы.
- Создать `useLocalStorage.ts` с дженериками: `useLocalStorage<T>(key: string, initial: T)`
- Обеспечить SSR-safe (проверка `typeof window`)
- Добавить error handling для JSON parse
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useLocalStorage.*`

### REF-32: Create `useStatusColor` hook for reusable status mapping ⬜ TODO
**Описание:** Компоненты имеют разные маппинги статусов. Создать хук, принимающий маппинг и возвращающий `color` и `bg` функции.
- API: `const { color, bg } = useStatusMap({ active: 'green', fading: 'yellow', default: 'red' })`
- Устраняет необходимость в `statusColor` и `statusBg` функциях
**Сложность:** Средняя
**Файлы:** Новый `web-ui/src/hooks/useStatusMap.js`

### REF-33: Create `useInterval` hook for polling components ⬜ TODO
**Описание:** Многие компоненты используют `setInterval` в `useEffect` с одинаковой структурой.
- Найти все `setInterval` в компонентах
- Создать `useInterval(callback, delay)` хук
- Заменить inline `setInterval` на хук
**Сложность:** Низкая
**Файлы:** Новый хук + 5+ компонентов

### REF-34: Create `usePrevious` hook for comparison logic ⬜ TODO
**Описание:** Некоторые компоненты сравнивают текущее значение с предыдущим (flash на изменении).
- Создать `usePrevious(value)` хук
- Использовать в компонентах, где есть flash/highlight на изменение
**Сложность:** Низкая
**Файлы:** Новый хук + 3+ компонентов

### REF-35: Migrate `ui-helpers.js` to TypeScript ⬜ TODO
**Описание:** `ui-helpers.js` — единственный JS файл в `utils/`, остальные TS.
- Переименовать в `ui-helpers.ts`
- Добавить интерфейсы для props: `StatCardProps`, `BarProps`, `WarningBannerProps`
- Добавить типы для `ICONS` map
**Сложность:** Средняя
**Файлы:** `web-ui/src/utils/ui-helpers.js` → `ui-helpers.ts`

### REF-36: Create error boundary wrapper for all panels ⬜ TODO
**Описание:** Только `ChunkRetryBoundary` существует. Если один панель падает — весь UI ломается.
- Создать `PanelErrorBoundary` — ловит ошибки конкретного панеля
- Показать fallback UI с кнопкой "Retry"
- Обернуть все panels в `registry.js` в `PanelErrorBoundary`
**Сложность:** Средняя
**Файлы:** Новый `web-ui/src/components/PanelErrorBoundary.jsx`, `web-ui/src/panels/registry.js`

### REF-37: Implement lazy loading for heavy panels ⬜ TODO
**Описание:** Все панели загружаются eagerly. Heavy panels (charts, tables) можно lazy-load.
- Использовать `React.lazy()` + `Suspense` для панелей с `lightweight-charts` или большим объёмом
- Добавить loading skeleton для lazy panels
- Измерить improvement в initial bundle size
**Сложность:** Средняя
**Файлы:** `web-ui/src/panels/registry.js`, компоненты с chart imports

### Категория H: Performance optimization

### REF-38: Audit `memo` usage — ensure all exported components are memoized ⬜ TODO
**Описание:** Некоторые компоненты не обёрнуты в `memo()`, что вызывает лишние ре-рендеры.
- Найти компоненты без `memo()`: `grep -L 'memo' web-ui/src/components/*.jsx`
- Обернуть все exported components в `memo()`
- Проверить, что `useMemo`/`useCallback` используются корректно
**Сложность:** Низкая
**Файлы:** 10+ компонентов

### REF-39: Add `key` prop audit — ensure all list renders have stable keys ⬜ TODO
**Описание:** Некоторые `.map()` рендеры могут использовать index как key.
- Найти: `grep -rn 'key={index}' web-ui/src/components/` и `grep -rn 'key={i}'`
- Заменить index keys на stable unique keys (id, symbol+timestamp)
**Сложность:** Низкая
**Файлы:** 10+ компонентов

### REF-40: Optimize re-renders — audit `useMemo`/`useCallback` dependencies ⬜ TODO
**Описание:** Некоторые `useMemo` имеют неправильные deps (missing dependencies, или `[]` когда нужны).
- Запустить ESLint `react-hooks/exhaustive-deps` rule
- Исправить все предупреждения
- Особое внимание: `useCallback` с missing deps
**Сложность:** Средняя
**Файлы:** Все компоненты

### Категория I: Python backend optimization

### REF-41: Audit Python functions for length and complexity (cyclomatic) ⬜ TODO
**Описание:** Найти Python функции с cyclomatic complexity > 10.
- Инструмент: `radon cc ai-signal-bot/src/ -nc`
- Рефакторить функции с complexity > 10: разбить на под-функции
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/`

### REF-42: Remove duplicate try/except blocks in Python code ⬜ TODO
**Описание:** Повторяющиеся `try/except` блоки с одинаковой логикой логирования.
- Найти: `grep -rn 'except.*Exception' ai-signal-bot/src/`
- Создать декоратор `@handle_errors(log_msg=...)` или context manager
- Применить к повторяющимся паттернам
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/`

### REF-43: Add type hints to all Python functions ⬜ TODO
**Описание:** Многие Python функции не имеют type hints.
- Запустить: `mypy ai-signal-bot/src/ --ignore-missing-imports`
- Добавить type hints постепенно: начать с public API functions
- Добавить `py.typed` marker
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/`

### REF-44: Audit Python imports — remove unused and organize with isort ⬜ TODO
**Описание:** Python файлы могут содержать неиспользуемые импорты.
- Запустить: `ruff check --select F401 ai-signal-bot/src/`
- Удалить unused imports
- Применить `isort` для сортировки
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/`

### REF-45: Add Python unit tests for signal validation logic ⬜ TODO
**Описание:** `signal_validation/` модуль не имеет тестов.
- Покрыть: валидацию сигналов, проверку confidence, фильтрацию
- Использовать `pytest` + `pytest-asyncio`
**Сложность:** Средняя
**Файлы:** Новый `ai-signal-bot/tests/test_signal_validation.py`

### Категория J: Accessibility, security & tooling

### REF-46: Accessibility audit — add ARIA labels and keyboard navigation ⬜ TODO
**Описание:** Ни один компонент не имеет ARIA labels. Кнопки без `aria-label`, таблицы без `scope`.
- Запустить: `npx @axe-core/cli localhost:5173`
- Добавить `aria-label` к icon-only buttons
- Добавить `role="table"` и `scope="col"` к таблицам
- Добавить `tabIndex` и keyboard handlers где нужно
**Сложность:** Высокая
**Файлы:** Все компоненты

### REF-47: Security audit — sanitize user inputs in API-related components ⬜ TODO
**Описание:** Компоненты `ApiPlayground`, `ApiClient`, `Auth` принимают пользовательский ввод.
- Проверить: нет ли XSS через `dangerouslySetInnerHTML`
- Проверить: API keys не логируются в console
- Проверить: `useLocalStorage` не хранит sensitive данные в plaintext
**Сложность:** Средняя
**Файлы:** `ApiPlayground.jsx`, `ApiClient.jsx`, `Auth.jsx`, `AlertWebhook.jsx`

### REF-48: Configure ESLint strict rules and fix all warnings ⬜ TODO
**Описание:** ESLint выдаёт warnings, но не настроен как strict.
- Включить: `no-unused-vars: error`, `react-hooks/exhaustive-deps: error`, `no-console: warn`
- Запустить: `npx eslint web-ui/src/ --max-warnings 0`
- Исправить все warnings
**Сложность:** Средняя
**Файлы:** `web-ui/.eslintrc.*` или `web-ui/eslint.config.js`

### REF-49: Add pre-commit hooks for lint and format ⬜ TODO
**Описание:** Нет pre-commit hooks — код может коммититься с ошибками линтера.
- Установить `husky` + `lint-staged`
- Настроить: pre-commit → `eslint --fix` + `prettier --write` на staged files
- Добавить: pre-push → `vitest run` (только изменённые тесты)
**Сложность:** Низкая
**Файлы:** `package.json`, `.husky/`

### REF-50: Create `cn()` utility for conditional Tailwind class merging ⬜ TODO
**Описание:** Многие компоненты используют inline ternary для классов: `className={cond ? 'a' : 'b'}`.
- Создать `cn(...classes)` — простой classnames helper (или установить `clsx`)
- Заменить inline ternary на `cn('base', cond && 'conditional')`
- Улучшает читаемость и уменьшает дублирование
**Сложность:** Низкая
**Файлы:** `web-ui/src/utils/cn.js` + 30+ компонентов

---

## ФАЗА 5 — Test Fixes, Coverage & Reliability

### REF-51: Fix Auth.jsx render crash — useLocalStorage mock returns 2 values, component expects 3 ✅ DONE
**Описание:** Auth.jsx destructures `[user, setUser, removeUser]` from useLocalStorage, but mock returns only `[value, setValue]`. Fix mock to return 3rd noop function.
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/auth.test.jsx`

### REF-52: Fix ApiClient.jsx render crash — same 3-value mock issue ✅ DONE
**Описание:** ApiClient uses `useLocalStorage` with remove function. Mock must return 3 values.
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/apiClient.test.jsx`

### REF-53: Fix DrawingTools.jsx render crash — 3-value mock issue ✅ DONE
**Описание:** DrawingTools uses remove from useLocalStorage.
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/drawingTools.test.jsx`

### REF-54: Fix ChartTemplates.jsx render crash — 3-value mock issue ✅ DONE
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/chartTemplates.test.jsx`

### REF-55: Fix FeatureFlags.jsx render crash — 3-value mock issue ✅ DONE
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/featureFlags.test.jsx`

### REF-56: Fix ThemeSwitcher.jsx render crash — 3-value mock issue ✅ DONE
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/themeSwitcher.test.jsx`

### REF-57: Fix NotificationCenter.jsx render crash — 3-value mock issue ✅ DONE
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/notificationCenter.test.jsx`

### REF-58: Fix RetrainingPipeline.jsx render crash — ui-helpers import issue ✅ DONE
**Описание:** RetrainingPipeline imports from ui-helpers but test shows "0 test" + render crash.
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/retrainingPipeline.test.jsx`, `web-ui/src/components/RetrainingPipeline.jsx`

### REF-59: Fix Colocation.test.jsx — "0 test" file ✅ DONE
**Описание:** Test file exists but vitest reports 0 tests. Likely import resolution issue with ui-helpers.
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/colocation.test.jsx`

### REF-60: Fix CostBasis.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/costBasis.test.jsx`

### REF-61: Fix DataQuality.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/dataQuality.test.jsx`

### REF-62: Fix RealtimeAttribution.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/realtimeAttribution.test.jsx`

### REF-63: Fix StrategyVersionControl.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/strategyVersionControl.test.jsx`

### REF-64: Fix WalkForwardViewer.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/walkForwardViewer.test.jsx`

### REF-65: Fix SignalTracker.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/signalTracker.test.jsx`

### REF-66: Fix FillAnalytics.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/fillAnalytics.test.jsx`

### REF-67: Fix Inventory.test.jsx — "0 test" file ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/inventory.test.jsx`

### REF-68: Fix useExchangeData "sorts candles by timestamp" test failure ✅ DONE
**Описание:** 1 test fails in useExchangeData — candle sorting logic issue.
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useExchangeData.js`

### REF-69: Fix statToolkit "computes and displays price statistics" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/statToolkit.test.jsx`

### REF-70: Fix registry "DEFAULT_VISIBLE contains all panel ids" test failure ✅ DONE
**Описание:** DEFAULT_VISIBLE array is missing some panel IDs.
**Сложность:** Низкая
**Файлы:** `web-ui/src/panels/registry.js`

### REF-71: Fix wsManager "renders connection status" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/wsManager.test.jsx`

### REF-72: Fix wsManager "handles empty/null data gracefully" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/wsManager.test.jsx`

### REF-73: Fix mlInsights "shows consensus based on model predictions" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/mlInsights.test.jsx`

### REF-74: Fix priceComparison "shows spread and arbitrage opportunity" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/priceComparison.test.jsx`

### REF-75: Fix marketImpact "renders liquidity imbalance when orderbook provided" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/marketImpact.test.jsx`

### REF-76: Fix featureStudio "shows summary stats" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/featureStudio.test.jsx`

### REF-77: Fix featureStudio "filters features by category" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/featureStudio.test.jsx`

### REF-78: Fix regimeDetector "shows regime names with probabilities" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/regimeDetector.test.jsx`

### REF-79: Fix portfolioOptLab "shows method selector with all methods" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/portfolioOptLab.test.jsx`

### REF-80: Fix portfolioOptLab "switches method on click" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/portfolioOptLab.test.jsx`

### REF-81: Fix cancelMonitor "renders cancel list with timestamps and reasons" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/cancelMonitor.test.jsx`

### REF-82: Fix cancelMonitor "renders cancel reasons breakdown" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/cancelMonitor.test.jsx`

### REF-83: Fix cancelMonitor "filters cancels by source" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/cancelMonitor.test.jsx`

### REF-84: Fix logDashboard "filters logs by level on button click" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/logDashboard.test.jsx`

### REF-85: Fix logDashboard "shows source labels for log entries" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/logDashboard.test.jsx`

### REF-86: Fix teamCollab "renders team members with roles and status" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/teamCollab.test.jsx`

### REF-87: Fix scenarioSim "renders scenario list with names" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/scenarioSim.test.jsx`

### REF-88: Fix apiPlayground "renders endpoint list with methods" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/apiPlayground.test.jsx`

### REF-89: Fix apiPlayground "sends request and shows response on click" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/apiPlayground.test.jsx`

### REF-90: Fix onChainAnalytics "shows whale addresses with accumulation/distribution labels" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/onChainAnalytics.test.jsx`

### REF-91: Fix crossAssetMatrix "renders correlation matrix with asset names" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/crossAssetMatrix.test.jsx`

### REF-92: Fix crossAssetMatrix "shows all 8 assets in returns table" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/crossAssetMatrix.test.jsx`

### REF-93: Fix slippageAnalytics "shows venue names with fill rates" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/slippageAnalytics.test.jsx`

### REF-94: Fix auditTrail "filters entries by user on button click" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/auditTrail.test.jsx`

### REF-95: Fix auditTrail "shows old and new values for config changes" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/auditTrail.test.jsx`

### REF-96: Fix dashboardProfiler "shows key metrics (render time, FPS, memory, bundle)" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/dashboardProfiler.test.jsx`

### REF-97: Fix liquidityMap3D "handles null currentPrice with fallback" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/liquidityMap3D.test.jsx`

### REF-98: Fix geneticViewer "renders fitness evolution and top individuals" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/geneticViewer.test.jsx`

### REF-99: Fix optionsChain "renders options chain with strikes" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/optionsChain.test.jsx`

### REF-100: Fix optionsChain "shows strike details on click" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/optionsChain.test.jsx`

### REF-101: Fix volSurface "renders IV grid with strikes and DTEs" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/volSurface.test.jsx`

### REF-102: Fix volSurface "handles null currentPrice with fallback" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/volSurface.test.jsx`

### REF-103: Fix taxReport "shows trade history table" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/taxReport.test.jsx`

### REF-104: Fix widgetSDK "shows code sample section" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/widgetSDK.test.jsx`

### REF-105: Fix widgetSDK "filters widgets by category" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/widgetSDK.test.jsx`

### REF-106: Fix sessionMarkers "shows session time ranges" test failure ✅ DONE
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/sessionMarkers.test.jsx`

### REF-107: Fix useInterval.test.jsx — "0/10" tests reported ✅ DONE
**Описание:** useInterval tests show 0/10 — likely a test discovery or import issue.
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/useInterval.test.jsx`

### REF-108: Fix "Worker exited unexpectedly" crash in vitest ✅ DONE
**Описание:** Vitest worker crashes at end of test run. Likely memory exhaustion or unhandled rejection from isolate: false.
**Сложность:** Высокая
**Файлы:** `web-ui/vitest.config.js`

### REF-109: Add vi.mock for useLocalStorage with 3-value return in all test files ✅ DONE
**Описание:** All vi.mock for useLocalStorage must return [value, setValue, () => {}] — 3rd value is the remove function.
**Сложность:** Низкая
**Файлы:** All 9 test files with useLocalStorage mock

### REF-110: Fix DeployStatus test — currently passing but uses 2-value mock ✅ DONE
**Описание:** DeployStatus works with 2-value mock but should use 3-value for consistency.
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/deployStatus.test.jsx`

### REF-111: Add test coverage for AlertWebhook component ⬜ TODO
**Описание:** No test file exists for AlertWebhook.
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/alertWebhook.test.jsx`

### REF-112: Add test coverage for ConfigEditor component ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/configEditor.test.jsx`

### REF-113: Add test coverage for NewsFeed component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/newsFeed.test.jsx`

### REF-114: Add test coverage for TickReplay component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/tickReplay.test.jsx`

### REF-115: Add test coverage for PacketInspector component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/packetInspector.test.jsx`

### REF-116: Add test coverage for BlackSwanTester component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/blackSwanTester.test.jsx`

### REF-117: Add test coverage for CapacityAnalysis component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/capacityAnalysis.test.jsx`

### REF-118: Add test coverage for ABTesting component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/abTesting.test.jsx`

### REF-119: Add test coverage for HyperoptUI component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/hyperoptUI.test.jsx`

### REF-120: Add test coverage for PairsArb component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/pairsArb.test.jsx`

### REF-121: Add test coverage for StrategyCorrelation component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/strategyCorrelation.test.jsx`

### REF-122: Add test coverage for TCA component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/tca.test.jsx`

### REF-123: Add test coverage for FuturesBasis component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/futuresBasis.test.jsx`

### REF-124: Add test coverage for DatabaseViewer component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/databaseViewer.test.jsx`

### REF-125: Add test coverage for ModelDashboard component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/modelDashboard.test.jsx`

### REF-126: Add test coverage for SentimentDashboard component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/sentimentDashboard.test.jsx`

### REF-127: Add test coverage for LatencyPanel component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/latencyPanel.test.jsx`

### REF-128: Add test coverage for Microstructure component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/microstructure.test.jsx`

### REF-129: Add test coverage for ArbScanner component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/arbScanner.test.jsx`

### REF-130: Add test coverage for LoadingSkeleton component edge cases ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/loadingSkeleton.test.jsx`

### REF-131: Add test coverage for PanelErrorBoundary component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/panelErrorBoundary.test.jsx`

### REF-132: Add test coverage for WSInspector component edge cases ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/wsInspector.test.jsx`

### REF-133: Add test for useLocalStorage hook with SSR scenario ⬜ TODO
**Описание:** Test hook behavior when localStorage is undefined (SSR scenario).
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/useLocalStorage.test.jsx`

### REF-134: Add test for useLocalStorage with function updater ⬜ TODO
**Описание:** Verify setValue((prev) => ...) works correctly with the hook.
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useLocalStorage.test.jsx`

### REF-135: Add test for useDebounce hook edge cases ⬜ TODO
**Описание:** Test with immediate value, zero delay, cleanup on unmount.
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useDebounce.test.jsx`

### REF-136: Add test for useTheme hook with invalid theme ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useTheme.test.jsx`

### REF-137: Add test for useMediaQuery hook with SSR ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useMediaQuery.test.jsx`

### REF-138: Add test for useKeyboardShortcuts with conflicting bindings ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/useKeyboardShortcuts.test.jsx`

### REF-139: Add test for useSoundAlerts with disabled state ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useSoundAlerts.test.jsx`

### REF-140: Add test for useTradeJournal with empty entries ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useTradeJournal.test.jsx`

### REF-141: Add test for useMockData with custom interval ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useMockData.test.jsx`

### REF-142: Add test for useDetachablePanels with duplicate panel IDs ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/useDetachablePanels.test.jsx`

### REF-143: Add test for useAnimatedNumber with negative values ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/useAnimatedNumber.test.jsx`

### REF-144: Add test for usePerformance with no metrics ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/usePerformance.test.jsx`

### REF-145: Add integration test for panel registry + lazy loading ⬜ TODO
**Описание:** Test that all registered panels can be lazy-loaded without errors.
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/registry.integration.test.jsx`

### REF-146: Add snapshot tests for stable components ⬜ TODO
**Описание:** Add snapshot tests for components that rarely change: LoadingSkeleton, PanelErrorBoundary, Toast.
**Сложность:** Низкая
**Файлы:** New snapshot test files

### REF-147: Add test for utils/format.ts edge cases ⬜ TODO
**Описание:** Test formatNumber, formatPercent, formatTime with edge cases (NaN, Infinity, null, undefined).
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/utils.test.js`

### REF-148: Add test for utils/cn.js (after REF-50 creates it) ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `web-ui/src/test/cn.test.js`

### REF-149: Add test for kalman filter with empty input ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/test/kalman.test.js`

### REF-150: Add test for HMM with single state ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/test/hmm.test.js`

---

## ФАЗА 6 — Performance Optimization

### REF-151: Memoize expensive components with React.memo ⬜ TODO
**Описание:** Components with heavy render logic (SymbolHeatmap, CrossAssetMatrix, VolSurface) should be wrapped in React.memo.
**Сложность:** Средняя
**Файлы:** 10+ components

### REF-152: Add useMemo to expensive calculations in components ⬜ TODO
**Описание:** Components like StatToolkit, Kalman, GARCH do heavy math on every render. Wrap in useMemo.
**Сложность:** Средняя
**Файлы:** `StatToolkit.jsx`, `KalmanFilter.jsx`, `GarchModel.jsx`, `KMeansCluster.jsx`

### REF-153: Add useCallback to event handlers in heavy components ⬜ TODO
**Описание:** Inline arrow functions in props cause unnecessary re-renders.
**Сложность:** Средняя
**Файлы:** 20+ components

### REF-154: Implement virtualization for large lists (Watchlist, SignalFeed, Fills) ⬜ TODO
**Описание:** Lists with 50+ items should use virtual scrolling. VirtualList component exists but is not used everywhere.
**Сложность:** Высокая
**Файлы:** `Watchlist.jsx`, `SignalFeed.jsx`, `FillsPanel.jsx`

### REF-155: Optimize WebSocket message handling — batch updates with requestAnimationFrame ⬜ TODO
**Описание:** High-frequency WS messages cause excessive re-renders. Batch updates.
**Сложность:** Высокая
**Файлы:** `web-ui/src/hooks/useExchangeData.js`, `web-ui/src/hooks/useWebSocket.js`

### REF-156: Add debounce to search inputs across components ⬜ TODO
**Описание:** Search/filter inputs trigger re-render on every keystroke. Use useDebounce hook.
**Сложность:** Низкая
**Файлы:** 10+ components with search inputs

### REF-157: Lazy-load chart libraries (lightweight-charts, recharts) only when needed ⬜ TODO
**Описание:** Chart libraries are heavy. Load them only when a chart panel is visible.
**Сложность:** Высокая
**Файлы:** `web-ui/src/panels/registry.js`, chart components

### REF-158: Optimize Tailwind CSS bundle — purge unused classes ⬜ TODO
**Описание:** Tailwind may include unused classes. Check purge config.
**Сложность:** Средняя
**Файлы:** `web-ui/tailwind.config.js`

### REF-159: Add code-splitting for route-level components ⬜ TODO
**Описание:** Use React.lazy + Suspense for panel components that are rarely opened.
**Сложность:** Средняя
**Файлы:** `web-ui/src/panels/registry.js`

### REF-160: Optimize bundle size — analyze with rollup-plugin-visualizer ⬜ TODO
**Описание:** Run bundle analysis and identify large dependencies.
**Сложность:** Средняя
**Файлы:** `web-ui/vite.config.js`

### REF-161: Add Intersection Observer for off-screen panel rendering ⬜ TODO
**Описание:** Panels that are not visible should not render their content.
**Сложность:** Высокая
**Файлы:** Panel wrapper components

### REF-162: Optimize useMockData — use setInterval instead of recursive setTimeout ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/hooks/useMockData.js`

### REF-164: Add requestIdleCallback for non-critical updates ⬜ TODO
**Описание:** Use requestIdleCallback for background data processing.
**Сложность:** Средняя
**Файлы:** Data processing hooks

### REF-165: Optimize re-renders in DashboardGrid — use zustand selectors ⬜ TODO
**Описание:** Dashboard re-renders on every store change. Use fine-grained selectors.
**Сложность:** Высокая
**Файлы:** `web-ui/src/store/` or zustand usage

### REF-166: Add throttling to resize events ⬜ TODO
**Описание:** Window resize events fire rapidly. Add throttle.
**Сложность:** Низкая
**Файлы:** `web-ui/src/hooks/useMediaQuery.js`, panel resize handlers

### REF-167: Optimize localStorage writes — batch and debounce ⬜ TODO
**Описание:** useLocalStorage writes on every state change. Debounce writes.
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useLocalStorage.ts`

### REF-168: Add error boundary per panel to prevent full dashboard crash ⬜ TODO
**Описание:** PanelErrorBoundary exists but may not wrap every panel.
**Сложность:** Средняя
**Файлы:** Dashboard layout

### REF-169: Optimize icon imports — use tree-shakeable imports from lucide-react ⬜ TODO
**Описание:** Some components import entire lucide-react. Use named imports.
**Сложность:** Низкая
**Файлы:** All components using lucide-react

### REF-171: Optimize useWebSocket reconnection — exponential backoff ⬜ TODO
**Описание:** Reconnection uses fixed delay. Use exponential backoff with jitter.
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useWebSocket.js`

### REF-172: Add cache layer for API responses in ApiClient ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/ApiClient.jsx`

### REF-173: Optimize SymbolHeatmap rendering — canvas instead of DOM ⬜ TODO
**Описание:** SymbolHeatmap with 50+ symbols causes many DOM nodes. Use canvas.
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/SymbolHeatmap.jsx`

### REF-174: Add requestAnimationFrame for animated number transitions ⬜ TODO
**Описание:** useAnimatedNumber should use rAF for smooth transitions.
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useAnimatedNumber.js`

### REF-175: Optimize CrossAssetMatrix — precompute correlation matrix ⬜ TODO
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/CrossAssetMatrix.jsx`

### REF-177: Reduce console.log in production build ⬜ TODO
**Описание:** esbuild drop console is configured but some logs may use other methods.
**Сложность:** Низкая
**Файлы:** All components

### REF-178: Optimize CSS animations — use transform and opacity only ⬜ TODO
**Описание:** Some animations may use width/height which causes layout thrashing.
**Сложность:** Средняя
**Файлы:** CSS/Tailwind classes

### REF-179: Add will-change hints for animated elements ⬜ TODO
**Сложность:** Низкая
**Файлы:** Animated components

### REF-180: Optimize large table rendering — use CSS contain ⬜ TODO
**Описание:** Large tables cause layout recalculation. Add `contain: strict`.
**Сложность:** Низкая
**Файлы:** Table components

### REF-181: Add AbortController to fetch requests in ApiPlayground ⬜ TODO
**Описание:** API requests should be abortable when component unmounts.
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/ApiPlayground.jsx`

### REF-182: Optimize useExchangeData — use Map instead of array for candles ⬜ TODO
**Описание:** Candle lookup by exchange+symbol+timestamp is O(n) with array. Map would be O(1).
**Сложность:** Высокая
**Файлы:** `web-ui/src/hooks/useExchangeData.js`

### REF-183: Add useMemo to filter/sort operations in list components ⬜ TODO
**Описание:** Components like Watchlist, NotificationCenter filter/sort on every render.
**Сложность:** Средняя
**Файлы:** 10+ list components

### REF-184: Optimize DrawdownAnalysis chart rendering ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/DrawdownAnalysis.jsx`

### REF-185: Add lazy initialization to useLocalStorage ⬜ TODO
**Описание:** useState initializer already reads localStorage, but ensure no double-read.
**Сложность:** Низкая
**Файлы:** `web-ui/src/hooks/useLocalStorage.ts`

### REF-186: Optimize Performance panel — use Performance Observer API ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/Performance.jsx`

### REF-187: Add memory leak detection to test suite ⬜ TODO
**Описание:** Add tests that detect memory leaks (unmounted component state updates).
**Сложность:** Высокая
**Файлы:** Test setup

### REF-188: Optimize DashboardProfiler — reduce polling frequency ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/components/DashboardProfiler.jsx`

### REF-189: Add Suspense boundaries for lazy-loaded panels ⬜ TODO
**Описание:** Lazy panels need Suspense fallback (LoadingSkeleton).
**Сложность:** Средняя
**Файлы:** Panel wrapper

### REF-190: Optimize WebSocket message parsing — use JSON.parse with reviver ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useWebSocket.js`

### REF-191: Add offline mode detection and graceful degradation ⬜ TODO
**Сложность:** Средняя
**Файлы:** App-level

### REF-192: Optimize recharts usage — minimize re-renders ⬜ TODO
**Описание:** Recharts components re-render on data change. Use memoized data.
**Сложность:** Средняя
**Файлы:** Chart components using recharts

### REF-193: Add windowing to LogDashboard entries ⬜ TODO
**Описание:** Log entries can grow to thousands. Use virtual scrolling.
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/LogDashboard.jsx`

### REF-194: Optimize AuditTrail rendering — paginate entries ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/AuditTrail.jsx`

### REF-195: Add connection pooling to WebSocket manager ⬜ TODO
**Описание:** Multiple WS connections should share a pool.
**Сложность:** Высокая
**Файлы:** `web-ui/src/utils/wsManager.js`

### REF-196: Optimize CancelMonitor rendering — group by reason ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/components/CancelMonitor.jsx`

### REF-198: Optimize TickReplay playback — use requestAnimationFrame ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/TickReplay.jsx`

### REF-199: Add performance budget to CI ⬜ TODO
**Описание:** Add bundle size check to CI pipeline.
**Сложность:** Средняя
**Файлы:** CI config

### REF-200: Optimize initial load — defer non-critical panels ⬜ TODO
**Описание:** Only render visible panels on initial load.
**Сложность:** Высокая
**Файлы:** Dashboard layout

---

## ФАЗА 7 — Python Backend Quality

### REF-201: Add type hints to all strategies ⬜ TODO
**Описание:** Strategy classes lack complete type hints.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/strategies/`

### REF-202: Add type hints to risk module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/risk/`

### REF-203: Add type hints to backtesting module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/backtesting/`

### REF-204: Add type hints to data_collection module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/data_collection/`

### REF-205: Add type hints to communication module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/communication/`

### REF-206: Add type hints to database module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/database/`

### REF-207: Add type hints to ML module ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/ml/`

### REF-208: Add type hints to portfolio module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/portfolio/`

### REF-209: Add type hints to monitoring module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/monitoring/`

### REF-210: Add type hints to observability module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/observability/`

### REF-211: Add type hints to research module ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/research/`

### REF-212: Add type hints to utils module ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/utils/`

### REF-213: Add type hints to llm_engine module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/llm_engine/`

### REF-214: Add type hints to notification module ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/notification/`

### REF-215: Add type hints to networking module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/networking/`

### REF-216: Add docstrings to all strategy classes ⬜ TODO
**Описание:** Strategy classes lack docstrings. Add Google-style docstrings.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/strategies/`

### REF-217: Add docstrings to risk module classes ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/risk/`

### REF-218: Add docstrings to backtesting module classes ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/backtesting/`

### REF-219: Add docstrings to data_collection module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/data_collection/`

### REF-220: Add docstrings to communication module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/communication/`

### REF-221: Add docstrings to database module ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/database/`

### REF-222: Add docstrings to ML module ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/ml/`

### REF-223: Add docstrings to portfolio module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/portfolio/`

### REF-224: Add docstrings to monitoring module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/monitoring/`

### REF-225: Add docstrings to observability module ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/observability/`

### REF-226: Add docstrings to research module ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/research/`

### REF-227: Add docstrings to utils module ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/utils/`

### REF-228: Add docstrings to llm_engine module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/llm_engine/`

### REF-229: Add docstrings to notification module ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/notification/`

### REF-230: Add docstrings to networking module ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/networking/`

### REF-231: Add pytest tests for TrendFollowing strategy ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_trend_following.py`

### REF-232: Add pytest tests for MeanReversion strategy ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_mean_reversion.py`

### REF-233: Add pytest tests for FFTCycle strategy ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_fft_cycle.py`

### REF-234: Add pytest tests for StatisticalArbitrage strategy ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_stat_arb.py`

### REF-235: Add pytest tests for EnsembleVoter ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_ensemble_voter.py`

### REF-236: Add pytest tests for RiskManager ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_risk_manager.py`

### REF-237: Add pytest tests for VaRCalculator ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_var_calculator.py`

### REF-238: Add pytest tests for CVaRCalculator ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_cvar_calculator.py`

### REF-239: Add pytest tests for KellyPositionSizer ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_kelly_position_sizer.py`

### REF-240: Add pytest tests for DynamicPositionSizer ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_dynamic_position_sizer.py`

### REF-241: Add pytest tests for StressTestScenario ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_stress_test.py`

### REF-242: Add pytest tests for Backtester ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_backtester.py`

### REF-243: Add pytest tests for BacktestEngine ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_backtest_engine.py`

### REF-244: Add pytest tests for PnLCalculator ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_pnl_calculator.py`

### REF-245: Add pytest tests for StrategyOptimizer ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_strategy_optimizer.py`

### REF-246: Add pytest tests for WalkForwardAnalyzer ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_walk_forward.py`

### REF-247: Add pytest tests for BacktestComparison ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_backtest_comparison.py`

### REF-248: Add pytest tests for OrderBookReplay ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_orderbook_replay.py`

### REF-249: Add pytest tests for technical_analysis indicators ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_indicators.py`

### REF-250: Add pytest tests for fft_analysis ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_fft_analysis.py`

---

## ФАЗА 8 — DevOps, Infrastructure & CI/CD

### REF-252: Add GitHub Actions CI for web-ui tests ⬜ TODO
**Описание:** Run vitest on PR. Cache node_modules.
**Сложность:** Средняя
**Файлы:** New `.github/workflows/web-ui-tests.yml`

### REF-253: Add GitHub Actions CI for Python tests ⬜ TODO
**Описание:** Run pytest on PR. Cache pip packages.
**Сложность:** Средняя
**Файлы:** New `.github/workflows/python-tests.yml`

### REF-254: Add GitHub Actions CI for linting ⬜ TODO
**Описание:** Run ruff (Python) + eslint (JS) on PR.
**Сложность:** Средняя
**Файлы:** New `.github/workflows/lint.yml`

### REF-255: Add Docker build CI ⬜ TODO
**Описание:** Build all Docker images on push to master.
**Сложность:** Средняя
**Файлы:** New `.github/workflows/docker-build.yml`

### REF-256: Add Helm lint CI ⬜ TODO
**Описание:** Run `helm lint` on chart changes.
**Сложность:** Низкая
**Файлы:** New `.github/workflows/helm-lint.yml`

### REF-257: Add CodeQL workflow for security scanning ⬜ TODO
**Описание:** Already has CodeQL but ensure it covers all languages.
**Сложность:** Низкая
**Файлы:** `.github/workflows/codeql.yml`

### REF-258: Add dependabot configuration ⬜ TODO
**Описание:** Auto-update npm and pip dependencies.
**Сложность:** Низкая
**Файлы:** New `.github/dependabot.yml`

### REF-259: Add release-please or semantic-release ⬜ TODO
**Описание:** Automate version bumping and changelog.
**Сложность:** Средняя
**Файлы:** New `.github/workflows/release.yml`

### REF-260: Add staging environment Helm values ⬜ TODO
**Описание:** Create `helm/values-staging.yaml` with non-production defaults.
**Сложность:** Низкая
**Файлы:** New `helm/values-staging.yaml`

### REF-261: Add production environment Helm values ⬜ TODO
**Описание:** Create `helm/values-prod.yaml` with production-grade defaults.
**Сложность:** Средняя
**Файлы:** New `helm/values-prod.yaml`

### REF-266: Add Prometheus ServiceMonitors for all services ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/templates/`

### REF-267: Add Grafana dashboards as ConfigMap ⬜ TODO
**Описание:** Export current Grafana dashboards and add to Helm chart.
**Сложность:** Средняя
**Файлы:** `helm/templates/grafana-dashboards.yaml`

### REF-268: Add TLS termination in ingress ⬜ TODO
**Описание:** Enable TLS in Helm ingress config.
**Сложность:** Средняя
**Файлы:** `helm/values.yaml`, `helm/templates/ingress.yaml`

### REF-269: Add secrets management with externalSecret ⬜ TODO
**Описание:** Use External Secrets Operator instead of plaintext passwords.
**Сложность:** Высокая
**Файлы:** `helm/templates/`

### REF-270: Add horizontal pod autoscaler for web-ui ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/templates/hpa-web-ui.yaml`

### REF-271: Add horizontal pod autoscaler for ai-signal-bot ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/templates/hpa-signal-bot.yaml`

### REF-272: Add backup CronJob for PostgreSQL ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/templates/backup-cronjob.yaml`

### REF-273: Add backup CronJob for Redis ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/templates/redis-backup.yaml`

### REF-274: Add log aggregation config (Loki/Fluentd) ⬜ TODO
**Сложность:** Высокая
**Файлы:** `helm/values.yaml`

### REF-275: Add tracing with Jaeger/Tempo ⬜ TODO
**Сложность:** Высокая
**Файлы:** `helm/values.yaml`

### REF-277: Add Docker image vulnerability scanning in CI ⬜ TODO
**Описание:** Use Trivy or Grype to scan images.
**Сложность:** Средняя
**Файлы:** CI config

### REF-278: Add .dockerignore for all services ⬜ TODO
**Сложность:** Низкая
**Файлы:** All service directories

### REF-280: Add docker-compose override for development ⬜ TODO
**Описание:** `docker-compose.override.yml` for local dev with hot reload.
**Сложность:** Средняя
**Файлы:** New `docker-compose.override.yml`

### REF-281: Add environment variable validation in all services ⬜ TODO
**Описание:** Fail fast on missing required env vars.
**Сложность:** Средняя
**Файлы:** All service entry points

### REF-283: Add structured logging with correlation IDs ⬜ TODO
**Сложность:** Средняя
**Файлы:** All services

### REF-285: Add config hot-reload for ai-signal-bot ⬜ TODO
**Описание:** Reload config without restarting the service.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/config/`

### REF-286: Add config validation schema with pydantic ⬜ TODO
**Описание:** Replace dataclass config with pydantic model for validation.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/config/`

### REF-288: Add seed data script for development ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `scripts/seed_data.py`

### REF-289: Add k6 load testing for WebSocket ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `tests/load/k6-ws.js`

### REF-290: Add k6 load testing for REST API ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `tests/load/k6-rest.js`

### REF-292: Add Kubernetes namespace isolation ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/values.yaml`

### REF-297: Add rollback strategy for Helm ⬜ TODO
**Сложность:** Средняя
**Файлы:** CI config

### REF-298: Add image pull secrets for private registry ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/values.yaml`

### REF-299: Add init containers for dependency checking ⬜ TODO
**Описание:** Wait for PostgreSQL/Redis before starting app.
**Сложность:** Средняя
**Файлы:** `helm/templates/`

### REF-300: Add priority classes for critical pods ⬜ TODO
**Сложность:** Средняя
**Файлы:** `helm/templates/priorityclass.yaml`

---

## ФАЗА 9 — Documentation

### REF-301: Write README for web-ui ⬜ TODO
**Описание:** Current README is minimal. Add setup, dev, build, test instructions.
**Сложность:** Низкая
**Файлы:** `web-ui/README.md`

### REF-302: Write README for ai-signal-bot ⬜ TODO
**Описание:** Add architecture overview, setup, configuration guide.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/README.md`

### REF-303: Write root README with project overview ⬜ TODO
**Описание:** Add architecture diagram, service map, quick start.
**Сложность:** Средняя
**Файлы:** `README.md`

### REF-304: Add JSDoc comments to all hooks ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/`

### REF-305: Add JSDoc comments to all utils ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/utils/`

### REF-306: Add JSDoc comments to all components ⬜ TODO
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/`

### REF-307: Add API documentation for WebSocket protocol ⬜ TODO
**Описание:** Document all WS message types and their payloads.
**Сложность:** Средняя
**Файлы:** New `docs/websocket-protocol.md`

### REF-308: Add API documentation for REST endpoints ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `docs/rest-api.md`

### REF-310: Add contributing guidelines ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `CONTRIBUTING.md`

### REF-312: Add changelog ⬜ TODO
**Описание:** Add CHANGELOG.md with semantic versioning.
**Сложность:** Низкая
**Файлы:** New `CHANGELOG.md`

### REF-313: Add license file ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `LICENSE`

### REF-314: Add security policy ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `SECURITY.md`

### REF-317: Add architecture diagram ⬜ TODO
**Описание:** Create Mermaid or PlantUML diagram of system architecture.
**Сложность:** Средняя
**Файлы:** New `docs/architecture.md`

### REF-318: Add data flow diagram ⬜ TODO
**Описание:** Document data flow from exchange → WS → UI.
**Сложность:** Средняя
**Файлы:** New `docs/data-flow.md`

### REF-319: Add deployment guide ⬜ TODO
**Описание:** Step-by-step deployment with Helm.
**Сложность:** Средняя
**Файлы:** New `docs/deployment.md`

### REF-320: Add development guide ⬜ TODO
**Описание:** Local dev setup, debugging, testing.
**Сложность:** Средняя
**Файлы:** New `docs/development.md`

### REF-321: Add configuration reference ⬜ TODO
**Описание:** Document all config options for settings.yaml.
**Сложность:** Средняя
**Файлы:** New `docs/configuration.md`

### REF-322: Add Helm chart documentation ⬜ TODO
**Описание:** Document all Helm values and their effects.
**Сложность:** Средняя
**Файлы:** New `helm/README.md`

### REF-323: Add panel development guide ⬜ TODO
**Описание:** How to add a new panel to the dashboard.
**Сложность:** Средняя
**Файлы:** New `docs/panel-development.md`

### REF-324: Add strategy development guide ⬜ TODO
**Описание:** How to add a new trading strategy.
**Сложность:** Средняя
**Файлы:** New `docs/strategy-development.md`

### REF-325: Add testing guide ⬜ TODO
**Описание:** How to run and write tests for both Python and JS.
**Сложность:** Низкая
**Файлы:** New `docs/testing.md`

### REF-326: Add Python docstring style guide ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `docs/python-style.md`

### REF-327: Add JavaScript style guide ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `docs/js-style.md`

### REF-328: Add Git workflow guide ⬜ TODO
**Описание:** Branch naming, commit conventions, PR process.
**Сложность:** Низкая
**Файлы:** New `docs/git-workflow.md`

### REF-329: Add troubleshooting guide ⬜ TODO
**Описание:** Common issues and solutions.
**Сложность:** Средняя
**Файлы:** New `docs/troubleshooting.md`

### REF-330: Add FAQ ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `docs/faq.md`

### REF-331: Add inline documentation for complex algorithms ⬜ TODO
**Описание:** Kalman, GARCH, HMM, FFT need inline explanations.
**Сложность:** Высокая
**Файлы:** `web-ui/src/utils/kalman.js`, `garch.js`, `hmm.js`, `fft.js`

### REF-332: Add inline documentation for trading strategies ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/strategies/`

### REF-333: Add inline documentation for risk models ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/risk/`

### REF-334: Add inline documentation for backtesting engine ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/backtesting/`

### REF-335: Add inline documentation for ML models ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/ml/`

### REF-336: Add inline documentation for portfolio optimization ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/portfolio/`

### REF-337: Add inline documentation for communication layer ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/communication/`

### REF-338: Add inline documentation for data collection ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/data_collection/`

### REF-339: Add inline documentation for observability ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/observability/`

### REF-340: Add inline documentation for research modules ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/research/`

### REF-349: Add diagram of panel system architecture ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `docs/panel-architecture.md`

### REF-350: Add diagram of WebSocket message flow ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `docs/ws-flow.md`

---

## ФАЗА 10 — Security Hardening

### REF-351: Audit all components for XSS vulnerabilities ⬜ TODO
**Описание:** Check for dangerouslySetInnerHTML, unsanitized user input.
**Сложность:** Высокая
**Файлы:** All components

### REF-352: Add CSP nonce to script tags ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/index.html`, `web-ui/vite.config.js`

### REF-353: Secure localStorage usage — encrypt sensitive data ⬜ TODO
**Описание:** API keys stored in localStorage should be encrypted.
**Сложность:** Высокая
**Файлы:** `web-ui/src/hooks/useLocalStorage.ts`

### REF-354: Add rate limiting to API playground ⬜ TODO
**Описание:** Prevent abuse of API playground requests.
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/ApiPlayground.jsx`

### REF-355: Add input validation to all form components ⬜ TODO
**Описание:** Auth, ConfigEditor, AlertWebhook need input validation.
**Сложность:** Средняя
**Файлы:** Form components

### REF-356: Add CSRF protection for REST API calls ⬜ TODO
**Сложность:** Высокая
**Файлы:** REST API layer

### REF-357: Audit npm dependencies for vulnerabilities ⬜ TODO
**Описание:** Run `npm audit` and fix all vulnerabilities.
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`

### REF-358: Audit pip dependencies for vulnerabilities ⬜ TODO
**Описание:** Run `pip-audit` and fix all vulnerabilities.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/requirements.txt`

### REF-359: Add secrets scanning to CI ⬜ TODO
**Описание:** Use gitleaks or trufflehog in CI.
**Сложность:** Средняя
**Файлы:** CI config

### REF-360: Add SAST scanning to CI ⬜ TODO
**Описание:** Static application security testing.
**Сложность:** Средняя
**Файлы:** CI config

### REF-361: Add dependency review action to PRs ⬜ TODO
**Описание:** GitHub dependency review API on PRs.
**Сложность:** Низкая
**Файлы:** New `.github/workflows/dependency-review.yml`

### REF-363: Secure WebSocket connections with auth ⬜ TODO
**Описание:** Add authentication to WS connections.
**Сложность:** Высокая
**Файлы:** WS layer

### REF-364: Add API key rotation mechanism ⬜ TODO
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/ApiClient.jsx`

### REF-365: Add audit logging for sensitive actions ⬜ TODO
**Описание:** Log all config changes, auth events, API key changes.
**Сложность:** Средняя
**Файлы:** Auth, ConfigEditor, ApiClient

### REF-366: Add session timeout for web UI ⬜ TODO
**Описание:** Auto-logout after inactivity.
**Сложность:** Средняя
**Файлы:** App-level

### REF-367: Add password strength validation ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/components/Auth.jsx`

### REF-370: Add request signing for API calls ⬜ TODO
**Сложность:** Высокая
**Файлы:** API layer

### REF-371: Add CORS configuration ⬜ TODO
**Описание:** Restrict CORS to known origins.
**Сложность:** Средняя
**Файлы:** Backend, `web-ui/vite.config.js`

### REF-372: Add helmet.js for security headers ⬜ TODO
**Сложность:** Низкая
**Файлы:** Backend

### REF-373: Add secure cookie settings ⬜ TODO
**Сложность:** Средняя
**Файлы:** Backend

### REF-374: Add JWT token validation ⬜ TODO
**Сложность:** Высокая
**Файлы:** Auth system

### REF-375: Add API endpoint authentication middleware ⬜ TODO
**Сложность:** Высокая
**Файлы:** Backend

### REF-376: Add SQL injection prevention audit ⬜ TODO
**Описание:** Audit all database queries for SQL injection.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/database/`

### REF-377: Add command injection prevention audit ⬜ TODO
**Описание:** Audit all subprocess calls for command injection.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/`

### REF-378: Add path traversal prevention audit ⬜ TODO
**Описание:** Audit all file operations for path traversal.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/`

### REF-379: Add SSRF prevention audit ⬜ TODO
**Описание:** Audit all HTTP requests for SSRF.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/`

### REF-380: Add secure deserialization for YAML config ⬜ TODO
**Описание:** Prevent YAML deserialization attacks.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/config/`

### REF-381: Add rate limiting to auth endpoints ⬜ TODO
**Сложность:** Средняя
**Файлы:** Backend

### REF-382: Add brute force protection for login ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/Auth.jsx`

### REF-383: Add secure file upload handling ⬜ TODO
**Сложность:** Высокая
**Файлы:** Backend

### REF-387: Add secrets rotation policy ⬜ TODO
**Сложность:** Высокая
**Файлы:** `docs/security.md`

### REF-388: Add incident response plan ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `docs/incident-response.md`

### REF-389: Add security training docs for developers ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `docs/security-guide.md`

### REF-391: Add data retention policy ⬜ TODO
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/database/`

### REF-392: Add PII detection in logs ⬜ TODO
**Сложность:** Средняя
**Файлы:** Logging layer

### REF-393: Add secure error handling — no stack traces in production ⬜ TODO
**Сложность:** Средняя
**Файлы:** All services

### REF-394: Add security headers validation in CI ⬜ TODO
**Сложность:** Низкая
**Файлы:** CI config

### REF-397: Add threat model documentation ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `docs/threat-model.md`

### REF-398: Add penetration testing checklist ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `docs/pentest-checklist.md`

### REF-400: Add security contact information ⬜ TODO
**Сложность:** Низкая
**Файлы:** `SECURITY.md`

---

## ФАЗА 11 — UI/UX Polish

### REF-401: Add dark/light theme consistency audit ⬜ TODO
**Описание:** Ensure all components respect theme variables.
**Сложность:** Средняя
**Файлы:** All components

### REF-402: Add consistent spacing scale across components ⬜ TODO
**Описание:** Some components use ad-hoc spacing. Standardize.
**Сложность:** Средняя
**Файлы:** All components

### REF-403: Add consistent font sizes across components ⬜ TODO
**Сложность:** Средняя
**Файлы:** All components

### REF-404: Add consistent border radius across components ⬜ TODO
**Сложность:** Низкая
**Файлы:** All components

### REF-405: Add hover states to all interactive elements ⬜ TODO
**Сложность:** Средняя
**Файлы:** All interactive components

### REF-406: Add focus states for keyboard navigation ⬜ TODO
**Сложность:** Средняя
**Файлы:** All interactive components

### REF-407: Add loading states to all async components ⬜ TODO
**Описание:** Components that fetch data should show loading skeleton.
**Сложность:** Средняя
**Файлы:** Async components

### REF-408: Add empty states to all list components ⬜ TODO
**Описание:** Show helpful message when list is empty.
**Сложность:** Низкая
**Файлы:** List components

### REF-409: Add error states to all data-fetching components ⬜ TODO
**Сложность:** Средняя
**Файлы:** Data-fetching components

### REF-410: Add transition animations for panel open/close ⬜ TODO
**Сложность:** Средняя
**Файлы:** Panel system

### REF-411: Add skeleton loading for chart components ⬜ TODO
**Сложность:** Средняя
**Файлы:** Chart components

### REF-412: Add toast notifications for all user actions ⬜ TODO
**Описание:** Ensure all user actions trigger appropriate toast.
**Сложность:** Средняя
**Файлы:** All interactive components

### REF-413: Add confirmation dialogs for destructive actions ⬜ TODO
**Описание:** Delete, clear, reset actions should require confirmation.
**Сложность:** Средняя
**Файлы:** Components with destructive actions

### REF-415: Add keyboard shortcuts for common actions ⬜ TODO
**Описание:** Already have useKeyboardShortcuts but need more bindings.
**Сложность:** Средняя
**Файлы:** App-level

### REF-416: Add drag-and-drop panel rearrangement ⬜ TODO
**Сложность:** Высокая
**Файлы:** Dashboard layout

### REF-417: Add panel resize functionality ⬜ TODO
**Сложность:** Высокая
**Файлы:** Dashboard layout

### REF-418: Add panel fullscreen mode ⬜ TODO
**Сложность:** Средняя
**Файлы:** Panel system

### REF-419: Add panel search/filter ⬜ TODO
**Описание:** Search panels by name in the panel picker.
**Сложность:** Средняя
**Файлы:** Panel system

### REF-420: Add recently used panels section ⬜ TODO
**Сложность:** Средняя
**Файлы:** Panel system

### REF-421: Add panel favorites/pinning ⬜ TODO
**Сложность:** Средняя
**Файлы:** Panel system

### REF-422: Add responsive layout for mobile devices ⬜ TODO
**Описание:** Dashboard should work on tablets and mobile.
**Сложность:** Высокая
**Файлы:** Dashboard layout

### REF-423: Add responsive layout for ultra-wide screens ⬜ TODO
**Сложность:** Средняя
**Файлы:** Dashboard layout

### REF-424: Add print-friendly styles ⬜ TODO
**Сложность:** Низкая
**Файлы:** CSS

### REF-425: Add high contrast mode ⬜ TODO
**Сложность:** Средняя
**Файлы:** Theme system

### REF-426: Add reduced motion support ⬜ TODO
**Описание:** Respect prefers-reduced-motion.
**Сложность:** Средняя
**Файлы:** CSS, animated components

### REF-427: Add colorblind-friendly palette option ⬜ TODO
**Сложность:** Средняя
**Файлы:** Theme system

### REF-428: Add font size preference ⬜ TODO
**Сложность:** Средняя
**Файлы:** Theme system

### REF-429: Add tooltip on hover for icon-only buttons ⬜ TODO
**Сложность:** Низкая
**Файлы:** All icon buttons

### REF-434: Add notification preferences ⬜ TODO
**Описание:** Let users choose which notifications to receive.
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/NotificationCenter.jsx`

### REF-435: Add sound preference per notification type ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useSoundAlerts.js`

### REF-436: Add visual indicator for connection status in header ⬜ TODO
**Сложность:** Низкая
**Файлы:** App header

### REF-437: Add latency indicator in header ⬜ TODO
**Сложность:** Низкая
**Файлы:** App header

### REF-438: Add clock/timezone display ⬜ TODO
**Сложность:** Низкая
**Файлы:** App header

### REF-439: Add market session indicator ⬜ TODO
**Сложность:** Средняя
**Файлы:** App header

### REF-440: Add quick action toolbar ⬜ TODO
**Описание:** Floating toolbar with common actions.
**Сложность:** Средняя
**Файлы:** App-level

### REF-442: Add help tooltips for complex panels ⬜ TODO
**Сложность:** Средняя
**Файлы:** Complex panels

### REF-443: Add panel descriptions in panel picker ⬜ TODO
**Сложность:** Низкая
**Файлы:** Panel system

### REF-444: Add data freshness indicator ⬜ TODO
**Описание:** Show when data was last updated.
**Сложность:** Средняя
**Файлы:** Data-fetching components

### REF-445: Add data quality indicator ⬜ TODO
**Описание:** Show data quality score for each panel.
**Сложность:** Высокая
**Файлы:** Data-fetching components

### REF-446: Add export to CSV/JSON for all tables ⬜ TODO
**Сложность:** Средняя
**Файлы:** Table components

### REF-448: Add chart annotation tools ⬜ TODO
**Сложность:** Высокая
**Файлы:** Chart components

### REF-449: Add chart screenshot/export ⬜ TODO
**Сложность:** Средняя
**Файлы:** Chart components

---

## ФАЗА 12 — Code Quality & Tooling

### REF-451: Add ESLint rule for consistent import ordering ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/eslint.config.js`

### REF-452: Add ESLint rule for no-console in production ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/eslint.config.js`

### REF-453: Add ESLint rule for react-hooks/exhaustive-deps as error ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/eslint.config.js`

### REF-454: Add Prettier configuration ⬜ TODO
**Описание:** Add .prettierrc with consistent formatting rules.
**Сложность:** Низкая
**Файлы:** New `web-ui/.prettierrc`

### REF-455: Run Prettier on all web-ui files ⬜ TODO
**Сложность:** Низкая
**Файлы:** All `web-ui/src/` files

### REF-456: Add Ruff strict rules for Python ⬜ TODO
**Описание:** Enable more ruff rules beyond defaults.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/pyproject.toml`

### REF-457: Add mypy strict mode for Python ⬜ TODO
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/pyproject.toml`

### REF-458: Add pre-commit framework (not just shell script) ⬜ TODO
**Описание:** Replace broken pre-commit shell script with pre-commit framework.
**Сложность:** Средняя
**Файлы:** New `.pre-commit-config.yaml`

### REF-459: Add commitlint for conventional commits ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`, commitlint config

### REF-460: Add lint-staged for incremental linting ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`

### REF-461: Add husky for git hooks management ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`, `.husky/`

### REF-462: Add TypeScript strict mode for new files ⬜ TODO
**Описание:** Enable strict TS for new .ts files gradually.
**Сложность:** Высокая
**Файлы:** `web-ui/tsconfig.json`

### REF-463: Convert useLocalStorage.ts to strict TypeScript ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/hooks/useLocalStorage.ts`

### REF-464: Convert format.ts to strict TypeScript ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/src/utils/format.ts`

### REF-465: Add TypeScript types for all props in components ⬜ TODO
**Описание:** Add PropTypes or TypeScript interfaces for component props.
**Сложность:** Высокая
**Файлы:** All components

### REF-466: Add TypeScript types for WebSocket messages ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/types/`

### REF-467: Add TypeScript types for API responses ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/types/`

### REF-468: Add TypeScript types for panel registry ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/panels/registry.js`

### REF-469: Add TypeScript types for hooks ⬜ TODO
**Сложность:** Высокая
**Файлы:** `web-ui/src/hooks/`

### REF-470: Add TypeScript types for utils ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/src/utils/`

### REF-471: Add code coverage reporting ⬜ TODO
**Описание:** Add c8 or istanbul for coverage reports.
**Сложность:** Средняя
**Файлы:** `web-ui/vitest.config.js`

### REF-472: Add coverage threshold enforcement ⬜ TODO
**Описание:** Fail CI if coverage drops below threshold.
**Сложность:** Средняя
**Файлы:** `web-ui/vitest.config.js`

### REF-474: Add bundle analyzer plugin ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/vite.config.js`

### REF-475: Add duplicate code detection tool ⬜ TODO
**Описание:** Use jscpd to detect duplicate code blocks.
**Сложность:** Средняя
**Файлы:** CI config

### REF-476: Add complexity analysis tool ⬜ TODO
**Описание:** Use plato or complexity-report for cyclomatic complexity.
**Сложность:** Средняя
**Файлы:** CI config

### REF-477: Add dependency graph visualization ⬜ TODO
**Описание:** Use madge or dependency-cruiser.
**Сложность:** Средняя
**Файлы:** `web-ui/`

### REF-478: Add circular dependency detection ⬜ TODO
**Сложность:** Средняя
**Файлы:** `web-ui/`

### REF-479: Add unused exports detection ⬜ TODO
**Описание:** Use ts-prune to find unused exports.
**Сложность:** Средняя
**Файлы:** `web-ui/`

### REF-480: Add TODO/FIXME scanner ⬜ TODO
**Описание:** Scan codebase for TODO/FIXME comments and create report.
**Сложность:** Низкая
**Файлы:** CI config

### REF-481: Add license header to all source files ⬜ TODO
**Сложность:** Низкая
**Файлы:** All source files

### REF-482: Add file naming convention enforcement ⬜ TODO
**Описание:** Ensure consistent file naming (kebab-case vs PascalCase).
**Сложность:** Низкая
**Файлы:** ESLint config

### REF-483: Add import path enforcement ⬜ TODO
**Описание:** Enforce relative imports for internal modules.
**Сложность:** Средняя
**Файлы:** ESLint config

### REF-484: Add no-default-export rule ⬜ TODO
**Описание:** Enforce named exports for better refactoring.
**Сложность:** Средняя
**Файлы:** ESLint config

### REF-485: Add React 19 compatibility audit ⬜ TODO
**Описание:** Check for deprecated React APIs.
**Сложность:** Средняя
**Файлы:** All React files

### REF-486: Add Node.js version pinning ⬜ TODO
**Описание:** Pin Node.js version in .nvmrc and engines.
**Сложность:** Низкая
**Файлы:** `web-ui/package.json`, New `.nvmrc`

### REF-487: Add Python version pinning ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/pyproject.toml`, New `.python-version`

### REF-488: Add package.json engines field ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/package.json`

### REF-489: Add strict dependency versions ⬜ TODO
**Описание:** Use exact versions instead of ranges.
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`

### REF-490: Add lock file linting ⬜ TODO
**Сложность:** Низкая
**Файлы:** CI config

### REF-491: Add automated dependency updates testing ⬜ TODO
**Описание:** Test PRs from dependabot automatically.
**Сложность:** Средняя
**Файлы:** CI config

### REF-492: Add rollback for failed dependency updates ⬜ TODO
**Сложность:** Средняя
**Файлы:** CI config

### REF-495: Add changelog generation tool ⬜ TODO
**Описание:** Auto-generate changelog from conventional commits.
**Сложность:** Средняя
**Файлы:** CI config

### REF-496: Add semantic versioning automation ⬜ TODO
**Сложность:** Средняя
**Файлы:** CI config

### REF-497: Add release notes generation ⬜ TODO
**Сложность:** Средняя
**Файлы:** CI config

### REF-499: Add feature flag system for UI ⬜ TODO
**Описание:** Use FeatureFlags component to toggle features in production.
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/FeatureFlags.jsx`

---

## ФАЗА 13 — Static Analysis Bug Fixes

### REF-501: Static analysis — audit all React components for runtime bugs ✅ DONE
**Описание:** Go through every .jsx component. Check for: undefined vars, wrong prop types, missing null checks, broken conditionals, incorrect hook usage. Fix bugs that cause incorrect behavior.
**Сложность:** Высокая
**Файлы:** All `web-ui/src/components/*.jsx` (51 files)

### REF-502: Static analysis — audit all hooks for bugs ✅ DONE
**Описание:** Check useLocalStorage, useExchangeData, useMockData, useNotifications, usePerformance, useDetachablePanels. Verify cleanup, edge cases, race conditions.
**Сложность:** Высокая
**Файлы:** `web-ui/src/hooks/` (6 files)

### REF-503: Static analysis — audit all utils for bugs ✅ DONE
**Описание:** Check indicators.js, backtestEngine.js, mockData.js, format.ts, patterns.ts, performance.ts, timeframes.ts, auditExport.js, performanceMonitor.js. Verify math correctness, edge cases.
**Сложность:** Высокая
**Файлы:** `web-ui/src/utils/` (11 files)

### REF-504: Static analysis — audit panel registry for broken imports ✅ DONE
**Описание:** Check registry.js — verify every panel import resolves, no dead references, all categories correct.
**Сложность:** Средняя
**Файлы:** `web-ui/src/panels/registry.js`, `web-ui/src/panels/PanelContainer.jsx`

### REF-505: Static analysis — audit App.jsx for bugs ✅ DONE
**Описание:** Check context providers, routing, WS connection, error boundaries, lazy loading.
**Сложность:** Высокая
**Файлы:** `web-ui/src/App.jsx`

### REF-506: Static analysis — audit Python strategies for bugs ✅ DONE
**Описание:** Check strategies.py — verify indicator math, signal generation, edge cases (empty candles, single candle, NaN values).
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/strategies/`

### REF-507: Static analysis — audit Python risk module for bugs ✅ DONE
**Описание:** Check VaR, CVaR, Kelly, position sizers, stress tests. Verify math, edge cases (empty portfolio, single position).
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/risk/`

### REF-508: Static analysis — audit Python backtesting for bugs ✅ DONE
**Описание:** Check backtester, engine, PnL calculator, optimizer, walk-forward. Verify equity curve, fee calculation, position simulation.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/backtesting/`

### REF-509: Static analysis — audit Python communication layer for bugs ✅ DONE
**Описание:** Check WS client, signal publisher, SHM ring buffer, circuit breaker. Verify reconnection, error handling, buffer overflow.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/communication/`

### REF-510: Static analysis — audit Python data_collection for bugs ✅ DONE
**Описание:** Check exchange factory, real account, real market data. Verify API calls, error handling, rate limiting.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/data_collection/`

### REF-511: Static analysis — audit Python ML module for bugs ✅ DONE
**Описание:** Check autoencoder, automl, environment, feature store, model registry, price predictor, RL trader, VAE, SVM. Verify model loading, prediction, training loops.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/ml/`

### REF-512: Static analysis — audit Python monitoring/observability for bugs ✅ DONE
**Описание:** Check alerting, health server, metrics, tracker, health checks, logging, tracing. Verify metric collection, alert thresholds.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/monitoring/`, `ai-signal-bot/src/observability/`

### REF-513: Static analysis — audit Python portfolio module for bugs ✅ DONE
**Описание:** Check Black-Litterman, Markowitz, rebalancing, risk parity. Verify optimization, edge cases.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/portfolio/`

### REF-514: Static analysis — audit Python research module for bugs ✅ DONE
**Описание:** Check attribution, competition, genetic strategy, greeks hedging, microstructure lab. Verify math, edge cases.
**Сложность:** Высокая
**Файлы:** `ai-signal-bot/src/research/`

### REF-515: Static analysis — audit Python database module for bugs ✅ DONE
**Описание:** Check database.py, db.py, models.py. Verify SQL queries, connection handling, migrations.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/database/`

### REF-516: Static analysis — audit Python config loading for bugs ✅ DONE
**Описание:** Check config/__init__.py, settings.yaml. Verify validation, defaults, type coercion.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/config/`, `ai-signal-bot/config/settings.yaml`

### REF-517: Static analysis — audit Python utils for bugs ✅ DONE
**Описание:** Check helpers.py — CircuitBreaker, RateLimiter, formatting, logging. Verify edge cases.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/utils/`

### REF-518: Static analysis — audit Python LLM engine for bugs ✅ DONE
**Описание:** Check engine.py — signal explanations, market analysis. Verify prompt construction, API calls.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/llm_engine/`

### REF-519: Static analysis — audit Python notification for bugs ✅ DONE
**Описание:** Check notifier.py. Verify message formatting, delivery, error handling.
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/src/notification/`

### REF-520: Static analysis — audit Python networking for bugs ✅ DONE
**Описание:** Check socket_transport.py. Verify connection handling, error recovery.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/src/networking/`

---

## ФАЗА 14 — Config Updates & Maintenance

### REF-521: Update settings.yaml — verify all config keys match code ⬜ TODO
**Описание:** Compare every config key in settings.yaml with actual usage in code. Remove dead keys, add missing keys, update defaults.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/config/settings.yaml`, `ai-signal-bot/src/config/`

### REF-522: Update settings.testnet.yaml — sync with main config ⬜ TODO
**Описание:** Ensure testnet config has same keys as main config with testnet-appropriate values.
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/config/settings.testnet.yaml`

### REF-523: Update helm/values.yaml — verify all values match templates ⬜ TODO
**Описание:** Compare values.yaml with all Helm templates. Remove dead values, add missing ones.
**Сложность:** Средняя
**Файлы:** `helm/values.yaml`, `helm/templates/`

### REF-524: Update deploy/helm/values.yaml — sync with main helm chart ⬜ TODO
**Описание:** Ensure deploy/helm chart is consistent with helm/ chart.
**Сложность:** Средняя
**Файлы:** `deploy/helm/`

### REF-525: Update shared_config.yaml — verify all shared values ⬜ TODO
**Описание:** Check shared_config.yaml is consistent with all service configs.
**Сложность:** Средняя
**Файлы:** `shared_config.yaml`

### REF-526: Update exchange_simulator/config.yaml — verify config ⬜ TODO
**Сложность:** Низкая
**Файлы:** `exchange_simulator/config.yaml`

### REF-527: Update hft-trade-bot config.yaml — verify config ⬜ TODO
**Сложность:** Средняя
**Файлы:** `hft-trade-bot/config/config.yaml`, `hft-trade-bot/config/config.prod.yaml`

### REF-528: Update web-ui/vite.config.js — verify build config ⬜ TODO
**Описание:** Check aliases, plugins, build options, PWA config, esbuild config.
**Сложность:** Средняя
**Файлы:** `web-ui/vite.config.js`

### REF-529: Update web-ui/vitest.config.js — fix isolate setting ⬜ TODO
**Описание:** Change isolate: false to isolate: true. Verify test setup file path.
**Сложность:** Низкая
**Файлы:** `web-ui/vitest.config.js`

### REF-530: Update web-ui/package.json — verify dependencies ⬜ TODO
**Описание:** Remove unused deps, update outdated deps, verify scripts.
**Сложность:** Средняя
**Файлы:** `web-ui/package.json`

### REF-531: Update web-ui/tsconfig.json — verify TS config ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/tsconfig.json`

### REF-532: Update web-ui/eslint.config.js — verify lint rules ⬜ TODO
**Сложность:** Низкая
**Файлы:** `web-ui/eslint.config.js`

### REF-533: Update ai-signal-bot/pyproject.toml — verify ruff/mypy config ⬜ TODO
**Сложность:** Низкая
**Файлы:** `ai-signal-bot/pyproject.toml`

### REF-534: Update ai-signal-bot/requirements.txt — verify deps ⬜ TODO
**Описание:** Remove unused deps, pin versions, verify compatibility.
**Сложность:** Средняя
**Файлы:** `ai-signal-bot/requirements.txt`

### REF-535: Update docker-compose.yml — verify service config ⬜ TODO
**Описание:** Check all services, ports, volumes, networks, healthchecks.
**Сложность:** Средняя
**Файлы:** `docker-compose.yml`

### REF-536: Update all Dockerfiles — verify build stages ⬜ TODO
**Описание:** Check base images, build steps, exposed ports, healthchecks.
**Сложность:** Средняя
**Файлы:** All Dockerfiles

### REF-537: Update .env.example — verify env vars ⬜ TODO
**Описание:** Ensure all env vars used in code are documented in .env.example.
**Сложность:** Низкая
**Файлы:** `.env.example` or create if missing

### REF-538: Update exchange_simulator config — verify all params ⬜ TODO
**Описание:** Check GBM params, candle intervals, symbol list, WS port.
**Сложность:** Средняя
**Файлы:** `exchange_simulator/config.yaml`

### REF-539: Update Grafana dashboards — verify queries match current metrics ⬜ TODO
**Описание:** Check all PromQL queries in Grafana dashboards match actual metrics exported by services.
**Сложность:** Высокая
**Файлы:** `helm/templates/grafana.yaml`, `deploy/helm/templates/grafana.yaml`

### REF-540: Update Prometheus scrape config — verify targets ⬜ TODO
**Описание:** Ensure all services are scraped, ports match, intervals correct.
**Сложность:** Средняя
**Файлы:** `helm/templates/prometheus.yaml`, `deploy/helm/templates/prometheus.yaml`

---

## ФАЗА 15 — Custom CI/CD (Self-Hosted)

### REF-541: Write custom CI script — lint check (Python + JS) ⬜ TODO
**Описание:** Write `scripts/ci/lint.sh` that runs ruff + eslint without GitHub Actions. Can run locally or in any CI.
**Сложность:** Средняя
**Файлы:** New `scripts/ci/lint.sh`

### REF-542: Write custom CI script — test runner (Python + JS) ⬜ TODO
**Описание:** Write `scripts/ci/test.sh` that runs pytest + vitest. Reports pass/fail counts.
**Сложность:** Средняя
**Файлы:** New `scripts/ci/test.sh`

### REF-543: Write custom CI script — build check ⬜ TODO
**Описание:** Write `scripts/ci/build.sh` that builds all Docker images and reports failures.
**Сложность:** Средняя
**Файлы:** New `scripts/ci/build.sh`

### REF-544: Write custom CI script — security scan ⬜ TODO
**Описание:** Write `scripts/ci/security.sh` that runs npm audit, pip-audit, gitleaks, and checks for hardcoded secrets.
**Сложность:** Высокая
**Файлы:** New `scripts/ci/security.sh`

### REF-545: Write custom CI script — Helm lint ⬜ TODO
**Описание:** Write `scripts/ci/helm-lint.sh` that validates all Helm charts.
**Сложность:** Низкая
**Файлы:** New `scripts/ci/helm-lint.sh`

### REF-546: Write custom CI script — Docker image scan ⬜ TODO
**Описание:** Write `scripts/ci/scan-images.sh` that scans built images with trivy or grype.
**Сложность:** Средняя
**Файлы:** New `scripts/ci/scan-images.sh`

### REF-547: Write custom CI orchestrator — run all checks ⬜ TODO
**Описание:** Write `scripts/ci/run-all.sh` that runs lint, test, build, security, helm-lint in sequence. Returns exit code.
**Сложность:** Средняя
**Файлы:** New `scripts/ci/run-all.sh`

### REF-548: Write pre-commit hook (Python, not shell) ⬜ TODO
**Описание:** Replace broken .git/hooks/pre-commit with a Python script that runs lint + test before commit. Configurable via .pre-commit-config.yaml.
**Сложность:** Средняя
**Файлы:** New `scripts/pre-commit.py`, `.pre-commit-config.yaml`

### REF-549: Write custom deployment script ⬜ TODO
**Описание:** Write `scripts/deploy.sh` that deploys via Helm to a configured cluster. Supports rollback.
**Сложность:** Высокая
**Файлы:** New `scripts/deploy.sh`

### REF-550: Write CI status reporter ⬜ TODO
**Описание:** Write `scripts/ci/report.py` that collects all CI results and generates a markdown report. Can be used in any CI system.
**Сложность:** Средняя
**Файлы:** New `scripts/ci/report.py`

---

## ФАЗА 16 — Documentation Updates (All Docs)

### REF-551: Update docs/WEB_UI.md — match current component count & panels ⬜ TODO
**Описание:** Doc says "227 React components, 204 registered panels". Verify actual count and update. Update all references to component names, hooks, utils.
**Сложность:** Средняя
**Файлы:** `docs/WEB_UI.md`

### REF-552: Update docs/WEBSOCKET_PROTOCOL.md — match current WS messages ⬜ TODO
**Описание:** Verify all message types documented match actual WS messages in code. Add new messages, remove dead ones.
**Сложность:** Средняя
**Файлы:** `docs/WEBSOCKET_PROTOCOL.md`

### REF-553: Update docs/TRADING_STRATEGIES.md — match current strategies ⬜ TODO
**Описание:** Verify all strategies documented match actual code. Update parameters, logic descriptions.
**Сложность:** Средняя
**Файлы:** `docs/TRADING_STRATEGIES.md`

### REF-554: Update docs/RISK_MANAGEMENT.md — match current risk module ⬜ TODO
**Описание:** Verify VaR, CVaR, Kelly, position sizers, stress tests match code. Update formulas, parameters.
**Сложность:** Средняя
**Файлы:** `docs/RISK_MANAGEMENT.md`

### REF-555: Update docs/TESTING.md — match current test count & structure ⬜ TODO
**Описание:** Doc says "118 Python + 46 C++ + 44 JS = 208 total". Verify actual test count. Update test structure, commands.
**Сложность:** Средняя
**Файлы:** `docs/TESTING.md`

### REF-556: Update docs/REST_API.md — match current endpoints ⬜ TODO
**Описание:** Verify all documented endpoints match actual code. Add new endpoints, remove dead ones.
**Сложность:** Средняя
**Файлы:** `docs/REST_API.md`

### REF-557: Update docs/MONITORING_GUIDE.md — match current monitoring ⬜ TODO
**Описание:** Verify Grafana dashboards, Prometheus metrics, alert rules match current code.
**Сложность:** Средняя
**Файлы:** `docs/MONITORING_GUIDE.md`

### REF-558: Update docs/PERFORMANCE.md — match current perf metrics ⬜ TODO
**Описание:** Verify performance benchmarks, optimization techniques match current code.
**Сложность:** Средняя
**Файлы:** `docs/PERFORMANCE.md`

### REF-559: Update docs/DEPLOYMENT.md — match current deployment process ⬜ TODO
**Описание:** Verify Helm chart, Docker Compose, deployment steps match current setup.
**Сложность:** Средняя
**Файлы:** `docs/DEPLOYMENT.md`

### REF-560: Update docs/ARCHITECTURE.md — match current architecture ⬜ TODO
**Описание:** Verify system architecture, data flow, service map match current code.
**Сложность:** Средняя
**Файлы:** `docs/ARCHITECTURE.md`

### REF-561: Update docs/ADVANCED_ORDER_TYPES.md — match current order types ⬜ TODO
**Сложность:** Средняя
**Файлы:** `docs/ADVANCED_ORDER_TYPES.md`

### REF-562: Update docs/AUDIT_FINDINGS.md — verify all findings resolved ⬜ TODO
**Описание:** Go through audit findings, mark resolved ones, update unresolved ones.
**Сложность:** Средняя
**Файлы:** `docs/AUDIT_FINDINGS.md`

### REF-563: Update docs/REFACTORING_PLAN_10DAYS.md — mark completed items ⬜ TODO
**Описание:** Mark completed refactoring items, update remaining plan.
**Сложность:** Низкая
**Файлы:** `docs/REFACTORING_PLAN_10DAYS.md`

### REF-564: Update docs/guides/QUICK_START.md — verify setup steps ⬜ TODO
**Описание:** Verify quick start guide matches current project setup.
**Сложность:** Низкая
**Файлы:** `docs/guides/QUICK_START.md`

### REF-565: Update docs/guides/DEVELOPMENT_GUIDE.md — verify dev workflow ⬜ TODO
**Описание:** Verify development guide matches current workflow, tools, commands.
**Сложность:** Средняя
**Файлы:** `docs/guides/DEVELOPMENT_GUIDE.md`

### REF-566: Update docs/guides/CONFIGURATION_GUIDE.md — verify config docs ⬜ TODO
**Описание:** Verify all config options documented, match settings.yaml.
**Сложность:** Средняя
**Файлы:** `docs/guides/CONFIGURATION_GUIDE.md`

### REF-567: Update docs/guides/TRADING_GUIDE.md — verify trading workflow ⬜ TODO
**Сложность:** Средняя
**Файлы:** `docs/guides/TRADING_GUIDE.md`

### REF-568: Update docs/theory/TECHNICAL_REFERENCE.md — match current system ⬜ TODO
**Описание:** Update tech stack, module count, architecture. Remove references to non-functional code (Rust, VHDL, C++ if not used).
**Сложность:** Высокая
**Файлы:** `docs/theory/TECHNICAL_REFERENCE.md`

### REF-569: Update docs/theory/module_guide_en.md — match current modules ⬜ TODO
**Описание:** Verify every module documented matches actual code. Update file paths, class names, logic descriptions.
**Сложность:** Высокая
**Файлы:** `docs/theory/module_guide_en.md`

### REF-570: Update docs/theory/project_architecture_en.md — match current architecture ⬜ TODO
**Описание:** Update data flow diagram, service ports, component count.
**Сложность:** Высокая
**Файлы:** `docs/theory/project_architecture_en.md`

### REF-571: Update docs/theory/useful_info_en.md — match current commands & configs ⬜ TODO
**Описание:** Update all commands, ports, config paths, test commands, Docker commands.
**Сложность:** Высокая
**Файлы:** `docs/theory/useful_info_en.md`

### REF-572: Update docs/theory/quant_models_en.md — match current models ⬜ TODO
**Описание:** Verify all quantitative models documented match actual implementations.
**Сложность:** Высокая
**Файлы:** `docs/theory/quant_models_en.md`

### REF-573: Update docs/theory/hft_architecture_en.md — match current HFT system ⬜ TODO
**Описание:** Update HFT architecture to match current code. Remove references to non-functional components.
**Сложность:** Высокая
**Файлы:** `docs/theory/hft_architecture_en.md`

### REF-574: Update docs/theory/ai_slop_lessons_en.md — add new lessons ⬜ TODO
**Описание:** Document any new AI slop patterns found during refactoring.
**Сложность:** Средняя
**Файлы:** `docs/theory/ai_slop_lessons_en.md`

### REF-575: Update docs/theory/README.md — update file listing ⬜ TODO
**Описание:** Update file count, descriptions, listing to match current docs.
**Сложность:** Низкая
**Файлы:** `docs/theory/README.md`

### REF-576: Update README.md — match current project overview ⬜ TODO
**Описание:** Update project description, features, setup instructions, architecture.
**Сложность:** Средняя
**Файлы:** `README.md`

### REF-577: Update README_PROJECT_OVERVIEW.md — match current project ⬜ TODO
**Сложность:** Средняя
**Файлы:** `README_PROJECT_OVERVIEW.md`

### REF-578: Update CHANGELOG.md — add recent changes ⬜ TODO
**Описание:** Document all recent refactoring, bug fixes, new features.
**Сложность:** Средняя
**Файлы:** `CHANGELOG.md`

### REF-579: Update CONTRIBUTING.md — match current workflow ⬜ TODO
**Сложность:** Низкая
**Файлы:** `CONTRIBUTING.md`

### REF-580: Update SECURITY.md — match current security practices ⬜ TODO
**Сложность:** Низкая
**Файлы:** `SECURITY.md`

---

## ФАЗА 17 — Test Coverage (Every Part)

### REF-581: Add vitest tests for useDetachablePanels hook ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/useDetachablePanels.test.jsx`

### REF-582: Add vitest tests for useExchangeData hook ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/useExchangeData.test.jsx`

### REF-583: Add vitest tests for useMockData hook ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/useMockData.test.jsx`

### REF-584: Add vitest tests for useNotifications hook ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/useNotifications.test.jsx`

### REF-585: Add vitest tests for usePerformance hook ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/usePerformance.test.jsx`

### REF-586: Add vitest tests for indicators.js ⬜ TODO
**Описание:** Test SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, VWAP calculations.
**Сложность:** Средняя
**Файлы:** Expand `web-ui/src/test/indicators.test.js`

### REF-587: Add vitest tests for format.ts ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `web-ui/src/test/format.test.ts`

### REF-588: Add vitest tests for patterns.ts ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/patterns.test.ts`

### REF-589: Add vitest tests for timeframes.ts ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `web-ui/src/test/timeframes.test.ts`

### REF-590: Add vitest tests for performance.ts ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/performance.test.ts`

### REF-591: Add vitest tests for auditExport.js ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/auditExport.test.js`

### REF-592: Add vitest tests for performanceMonitor.js ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/performanceMonitor.test.js`

### REF-593: Add vitest tests for backtestEngine.js ⬜ TODO
**Описание:** Expand existing test with more edge cases.
**Сложность:** Высокая
**Файлы:** Expand `web-ui/src/test/backtestEngine.test.js`

### REF-594: Add vitest tests for mockData.js ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/mockData.test.js`

### REF-595: Add vitest tests for PanelContainer.jsx ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `web-ui/src/test/panelContainer.test.jsx`

### REF-596: Add vitest tests for registry.js — verify all panels ⬜ TODO
**Описание:** Test that every panel in registry renders without crashing.
**Сложность:** Высокая
**Файлы:** New `web-ui/src/test/registry.test.jsx`

### REF-597: Add vitest tests for App.jsx — verify providers & routing ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `web-ui/src/test/app.test.jsx`

### REF-598: Add pytest tests for SignalValidator ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_signal_validator.py`

### REF-599: Add pytest tests for exchange_factory ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_exchange_factory.py`

### REF-600: Add pytest tests for database module ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_database.py`

### REF-601: Add pytest tests for config loading & validation ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_config.py`

### REF-602: Add pytest tests for notifier ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `ai-signal-bot/tests/test_notifier.py`

### REF-603: Add pytest tests for helpers (CircuitBreaker, RateLimiter) ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_helpers.py`

### REF-604: Add pytest tests for LLM engine ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_llm_engine.py`

### REF-605: Add pytest tests for monitoring alerting ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_alerting.py`

### REF-606: Add pytest tests for monitoring metrics ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_metrics.py`

### REF-607: Add pytest tests for observability health_checks ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_health_checks.py`

### REF-608: Add pytest tests for observability logging ⬜ TODO
**Сложность:** Низкая
**Файлы:** New `ai-signal-bot/tests/test_logging.py`

### REF-609: Add pytest tests for portfolio black_litterman ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_black_litterman.py`

### REF-610: Add pytest tests for portfolio markowitz ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_markowitz.py`

### REF-611: Add pytest tests for portfolio rebalancing ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_rebalancing.py`

### REF-612: Add pytest tests for portfolio risk_parity ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_risk_parity.py`

### REF-613: Add pytest tests for research attribution ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_attribution.py`

### REF-614: Add pytest tests for research greeks_hedging ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_greeks_hedging.py`

### REF-615: Add pytest tests for research microstructure_lab ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_microstructure_lab.py`

### REF-616: Add pytest tests for ML autoencoder ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_autoencoder.py`

### REF-617: Add pytest tests for ML feature_store ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_feature_store.py`

### REF-618: Add pytest tests for ML model_registry ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_model_registry.py`

### REF-619: Add pytest tests for ML price_predictor ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_price_predictor.py`

### REF-620: Add pytest tests for communication circuit_breaker ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_circuit_breaker.py`

### REF-621: Add pytest tests for communication ws_client ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_ws_client.py`

### REF-622: Add pytest tests for communication shm_ring_buffer ⬜ TODO
**Сложность:** Высокая
**Файлы:** New `ai-signal-bot/tests/test_shm_ring_buffer.py`

### REF-623: Add pytest tests for data_collection real_account ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_real_account.py`

### REF-624: Add pytest tests for data_collection real_market_data ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_real_market_data.py`

### REF-625: Add pytest tests for networking socket_transport ⬜ TODO
**Сложность:** Средняя
**Файлы:** New `ai-signal-bot/tests/test_socket_transport.py`