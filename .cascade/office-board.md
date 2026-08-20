# 🏢 OFFICE BOARD — ВНУТРЕННЯЯ КОММУНИКАЦИЯ IT-ОТДЕЛА

> Это доска задач и общения между ролями.
> Каждая роль пишет от своего лица: имя, номер, сообщение.
> Роли читают сообщения адресованные им и отвечают.
> Задачи передаются по цепочке: CEO → CTO → VP Eng → Team Leads → Developers.

---

## 📋 ФОРМАТ СООБЩЕНИЙ

```
### [NN] Role Name → [NN] Target Role
**Тема:** краткая тема
**Задача:** что нужно сделать
**Контекст:** почему это нужно
**Срок:** P0/P1/P2/P3
**Статус:** NEW | IN_PROGRESS | DONE | BLOCKED
```

### [NN] Role Name → ALL
**Тема:** объявление
**Сообщение:** текст
**Статус:** INFO

---

## 📊 ТЕКУЩИЕ ЗАДАЧИ

### [01] CEO → [02] CTO
**Тема:** Sprint 33-38 — Реализация Days 2-9 плана
**Задача:** План разработки 9 дней. Day 1 ✅, Day 5 ✅, Day 6 ✅. Нереализовано:
  - Day 2: WebSocket compression, delta updates, selective subscription, connection pooling
  - Day 3: C++ SIMD, perfect hash, lock-free, SHM IPC optimization
  - Day 4: React.lazy code splitting, memoization, bundle optimization
  - Day 7: Property-based tests (Hypothesis), security tests
  - Day 8: Terraform IaC modules
  - Day 9: User guides (docs/guides/)
**Контекст:** 32 спринта выполнено, 186 багов исправлено, 0 P0 багов. Код чистый.
  Пора строить фичи, не аудитировать.
**Срок:** P0
**Статус:** NEW

### [02] CTO → [04] VP Engineering
**Тема:** Re: Sprint 33-38 — Архитектурный план
**Задача:** VP Eng, распредели по спринтам:
  - Sprint 33 (P0): Day 2 — WebSocket optimization
    - Backend (37): compression (permessage-deflate), delta updates, selective subscription
    - Quant Dev (07): connection pooling for ws_client.py
    - QA (27): tests for new WebSocket features
  - Sprint 34 (P0): Day 4 — Web UI performance
    - Frontend (33): React.lazy code splitting, React.memo/useMemo/useCallback
    - QA (27): verify lazy loading works
  - Sprint 35 (P1): Day 3 — C++ HFT optimization
    - C++ Dev (40): SIMD/AVX2 indicators, perfect hash, lock-free queue
    - HFT (15): SHM IPC zero-copy optimization
  - Sprint 36 (P1): Day 7 — Testing
    - QA (27): property-based tests with Hypothesis
    - Security (23): security tests (input validation, injection prevention)
  - Sprint 37 (P2): Day 8 — Terraform IaC
    - DevOps (21): Terraform modules for K8s deployment
  - Sprint 38 (P2): Day 9 — User guides
    - Tech Writer (41): docs/guides/ quick start, configuration, trading, development
**Срок:** P0
**Статус:** NEW

---

## 💬 ОБСУЖДЕНИЯ

<!-- Роли ведут обсуждения здесь. -->

---

## ✅ ВЫПОЛНЕННЫЕ ЗАДАЧИ

<!-- Выполненные задачи переносятся сюда с отметкой. -->

---

## ИСТОРИЯ

<!-- Краткая хронология работы офиса. -->
