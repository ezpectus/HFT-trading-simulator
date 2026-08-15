---
description: Project structure analysis prompt — AI analyzes the full HFT Trading System architecture, identifies gaps, missing models, dead code, and creates an honest readiness assessment
---

# Project Analysis — Промпт для анализа структуры HFT Trading System

> Вставь этот промпт в начало сессии. AI проанализирует структуру проекта, найдёт пробелы, мёртвый код, и создаст честную оценку готовности.

---

## СТАРТ

Ты — Senior System Architect для HFT Trading System. Твоя задача — ПОЛНЫЙ анализ структуры проекта.

### Перед анализом — прочитай контекст:

1. **`MASTER_DEVELOPMENT_PLAN.md`** — текущий план, что сделано, что нет
2. **`README_PROJECT_OVERVIEW.md`** — честная готовность, известные пробелы
3. **`docs/future_development.md`** — идеи, UI-only модели, missing модели, dead code
4. **`CHANGELOG.md`** — последние изменения
5. **`.cascade/notes.md`** — контекст проекта
6. **`.cascade/bug_log.md`** — известные баги
7. **Section 18 of `ai-monster-workflow.md`** — план оставшихся 40%

### После анализа — обнови ВСЕ документы:

- `README_PROJECT_OVERVIEW.md` — обновить честную готовность
- `MASTER_DEVELOPMENT_PLAN.md` — обновить план, отметить новые найденные пробелы
- `docs/future_development.md` — добавить новые идеи если нашёл
- `docs/ARCHITECTURE.md` — если архитектура изменилась
- `docs/MATH_MODELS.md` — если модели добавлены/изменены
- `CHANGELOG.md` — запись об анализе
- `README.md` — исправить badge'ы если нужно
- `.cascade/progress.md` — отметить задачу
- `.cascade/notes.md` — новый контекст

### Что делать

1. **Прочитать структуру проекта** — все директории, все файлы
2. **Понять архитектуру** — как компоненты взаимодействуют
3. **Найти пробелы** — что заявлено в документации, но отсутствует в коде
4. **Найти мёртвый код** — код за #ifdef, неиспользуемые модули
5. **Оценить готовность** — честный процент по каждому компоненту
6. **Создать план** — что нужно сделать до 100%

---

## ФАЗА 1: Структура проекта

### 1.1 Прочитать все директории

```
exchange-simulator/
├── src/                    → ALL .py files
├── tests/                  → ALL test files
├── config/                 → config files
└── requirements.txt

ai-signal-bot/
├── src/
│   ├── strategies/         → ALL strategies
│   ├── ml/                 → ML models
│   ├── risk/               → Risk management
│   ├── portfolio/          → Portfolio optimization
│   ├── technical_analysis/ → Indicators
│   ├── research/           → Research modules
│   ├── backtesting/        → Backtesting engine
│   └── ...
├── tests/
├── config/
└── requirements.txt

hft-trade-bot/
├── src/
│   ├── strategies/         → Signal engines
│   ├── ml/                 → CUDA, ONNX
│   ├── fix/                → FIX 4.4
│   ├── exchange/           → Exchange APIs
│   ├── risk/               → Risk manager
│   ├── persistence/        → Memory-mapped
│   ├── ipc/                → SHM IPC
│   └── ...
├── tests/
├── CMakeLists.txt
└── ...

hft-executor/
├── src/                    → Rust code
├── Cargo.toml
└── ...

web-ui/
├── src/
│   ├── components/         → 197 panels
│   ├── hooks/
│   ├── utils/
│   └── ...
├── package.json
└── ...

docs/                       → ALL documentation
.cascade/                   → AI workspace
shared_config.yaml          → Global config
```

### 1.2 Для каждого компонента

- **Сколько файлов?**
- **Сколько строк кода?**
- **Сколько тестов?**
- **Что реально реализовано?** (прочитать ключевые файлы)
- **Что заявлено в документации?** (прочитать README.md, ARCHITECTURE.md, MATH_MODELS.md)
- **Разница между заявленным и реальным?**

---

## ФАЗА 2: Анализ архитектуры

### 2.1 Компоненты и их взаимодействие

```
Exchange Simulator ←(WebSocket)→ AI Signal Bot ←(SHM/FIX)→ HFT Trade Bot ←(FFI)→ hft-executor
       ↓                                    ↓                           ↓
   Web UI ←(WebSocket)───────────────────────┘───────────────────────────┘
```

Проверить:
- [ ] Как данные передаются между компонентами?
- [ ] Какие протоколы используются? (WebSocket, SHM, FIX, FFI)
- [ ] Есть ли bottlenecks в взаимодействии?
- [ ] Корректно ли работает pipeline: симуляция → анализ → исполнение?
- [ ] Что ломается если один компонент падает?

### 2.2 Стратегии — что реально работает

Прочитать `ai-signal-bot/src/strategies/__init__.py` и `run.py`:
- **Сколько стратегий активно?**
- **Сколько заявлено в README?**
- **Разница?**

### 2.3 ML модели — что реально обучено

Прочитать `ai-signal-bot/src/ml/`:
- **Какие модели существуют?** (LSTM, Transformer, RL, AutoML, Price Predictor)
- **Есть ли обученные веса?** (проверить models/ директорию)
- **Какие модели используются в pipeline?**
- **LightGBM/XGBoost установлены?**

### 2.4 Математические модели — что в trading logic vs UI-only

Проверить КАЖДУЮ модель из README.md:

1. **Найти claim в документации** — "75+ math models"
2. **Найти реализацию в коде** — `grep_search` по имени модели
3. **Категория:**
   - ✅ **Trading logic** — реально используется в pipeline
   - ⚠️ **UI-only** — существует только как .jsx компонент
   - ❌ **Missing** — не существует нигде
   - 💀 **Dead code** — за #ifdef, никогда не компилируется

### 2.5 C++ компоненты

Проверить:
- [ ] Signal Engine V2 — какие индикаторы?
- [ ] Signal Engine V3 — HMM реализация?
- [ ] CUDA kernels — компилируются ли? (#ifdef USE_CUDA)
- [ ] ONNX Runtime — компилируется ли? (#ifdef USE_ONNXRUNTIME)
- [ ] FIX 4.4 — подключён ли к реальному брокеру?
- [ ] SIMD — используется ли AVX2?
- [ ] Memory-mapped persistence — работает ли?

### 2.6 Rust executor

Проверить:
- [ ] Lock-free queue — реализована?
- [ ] WebSocket connection — заглушка или работает?
- [ ] FFI interface — корректна?
- [ ] Auto-reconnect — есть?

### 2.7 Web UI

Проверить:
- [ ] Сколько панелей? (посчитать .jsx файлы)
- [ ] Сколько из них math UI components?
- [ ] Сколько из них реально подключены к данным?
- [ ] Mock mode работает?
- [ ] PWA, accessibility, virtual scrolling?

---

## ФАЗА 3: Сравнение документации vs реальности

### 3.1 README.md badges

| Badge | Claims | Reality | Match? |
|-------|--------|---------|--------|
| strategies | 34+ | ? | ? |
| math models | 75+ | ? | ? |
| panels | 197 | ? | ? |
| tests | 484+ | ? | ? |
| readiness | 85% | ? | ? |

### 3.2 ARCHITECTURE.md claims

Проверить КАЖДЫЙ claim в ARCHITECTURE.md:
- [ ] "FIX 4.4 protocol" — есть, но подключён?
- [ ] "Smart Order Router V2" — реализован?
- [ ] "GPU Acceleration" — компилируется?
- [ ] "ONNX ML inference" — компилируется?
- [ ] "SVI/SABR volatility surface" — существует?
- [ ] "Co-location support" — существует?
- [ ] "Hardware timestamping" — существует?

### 3.3 MATH_MODELS.md claims

Проверить КАЖДУЮ модель:
- [ ] GBM — реализован? ✅/❌
- [ ] Student-t — реализован? ✅/❌
- [ ] Merton Jump Diffusion — реализован? ✅/❌
- [ ] Heston — реализован? ✅/❌
- [ ] Markov Regime Switching — реализован? ✅/❌
- [ ] HMM — где? (C++ only? Python? UI only?)
- [ ] GARCH — где? (trading logic? UI only?)
- [ ] Kalman — где?
- [ ] Copula — где?
- [ ] Wavelet — где?
- [ ] Monte Carlo — где?

---

## ФАЗА 4: Честная оценка готовности

### 4.1 Таблица готовности

```markdown
| Компонент | README badge | Реально | Разница |
|-----------|-------------|---------|---------|
| Exchange Simulator | 90% | ?% | ?% |
| AI Signal Bot | 85% | ?% | ?% |
| HFT Trade Bot | 80% | ?% | ?% |
| Web UI | 85% | ?% | ?% |
| hft-executor | - | ?% | - |
| Monitoring | 90% | ?% | ?% |
| Testing | 85% | ?% | ?% |
| Documentation | 95% | ?% | ?% |
| **Общая** | **85%** | **?%** | ?% |
```

### 4.2 UI-only модели (существуют как .jsx, НЕ в trading logic)

Для каждой модели:
- Имя модели
- UI файл (.jsx)
- Есть ли в Python? (grep_search)
- Есть ли в C++? (grep_search)
- Категория: Trading logic / UI-only / Missing

### 4.3 Модели которых нет ВООБЩЕ

Список моделей, которые заявлены или ожидаемы, но не существуют даже как UI:
- Hurst exponent
- VPIN
- Kyle's Lambda
- ZScore detector
- Ornstein-Uhlenbeck
- SVI/SABR
- и т.д.

### 4.4 Dead code

- CUDA kernels — `#ifdef USE_CUDA`
- ONNX Runtime — `#ifdef USE_ONNXRUNTIME`
- Любой другой код за #ifdef, который не компилируется

---

## ФАЗА 5: План до 100%

### 5.1 Что нужно сделать

Для каждого компонента:
1. **Что есть** — текущее состояние
2. **Чего не хватает** — конкретные пробелы
3. **Что нужно сделать** — конкретные задачи
4. **Приоритет** — Critical / High / Medium / Low
5. **Оценка времени** — недели
6. **Зависимости** — от чего зависит

### 5.2 Приоритизация

```
CRITICAL (нужно сделать первым):
1. Исправить README.md — убрать завышенные badge'ы
2. Портировать high-priority UI-only модели в trading logic
3. Включить CUDA/ONNX в CI или удалить
4. Обучить ML модели

HIGH (после critical):
5. Broker integration
6. Real HFT features (hardware timestamping, tick data)
7. Quantum models (QAOA, VQE)
8. SVI/SABR volatility surface

MEDIUM:
9. Medium-priority UI-only модели
10. Web UI improvements
11. Testing coverage

LOW:
12. Low-priority теоретические модели
13. Documentation polish
```

### 5.3 Timeline

```
Phase 1 (Critical):    X недель
Phase 2 (High):        X недель
Phase 3 (Medium):      X недель
Phase 4 (Low):         X недель (фоново)
Total:                 X недель
```

---

## ФАЗА 6: Документация

### 6.1 Обновить README_PROJECT_OVERVIEW.md

- Честная готовность (не завышенная)
- Список UI-only моделей
- Список missing моделей
- Dead code
- План до 100%

### 6.2 Обновить MASTER_DEVELOPMENT_PLAN.md

- Честные проценты
- Конкретные задачи с приоритетами
- Timeline
- Чек-листы

### 6.3 Обновить docs/future_development.md

- UI-only модели → портировать
- Missing модели → создать
- Dead code → включить или удалить
- Quantum models → план
- Broker integration → план
- Real HFT features → план

### 6.4 Обновить CHANGELOG.md

- Запись об аудите
- Найденные расхождения
- Обновлённые документы

---

## КОММИТ

После завершения анализа:

```powershell
git add -A; git commit -m "docs: project structure analysis — honest readiness assessment, gap analysis, plan to 100%"; git push
```

---

## QUICK REFERENCE

```
ПРОЧИТАТЬ СТРУКТУРУ → ПОНЯТЬ АРХИТЕКТУРУ →
СРАВНИТЬ ДОКУМЕНТАЦИЮ vs РЕАЛЬНОСТЬ →
НАЙТИ ПРОБЕЛЫ (UI-only, missing, dead code) →
ОЦЕНИТЬ ГОТОВНОСТЬ (честно) →
СОЗДАТЬ ПЛАН ДО 100% →
ОБНОВИТЬ ДОКУМЕНТАЦИЮ →
КОММИТ
```

---

*Анализ должен быть честным. Если чего-то нет в коде — писать что нет. Если README врёт — указать где. Если код мёртвый — пометить. Без исключений.*
