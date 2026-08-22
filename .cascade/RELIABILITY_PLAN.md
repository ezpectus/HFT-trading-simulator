# Reliability & Healthcheck Plan

> Фаза: РЕЛАЙАБИЛИТИ (после рефакторинга)
> Цель: привести систему к стандартам production — healthchecks, probes, метрики, алерты, graceful shutdown, retry/backoff.
> Полный аудит кода: `.cascade/CODE_AUDIT.md`

---

## АУДИТ ТЕКУЩЕГО СОСТОЯНИЯ (verified Aug 22)

### Что уже есть

| Компонент | Файл | Статус |
|-----------|------|--------|
| Exchange Simulator health | `exchange_simulator/health.py` (FastAPI :8775) | ⚠️ НАПИСАН, НО НЕ ЗАПУСКАЕТСЯ |
| Exchange Simulator metrics | `exchange_simulator/metrics.py` (Prometheus :8000) | ⚠️ НАПИСАН, НО НЕ ЗАПУСКАЕТСЯ |
| AI Bot HealthServer | `ai-signal-bot/src/monitoring/health_server.py` (:8080) | ✅ Запускается с `--metrics` |
| AI Bot MetricsExporter | `ai-signal-bot/src/monitoring/metrics.py` (:9090) | ✅ Запускается с `--metrics` |
| AI Bot HealthAggregator | `ai-signal-bot/src/communication/health_check.py` (:9092) | ❌ НИКТО НЕ ИМПОРТИРУЕТ |
| AI Bot observability v2 | `ai-signal-bot/src/observability/` (health_checks, logging, tracing) | ❌ НИКТО НЕ ИМПОРТИРУЕТ |
| HFT Bot HealthServer | `hft-trade-bot/src/monitoring/health_server.h` (:9091) | ✅ Запускается через `init_monitoring` |
| Prometheus config | `monitoring/prometheus.yml` | ✅ Есть |
| Alert rules | `monitoring/alerts/alerts.yml` | ✅ Есть |
| Alertmanager | `monitoring/alertmanager/config.yml` | ⚠️ Placeholder'ы (YOUR/SLACK/WEBHOOK) |
| docker-compose healthchecks | `docker-compose.yml` | ⚠️ TCP-проверки вместо HTTP |

### Проблемы (gap analysis)

1. **Exchange Simulator не отдаёт health/metrics** — `health.py` и `metrics.py` существуют, но `__main__.py` их не запускает. Prometheus не может скрейпить `exchange-simulator:8775`.
2. **docker-compose healthcheck'и — TCP, не HTTP** — проверяют порт 8765/8766 (WebSocket), а не `/health`. TCP-проверка не показывает, что сервис реально работает (только что порт открыт).
3. **HealthAggregator мёртвый** — написан, но никто не запускает. Нет единой точки агрегации здоровья.
4. **observability/ мёртвый** — health_checks v2 (live/ready), tracing (OpenTelemetry), logging — написаны, но не подключены.
5. **Нет /live и /ready у Exchange Simulator** — только у AI Bot (в HealthServer).
6. **Нет health в Web UI** — фронтенд не имеет `/health` endpoint.
7. **Alertmanager с placeholder'ами** — не сконфигурирован для реальных каналов.
8. **Helm probes — TCP вместо HTTP** — `livenessProbe`/`readinessProbe` в `helm/templates/ai-signal-bot.yaml` используют `tcpSocket` на WS-порт, а не `httpGet` на `/health`.
9. **Нет graceful shutdown** — в `run.py` есть `finally` блок, но нет SIGTERM-обработки с drain'ом.
10. **Нет retry/backoff для WS-клиентов** — `_listen_loop` реконнектит, но без экспоненциального backoff.

---

## ПЛАН РАБОТ

### Task 1: Exchange Simulator — включить health + metrics серверы
**Файлы:** `exchange_simulator/__main__.py`, `exchange_simulator/health.py`, `exchange_simulator/metrics.py`
- В `run_websocket_server()` запускать `health.py` (FastAPI :8775) и `metrics.py` (:8000) как фоновые задачи
- Добавить `/live` и `/ready` в `health.py` (сейчас только `/health`)
- Проверить, что порты не конфликтуют с WebSocket (8765)

### Task 2: docker-compose — HTTP healthchecks вместо TCP
**Файлы:** `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml`
- exchange-simulator: `wget http://localhost:8775/health` вместо TCP 8765
- ai-signal-bot: `wget http://localhost:9090/health` (metrics server уже отдаёт /health) вместо TCP 8766
- hft-trade-bot: уже HTTP `/health` на 9091 ✅ (оставить)
- web-ui: добавить `/health` endpoint (см. Task 6), затем `wget http://localhost:3000/health`

### Task 3: Helm — HTTP probes вместо TCP
**Файлы:** `helm/templates/ai-signal-bot.yaml`, `helm/templates/exchange-simulator.yaml`
- ai-signal-bot: `livenessProbe`/`readinessProbe` → `httpGet: /health` на metrics-порт (9090)
- exchange-simulator: `httpGet: /health` на 8775
- hft-trade-bot: уже HTTP ✅ (оставить)

### Task 4: Подключить HealthAggregator
**Файлы:** `ai-signal-bot/run.py`, `ai-signal-bot/src/communication/health_check.py`
- В `AISignalBot.run()` запускать `HealthAggregator` (порт 9092) как фоновую задачу
- Он агрегирует: ai-signal-bot (:9090/health), exchange-simulator (:8775/health), hft-trade-bot (:9091/health)
- Единая точка: `http://localhost:9092/health`

### Task 5: Подключить observability v2
**Файлы:** `ai-signal-bot/run.py`, `ai-signal-bot/src/observability/health_checks.py`, `tracing.py`, `logging.py`
- `HealthChecker` (live/ready/status) — заменить или дополнить `HealthServer`
- `setup_tracing()` — включить OpenTelemetry (Jaeger) с флагом `--tracing`
- `setup_logging()` — JSON-логирование (structlog) с флагом `--json-logs`

### Task 6: Web UI — /health endpoint
**Файлы:** `web-ui/` (Vite dev server / express static)
- Добавить `/health` → `{"status": "ok"}`
- В docker-compose healthcheck для web-ui использовать его

### Task 7: Alertmanager — реальная конфигурация
**Файлы:** `monitoring/alertmanager/config.yml`
- Убрать placeholder'ы (YOUR/SLACK/WEBHOOK)
- Сделать конфиг через env-переменные (SMTP, Slack webhook)
- Добавить `templates/` для кастомного форматирования

### Task 8: Graceful shutdown
**Файлы:** `ai-signal-bot/run.py`, `exchange_simulator/__main__.py`
- Обработка SIGTERM/SIGINT: остановить приём новых сигналов → закрыть позиции (опционально) → закрыть WS → сохранить состояние → exit 0
- В `run.py` уже есть `finally` — добавить явный сигнальный хендлер

### Task 9: Retry/backoff для WebSocket клиентов
**Файлы:** `ai-signal-bot/src/communication/ws_client.py`
- Экспоненциальный backoff: 1s → 2s → 4s → 8s → max 60s
- Jitter (случайная задержка) для избежания thundering herd
- Счётчик реконнектов → метрика `trading_ws_reconnects_total`

### Task 10: Метрики — покрыть пробелы
**Файлы:** `ai-signal-bot/src/monitoring/metrics.py`, `exchange_simulator/metrics.py`
- Добавить: `trading_ws_reconnects_total`, `trading_signals_rejected_total` (по причинам), `trading_db_errors_total`
- Убедиться, что имена метрик совпадают с alert rules в `monitoring/alerts/alerts.yml` (сейчас там `ai_signal_bot_*` и `exchange_simulator_*`, а в коде `trading_*` — НЕСОВПАДЕНИЕ!)

### Task 11: Проверить alert rules vs фактические метрики
**Файлы:** `monitoring/alerts/alerts.yml`, `monitoring/prometheus.yml`
- Alert rules ссылаются на `ai_signal_bot_signal_generation_latency_seconds`, `exchange_simulator_order_latency_seconds` и т.д.
- В коде метрики называются `trading_signal_latency_seconds`, `trading_order_latency_seconds`
- **НЕСОВПАДЕНИЕ ИМЁН** — алерты никогда не сработают! Нужно унифицировать.

---

## ПОРЯДОК ВЫПОЛНЕНИЯ

1. **Task 1** — Exchange Simulator health/metrics (базово, без него всё остальное бессмысленно)
2. **Task 11** — Унификация имён метрик (алерты начнут работать)
3. **Task 2 + 3** — docker-compose + helm probes
4. **Task 4 + 5** — Подключить HealthAggregator + observability
5. **Task 6** — Web UI health
6. **Task 8 + 9** — Graceful shutdown + retry/backoff
7. **Task 7** — Alertmanager
8. **Task 10** — Дополнительные метрики

---

## КРИТЕРИИ ГОТОВНОСТИ

- [ ] `curl localhost:8775/health` → 200 (exchange simulator)
- [ ] `curl localhost:9090/health` → 200 (ai-signal-bot)
- [ ] `curl localhost:9091/health` → 200 (hft-trade-bot)
- [ ] `curl localhost:9092/health` → агрегированный статус всех 3 сервисов
- [ ] `curl localhost:3000/health` → 200 (web-ui)
- [ ] Prometheus скрейпит все 4 таргета (UP)
- [ ] Alert rules совпадают с фактическими именами метрик
- [ ] docker-compose healthchecks — HTTP, не TCP
- [ ] Helm probes — httpGet, не tcpSocket
- [ ] SIGTERM → graceful shutdown (exit 0, состояние сохранено)
- [ ] WS reconnect с экспоненциальным backoff

---

## ПОЛНЫЕ НАХОДКИ АУДИТА (дополнение к плану)

### Дублирование (одно и то же написано 2-3 раза)

| Что | Где | Строк | Статус |
|-----|-----|-------|--------|
| PortfolioOptimizer | `risk/portfolio_optimizer.py` + `strategies/portfolio_optimizer.py` + `portfolio/` пакет | ~1000 | ❌ 3 копии, все только для тестов |
| VaR/CVaR | `risk/var.py`+`cvar.py` vs `risk/var_stress_test.py` | ~600 | ❌ 2 реализации |
| StressTest | `risk/stress_test.py` vs `risk/var_stress_test.py` | ~400 | ❌ 2 реализации |
| Backtester | `backtesting/backtester.py` vs `backtesting/backtest_engine.py` | ~800 | ❌ 2 реализации |
| CircuitBreaker | `communication/` + `strategies/` + `utils/helpers.py` | ~300 | ❌ 3 копии |
| Metrics | `communication/metrics_server.py` vs `monitoring/metrics.py` | ~500 | ❌ 2 реализации |
| Health | `communication/health_check.py` + `monitoring/health_server.py` + `observability/health_checks.py` | ~500 | ❌ 3 реализации |
| compute_returns | 22 копии в research/ | ~130 | ❌ (Day 2 плана) |
| quantize | `info_bottleneck.py` + `transfer_entropy.py` | ~30 | ❌ (Day 3 плана) |

### Мёртвый код (написан, никто не использует)

| Модуль | Строк | Использование |
|--------|-------|---------------|
| `src/ml/` (10 файлов) | ~1000 | 0 импортов, 0 тестов |
| `fix_client.py` | 329 | только тест |
| `ws_connection_pool.py` | ~150 | только тест |
| `networking/socket_transport.py` | ~150 | никто |
| SHM модули (4 файла) | ~600 | никто вне communication/ |
| `marketplace.py`, `cross_exchange_arb.py`, `funding_arb_detector.py` | ~800 | только тесты |
| `portfolio/`, `pricing/`, `notification/`, `data_collection/` | ~1300 | только тесты |

**Итого мёртвого кода: ~4300 строк. С дублированием: ~7000-8000 строк (30% кода).**

### Чего нет (что в нормальных системах есть)

1. **Кеширование индикаторов** — EMA/RSI/ADX/ATR пересчитываются с нуля каждые 60s для 50 символов × 5 стратегий
2. **Rate limiting** — RateLimiter написан в `utils/helpers.py`, но не подключён к broadcast_signal
3. **Idempotency ордеров** — `submit_order` без `client_order_id` → повтор = двойной ордер
4. **Retry/backoff для ордеров** — есть только для WS connect
5. **Graceful shutdown** — нет SIGTERM-обработки (только KeyboardInterrupt)
6. **Tracing** — `setup_tracing()` написан, нигде не вызывается
7. **Schema validation** — WS сообщения не валидируются
8. **Баг в `scripts/run_bot.py`** — `SignalPublisher(ws_port=...)` — параметра `ws_port` НЕ СУЩЕСТВУЕТ, скрипт упадёт. Правильно: `SignalPublisher(host=..., port=...)`

---

## ПРИМЕРЫ КОДА: КАК НЕ НАДО vs КАК НАДО

### Пример 1: Дублирование drawdown-логики (backtester.py)

**КАК НЕ НАДО** — одна и та же логика в двух методах:

```python
# _process_risk_update (строки 118-120)
equity = balance
equity_curve.append(equity)
peak_equity = max(peak_equity, equity)
drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)

# _track_equity_and_drawdown (строки 147-149) — ТО ЖЕ САМОЕ
equity = self._track_equity(current_position, balance, current_price)
equity_curve.append(equity)
peak_equity = max(peak_equity, equity)
drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)
```

**КАК НАДО** — один метод, вызывается из двух мест:

```python
def _update_equity_and_drawdown(self, equity_curve, balance, peak_equity, result,
                                current_position=None, current_price=0.0) -> float:
    """Append equity, update peak and max drawdown. Returns new peak_equity."""
    equity = self._track_equity(current_position, balance, current_price)
    equity_curve.append(equity)
    peak_equity = max(peak_equity, equity)
    if peak_equity > 0:
        drawdown = (peak_equity - equity) / peak_equity * 100
        result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)
    return peak_equity
```

**Разница:** 15 строк дублирования → 1 метод. Если баг в расчёте drawdown — чинишь в одном месте, а не в двух.

---

### Пример 2: Дублирование position sizing (backtester.py + run.py)

**КАК НЕ НАДО** — одинаковый расчёт размера позиции в двух файлах:

```python
# backtester.py _open_position (строки 366-378)
risk_amount = balance * self.risk_per_trade_pct / 100
risk_per_unit = abs(fill_price - signal.stop_loss)
if risk_per_unit <= 0:
    return None
quantity = risk_amount / risk_per_unit
max_notional = balance * self.max_position_pct / 100
max_qty = max_notional / fill_price if fill_price > 0 else 0
quantity = min(quantity, max_qty)

# run.py _execute_paper_order (строки 268-277) — ТОТ ЖЕ РАСЧЁТ
risk_amount = balance * self.config.max_risk_pct / 100
risk_per_unit = abs(signal.entry_price - signal.stop_loss)
if risk_per_unit <= 0:
    return
quantity = risk_amount / risk_per_unit
max_notional = balance * self.config.max_position_size_pct / 100
max_qty = max_notional / signal.entry_price if signal.entry_price > 0 else 0
quantity = min(quantity, max_qty)
```

**КАК НАДО** — общая функция в `src/utils/position_sizing.py`:

```python
def calculate_position_size(balance: float, entry_price: float, stop_loss: float,
                            risk_pct: float, max_position_pct: float) -> float:
    """Risk-based position sizing: risk_pct of balance / distance to SL, capped by max_position_pct."""
    risk_amount = balance * risk_pct / 100
    risk_per_unit = abs(entry_price - stop_loss)
    if risk_per_unit <= 0:
        return 0.0
    quantity = risk_amount / risk_per_unit
    max_qty = balance * max_position_pct / 100 / entry_price if entry_price > 0 else 0
    return min(quantity, max_qty)
```

**Разница:** один источник правды. Меняешь формулу риска — меняется везде. Плюс тест на функцию один, а не два.

---

### Пример 3: Мёртвый параметр (scripts/run_bot.py)

**КАК НЕ НАДО** — вызов с несуществующим параметром:

```python
# scripts/run_bot.py строка 31 — УПАДЁТ с TypeError
publisher = SignalPublisher(ws_port=config.get("websocket_port", 8766))

# Реальная сигнатура (signal_publisher.py строка 58):
def __init__(self, host: str = "0.0.0.0", port: int = 8766):
```

**КАК НАДО**:

```python
publisher = SignalPublisher(host="0.0.0.0", port=int(config.get("websocket_port", 8766)))
```

**Разница:** скрипт реально работает. ИИ написал `ws_port=` потому что "звучит логично", но не проверил сигнатуру. Это классический AI slop — код, который никто не запускал.

---

### Пример 4: Fail-open вместо fail-fast (utils/helpers.py)

**КАК НЕ НАДО** — молча возвращает пустой конфиг при ошибке:

```python
def load_config(config_path: str = "config/settings.yaml") -> dict:
    try:
        import yaml
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}          # ← бот стартует с ПУСТЫМ конфигом
    except (OSError, ValueError, TypeError) as e:
        logging.error(f"Failed to load config {config_path}: {e}")
        return {}          # ← и торгует с дефолтами молча
```

**КАК НАДО** — упасть сразу, чем торговать с неправильными параметрами:

```python
def load_config(config_path: str = "config/settings.yaml") -> dict:
    """Load YAML config. Raises on missing/invalid file — fail fast."""
    import yaml
    with open(config_path) as f:
        config = yaml.safe_load(f)
    if not config:
        raise ValueError(f"Config {config_path} is empty")
    return config
```

**Разница:** пустой конфиг = бот торгует с дефолтными рисками (2% вместо настроенных 5%) — тихая катастрофа. Fail-fast: бот не стартует, ты сразу видишь ошибку.

---

### Пример 5: Имена метрик не совпадают с алертами

**КАК НЕ НАДО** — алерт смотрит на `ai_signal_bot_*`, код пишет `trading_*`:

```yaml
# monitoring/alerts/alerts.yml — ищет ЭТО:
expr: ai_signal_bot_signal_generation_latency_seconds > 0.1
```

```python
# monitoring/metrics.py — а код пишет ЭТО:
self.signal_latency = Histogram(
    "trading_signal_latency_seconds", ...)  # ← никогда не сработает алерт!
```

**КАК НАДО** — одно имя везде:

```python
# monitoring/metrics.py — имя совпадает с алертом
self.signal_latency = Histogram(
    "ai_signal_bot_signal_generation_latency_seconds", ...)
```

**Разница:** алерты молча не работают. Prometheus не ругается на несуществующие метрики в rules — он просто ждёт данные, которых нет. Обнаружить можно только через `promtool check rules` + сравнение с фактическими метриками.

---

### Пример 6: Мёртвый код — 3 реализации одного класса

**КАК НЕ НАДО** — три Health-класса, работает один:

```python
# communication/health_check.py — HealthAggregator (никто не вызывает)
# monitoring/health_server.py — HealthServer (работает, run.py --metrics)
# observability/health_checks.py — HealthChecker (никто не вызывает)
```

**КАК НАДО** — один класс, остальные удалить или re-export:

```python
# monitoring/health_server.py — единственный источник
class HealthServer:
    """HTTP health check server — /health, /ready, /live."""
    ...

# communication/__init__.py — re-export для совместимости
from src.monitoring.health_server import HealthServer
```

**Разница:** 3 класса = 3 места для багов, 3 места для правок. Один класс + re-export = одна реализация, старые импорты продолжают работать.

---

### Пример 7: Нет idempotency у ордеров

**КАК НЕ НАДО** — повторная отправка = двойной ордер:

```python
# ws_client.py submit_order — нет client_order_id
order_msg = {
    "type": "order",
    "exchange": exchange,
    "symbol": symbol,
    "side": side,
    "quantity": quantity,
    "order_type": "MARKET",
    ...
}
# Сеть моргнула → клиент повторил → БИРЖА ИСПОЛНИЛА ДВАЖДЫ
```

**КАК НАДО** — idempotency key:

```python
import uuid

order_msg = {
    "type": "order",
    "client_order_id": str(uuid.uuid4()),  # ← ключ идемпотентности
    "exchange": exchange,
    "symbol": symbol,
    "side": side,
    "quantity": quantity,
    "order_type": "MARKET",
    ...
}
# Биржа: если client_order_id уже видели → вернуть прежний результат, НЕ исполнять повторно
```

**Разница:** в трейдинге повторный ордер = потеря денег. Idempotency key — стандарт в биржах (Binance, Coinbase). Без него retry опасен.

---

### Пример 8: Нет кеширования индикаторов

**КАК НЕ НАДО** — пересчёт с нуля каждые 60s:

```python
# strategies.py analyze() — вызывается для 50 символов × 5 стратегий каждые 60s
closes = [c["close"] for c in candles]      # 200 свечей
ema_f = ema(closes, self.ema_fast)          # полный пересчёт O(N)
ema_s = ema(closes, self.ema_slow)          # ещё раз O(N)
adx_vals = adx(candles, 14)                 # ещё раз O(N)
atr_vals = atr(candles, 14)                 # ещё раз O(N)
# Итого: 50 × 5 × 4 индикатора × 200 свечей = 200 000 операций каждые 60s
```

**КАК НАДО** — инкрементальное обновление O(1):

```python
class IndicatorCache:
    """Incremental indicator updates — O(1) per new candle."""

    def __init__(self, period: int):
        self.period = period
        self._ema: float | None = None
        self._alpha = 2 / (period + 1)

    def update(self, price: float) -> float:
        """EMA update: EMA_new = α·price + (1-α)·EMA_old — 1 умножение, 1 сложение."""
        if self._ema is None:
            self._ema = price
        else:
            self._ema = self._alpha * price + (1 - self._alpha) * self._ema
        return self._ema
```

**Разница:** 200 000 операций → 50 × 5 × 4 = 1000 операций (в 200 раз меньше). EMA/RSI/ADX/ATR — все имеют O(1) инкрементальные формулы (Wilder's smoothing).

---

### Пример 9: Нет graceful shutdown

**КАК НЕ НАДО** — только KeyboardInterrupt:

```python
# run.py — Ctrl+C работает, но SIGTERM (docker stop, k8s) — НЕТ
try:
    while self._running:
        await asyncio.sleep(self.config.signal_interval)
        await self._generate_signals()
except KeyboardInterrupt:
    self.logger.info("Stopping...")
finally:
    self._running = False
    # ... cleanup
```

**КАК НАДО** — обработка SIGTERM:

```python
import signal

def _install_signal_handlers(self) -> None:
    """Handle SIGTERM/SIGINT for graceful shutdown (docker stop, k8s)."""
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, self._request_shutdown)

def _request_shutdown(self) -> None:
    """Request graceful shutdown — stop accepting new signals, drain, exit."""
    self.logger.info("Shutdown requested — draining...")
    self._running = False
```

**Разница:** `docker stop` шлёт SIGTERM. Без обработчика контейнер убивается через 10s принудительно (SIGKILL) — позиции не закрыты, состояние не сохранено. С обработчиком — чистый drain.

---

### Пример 10: Дублирование стратегий в signal_publisher

**КАК НЕ НАДО** — своя сборка стратегий в publisher:

```python
# signal_publisher.py _build_strategies (строки 364-391)
# Дублирует bot_helpers.build_strategies() с другими параметрами по умолчанию!
if strategy_name in ("trend", "all", "ensemble"):
    strategies["Trend Following"] = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25)
if strategy_name in ("mean_reversion", "all", "ensemble"):
    strategies["Mean Reversion"] = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0)
```

**КАК НАДО** — переиспользовать:

```python
# signal_publisher.py — импорт из bot_helpers
from src.utils.bot_helpers import build_strategies

# ... в _run_backtest:
strategies = {s.name: s for s in build_strategies(config)}
```

**Разница:** две сборки стратегий = два набора параметров = бэктест в UI показывает другие результаты, чем live-бот. Один источник = консистентность.

---

## ДОПОЛНЕНИЕ АУДИТА — GREP НАХОДКИ (26 пунктов)

> Полный документ: `docs/AUDIT_FINDINGS.md`

### Reliability-критичные находки

| # | Проблема | Файл | Влияние |
|---|----------|------|---------|
| 009 | `except Exception: pass` | `db.py:33` | Ошибки checkpoint WAL молча глотаются. БД может остаться в inconsistent state |
| 021 | `Exception` в кортеже исключений | `feature_store.py:94` | `except (OSError, ConnectionError, RuntimeError, Exception)` — Exception делает остальные избыточными. Ловит ВСЁ включая KeyboardInterrupt |
| 022 | f-string в logger (~80+ calls) | `src/` повсеместно | f-string вычисляется даже если log level отключён. В prod с INFO логированием все DEBUG f-strings всё равно форматируются |
| 023 | `os.system` | `monitor.py:21` | Shell injection potential (хотя здесь безопасно — static string) |
| 025 | `open()` без `encoding=` (7 файлов) | `fix_client.py`, `llm_engine/engine.py`, `ml/automl.py`, `ml/model_registry.py`, `strategies/marketplace.py` | На Windows с cp1251 чтение UTF-8 файлов → UnicodeDecodeError. Критично для JSON с non-ASCII |
| 013 | Hardcoded `localhost:8765` | `ws_client.py`, `exchange_factory.py`, `price_monitor.py` | В Docker/K8s localhost ≠ exchange-simulator. Должно быть через config/env |

### Reliability-проверенные паттерны (ЧИСТО)

| Паттерн | Кол-во | Статус |
|---------|--------|--------|
| `SIGTERM`/`signal.signal` | 0 | ❌ Нет (см. Task 8) |
| `graceful shutdown` | 0 | ❌ Нет (см. Task 8) |
| `backpressure` | 0 | ❌ Нет |
| `idempotent` (production) | 0 | ❌ Нет (см. CODE_AUDIT §4.4) |
| `retry`/`backoff` | 0 | ❌ Нет для ордеров (см. Task 9) |
| `deadlock`/`lock_timeout` | 0 | ❌ Нет |
| `sharding`/`partition` | 0 | ❌ Нет (см. CODE_AUDIT §4.2) |
| `WAL` mode | ✅ | `db.py:23` — `PRAGMA journal_mode=WAL` |
| `CancelledError` handling | ✅ | 10 файлов — правильно обрабатывают |
| `CircuitBreaker` | ✅ | `communication/circuit_breaker.py` — работает |
| `RateLimiter` | ⚠️ | `utils/helpers.py` — написан, не подключён к broadcast |
| `health_check` | ⚠️ | Частично (см. Tasks 1-6) |
| `connection_pool` | ✅ | `price_feed_apis.py` — aiohttp TCPConnector |
| `KeyboardInterrupt` | ✅ | 10 файлов — есть, но без SIGTERM |

### Дополнительные reliability-находки (расширенный grep)

| # | Проблема | Файл | Severity | Влияние |
|---|----------|------|----------|---------|
| R1 | Race condition: `_clients` set без lock | `signal_publisher.py` | Medium | `RuntimeError: Set changed size during iteration` при concurrent broadcast + connect/disconnect |
| R2 | Нет DB `busy_timeout` | `db.py:22` | Medium | `database is locked` при concurrent writes (WAL mode, но 5s default timeout) |
| R3 | Нет DB connection pooling | `db.py` | Medium | Каждый метод открывает/закрывает соединение. При масштабировании — overhead |
| R4 | Нет socket buffer tuning | `hft-trade-bot/src/` | Low | WS client использует OS defaults (64-128KB). При bursts возможны dropped packets |
| R5 | SQL injection | `db.py` | ✅ Чисто | Все запросы parameterized (`?` placeholders) |
| R6 | Unbounded structures | `src/` | ✅ Чисто | Все истории используют `deque(maxlen=...)` |
| R7 | C++ concurrency | `hft-trade-bot/src/` | ✅ Правильно | atomics, mutexes, SPSC queue, spinlocks, CAS, cache-line alignment |
| R8 | Resource leak: aiohttp session per alert | `alerting.py:168,190,205` | Medium | Каждая отправка алерта создаёт новую ClientSession. При частых алертах — overhead |
| R9 | Docker healthchecks TCP вместо HTTP | `docker-compose*.yml` | Medium | TCP проверяет только порт, не готовность сервиса. exchange-simulator и ai-signal-bot |
| R10 | Helm probes отсутствуют | `helm/templates/*.yaml` | High | K8s сервисы без liveness/readiness probes. Pod не рестартует при hang |
| R11 | Нет top-level ErrorBoundary | `web-ui/src/App.jsx` | Low | При падении корневого компонента — белый экран |
| R12 | Magic numbers в publisher | `signal_publisher.py` | Low | `maxlen=100`, `sleep(5)`, `Random(42)` — не из config |
