# Sprint Template — заполни и работай

> Копируй этот шаблон в office-board.md в начале каждого спринта.
> Заполни [МОДЕЛЬ], [ФАЙЛ], [UI_ФАЙЛ] из context_cache.md или future_development.md.

---

## 📊 ТЕКУЩИЙ СПРИНТ — Sprint [N]

### [01] CEO → [02] CTO
**Тема:** Sprint [N] — [МОДЕЛЬ] из future_development.md
**Задача:** Следующая модель без ✅ DONE: [МОДЕЛЬ] (раздел [X]).
  CTO, подготовь архитектуру — файл, класс, зависимости.
**Контекст:** Sprint [N-1] завершён. future_development.md раздел [X].
**Срок:** P0
**Статус:** NEW

### [02] CTO → [04] VP Engineering
**Тема:** Re: [МОДЕЛЬ] — архитектурный план
**Задача:** Распределить:
  - Quant Dev (07): [ФАЙЛ], класс [CLASS], методы fit/predict/calculate
  - QA (27): test_[model].py (8 тестов: normal, edge cases)
  - Code Reviewer (29): read_file [ФАЙЛ], проверка качества, коммит
  - Tech Writer (41): MATH_MODELS.md, CHANGELOG.md, ✅ DONE
**Контекст:** Паттерны: kalman.py, pca.py. UI: [UI_ФАЙЛ]
**Срок:** P0
**Статус:** NEW

### [04] VP Eng → [07] Quant Developer
**Тема:** [МОДЕЛЬ] модель
**Задача:** Создать [ФАЙЛ]. Класс [CLASS].
  Прочитай [UI_ФАЙЛ] для формул.
  Прочитай ai-signal-bot/src/technical_analysis/kalman.py для паттерна.
  Type hints, docstrings, файл <= 500 строк.
  Тесты: tests/unit/test_[model].py (5-10 тестов, edge cases).
  НЕ коммить — Code Reviewer (29) коммитит после ревью.
**Срок:** P0
**Статус:** NEW

### [07] Quant Dev → [29] Code Reviewer
**Тема:** Re: [МОДЕЛЬ] — код готов к ревью
**Задача:** read_file [ФАЙЛ] и test_[model].py.
  Проверь: type hints, docstrings, ≤500 строк, edge cases, паттерны.
  Если есть проблемы → edit исправления.
  Если всё ОК → git add -A; git commit -m "math: add [МОДЕЛЬ]"
**Срок:** P0
**Статус:** NEW

---

## ✅ ПРЕДЫДУЩИЙ СПРИНТ

### [04] VP Eng → ALL
**Тема:** Sprint [N-1] — завершён
**Сообщение:**
  - [Что сделано]
  - [N] тестов добавлено.
  - [N]/15 моделей раздела 0.1 портировано ([X]%).
**Статус:** INFO
