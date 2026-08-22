# OFFICE BOARD — РЕФАКТОРИНГ И УПРОЩЕНИЕ

> Фаза 1 (Портирование моделей): ЗАВЕРШЕНО (52 модели, Sprint 1-105)
> Фаза 2 (Рефакторинг): АКТИВНА (22 авг – 1 сен 2026)
> План: docs/REFACTORING_PLAN_10DAYS.md

---

## ТЕКУЩИЙ ДЕНЬ — Day 2 (Aug 23): compute_returns дедупликация

### [01] Refactoring Agent — extract compute_returns
**Задача:** Создать `src/research/_common.py` с `compute_returns(prices)`.
  Заменить все 20+ локальных копий на import из `_common.py`.
  Обновить `research/__init__.py` если нужно.
  Все тесты должны проходить.
**Статус:** NEW

### [02] Code Review Agent — /code-review
**Задача:** Проверить работу агента 01:
  - Все импорты корректны?
  - Нет циклических зависимостей?
  - __init__.py экспорты работают?
  - Тесты проходят?
**Статус:** NEW

---

## ВЫПОЛНЕННЫЕ ЗАДАЧИ

### Day 1 (Aug 22): Hawkes split ✅
- hawkes.py → hawkes_model.py + hawkes_funcs.py + hawkes.py (facade)
- 38 тестов проходят, коммит 3c6919b
