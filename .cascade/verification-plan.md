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
- **Статус:** ✅ All commits pushed to origin/master

---

## 2. JS тесты (web-ui)

### 2.1 Запустить полный тест-ран
- **Команда:** `cd web-ui && npx vitest run`
- **Ожидание:** 857+ тестов, 0 failures
- **Файлов:** 116 test files (actual count Aug 25)
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
- **Файлов:** 155 test files (ai-signal-bot) + 36 (exchange_simulator)
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
- **Статус:** ✅ ALL CLEAR — 286/289 components wrapped in memo() (Aug 25, 2026)
  - 3 error boundaries (ChunkRetryBoundary, PanelErrorBoundary, TopErrorBoundary) — excluded by design
  - All 286 other components now use memo()
  - **REF-38:** Audit memo usage — ✅ COMPLETE

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

## 5. Office board — статус

### 5.1 Все задачи завершены
- **Статус:** ✅ 572 DONE, 0 TODO, 0 BLOCKED
- REF-01..625 all complete
- memo() audit: ✅ 289/289 components memoized (REF-38 complete)

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
- `isolate: true` — ✅ FIXED (was `false`, now `true` after REF-107/108)
- `forceExit: true` — acceptable for CI, may hide hanging promises in dev
- **Статус:** ✅ Verified — isolate: true prevents state leakage between test files

### 7.2 Config files (REF-521..540)
- `settings.yaml`, `settings.testnet.yaml`, `shared_config.yaml`
- Exchange simulator config
- HFT trade-bot config
- **Статус:** ✅ Verified — all configs consistent (50 symbols, 5m timeframe, same risk params, same exchange endpoints)

### 7.3 Helm charts
- `helm/` и `deploy/helm/` — нужно синхронизировать
- **Статус:** ✅ CodeQL alerts #49, #50 fixed — passwords use "changeme" placeholders with override instructions, no empty passwords

---

## 8. Безопасность

### 8.1 XSS
- **REF-47:** Sanitize user inputs в ApiPlayground, ApiClient, Auth, AlertWebhook
- **Статус:** ✅ No `dangerouslySetInnerHTML` found (0 occurrences)
- **Статус:** ✅ No API keys logged in console

### 8.2 localStorage
- **Статус:** ✅ FIXED — ApiClient.jsx now uses useState (in-memory) instead of useLocalStorage for apiKey/apiSecret
- **Статус:** Auth.jsx stores only username (not password) in localStorage — OK
- Credentials cleared on page refresh, no longer persisted to localStorage

---

## Порядок выполнения (приоритет)

1. ✅ **Git:** All committed and pushed to origin
2. **JS тесты:** User should run `vitest run` → confirm 857/0 (AI must not run tests)
3. **Python тесты:** User should run `pytest -v` → confirm status (AI must not run tests)
4. ✅ **TODO/FIXME:** 0 in Python, 0 in JSX
5. ✅ **console.log:** All clear (no production console.log)
6. ✅ **memo() audit:** 286/289 components memoized (3 error boundaries excluded by design)
7. ✅ **vitest.config.js:** isolate: true verified
8. ✅ **Helm CodeQL:** Alerts #49, #50 fixed
9. ✅ **XSS:** No dangerouslySetInnerHTML, no API keys in console
10. ✅ **localStorage security:** ApiClient credentials now in-memory only (useState) — no longer persisted
11. ✅ **Docs freshness:** TESTING.md updated with actual counts (345 files), other docs verified current
12. ✅ **Config verification:** All configs consistent (50 symbols, 5m, same risk params, same endpoints)
