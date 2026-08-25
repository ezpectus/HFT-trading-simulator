# Plan проверок проекта — найти и исправить всё "говно"

> Создан: Aug 25, 2026
> Цель: систематический аудит всего проекта, найти сломанное/устаревшее/незавершённое

---

## 1. Git & коммиты

### 1.1 Незакоммиченные изменения
- **Статус:** ✅ Clean working tree — `git status --short` shows no uncommitted changes

### 1.2 Python тест-фиксы не закоммичены
- **Статус:** ✅ All committed — working tree clean

### 1.3 Неотправленные коммиты на origin
- **Статус:** ⚠️ ~25+ local commits ahead of origin/master — need `git push origin master`

---

## 2. JS тесты (web-ui)

### 2.1 Запустить полный тест-ран
- **Команда:** `cd web-ui && npx vitest run`
- **Ожидание:** 857 тестов, 0 failures (commit a039f4c)
- **Проверка:** Если упали — зафиксировать какие

### 2.2 Flaky тесты
- **Команда:** `npx vitest run` 3 раза подряд
- **Проверка:** Тесты, которые иногда падают (таймеры, random, localStorage)
- **REF-19:** Audit all test files for flaky tests

### 2.3 Coverage
- **REF-20:** Добавить coverage report, установить порог
- **Команда:** `npx vitest run --coverage`
- **Проверка:** Текущий coverage для `src/utils/**` и `src/hooks/**`

### 2.4 Тесты для утилит
- **REF-15:** Нет тестов для `ui-helpers.js` (pnlColor, pnlBg, sideColor, statusColor, statusIcon, ICONS, StatCard, Bar, WarningBanner, Label, SectionTitle)
- **REF-16:** Нет тестов для `format.ts` (formatPrice, formatVolume, formatPct, formatUsd, formatTime)
- **REF-17:** Нет тестов для `patterns.ts` (detectCandlePatterns)
- **REF-18:** Нет тестов для `timeframes.ts` (aggregateCandles)

---

## 3. Python тесты (ai-signal-bot)

### 3.1 Запустить полный тест-ран
- **Команда:** `cd ai-signal-bot && python -m pytest -v`
- **Проверка:** Сколько тестов, сколько падает

### 3.2 Незакоммиченные фиксы
- **Проверить:** `git diff --name-only` на Python файлах
- **Файлы:** test_validator, test_comm_circuit_breaker, test_signal_publisher, test_db, test_backtester, test_tracker, test_integration, test_e2e_pipeline, test_strategy_risk_backtest
- **Source:** alerting.py, copula.py, dtw.py, position_sizing.py

### 3.3 TODO/FIXME в Python коде
- **Статус:** ✅ ALL CLEAR — 0 TODO/FIXME/HACK/XXX found in ai-signal-bot/src/**/*.py

---

## 4. web-ui компоненты — аудит качества

### 4.1 Компоненты без memo()
- **Найдено:** 6 компонентов без `memo()`:
  - `ChunkRetryBoundary.jsx` — error boundary (OK, не нужно)
  - `LoadingSkeleton.jsx` — проверит
  - `PanelErrorBoundary.jsx` — error boundary (OK)
  - `ReconnectBanner.jsx` — проверит
  - `Toast.jsx` — проверит
  - `TopErrorBoundary.jsx` — error boundary (OK)
- **REF-38:** Audit memo usage

### 4.2 console.log/warn/error в компонентах
- **Статус:** ✅ ALL OK
  - `AlertWebhook.jsx:27,34` — console.warn (OK, error handling)
  - `PriceAlerts.jsx:37` — console.warn (OK, error handling)
  - `SessionStats.jsx:19,189` — console.warn (OK, error handling)
  - `StrategyBuilder.jsx:36,57,73` — console.warn (OK, error handling)
  - `TopErrorBoundary.jsx:15` — console.error (OK, error boundary)
  - `WidgetSDK.jsx:20` — ✅ OK: `console.log` is inside a string template literal (code sample displayed to user), not an actual call
  - `performanceMonitor.js` — ✅ OK: 6 `console.log` calls gated by `IS_DEV` flag with `eslint-disable` comments

### 4.3 TODO/FIXME в JSX
- **Статус:** ✅ ALL CLEAR — 0 TODO/FIXME/HACK found in web-ui/src/**/*.jsx,*.js,*.ts

### 4.4 Длинные компоненты (>200 строк)
- **Статус:** ✅ N/A — 113 components >200 lines, but these are math/visualization panels (BayesianPricePredictor, CopulaModel, BacktestRunner, etc.) where each is a single self-contained model display. Splitting would add complexity without benefit. Largest: BacktestRunner (783), PerformanceDashboard (520), CopulaModel (493), KMeansClustering (477)"

### 4.5 Index keys в .map()
- **Статус:** ✅ ALL CLEAR — 0 `key={index}` or `key={i}` found in web-ui/src/

---

## 5. Office board — незавершённые задачи

### 5.1 REF-01..50 (текущий приоритет)
- **DONE:** REF-01..13, REF-22..28, REF-33..34 (19 задач)
- **TODO:** REF-14..21, REF-29..32, REF-35..50 (27 задач)
- **Конкретно:**
  - REF-14: Fix useLocalStorage hook (возможно уже не актуально после REF-51..67)
  - REF-15..18: Тесты для утилит (format, patterns, timeframes, ui-helpers)
  - REF-19: Flaky test audit
  - REF-20: Coverage report
  - REF-21: Длинные компоненты >200 строк
  - REF-29: registry.js consistency
  - REF-30: Bundle size audit (depcheck)
  - REF-31: useLocalStorage → TypeScript
  - REF-32: useStatusColor hook
  - REF-35: ui-helpers.js → TypeScript
  - REF-36: PanelErrorBoundary для всех панелей
  - REF-37: Lazy loading для heavy panels
  - REF-38: memo() audit (почти done — 6 без memo, 3 из них error boundaries)
  - REF-39: key prop audit
  - REF-40: useMemo/useCallback deps audit
  - REF-41..50: Python quality, type hints, accessibility, security, ESLint, pre-commit hooks, cn() utility

### 5.2 REF-111..200 (test coverage + performance)
- Все TODO

### 5.3 REF-201..500 (Python, DevOps, UI/UX, tooling)
- Все TODO

### 5.4 REF-521..625 (configs, CI/CD, docs, test coverage)
- Все TODO

---

## 6. Документация

### 6.1 Устаревшие docs
- **Файлов:** 13 `.md` в `docs/`
- **REF-551..580:** Все docs должны соответствовать текущему коду
- **Проверка:** Сравнить описания в docs/ с актуальной структурой кода

### 6.2 autonomous-prompt.md
- **Проверить:** Актуальность приоритетов после каждой сессии
- **Проверить:** Счётчики DONE/TODO

### 6.3 office-board.md
- **Проверить:** Сводка в начале файла актуальна
- **Проверить:** Нет ли противоречий (задача DONE, но фикс не закоммичен)

---

## 7. Конфигурация

### 7.1 vitest.config.js
- `isolate: false` — может вызывать утечку состояния между тестами
- `forceExit: true` — может скрывать hanging promises
- **Проверить:** Актуальны ли эти настройки после REF-107/108 фиксов

### 7.2 Config files (REF-521..540)
- `settings.yaml`, `settings.testnet.yaml`, `shared_config.yaml`
- Exchange simulator config
- HFT trade-bot config
- **Проверить:** Соответствуют ли конфиги текущему коду

### 7.3 Helm charts
- `helm/` и `deploy/helm/` — нужно синхронизировать
- **Проверить:** CodeQL alerts #49, #50 исправлены (empty passwords)

---

## 8. Безопасность

### 8.1 XSS
- **REF-47:** Sanitize user inputs в ApiPlayground, ApiClient, Auth, AlertWebhook
- **Проверить:** Нет `dangerouslySetInnerHTML` (найдено: 0 — OK)
- **Проверить:** API keys не логируются в console

### 8.2 localStorage
- **Проверить:** Не хранит ли sensitive данные в plaintext
- **Проверить:** useLocalStorage не пишет API keys/tokens

---

## Порядок выполнения (приоритет)

1. **Git:** Закоммитить незакоммиченные изменения (JS + Python)
2. **JS тесты:** Запустить `vitest run` → подтвердить 857/0
3. **Python тесты:** Запустить `pytest -v` → зафиксировать состояние
4. **TODO/FIXME:** Просмотреть 19 Python + 2 JSX
5. **console.log:** Удалить `console.log` из WidgetSDK.jsx mock data
6. **REF-14:** Проверить, актуально ли (после REF-51..67)
7. **REF-15..18:** Создать тесты для утилит
8. **REF-19:** Flaky test audit (3 прогона)
9. **REF-21:** Audit длинных компонентов
10. **REF-29:** registry.js consistency
11. **REF-38..40:** memo/key/deps audit
12. **REF-521..540:** Config updates
13. **REF-551..580:** Documentation updates
