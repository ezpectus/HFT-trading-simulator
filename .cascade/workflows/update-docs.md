---
description: Documentation update prompt — AI updates all project docs to reflect reality, plans what's needed to reach 100%, adds missing models and features to roadmap
---

# Update Docs — Промпт для обновления документации и планирования

> Вставь этот промпт в начало сессии. AI обновит документацию чтобы она отражала реальность, и составит план что реально нужно проекту до 100%.

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
| `cat` / `head` / `tail` | Используй read_file |
| `grep` / `rg` / `find` в терминале | Используй grep_search / find_by_name |
| `ls` / `dir` / `tree` | Используй list_dir |

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

Ты — Technical Writer и Product Manager для HFT Trading System. Твоя задача — сделать документацию ЧЕСТНОЙ и составить ПЛАН до 100%.

### Перед началом — прочитай ВСЕ документы (через read_file, НЕ через терминал):

1. **`MASTER_DEVELOPMENT_PLAN.md`** — текущий план
2. **`README_PROJECT_OVERVIEW.md`** — текущий обзор
3. **`docs/future_development.md`** — идеи и планы
4. **`docs/ARCHITECTURE.md`** — архитектура
5. **`docs/MATH_MODELS.md`** — модели
6. **`CHANGELOG.md`** — последние изменения
7. **`README.md`** — публичный readme
8. **`PERFORMANCE.md`** — производительность
9. **`docs/SETUP.md`** — установка
10. **`.cascade/notes.md`** — контекст
11. **Section 18 of `ai-monster-workflow.md`** — план оставшихся 40%

### После обновления — проверь консистентность:

- `README.md` badge'ы = `README_PROJECT_OVERVIEW.md` % = `MASTER_DEVELOPMENT_PLAN.md` %
- `docs/MATH_MODELS.md` модели = `docs/future_development.md` секция 0
- `docs/ARCHITECTURE.md` claims = реальный код
- `CHANGELOG.md` содержит все изменения

### Правила
1. **Не врать** — если чего-то нет в коде, писать что нет
2. **Не завышать** — если готовность 60%, писать 60%, не 85%
3. **Не занижать** — если что-то работает, отметить что работает
4. **Конкретно** — не "нужно улучшить", а "нужно добавить GARCH(1,1) в src/technical_analysis/garch.py"
5. **С строками кода** — указывать файлы и номера строк
6. **С приоритетами** — Critical / High / Medium / Low
7. **С временем** — оценка в неделях
8. **Коммитить после каждого документа**

---

## ФАЗА 1: Прочитать текущую документацию

### 1.1 Прочитать ВСЕ docs

```
README.md
README_PROJECT_OVERVIEW.md
MASTER_DEVELOPMENT_PLAN.md
CHANGELOG.md
docs/ARCHITECTURE.md
docs/MATH_MODELS.md
docs/SETUP.md
docs/PERFORMANCE.md
docs/future_development.md
docs/9_DAY_DEVELOPMENT_PLAN.md
shared_config.yaml
```

### 1.2 Для каждого документа

- **Что он заявляет?**
- **Это соответствует коду?** (проверить через grep_search / read_file)
- **Что нужно обновить?**

---

## ФАЗА 2: Проверить claims против кода

### 2.1 README.md badges

Проверить КАЖДЫЙ badge:
- "75+ quant models" → `grep_search` по всем моделям → реально ? моделей
- "34+ strategies" → прочитать `strategies/__init__.py` → реально ? стратегий
- "24+ indicators" → прочитать `indicators.py` → реально ? индикаторов
- "197 dashboard panels" → посчитать .jsx файлы → реально ?
- "85% readiness" → оценить по компонентам → реально ?%
- "484+ tests passing" → проверить → реально ?

### 2.2 ARCHITECTURE.md claims

Проверить КАЖДЫЙ claim:
- "FIX 4.4 protocol" → есть код, но подключён ли к брокеру?
- "Smart Order Router V2" → реализован или заглушка?
- "GPU Acceleration (CUDA)" → `#ifdef USE_CUDA` — компилируется?
- "ONNX ML inference" → `#ifdef USE_ONNXRUNTIME` — компилируется?
- "SVI/SABR volatility surface" → существует?
- "Co-location support" → существует?
- "Hardware timestamping" → существует?
- "Tick-by-tick data" → существует?

### 2.3 MATH_MODELS.md claims

Проверить КАЖДУЮ модель:
- Заявлена в документации?
- Есть в Python trading logic?
- Есть в C++ trading logic?
- Есть только как UI компонент?
- Не существует нигде?

---

## ФАЗА 3: Составить честную таблицу готовности

### 3.1 По компонентам

```markdown
| Компонент | Заявлено | Реально | Что нужно до 100% |
|-----------|----------|---------|-------------------|
| Exchange Simulator | 90% | ?% | ... |
| AI Signal Bot | 85% | ?% | ... |
| HFT Trade Bot | 80% | ?% | ... |
| Web UI | 85% | ?% | ... |
| hft-executor | - | ?% | ... |
| Monitoring | 90% | ?% | ... |
| Testing | 85% | ?% | ... |
| Documentation | 95% | ?% | ... |
| **Общая** | **85%** | **?%** | |
```

### 3.2 По моделям

```markdown
| Модель | В trading logic? | UI only? | Missing? | Что нужно? |
|--------|-----------------|----------|----------|------------|
| GARCH(1,1) | ❌ | ✅ .jsx | - | Создать src/technical_analysis/garch.py |
| Kalman Filter | ❌ | ✅ .jsx | - | Создать src/technical_analysis/kalman.py |
| Copula | ❌ | ✅ .jsx | - | Создать src/technical_analysis/copula.py |
| Wavelet | ❌ | ✅ .jsx | - | Создать src/technical_analysis/wavelet.py |
| Monte Carlo | ❌ | ✅ .jsx | - | Создать src/technical_analysis/monte_carlo.py |
| Hawkes | ❌ | ✅ .jsx | - | Создать src/technical_analysis/hawkes.py |
| Hurst | ❌ | ❌ | ✅ | Создать с нуля |
| VPIN | ❌ | ❌ | ✅ | Создать с нуля |
| Kyle's Lambda | ❌ | ❌ | ✅ | Создать с нуля |
| SVI/SABR | ❌ | ❌ | ✅ | Создать с нуля |
| ... | ... | ... | ... | ... |
```

### 3.3 По категориям

```markdown
| Категория | Сейчас | Что нужно | Время |
|-----------|--------|-----------|-------|
| Math models (trading logic) | ~36 | +40 UI-only портировать | 8-50 недель |
| Math models (missing) | 0 | +15 создать с нуля | 15 недель |
| Quantum models | 0% | QAOA, VQE, QMC, QNN | 12 недель |
| Broker integration | 5% | FIX → реальный брокер | 8 недель |
| Real HFT features | 10% | Co-location, DMA, PTP, tick | 10 недель |
| CUDA/ONNX | Dead code | Включить в CI или удалить | 2 недели |
| ML training | 0% | Обучить модели | 2 недели |
| Documentation | 50% | Исправить README, ARCHITECTURE | 3 недели |
```

---

## ФАЗА 4: Обновить документы

### 4.1 README.md

- **Исправить badge'ы** — честные цифры
- **Исправить секцию features** — что реально есть
- **Исправить roadmap** — честный статус
- **Добавить секцию "What's NOT implemented"** — честно
- **Не удалять** существующие секции, а обновить

### 4.2 README_PROJECT_OVERVIEW.md

- **Обновить таблицу готовности** — честные проценты
- **Обновить список UI-only моделей** — полный список
- **Обновить список missing моделей** — полный список
- **Обновить dead code секцию** — CUDA, ONNX
- **Обновить план до 100%** — конкретные шаги

### 4.3 MASTER_DEVELOPMENT_PLAN.md

- **Обновить проценты** — честные
- **Обновить timeline** — реалистичный
- **Обновить чек-листы** — конкретные задачи
- **Добавить новые секции** если найдено что-то новое

### 4.4 docs/future_development.md

- **Добавить недостающие модели** — которых нет даже в UI
- **Отметить UI-only модели** — которые нужно портировать
- **Добавить quantum models** — план
- **Добавить broker integration** — план
- **Добавить real HFT features** — план
- **Обновить приоритеты** — на основе аудита

### 4.5 CHANGELOG.md

```markdown
## [Unreleased] — YYYY-MM-DD (vX.0 — Documentation Update)

### Changed
- **README.md** — honest badges (strategies 34+ → 16, models 75+ → ~36+40 UI-only)
- **README_PROJECT_OVERVIEW.md** — updated readiness to ?%
- **MASTER_DEVELOPMENT_PLAN.md** — updated timeline to ? weeks
- **docs/future_development.md** — added ? missing models, ? UI-only to port

### Audit Findings
- [список найденных расхождений]
```

### 4.6 docs/ARCHITECTURE.md (если нужно)

- Обновить claims которые не соответствуют коду
- Добавить пометки "planned" / "not implemented" где нужно

### 4.7 docs/MATH_MODELS.md (если нужно)

- Добавить секцию "UI-only models (not in trading logic)"
- Добавить секцию "Missing models (not implemented)"
- Обновить существующие секции

---

## ФАЗА 5: План до 100%

### 5.1 Что РЕАЛЬНО нужно проекту

Разделить на категории:

#### Критично (без этого проект не полноценный):
1. **Портировать UI-only модели в trading logic** — GARCH, Kalman, Copula, Wavelet, Monte Carlo, Hawkes
2. **Включить CUDA/ONNX** — или удалить dead code
3. **Обучить ML модели** — код есть, весов нет
4. **Исправить README** — перестать врать

#### Важно (для real-world использования):
5. **Broker integration** — FIX framework есть, нужно подключить
6. **Real HFT features** — hardware timestamping, tick data, time sync
7. **Missing модели** — Hurst, VPIN, Kyle's Lambda, SVI/SABR

#### Расширение (для competitive advantage):
8. **Quantum models** — QAOA, VQE, quantum MC
9. **Remaining UI-only модели** — 30+ теоретических
10. **Web UI improvements** — mobile, drawing tools

### 5.2 Для каждого пункта

```markdown
### [Название]
- **Что:** [конкретное описание]
- **Почему:** [зачем это нужно проекту]
- **Как:** [конкретные шаги]
- **Файлы:** [какие файлы создать/изменить]
- **Приоритет:** Critical / High / Medium / Low
- **Время:** X недель
- **Зависимости:** [от чего зависит]
- **Чек-лист:**
  - [ ] Шаг 1
  - [ ] Шаг 2
  - [ ] ...
```

### 5.3 Timeline

```markdown
Phase 1 (Critical):    ? недель — что именно
Phase 2 (High):        ? недель — что именно
Phase 3 (Medium):      ? недель — что именно
Phase 4 (Low):         ? недель — что именно
Total:                 ? недель
```

---

## КОММИТ — после каждого документа

### После каждого обновления документа:

```powershell
git add -A; git commit -m "docs: update [filename] — honest readiness, [what changed]"; git push
```

### Финальный коммит:

```powershell
git add -A; git commit -m "docs: full documentation update — honest audit, plan to 100%, N documents updated"; git push
```

### Правила
- **Коммитить после каждого документа** — не накапливать
- **НЕ ЖДИ РАЗРЕШЕНИЯ** — автокоммит разрешён
- **Честное commit message** — что изменено и почему

---

## QUICK REFERENCE

```
ПРОЧИТАТЬ ВСЕ DOCS → ПРОВЕРИТЬ CLAIMS ПРОТИВ КОДА →
СОСТАВИТЬ ЧЕСТНУЮ ТАБЛИЦУ ГОТОВНОСТИ →
ОБНОВИТЬ README.md (badges) →
ОБНОВИТЬ README_PROJECT_OVERVIEW.md →
ОБНОВИТЬ MASTER_DEVELOPMENT_PLAN.md →
ОБНОВИТЬ docs/future_development.md →
ОБНОВИТЬ CHANGELOG.md →
СОСТАВИТЬ ПЛАН ДО 100% →
КОММИТ ПОСЛЕ КАЖДОГО ДОКУМЕНТА
```

---

*Документация должна быть ЧЕСТНОЙ. README врёт? Исправить. Архитектура заявляет то, чего нет? Пометить. Модели только в UI? Указать. Без исключений.*
