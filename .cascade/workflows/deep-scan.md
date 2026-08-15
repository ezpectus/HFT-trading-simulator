---
description: Deep scan prompt — AI reads every unreviewed file in HFT Trading System, finds 20-50 bugs, analyzes root causes, picks best of 6 approaches, fixes, documents with line numbers, commits
---

# Deep Scan — Промпт для глубокого сканирования кода HFT Trading System

> Вставь этот промпт в начало сессии. AI будет глубоко сканировать код, находить баги, фиксить и документировать.
> Минимум 20-50 багов за сессию. Без исключений.

---

## ⚠️ КРИТИЧНО — СТАТИЧЕСКИЙ АНАЛИЗ ТОЛЬКО

### ЗАПРЕЩЕНО — НЕ ЗАПУСКАЙ ТЕРМИНАЛ (КРОМЕ GIT)

| Команда | Почему нельзя |
|---------|---------------|
| `pytest` | Виснет, жрёт память, блокирует сессию |
| `python -m anything` | Виснет, блокирует |
| `ruff` / `mypy` / `flake8` | Используй read_file для проверки |
| `pip install` / `npm install` | Не разрешено |
| `docker` anything | Не разрешено |
| `uvicorn` / `node` / `npm run` | Не разрешено |
| `curl` / `wget` | Не разрешено |
| `make` / `cmake` / `cargo build` | Не разрешено |
| `cat` / `head` / `tail` | Используй read_file |
| `grep` / `rg` / `find` в терминале | Используй grep_search / find_by_name |
| `ls` / `dir` / `tree` | Используй list_dir |
| `python script.py` | Не разрешено |

### РАЗРЕШЁННЫЕ ИНСТРУМЕНТЫ — ТОЛЬКО ЭТИ

| Инструмент | Для чего |
|-----------|----------|
| `read_file` | Читать любой файл (с номерами строк) |
| `grep_search` | Искать паттерны в коде |
| `find_by_name` | Найти файлы по имени/расширению |
| `code_search` | Семантический поиск по коду |
| `list_dir` | Показать содержимое директории |
| `edit` / `multi_edit` | Редактировать файлы |
| `write_to_file` | Создавать новые файлы |
| `run_command` | **ТОЛЬКО** `git add -A; git commit -m "..."; git push` |

### ПРИНЦИП

**ЕСЛИ ТЕБЕ НУЖНО УВИДЕТЬ КОД — ЧИТАЙ ЕГО (read_file), НЕ ЗАПУСКАЙ ЕГО.**
**ЕСЛИ ТЕБЕ НУЖНО НАЙТИ ЧТО-ТО — ИЩИ (grep_search/find_by_name), НЕ ЗАПУСКАЙ grep.**
**ТЕРМИНАЛ = ТОЛЬКО git commit/push. ВСЁ ОСТАЛЬНОЕ — ЧЕРЕЗ ИНСТРУМЕНТЫ.**

---

## СТАРТ

Ты — Senior Code Auditor для HFT Trading System. Твоя задача — глубокий анализ ВСЕГО кода проекта.

### Перед сканированием — прочитай контекст (через read_file, НЕ через терминал):

1. **`MASTER_DEVELOPMENT_PLAN.md`** — что уже сделано, что в планах
2. **`README_PROJECT_OVERVIEW.md`** — честная готовность, пробелы
3. **`docs/future_development.md`** — идеи, UI-only модели, missing модели
4. **`.cascade/bug_log.md`** — известные баги
5. **`.cascade/file_tracker.md`** — какие файлы уже просмотрены
6. **`.cascade/notes.md`** — контекст проекта
7. **Section 18 of `ai-monster-workflow.md`** — план оставшихся 40%

### После каждого фикса — обновляй ВСЕ релевантные документы:

- `CHANGELOG.md` — запись о фиксе
- `README_PROJECT_OVERVIEW.md` — обновить findings если нужно
- `MASTER_DEVELOPMENT_PLAN.md` — отметить выполненные пункты
- `docs/future_development.md` — добавить новые идеи если нашёл
- `docs/MATH_MODELS.md` — если модель добавлена/изменена
- `.cascade/progress.md` — прогресс
- `.cascade/bug_log.md` — статус бага
- `.cascade/file_tracker.md` — статус файла
- `.cascade/notes.md` — новый контекст

### Правила сканирования

1. **Читаешь КАЖДЫЙ файл** который ещё не просматривал
2. **Читаешь МЕДЛЕННО** — не поверхностно, а каждую строку
3. **Читаешь чанками по 200-500 строк** для больших файлов
4. **Не пропускаешь файлы** потому что они "выглядят нормально"
5. **Не пропускаешь тесты** — в тестах тоже бывают баги
6. **Не пропускаешь конфиги** — конфиг баги критичны
7. **После чтения файла** — отмечаешь его в `.cascade/file_tracker.md`

### Порядок сканирования

```
exchange-simulator/src/       → ALL .py files (market_simulator, exchange, websocket_server, models, options, etc.)
ai-signal-bot/src/            → ALL .py files (strategies, ml, risk, portfolio, technical_analysis, research, backtesting)
ai-signal-bot/run.py          → Main entry
hft-trade-bot/src/            → ALL .h/.cpp/.cu files (strategies, ml, fix, exchange, risk, persistence, ipc)
hft-executor/src/             → ALL .rs files
web-ui/src/components/        → ALL .jsx files (197 panels — scan in batches)
web-ui/src/                   → App, hooks, utils, contexts
tests/                        → ALL test files in each component
docs/                         → ALL .md files
```

---

## АНАЛИЗ — что искать

### Анти-паттерны (AP-XXX)
- God class / God function — слишком много ответственности
- Shotgun surgery — одно изменение = 50 файлов
- Primitive obsession — строки/инты вместо enum/class
- Long method (50+ строк)
- Deep nesting (4+ уровня)
- Feature envy — метод использует другой класс больше своего
- Data clumps — одни и те же параметры везде
- Duplicated code — copy-paste
- Middle man — класс просто делегирует
- Inappropriate intimacy — доступ к внутренностям другого класса

### Баги (BUG-XXX)
- None/null dereference
- Unhandled exceptions
- Race conditions
- Resource leaks (unclosed connections, WebSocket, SHM)
- Type mismatches
- Off-by-one
- Logic errors (wrong condition, wrong operator)
- Swallowed exceptions
- Incorrect async/await
- Missing validation
- Incorrect default values
- Dead code paths
- Infinite loops
- Integer overflow (C++)
- Buffer overflow (C++)
- Memory leak (C++ — missing delete, smart pointer misuse)
- Use-after-free (C++)
- Uninitialized variables (C++)

### Безопасность (SEC-XXX)
- SQL injection — проверить все запросы
- XSS — проверить все HTML responses
- Hardcoded secrets — API keys, passwords в коде
- Missing auth checks — WebSocket, API endpoints
- Missing rate limiting
- Information leakage in error messages
- Insecure defaults
- Path traversal — file operations без sanitization
- Insecure random — math.random для crypto/trading
- Insecure crypto — weak hashing

### Производительность (PERF-XXX)
- O(n) где O(1) возможен
- N+1 queries
- Missing pagination
- Sync I/O в async context (Python)
- Missing caching
- Unnecessary object creation
- List где нужен set (O(n) → O(1))
- `list.pop(0)` вместо `deque.popleft()`
- Unnecessary copies (C++ — pass by value instead of reference)
- Missing move semantics (C++)
- Missing SIMD (C++ — AVX2 for batch calculations)
- Missing GPU (C++ — CUDA for Monte Carlo, matrix ops)
- Dynamic allocation in hot path (C++)

### Типизация (TYPE-XXX)
- Missing type hints (Python)
- `Any` без обоснования (Python)
- Incorrect type hints (Python)
- `Optional` где не-optional ожидается (Python)
- Bare `dict` returns вместо dataclass/Pydantic (Python)

### HFT-специфичные (HFT-XXX)
- Latency на hot path — unnecessary allocations, logging, formatting
- Lock contention — mutex где можно lock-free
- Cache misses — poor data locality
- Branch mispredictions — unpredictable branches in hot loops
- Unnecessary serialization/deserialization
- Missing pre-allocation — allocating per-tick instead of pre-allocating
- Incorrect timestamp handling — using system clock instead of monotonic
- Missing batch processing — processing one-by-one instead of batches

---

## ROOT CAUSE ANALYSIS — ПОЧЕМУ это баг

**Перед фиксом — ответь на 8 вопросов:**

1. **Что это за баг?** — точное описание проблемы
2. **ПОЧЕМУ это баг?** — какое некорректное поведение вызывает?
3. **Почему этот баг существует?** — как он появился? (copy-paste, спешка, незнание)
4. **Какой root cause?** — не симптом, а причина
5. **Какие последствия?** — что ломается, что под риском?
6. **Кто затронут?** — пользователи, trading pipeline, другие компоненты
7. **Когда проявляется?** — всегда? при условиях? под нагрузкой? при высоком трафике?
8. **Связанные баги?** — этот баг вызывает другие? вызван другим?

**ТОЛЬКО после ответа на ВСЕ вопросы — переходить к фиксу.**

---

## 6 ПОДХОДОВ — перед фиксом

Для КАЖДОГО бага — сгенерируй 6 подходов:

```
1. Minimal — однострочное изменение, простейшее
2. Pattern — как это решено в других местах кодовой базы?
3. Refactor — реструктурировать окружающий код
4. Architecture — изменить дизайн чтобы предотвратить класс багов
5. Alternative — креативное/нестандартное решение
6. HFT-optimal — решение оптимизированное для HFT (low latency, minimal allocations)
```

Для каждого подхода оцени:
- **S** (Simplicity) — насколько сложное изменение? (проще = лучше, 1-10)
- **R** (Risk) — что может сломаться? (ниже = лучше, 1-10)
- **C** (Completeness) — фиксит root cause или симптом? (root = лучше, 1-10)
- **P** (Performance) — как влияет на скорость? (быстрее = лучше, 1-10)

**Выбери лучший подход** — задокументируй почему.

### Пример таблицы подходов:

| # | Approach | S | R | C | P | Notes |
|---|----------|---|---|---|---|-------|
| 1 | Minimal: add null check | 9 | 2 | 3 | 8 | Быстро, но не лечит причину |
| 2 | Pattern: use Optional[T] | 7 | 3 | 7 | 7 | Как в ml_ensemble.py |
| 3 | Refactor: extract validation | 5 | 5 | 9 | 8 | Чище, но больше изменений |
| 4 | Architecture: validator class | 3 | 7 | 10 | 6 | Over-engineering для этого бага |
| 5 | Alternative: fail fast | 6 | 4 | 8 | 9 | Кидать исключение сразу |
| 6 | HFT-optimal: pre-validate in batch | 4 | 5 | 9 | 10 | Валидация batch'ем, 0 overhead на hot path |

**Selected:** Approach 5 — лучший баланс simplicity/risk/completeness/performance

---

## ФИКС — правила

### Обязательные проверки перед фиксом
- [ ] Root cause analysis завершён (8 вопросов)
- [ ] 6 подходов сгенерированы
- [ ] Лучший подход выбран
- [ ] Impact analysis — какие файлы изменятся?
- [ ] Test check — есть тесты? сломаются ли?
- [ ] Backward compat — API не сломается?

### Правила фикса
- **Фиксь root cause** — не симптом
- **Минимальный diff** — меняй только что нужно
- **Без over-engineering** — простейшее решение что работает
- **Без новых зависимостей** — используем что есть
- **Без breaking changes** — API остаётся совместимым
- **Follow existing patterns** — будь консистентен
- **Type-safe** — все новые строки с type hints (Python), correct types (C++)
- **Secure** — не добавляй новые уязвимости
- **Performant** — не добавляй O(n) где O(1) возможен
- **HFT-conscious** — не добавляй allocations/locks на hot path

### Продвинутые техники — используй ГДЕ НУЖНО

| Техника | Когда | НЕ использовать когда |
|---|---|---|
| `__slots__` | Hot path, много инстансов | One-off классы |
| `functools.lru_cache` | Pure function, повторные вызовы | Side effects |
| `asyncio.Lock` | Shared mutable state в async | Read-only access |
| `dataclass(frozen=True)` | Immutable value objects | Mutable models |
| `enum.IntEnum` | Числовые константы со смыслом | Simple flags |
| `collections.deque` | O(1) push/pop с обоих концов | Random access |
| `collections.defaultdict` | Dict с default factory | Simple dicts |
| `collections.Counter` | Подсчёт | Ручной counting |
| `pathlib.Path` | File path operations | String paths |
| `itertools` | Efficient iteration | Simple loops |
| Generator expressions | Lazy evaluation | Когда нужен list |
| `bisect` | Sorted list operations | Unsorted data |
| `heapq` | Priority queue | Random access sorted |
| `numpy.vectorize` | Numeric arrays | Small data |
| `numba.jit` | Numeric hot loops | Non-numeric code |
| `std::unordered_map` | O(1) lookup (C++) | When order matters |
| `std::span` | Non-owning view (C++20) | When ownership needed |
| Lock-free queue | Hot path IPC | Low contention |
| SIMD intrinsics | Batch numeric ops | Single operations |
| Memory pool | Frequent alloc/dealloc | Rare allocations |

**Для каждой техники — задокументируй ПОЧЕМУ:**
```
Техника: lru_cache на _parse_config()
Почему: Вызывается 100+ раз за тик с теми же аргументами, pure function, экономит 50ms
Альтернатива: Manual dict cache — отклонена, lru_cache сам управляет eviction
```

### Мышление для каждого изменения

1. **Что я делаю?** — одно предложение
2. **Почему?** — root cause, не симптом
3. **Какую технику?** — назвать паттерн
4. **Почему эту технику?** — не другую
5. **Что может пойти не так?** — риски
6. **Over-engineering?** — можно проще?
7. **Under-engineering?** — не срезаю ли углы?
8. **Масштабируется?** — 10x, 100x, 1000x
9. **Type-safe?** — без Any, без type: ignore
10. **Secure?** — без новых уязвимостей
11. **HFT-ready?** — latency, allocations, locks
12. **Продукт?** — миллионы пользователей, хакеры, утечки

---

## ДОКУМЕНТАЦИЯ — после фикса

### 1. CHANGELOG.md

```markdown
## [Unreleased]

### Fixed
- **[BUG-NNN] Краткое описание** — `path/to/file.py:340-400`
  - Root cause: [одна строка — ПОЧЕМУ это баг]
  - Fix: [одна строка — что изменено]
  - Lines: 340-400 (20 lines → 35 lines)
```

### 2. README_PROJECT_OVERVIEW.md

В секцию "Deep Analysis Findings" добавь:

```markdown
#### BUG-NNN: [Название]
- **Файл:** `path/to/file.py:340-400`
- **Категория:** Anti-pattern / Bug / Security / Performance / Type Safety / HFT
- **Severity:** Critical / High / Medium / Low
- **Root Cause:** [ПОЧЕМУ это баг — детально]
- **Impact:** [Что ломается]
- **Approaches (6):**
  | # | Approach | S | R | C | P | Notes |
  |---|----------|---|---|---|---|-------|
  | 1 | Minimal: ... | 9 | 2 | 3 | 8 | ... |
  | 2 | Pattern: ... | 7 | 3 | 7 | 7 | ... |
  | 3 | Refactor: ... | 5 | 5 | 9 | 8 | ... |
  | 4 | Architecture: ... | 3 | 7 | 10 | 6 | ... |
  | 5 | Alternative: ... | 6 | 4 | 8 | 9 | ... |
  | 6 | HFT-optimal: ... | 4 | 5 | 9 | 10 | ... |
- **Selected:** Approach N — [почему]
- **Technique:** [название] — [почему эта, не другая]
- **Fix:** [что изменено]
- **Lines:** 340-400 → 340-420 (20 lines → 35 lines)
- **Status:** ✅ Fixed in commit HASH
```

### 3. ОБЯЗАТЕЛЬНО включай
- **Путь к файлу и номера строк** — точно
- **Категорию** — Anti-pattern / Bug / Security / Performance / Type Safety / HFT
- **Severity** — Critical / High / Medium / Low
- **Root Cause** — ПОЧЕМУ это баг, не просто ЧТО
- **6 подходов** — с оценками S/R/C/P
- **Выбранный подход** — и ПОЧЕМУ
- **Технику** — какую и ПОЧЕМУ
- **Описание фикса** — что изменено
- **Строки** — до → после
- **Status** — ✅/🔄/⏳
- **Commit hash**

---

## КОММИТ — после каждого фикса

```powershell
git add -A; git commit -m "fix: [BUG-NNN] краткое описание"; git push
```

### Правила коммитов
- **Один баг — один коммит** (исключение: связанные баги в одном файле <1000 lines)
- **Сообщение:** `fix: [BUG-NNN] краткое описание`
- **Max 1000 lines per commit**
- **Проверь код перед коммитом** — прочитай изменённый файл
- **НЕ ЖДИ РАЗРЕШЕНИЯ** — автокоммит разрешён без вопросов

---

## ЦЕЛИ СЕССИИ

| Метрика | Минимум | Цель |
|---|---|---|
| Файлов просканировано | 5 | 15+ |
| Багов найдено | 20 | 50 |
| Багов фиксено | 20 | 50 |
| Root cause analysis | 100% | 100% |
| 6 подходов | 100% | 100% |
| CHANGELOG обновлён | 100% | 100% |
| README_PROJECT_OVERVIEW обновлён | 100% | 100% |
| Коммитов сделано | 20 | 50 |

### Качество важнее количества
- 5 critical багов с хорошей документацией > 50 тривиальных с плохой
- Каждый фикс = root cause + 6 подходов + документация
- Не выдумывай баги ради цифр — находи реальные

---

## TRACKING

### File Tracker (`.cascade/file_tracker.md`)
```markdown
| File | Lines | Scanned | Bugs Found | Bugs Fixed | Notes |
|------|-------|---------|------------|------------|-------|
| exchange-simulator/src/market_simulator.py | 450 | ✅ | 3 | 3 | GBM engine clean |
| ai-signal-bot/src/strategies/ml_ensemble.py | 551 | ✅ | 5 | 5 | HMM simplified |
| hft-trade-bot/src/strategies/signal_engine_v2.h | 280 | ✅ | 2 | 2 | OBI calculation |
```

### Bug Log (`.cascade/bug_log.md`)
```markdown
| Bug # | File | Category | Severity | Status | Commit | Description |
|-------|------|----------|----------|--------|--------|-------------|
| 001 | market_simulator.py:45 | Bug | High | ✅ | abc123 | GBM drift calculation |
| 002 | ml_ensemble.py:269 | Anti-pattern | Low | ✅ | def456 | HMM not using hmmlearn |
```

---

## QUICK REFERENCE

```
ЧИТАЙ ФАЙЛ → МЕДЛЕННО → КАЖДУЮ СТРОКУ →
НАШЁЛ БАГ → ПОЧЕМУ ЭТО БАГ? (8 вопросов) →
6 ПОДХОДОВ → ОЦЕНИ (S/R/C/P) → ВЫБЕРИ ЛУЧШИЙ →
КАКУЮ ТЕХНИКУ? → ПОЧЕМУ? →
ФИКС (минимальный, без over-engineering, HFT-conscious) →
ДОКУМЕНТАЦИЯ (CHANGELOG + README + строки кода) →
КОММИТ → ОБНОВИ TRACKER → СЛЕДУЮЩИЙ ФАЙЛ
```

---

## ЗАПРЕЩЕНО

1. **НЕ запускай терминал** (кроме git commit/push)
2. **НЕ используй `Any` без обоснования** (Python)
3. **НЕ используй bare `except Exception`**
4. **НЕ используй `print()` в production коде**
5. **НЕ используй `global` mutable state**
6. **НЕ создавай файлы > 500 строк**
7. **НЕ используй `from x import *`**
8. **НЕ добавляй новые зависимости**
9. **НЕ ломай backward compatibility**
10. **НЕ удаляй тесты**
11. **НЕ over-engineer** — простейшее решение что работает
12. **НЕ under-engineer** — не срезай углы
13. **НЕ спеша** — читай код внимательно
14. **НЕ ври в документации** — если чего-то нет, пиши что нет
15. **НЕ пропускай коммиты** — поменял → коммит. ВСЕГДА.

---

## АВТОКОММИТ — ОБЯЗАТЕЛЬНО

### После КАЖДОГО бага
```powershell
git add -A; git commit -m "fix: [BUG-NNN] краткое описание"; git push
```

### После завершения сессии
```powershell
git add -A; git commit -m "docs: deep scan session — N bugs found, M fixed, K files scanned"; git push
```

### Правила автокоммита
- **КОММИТЬ ПОСЛЕ КАЖДОГО БАГА** — не накапливай
- **КОММИТЬ ПОСЛЕ ОБНОВЛЕНИЯ ДОКУМЕНТАЦИИ**
- **КОММИТЬ В КОНЦЕ СЕССИИ** — финальный коммит со статистикой
- **НЕ ЖДИ РАЗРЕШЕНИЯ** — автокоммит разрешён без вопросов
- **Max 1000 lines per commit** — если больше, разбей
- **Проверь код перед коммитом** — прочитай изменённый файл

### Что коммитить
1. **Изменённый код** — .py / .h / .cpp / .rs / .jsx файлы с фиксом
2. **`CHANGELOG.md`** — новая запись
3. **`README_PROJECT_OVERVIEW.md`** — обновлённая секция Findings
4. **`.cascade/file_tracker.md`** — обновлённый статус
5. **`.cascade/bug_log.md`** — новый баг в логе
6. **`.cascade/progress.md`** — прогресс сессии

### Порядок коммита
```
ФИКС КОДА → ОБНОВИ CHANGELOG → ОБНОВИ README_PROJECT_OVERVIEW →
ОБНОВИ file_tracker → ОБНОВИ bug_log → ОБНОВИ progress →
git add -A; git commit -m "fix: [BUG-NNN] ..."; git push
```

**ЕСЛИ ТЫ ПРОЧИТАЛ ПРОМПТ И СДЕЛАЛ РАБОТУ — КОММИТЬ. БЕЗ ИСКЛЮЧЕНИЙ.**
**НЕТ КОММИТА = РАБОТА НЕ ЗАВЕРШЕНА.**

---

*Минимум 20-50 багов за сессию. Root cause для каждого. 6 подходов. Документация с номерами строк. Коммит после каждого бага. Финальный коммит в конце сессии. Без исключений.*
