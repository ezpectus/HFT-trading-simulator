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
| R13 | Missing DB indexes (timestamp, composite) | `db.py:78-80` | Medium | `get_stats` full-scan на `trades WHERE status='CLOSED' AND pnl > 0`. equity_curve без индекса |
| R14 | C++ `catch (...)` без логирования | `kill_switch.h:64` | Low | Kill switch — safety-critical. Silent failure = kill switch не работает, бот торгует дальше |
| R15 | No CORS configuration | `signal_publisher.py`, `exchange_simulator/` | Low | WebSocket не требует CORS, но HTTP endpoints (metrics, health) заблокированы для браузера |
| R16 | No PropTypes/TypeScript в web-ui | `web-ui/src/` | Low | Нет runtime prop validation. Wrong prop type = silent failure или crash |
| R17 | Env secrets handling | `ai-signal-bot/` | ✅ Clean | All via `os.getenv()` / `os.environ.get()`, no hardcoded secrets |
| R18 | Docker-compose secrets | `docker-compose*.yml` | ✅ Clean | No secrets in compose files, all via env vars / `.env` |
| R19 | No log rotation | весь проект | Medium | Log files grow unbounded → disk full → bot crashes |
| R20 | Float precision in financial calc | `src/` повсеместно | Medium | IEEE 754 float errors accumulate in P&L over thousands of trades |
| R21 | No WS message validation | `communication/` | Medium | Raw JSON accepted, no pydantic/schema validation. Malformed msg → KeyError |
| R22 | No DB retention/cleanup | `db.py` | Medium | signals/trades/equity_curve grow forever. ~2.6M rows/year |
| R23 | No auth on health/metrics | `monitoring/` | Low | Endpoints open. OK in Docker/K8s with netpol, risky if exposed |
| R24 | Dependency pinning | `requirements.txt` | ✅ Good | All pinned with `==`. Optional deps (scipy, LightGBM) not listed |
| R25 | Rust `unwrap()`/`expect()` panic | `hft-executor/lib.rs:80,156,159` | Medium | `expect()` panics process if runtime fails. `unwrap_or_default()` sends empty string on serialization error |
| R26 | Rust FFI: no idempotency | `hft-executor/lib.rs:151` | Medium | Local seq, not `client_order_id`. Reconnect = exchange can't deduplicate |
| R27 | Rust: no fill tracking | `hft-executor/lib.rs:178` | Low | Fills only counted, not stored. `avg_latency_ns` always 0 |
| R28 | Rust: string matching for fills | `hft-executor/lib.rs:209` | Low | `text.contains("fill")` instead of JSON parsing. Fragile |
| R29 | exchange_simulator exceptions | `exchange_simulator/` | ✅ Clean | Only `except ImportError` for optional deps. No broad catches |
| R30 | C++ raw pointers | `hft-trade-bot/src/` | ✅ Clean | All smart pointers (`unique_ptr`, `make_unique`). No manual new/delete |
| R31 | No network timeout in config | `config/settings.yaml` | Medium | All timeouts hardcoded in source. Changing timeout = code change + redeploy |
| R32 | Prometheus HFT metrics path | `prometheus.yml:28` | Low | Scrapes `/metrics` but C++ bot may only expose `/health`. Possible 404 |
| R33 | No HFT-specific alert rules | `alerts.yml` | Low | No alerts for HFT executor, signal publisher, DB locked, circuit breaker changes |
| R34 | CI/CD pipeline | `.github/workflows/ci.yml` | ✅ Excellent | 18 jobs: lint, test, build, docker, security, e2e, coverage, test-count floor |
| R35 | CI: npm audit non-blocking | `ci.yml:332` | Low | `|| true` means high-severity vulns don't fail CI |
| R36 | No config schema validation | `config/settings.yaml` | Medium | No pydantic/schema. Wrong type in YAML → runtime TypeError |
| R37 | Dockerfile security | `Dockerfile*` | ✅ Good | Multi-stage, non-root, --no-install-recommends, .dockerignore. Tag pins not digests |
| R38 | Dockerfile healthcheck TCP | `ai-signal-bot/Dockerfile:42` | Medium | TCP socket check, not HTTP /health. Same as docker-compose issue |
| R39 | Terraform encryption | `terraform/` | Low | No encrypt/KMS/SSE config. Skeleton/stub .tf files only |
| R40 | Dead code: tracing.py | `observability/tracing.py` | Low | 111 lines, fully implemented, never imported. 0 grep matches for setup_tracing |
| R41 | Test coverage gaps | `tests/` | Medium | No tests for signal_publisher, ws_client, db.py, alerting, llm_engine, notifier, observability |
| R42 | No signal handling / graceful shutdown | весь проект | **High** | No SIGTERM/SIGINT handler. Ctrl+C = immediate kill, no DB close, no WS notify, no session cleanup |
| R43 | No WS keepalive (ping/pong) | `signal_publisher.py`, `ws_client.py` | Medium | Silent disconnects undetected. Firewalls drop idle connections after 60s |
| R44 | No reconnection backoff with jitter | `ws_client.py` | Medium | No backoff in Python. Rust has backoff but no jitter → thundering herd on mass reconnect |
| R45 | 3x CircuitBreaker duplication | `communication/`, `strategies/`, `utils/helpers.py` | Medium | 3 different implementations, different APIs. #3 in helpers.py never imported |
| R46 | RateLimiter — dead code | `utils/helpers.py:179` | Low | Implemented, exported, tested — but never used in production. No rate limiting on orders/API/signals |
| R47 | No asyncio task management | `src/` | Medium | No TaskGroup, no task cancellation on shutdown, background tasks fire-and-forget. Crashes go unnoticed |
| R48 | Health check no dependency depth | `health_check.py` | Medium | Checks HTTP 200 only, not DB/exchange/queue/client count. "Healthy" while DB locked |
| R49 | Health aggregator session leak | `health_check.py:53` | Medium | New aiohttp ClientSession per check call. 3 services × every interval = 3 sessions |
| R50 | No retry on transient failures | `src/` | Medium | No retry on exchange 429/5xx, DB locked, LLM rate limit. Circuit breaker blocks but doesn't retry |
| R51 | Health aggregator 0.0.0.0 bind | `health_check.py:116` | Low | Binds all interfaces. `# nosec: B104` acknowledges. OK in Docker, risky in direct deploy |
| R52 | Code reduction potential | `src/` | Info | ~510 lines removable: 3× CircuitBreaker→1, dead tracing.py, dead RateLimiter, compute_returns dup |
| R53 | F-string logging — not structured | весь `src/` | Low | 30+ f-string log calls. Flat strings, unparseable by Loki/ELK/Datadog |
| R54 | SHM no cleanup on crash | `shm_signal_producer.py` | Medium | SIGKILL/OOM = SHM segment not unlinked. Restart fails (segment exists) |
| R55 | SHM polling at 1ms | `shm_fill_consumer.py:62` | Low | 1000 polls/sec, 5-10% CPU wasted when no fills. Use eventfd or 10ms interval |
| R56 | Dual metrics systems | `metrics_server.py` + `metrics.py` | Medium | Custom text format + prometheus_client. Overlapping metric names, dashboards confused |
| R57 | No asyncio.Lock on shared state | `signal_publisher.py` | Medium | `_clients` set mutated from multiple coroutines without lock. `await` during iteration → RuntimeError |
| R58 | Helm: no PodDisruptionBudget | `helm/templates/` | Medium | Node drain can evict all pods → downtime. Single-replica StatefulSet has no protection |
| R59 | Helm: no NetworkPolicy | `helm/templates/` | Medium | All pods can reach all pods. DB should only accept from app pods |
| R60 | Helm: hardcoded PG password | `values.yaml:17` | Medium | Default "change-me-in-production". No validation it was changed. `helm install` without override = known password |
| R61 | Docker Compose: no resource limits | `docker-compose.yml` | Medium | No memory/CPU limits. Memory leak = host crash. Helm has limits, compose doesn't |
| R62 | WS input: no schema validation | `signal_publisher.py:141` | Medium | `json.loads` accepts anything. No type check, no size limit. Malicious client can crash bot |
| R63 | DB migrations: no runner | `database/migrations/` | Medium | 4 SQL files exist but no code to apply them. No version tracking. SQLite and PG schemas diverged |
| R64 | Alertmanager hardcoded credentials | `alertmanager/config.yml:12,56,62` | Medium | SMTP password, Slack/Discord webhooks are placeholders. Critical alerts silently fail |
| R65 | shared_config.yaml hardcoded localhost | `shared_config.yaml:108,112` | Medium | Won't work in Docker/K8s. Services communicate via names, not localhost |
| R66 | C++ memory ordering | `hft-trade-bot/src/` | ✅ Correct | Relaxed for stats, release for signaling, CAS for min/max. Balance relaxed OK (single-threaded exec) |
| R67 | Grafana dashboards | `grafana/dashboards/` | ✅ Good | 5 dashboards + provider config. Well-configured |
| R68 | Alertmanager: no silence/maintenance | `alertmanager/config.yml` | Low | No auto-silence during deploy. All alerts fire on restart |
| R69 | CMake build | `CMakeLists.txt` | ✅ Excellent | C++20, ccache, PCH, PGO, mimalloc/jemalloc, ASan/UBSan, 30+ tests, cross-platform |
| R70 | Cargo.toml release profile | `Cargo.toml` | ✅ Good | opt-level=3, lto, codegen-units=1, panic=abort (correct for FFI), strip |
| R71 | Pre-commit hooks | `.pre-commit-config.yaml` | ✅ Good | ruff, eslint, detect-private-key, check-yaml, large-files |
| R72 | Makefile: no C++ test target | `Makefile:23` | Low | `make test` runs Python + JS but not C++ CTest. 30+ C++ tests skipped |
| R73 | Rust panic=abort + unwrap | `Cargo.toml:25` + `lib.rs` | Low | Correct for FFI, but unwrap() = immediate abort. SystemTime error kills C++ host |
| R74 | exchange_simulator config_validator | `config_validator.py` | ✅ Good | Validates structure, ranges, cross-refs. Returns (errors, warnings). Exits on error |
| R75 | exchange_simulator global singletons | `audit_logger.py`, `health.py`, `metrics.py`, `tracing.py` | Low | 4 global mutable singletons. Same pattern as ai-signal-bot. Safe in asyncio |
| R76 | C++ signal handling | `bot_setup.cpp:11-13` | ✅ Good | `atomic<bool> g_running`, signal_handler sets false, main loop checks is_running() |
| R77 | deploy.sh: no health check failure exit | `deploy.sh:176-218` | Medium | 30 retries but never exits on failure. Reports "completed successfully" even if all down |
| R78 | deploy.sh: rollback rm -rf before cp | `deploy.sh:266-267` | Low | rm -rf data before cp backup. If cp fails, data lost. No atomic swap |
| R79 | deploy.sh: no backup retention | `deploy.sh:32-62` | Low | Backups never cleaned. 100 deploys = 100 copies. No rotation policy |
| R80 | ESLint: PropTypes + unused-vars disabled | `eslint.config.js:23,27` | Low | No prop type checking, dead vars accumulate. TS in devDeps but unused |
| R81 | Vite: no CSP headers | `vite.config.js` | Low | No Content-Security-Policy. XSS easier if served directly |
| R82 | hft-trade-bot config: hardcoded localhost | `config.yaml:76,165` | Medium | ws://localhost:8765/8766. Won't work in Docker/K8s |
| R83 | FIX session: seq num persistence | `fix_session.h:251-268` | ✅ Good | Seq nums saved/loaded from file. Mutex-protected. Minor: no atomic write |
| R84 | ErrorBoundary: no top-level | `App.jsx` | Medium | Per-panel boundaries but App itself unprotected. Crash = white screen |
| R85 | Code reduction: exchange_simulator | `exchange_simulator/` | Low | ~200 lines removable. Total reduction ~710 lines (510 + 200) |
| R86 | config.prod.yaml | `config.prod.yaml` | ✅ Excellent | All secrets from env, stricter risk, kill switch with auto-cancel/close, thread pinning, rate limits per exchange |
| R87 | settings.testnet.yaml | `settings.testnet.yaml` | ✅ Good | Env vars for API keys, 3 symbols only, clear testnet docs |
| R88 | Dependabot config | `dependabot.yml` | ✅ Excellent | 7 configs (pip×2, npm, GH Actions, Docker×4). Weekly, grouped, labeled |
| R89 | SECURITY.md | `SECURITY.md` | ✅ Good | Vuln reporting process, 48h SLA, scope definition. Inaccurate WS validation claim |
| R90 | Docker Compose staging | `staging.yml` | ✅ Good | All 6 services have limits, JSON logging, restart backoff, health checks |
| R91 | C++ kill switch | `kill_switch.h`, `bot_setup.cpp:217` | ✅ Excellent | Dual trigger (SHM+file), 5 reasons, auto-cancel+close, SHM fallback, poll interval |
| R92 | SECURITY.md: inaccurate WS claim | `SECURITY.md:35` | Low | Claims WS validated but §8.71 showed no schema validation |
| R93 | Health checks v2: deep probes | `health_checks.py` | ✅ Excellent | Liveness + readiness + status. Per-component. HTTP 503 when unhealthy. Specific exceptions |
| R94 | Notifier: Telegram/Discord | `notifier.py` | ✅ Good | Env vars, session closed, task cancelled, chat ID validation. No retry on send failure |
| R95 | Rust FFI: null pointer safety | `lib.rs:233-297` | ✅ Good | All FFI functions check null. Box::from_raw in destroy. 22 FFI tests |
| R96 | Rust tests: comprehensive | `lib.rs:299-524` | ✅ Good | 22 tests: order, batch, stats, FFI null safety, serialization round-trip |
| R97 | dpdk_transport.py: source missing | `networking/dpdk_transport.py` | Medium | Only .pyc exists. Can't lint, audit, or modify. Version-specific. git clean = gone |
| R98 | Health checks: not wired into bot | `health_checks.py` | Medium | HealthChecker exists but not used in run.py. Bot uses shallow health_check.py instead |
| R99 | C++ order_executor: detached thread | `order_executor.h:57-63` | Medium | Detached reconnect thread captures `this`. Destroy while sleeping = use-after-free |
| R100 | C++ order_executor: snprintf truncation | `order_executor.h:108-128` | Low | snprintf truncates silently. Long exchange_id/symbol = malformed JSON sent |
| R101 | C++ position_manager_v2 | `position_manager_v2.h:140-150` | ✅ Good | O(1) atomic counter, spinlock, stale entry cleanup, relaxed ordering correct |
| R102 | web-ui useWebSocket | `useWebSocket.ts` | ✅ Excellent | Ping/pong, backoff, ring buffer, batching, sync-on-reconnect, outgoing queue, clean cleanup |
| R103 | web-ui useTradingStore | `useTradingStore.js` | ✅ Good | Clean zustand store, batch setters, no prop drilling, no mutation issues |
| R104 | Dockerfile.prod (both) | `Dockerfile.prod` ×2 | ✅ Good | Multi-stage, non-root, no-cache pip, TCP healthcheck, PYTHONUNBUFFERED |
| R105 | .env.prod.example: placeholder passwords | `.env.prod.example:24-25` | Low | `change_me_to_a_secure_password` — no validation that password was actually changed |
| R106 | .env.prod.example: localhost WS URLs | `.env.prod.example:39-40` | Low | Vite build-time args default to localhost. Docker build without override = broken WS |
| R107 | C++ smart_order_router_v2 | `smart_order_router_v2.h` | ✅ Excellent | 5 strategies, anti-toxic backoff, depth check, stack-allocated, IExchange interface |
| R108 | C++ health_server: accept() blocks | `health_server.h:95-96` | Medium | accept() blocks indefinitely. stop() can't join thread until next connection arrives |
| R109 | C++ health_server: raw POSIX HTTP | `health_server.h` | ✅ Good | Cross-platform, SO_REUSEADDR, HTTP 503 when unhealthy, RAII destructor calls stop() |
| R110 | Makefile.prod: migration runner | `Makefile.prod:48-60` | ✅ Good | Runs SQL files via asyncpg. But no _migrations tracking, not idempotent, not automatic |
| R111 | Makefile.prod: health+backup+deploy | `Makefile.prod:80-101` | ✅ Good | prod-health checks 6 endpoints, prod-db-backup pg_dump, prod-deploy pipeline |
| R112 | docker-compose.hub.yml | `docker-compose.hub.yml` | ✅ Good | Pre-built Docker Hub images, health checks, depends_on healthy, networks, restart |
| R113 | build-all.bat | `build-all.bat` | ✅ Good | 6-component Windows build, multiple modes, error tracking, per-component status |
| R114 | CI workflow | `ci.yml` | ✅ Excellent | Python+C+++JS+Rust lint+test, Bandit, CodeQL, npm audit, Docker build, concurrency control |
| R115 | C++ low_latency.h | `low_latency.h` | ✅ Excellent | Spinlock+SPSC+ObjectPool+Histogram+ThreadPin+CircuitBreaker+Retry. Correct memory ordering, cache-line aligned |
| R116 | GitHub deploy.yml | `deploy.yml` | ✅ Excellent | Netlify+Docker push+SSH deploy+health check+Discord/Telegram notify. Semver tags, GHA cache |
| R117 | docker-compose dev: no limits | `docker-compose.yml` | Low | No resource limits. OK for dev, already noted §8.68 |
| R118 | docker-compose dev: Grafana admin/admin | `docker-compose.yml:187` | Low | Default creds. Fine for local dev, risky if exposed |
| R119 | docker-compose dev: VITE_WS localhost | `docker-compose.yml:118` | ✅ Correct | Comment explains browser-side resolution. Correct for dev |
| R120 | CONTRIBUTING.md | `CONTRIBUTING.md` | ✅ Good | 616 lines. Prerequisites, Win/Linux/macOS setup, build, test, code style, PR process |
| R121 | Helm _helpers.tpl | `_helpers.tpl` | ✅ Good | Standard labels + selector labels per K8s conventions |
| R122 | C++ CircuitBreaker: relaxed ordering race | `low_latency.h:366` | Low | record_success + record_failure can race on error_count_. Acceptable for safety-net CB |
| R123 | C++ ObjectPool: O(n) acquire | `low_latency.h:153` | Low | Linear scan. Fine for small pools. Free-list would be O(1) but adds complexity |
| R124 | deploy.yml: health check no exit | `deploy.yml:143` | Low | WARNING logged but pipeline succeeds. Notify sends SUCCESS even when services down |
| R125 | C++ aligned_types.h | `aligned_types.h` | ✅ Excellent | Cache-line aligned (alignas(64)), static_assert, FastSignal no heap (char[32] not string) |
| R126 | C++ IExchange interface | `IExchange.h` | ✅ Good | Pure virtual, DIP/SOLID, SmartOrderRouter depends on interface not concrete |
| R127 | C++ bot_context: God struct | `bot_context.h:67-111` | Medium | 25+ members, all components coupled. Hard to test individually |
| R128 | C++ bot_context: SPSCQueue + mutex | `bot_context.h:99-100` | Low | SPSC is single-producer but mutex suggests multi-thread. Race or unnecessary mutex |
| R129 | GitHub codeql.yml | `codeql.yml` | ✅ Excellent | 3 languages, weekly scan, paths-ignore, least-privilege, fail-fast false |
| R130 | docker-compose.prod.yml | `docker-compose.prod.yml` | ✅ Excellent | Mandatory secrets (:?), resource limits, network segmentation, SHM IPC, pinned images |
| R131 | docker-compose.prod: backend internal | `docker-compose.prod.yml:273` | ✅ Good | backend network internal: true — DBs not accessible from host |
| R132 | docker-compose.prod: VITE_WS fallback | `docker-compose.prod.yml:237` | Low | Defaults to localhost without :? check. Forgetting to set = broken WS in prod |
| R133 | C++ bot_loop.h | `bot_loop.h` | ✅ Good | Clean function separation, BotContext& by ref, no globals |
| R134 | C++ risk_manager.h: dual V1+V2 | `risk_manager.h` | ✅ Good | V1 no-mutex hot path with [[unlikely]], V2 mutex-protected 8 checks, CAS rate limiter |
| R135 | C++ risk_manager: check_order mutex | `risk_manager.h:101` | Medium | Mutex on every order submission serializes all orders. Use shared_mutex for read-heavy |
| R136 | C++ risk_manager: daily_pnl += race | `risk_manager.h:201` | Low | atomic<double> += is not atomic (load+store). Use fetch_add. on_fill uses fetch_sub correctly |
| R137 | C++ pre_trade_risk: token bucket | `pre_trade_risk.h` | ✅ Excellent | Lock-free CAS token bucket, O(1) check, const char* reasons, blacklist+whitelist |
| R138 | C++ pre_trade_risk: blacklist not thread-safe | `pre_trade_risk.h:189` | Medium | insert/erase on unordered_set while check() reads concurrently = data race UB |
| R139 | C++ portfolio_risk.h | `portfolio_risk.h` | ✅ Good | VaR/CVaR/drawdown/stress, fixed-size arrays, no heap alloc in hot path |
| R140 | C++ simd_indicators.h | `simd_indicators.h` | ✅ Excellent | AVX2 EMA/RSI with _mm256_fmadd_pd, scalar fallback, compile-time guard |
| R141 | C++ signal_receiver.h | `signal_receiver.h` | ✅ Good | WebSocket++ client, callback-based, symbol ID mapping, nlohmann/json parsing |
| R142 | Terraform: hardcoded RDS password | `dev/main.tf:31` | Medium | default = "ChangeMeInProduction123!" — RDS gets weak password if not overridden |
| R143 | Terraform: S3 backend encryption+locking | `dev/main.tf:13` | ✅ Good | encrypt=true, dynamodb_table for locking. State protection done right |
| R144 | Terraform: modular structure | `dev/main.tf` | ✅ Good | VPC+EKS+RDS+ElastiCache+S3 modules, environment-specific, outputs |
| R145 | verify.bat | `verify.bat` | ✅ Good | 5-component Windows test runner, error tracking, graceful CMake skip |
| R146 | C++ duplicate risk system | `risk_manager.h` vs `pre_trade_risk.h` | Medium | Two systems doing same 8 checks. Consolidate to PreTradeRisk (lock-free) |
| R147 | C++ risk_manager: reset_daily incomplete | `risk_manager.h:214` | Low | Resets daily_pnl but not peak_equity_ → drawdown compares against yesterday's peak |
| R148 | C++ signal_engine_v2 | `signal_engine_v2.h` | ✅ Excellent | 6-indicator composite, no heap alloc, branchless, alignas(64), cooldown |
| R149 | C++ signal_engine_v3 | `signal_engine_v3.h` | ✅ Excellent | HMM regime detection, Viterbi, online Baum-Welch, O(1) per-tick, gates V2 signals |
| R150 | C++ market_making_v2 | `market_making_v2.h` | ✅ Excellent | Avellaneda-Stoikov, reservation price, inventory skew, adverse selection, EWMA vol |
| R151 | C++ shm_ring_buffer | `shm_ring_buffer.h` | ✅ Excellent | Cross-process SPSC, mmap+MAP_SHARED, cache-line aligned, magic validation, RAII |
| R152 | C++ shm_heartbeat | `shm_heartbeat.h` | ✅ Good | Seq-guarded lock-free heartbeat, alignas(64), bidirectional, cross-platform |
| R153 | ai-signal-bot migrate.py | `scripts/migrate.py` | ✅ Excellent | Idempotent: schema_migrations table, skip applied, record new. Makefile.prod should use this |
| R154 | migrate.py: narrow exception | `scripts/migrate.py:80` | Low | Doesn't catch asyncpg.PostgresError. SQL errors crash with traceback |
| R155 | Helm Chart.yaml | `Chart.yaml` | ✅ Good | Standard v2 chart, appVersion matches Docker Hub tags, keywords, maintainer |
| R156 | C++ 3 signal engines (v1/v2/v3) | `signal_engine*.h` | Medium | 3 versions in BotContext. V2 may be dead code (only through V3). ~200 lines reducible |
| R157 | C++ shm: no cleanup on crash | `shm_ring_buffer.h:168` | Info | shm_unlink not called on crash. Stale segment persists. Already noted R92 |
| R158 | C++ shm: stale data on restart | `shm_ring_buffer.h:134` | Low | Magic/capacity validation passes but head/tail may be inconsistent after crash |
| R159 | C++ adaptive_order_selector_v2 | `adaptive_order_selector_v2.h` | ✅ Excellent | Dynamic IOC/FOK/GTD/PostOnly, confidence/spread/toxicity/OBI, const char* reason, noexcept |
| R160 | C++ mean_reversion_v2 | `mean_reversion_v2.h` | ✅ Excellent | OU + KalmanFilter1D, z-score, vol-scaled entry/exit, half-life holding, no heap |
| R161 | C++ statistical_arb_v2 | `statistical_arb_v2.h` | ✅ Excellent | Engle-Granger cointegration, Kalman hedge ratio, z-score entry/exit/stop, no heap |
| R162 | C++ momentum_breakout_v2 | `momentum_breakout_v2.h` | ✅ Good | EMA stack 9/21/50/200, volume confirm, ATR breakout, ADX-gated, no heap |
| R163 | C++ inline_indicators | `inline_indicators.h` | ✅ Excellent | O(1) EMA/RSI/ADX/VWAP/ATR, StringHash transparent (no string alloc), [[unlikely]] |
| R164 | C++ system_monitor | `system_monitor.h` | ✅ Excellent | 11 atomic counters, fetch_add(relaxed), snapshot, fill/rejection rate, MemoryTracker |
| R165 | C++ system_monitor: snprintf done right | `system_monitor.h:110-127` | ✅ Good | min(n, sizeof-1) truncation guard + n<=0 check. Contrast with order_executor §8.118 |
| R166 | C++ types.h | `types.h` | ✅ Good | Candle/OrderBook/Order/Position, empty checks, optional<double> price, PnL with fees |
| R167 | C++ types.h: string_to_side no validation | `types.h:21-23` | Low | Any non-"BUY" string → SELL. "buy", "HOLD", garbage → SELL silently |
| R168 | web-ui: setInterval cleanup | `components/*.jsx` | ✅ Good | All 6 setInterval calls have clearInterval cleanup in useEffect return |
| R169 | web-ui: 50+ components code reduction | `components/` | Medium | Many math viz panels may be unused. ~1000+ lines reducible if 10-15 dead |
| R170 | C++ system_monitor: snapshot not atomic | `system_monitor.h:76-93` | Low | 11 separate relaxed loads. Inconsistent snapshot. Acceptable for monitoring |
| R171 | C++ strategies: 5 strategy files | `strategies/*.h` | ✅ Good | mean_reversion, stat_arb, momentum, market_making, pressure_model — all no heap, research-grade |
| R172 | C++ pressure_model | `pressure_model.h` | ✅ Excellent | Multi-level OBI, toxicity, trade flow, spread regime, single-pass, no heap, [[unlikely]] |
| R173 | C++ obi_utils | `obi_utils.h` | ✅ Good | Extracted from signal_engine_v2, single-pass compute_obi_all, noexcept, 1e-12 guard |
| R174 | C++ signal.h: NEUTRAL→BUY | `signal.h:28` | Low | side() returns BUY for NEUTRAL. Comment says check is_actionable() but no enforcement |
| R175 | Helm values.yaml: hardcoded passwords | `values.yaml:17,132` | Medium | postgres password "change-me-in-production", grafana adminPassword "" → admin/admin |
| R176 | Helm values.yaml: resource limits | `values.yaml` | ✅ Good | All 7 services have requests+limits. Better than docker-compose dev |
| R177 | Helm values.yaml: VITE_WS localhost | `values.yaml:104-105` | Medium | localhost WS URLs in K8s config. Browser can't reach localhost in cluster |
| R178 | web-ui ExchangeContext | `ExchangeContext.jsx` | ✅ Good | 3 exchange themes/layouts, CSS vars, useCallback, throws outside provider |
| R179 | web-ui usePerformance | `usePerformance.js` | ✅ Excellent | debounce/throttle/batch/worker/intersection — all with cleanup, no leaks |
| R180 | C++ signal.h: rr_ratio guard | `signal.h:31-42` | ✅ Good | risk > 0 check before division, returns 0.0 on invalid SL/TP |
| R181 | Helm values.yaml: ingress disabled | `values.yaml:143` | ✅ Good | Ingress+TLS disabled by default. Must explicitly enable for public exposure |
| R182 | C++ signal.h: string direction | `signal.h:11` | Info | std::string direction (heap) vs FastSignal char[32]. OK for receive side, not hot path |
| R183 | C++ signal.h: side() silent default | `signal.h:28` | Low | Same pattern as string_to_side — NEUTRAL silently becomes BUY order |
| R184 | C++ ExchangeBase | `ExchangeBase.h` | ✅ Excellent | EWMA latency CAS loop, toxic backoff, atomic counters, clean base class |
| R185 | C++ BinanceAdapter | `BinanceAdapter.h` | ✅ Good | HMAC-SHA256, CAS rate limit, Spinlock, listenKey ping, symbol_lower |
| R186 | C++ BinanceAdapter: nested Spinlock | `BinanceAdapter.h:74-79` | Medium | price_lock_ → depth_lock_ nesting. Consistent ordering but fragile |
| R187 | C++ BinanceAdapter: can_send_order TOCTOU | `BinanceAdapter.h:135` | Low | fetch_add always increments even on reject. Over-count persists in window |
| R188 | C++ OKXAdapter | `OKXAdapter.h` | ✅ Good | OKX inst_id conversion, passphrase auth, public+private WS, Spinlock |
| R189 | C++ BybitAdapter | `BybitAdapter.h` | ✅ Good | Bybit v5 API, HMAC-SHA256, Spinlock, 1 bps maker / 6 bps taker |
| R190 | C++ 3 exchange adapters: code duplication | `*Adapter.h` | Medium | 470 lines, ~200 duplicated. Move maps+locks+methods to ExchangeBase |
| R191 | C++ binance_config.h | `binance_config.h` | ✅ Excellent | constexpr endpoints/limits/channels/types, string_view, compile-time |
| R192 | web-ui App.jsx: lazy loading | `App.jsx` | ✅ Good | 14 React.lazy + Suspense, PanelFallback, memo(TabButton) |
| R193 | web-ui App.jsx: Zustand store sync | `App.jsx:92-134` | ✅ Good | WS → hook → useEffect → store. Unidirectional, useRef for prev state |
| R194 | web-ui App.jsx: 565 lines God component | `App.jsx` | Medium | 6 useEffects, 14 tabs, keyboard, mobile, detached panels. Extract hooks |
| R195 | shared_config.yaml: localhost | `shared_config.yaml:108,112` | Medium | localhost WS host in shared config. Won't work in K8s/Docker prod |
| R196 | shared_config.yaml: 50 symbols + 3 exchanges | `shared_config.yaml` | ✅ Good | 50 pairs, 3 exchanges, risk params match component configs, clean |
| R197 | C++ ExchangeBase: hardcoded toxic threshold | `ExchangeBase.h:49` | Low | toxic_count < 5 hardcoded. No per-exchange/per-env configuration |
| R198 | Alertmanager: hardcoded SMTP password | `alertmanager/config.yml:12` | Medium | smtp_auth_password 'your-password' in git. Slack/Discord webhooks too |
| R199 | Alertmanager: inhibition rules | `config.yml:84-98` | ✅ Good | Critical suppresses warning+info for same component. Prevents alert storms |
| R200 | Alertmanager: no silence rules | `config.yml` | Info | No maintenance windows. Manual silences only. Add scheduled silences in CI/CD |
| R201 | web-ui useTradingStore | `useTradingStore.js` | ✅ Good | 3 batch setters, actions as nullable refs, clean Zustand pattern |
| R202 | web-ui useUIStore: 50 symbols duplicated | `useUIStore.js:7-18` | Low | 50 symbols in JS + shared_config.yaml. Out of sync risk |
| R203 | web-ui useToastStore: setTimeout no cleanup | `useToastStore.js:21` | Low | setTimeout not tracked. HMR dev warning. Harmless in prod |
| R204 | web-ui usePanelContext | `usePanelContext.js` | ✅ Good | Bridge Zustand→registry, useMemo, backward compat with 200+ panels |
| R205 | signal_publisher: 6 catch-all Exception | `signal_publisher.py` | Low | Broadcast pattern acceptable. Narrow to ConnectionClosed where possible |
| R206 | web-ui 4 Zustand stores | `stores/*.js` | ✅ Good | Trading/UI/Toast/PanelContext. 296 lines, no circular deps |
| R207 | web-ui useUIStore: getFilteredSymbols not memoized | `useUIStore.js:45` | Low | Re-filters on every call. New array → unnecessary re-renders |
| R208 | Alertmanager: SMTP/Slack/Discord placeholders | `config.yml:12,56,62` | Medium | Placeholders will be replaced with real secrets and committed |
| R209 | ai-signal-bot health_check: aiohttp session per call | `health_check.py:53` | Medium | New ClientSession per health check. Should reuse session (already noted R27) |
| R210 | ai-signal-bot alerting: aiohttp session per alert | `alerting.py:168,190,205` | Medium | 3 new ClientSession per alert send. Should reuse session (already noted R27) |
| R211 | monitoring alerts.yml: 12 Prometheus rules | `alerts.yml` | ✅ Excellent | 12 rules, 4 groups, severity+service labels, for durations, annotations |
| R212 | monitoring alerts.yml: no HFT-specific alerts | `alerts.yml` | Medium | No order latency, SHM overflow, fill rate, slippage, position limit, drawdown alerts |
| R213 | monitoring ebpf_monitor.py | `ebpf_monitor.py` | ✅ Good | eBPF syscall+network tracing, BCC fallback, SIGINT/SIGTERM, narrow exceptions |
| R214 | ebpf_monitor: only syscall BPF loaded | `ebpf_monitor.py:128` | Low | NETWORK_BPF defined but never loaded. Dead code |
| R215 | ebpf_monitor: no Prometheus export | `ebpf_monitor.py:183` | Low | JSON to stdout only. No /metrics endpoint, not in Grafana |
| R216 | web-ui performanceMonitor.js | `performanceMonitor.js` | ✅ Good | Web Vitals (LCP/FID/CLS/TTFB/FCP), budgets, ratings, alert callbacks, custom metrics |
| R217 | web-ui performanceMonitor: metricsHistory unbounded | `performanceMonitor.js:28` | Low | Arrays grow without bound. Cap at 100 entries |
| R218 | web-ui performanceMonitor: console.log in prod | `performanceMonitor.js:178+` | Low | 6 console.log calls. Use import.meta.env.DEV guard or Vite esbuild.drop |
| R219 | monitoring Grafana: 5 dashboards | `grafana/dashboards/` | ✅ Good | 5 pre-built JSON dashboards. Ready after deployment |
| R220 | web-ui performanceMonitor: alertCallbacks unbounded | `performanceMonitor.js:37` | Low | No offAlert(). Callbacks fire after unmount. Return unsubscribe fn |
| R221 | monitoring alerts.yml: no alert for SHM overflow | `alerts.yml` | Medium | SHM ring buffer overflow = silent data loss. Should alert on head==tail wrap |
| R222 | monitoring alerts.yml: no drawdown alert | `alerts.yml` | Medium | Daily drawdown approaching limit (e.g., >6% of 8%) should warn before circuit breaker |
| R223 | web-ui backtestEngine.js | `backtestEngine.js` | ✅ Good | 8 conditions, 4 actions, 14 metrics, fee model, input validation, precomputed indicators |
| R224 | web-ui backtestEngine: EMA/RSI duplicated | `backtestEngine.js:66-101` | Low | Identical to indicators.js calcEMA/calcRSI. Import instead. ~40 lines reduction |
| R225 | web-ui backtestEngine: no borrow fee | `backtestEngine.js:265` | Low | Short selling only charges trading fee, no daily borrow fee. Overestimates short P&L |
| R226 | web-ui backtestEngine: no slippage | `backtestEngine.js:281` | Low | Entry/exit use candle.close. No slippage model. Overestimates fill quality |
| R227 | web-ui indicators.js | `indicators.js` | ✅ Excellent | 12 indicators, JSDoc, NaN handling, zero-division guards, Wilder's smoothing correct |
| R228 | web-ui indicators: O(n²) SMA/Bollinger | `indicators.js:71-78` | Low | O(n×period) instead of O(n) rolling sum. 500 candles × 20 period = 10k ops |
| R229 | web-ui auditExport.js | `auditExport.js` | ✅ Good | JSON/CSV export, proper URL.revokeObjectURL cleanup, quote escaping, no leaks |
| R230 | web-ui mockData.js | `mockData.js` | ✅ Good | GBM with jumps, Box-Muller with 1e-10 guard, 10 news headlines, 6 strategies |
| R231 | web-ui mockData: only 5 of 50 symbols | `mockData.js:14` | Low | 5 mock symbols vs 50 in useUIStore. Mock mode doesn't represent full universe |
| R232 | web-ui indicators.js: 579 lines | `indicators.js` | Medium | 12 indicators in one file. Split by category or keep as utility |
| R233 | web-ui vite.config.js | `vite.config.js` | ✅ Excellent | PWA autoUpdate, 5 manual vendor chunks, 0.0.0.0 host, es2020, cssCodeSplit |
| R234 | web-ui vite.config: no esbuild.drop | `vite.config.js:48` | Low | No console.log stripping in prod. 6 console.log in performanceMonitor |
| R235 | hft-trade-bot config.yaml: 50 symbols 3x | `config.yaml:20-70` | Medium | 50 symbols in config.yaml + shared_config.yaml + useUIStore.js. 3 copies |
| R236 | hft-trade-bot config.yaml: localhost WS | `config.yaml:76,165` | Medium | ws://localhost:8765 and :8766. Won't work in K8s/Docker prod |
| R237 | hft-trade-bot config.yaml | `config.yaml` | ✅ Good | 166 lines, 12 sections, each param commented with recommended range |
| R238 | web-ui PanelContainer.jsx | `PanelContainer.jsx` | ✅ Good | localStorage persistence, hover preload, error boundaries, a11y, fallback context |
| R239 | web-ui registry.js: 200+ lazy panels | `registry.js` | ✅ Good | 200+ React.lazy, 7 categories, props builders, preloadCategory. 684 lines |
| R240 | web-ui registry.js: 200+ math panels | `registry.js` | Medium | Research-grade math (SchrodingerBridge, FokkerPlanck, etc). Feature flag or remove |
| R241 | web-ui e2e tests | `e2e/mock-mode.spec.js` | ✅ Good | 10 Playwright tests, 5 suites, gotoWithRetry, dismissOnboarding, resilient |
| R242 | web-ui e2e: no WS interaction tests | `e2e/` | Low | No WebSocket, real-time, order flow, signal display tests. Static UI only |
| R243 | web-ui useExchangeData.js | `useExchangeData.js` | ✅ Good | 7 msg types, candle Map dedup, 500 cap, orderbook deltas, fills cap, reconnect sync |
| R244 | web-ui useExchangeData: candle sort every update | `useExchangeData.js:55` | Low | Full Array.from + sort on every candle update. 500 elements × every second |
| R245 | web-ui useMockData.js | `useMockData.js` | ✅ Good | Mock mode via env/localStorage, setInterval 2s, refs for state, cleanup, same interface |
| R246 | web-ui useDetachablePanels.js | `useDetachablePanels.js` | ✅ Good | BroadcastChannel, createElement DOM (no XSS), popup management, blocked detection |
| R247 | web-ui useDetachablePanels: no channel cleanup | `useDetachablePanels.js:21` | Low | BroadcastChannel never closed. Harmless in prod but resource leak |
| R248 | ai-signal-bot db.py | `db.py` | ✅ Good | WAL mode, Windows-safe close, 3 tables, 3 indexes, parameterized queries, COALESCE |
| R249 | ai-signal-bot db.py: new connection per op | `db.py:21-25` | Medium | Every method opens/closes connection. PRAGMA WAL on every conn. No retry on locked |
| R250 | ai-signal-bot db.py: no data retention | `db.py` | Low | No retention policy. Tables grow without bound over months |
| R251 | ai-signal-bot db.py: no equity_curve index | `db.py:70-76` | Low | No index on equity_curve.timestamp. Range queries will full-scan |
| R252 | ai-signal-bot db.py: no migration system | `db.py:36-81` | Medium | _init_db() uses CREATE TABLE IF NOT EXISTS. No ALTER TABLE for schema changes |
| R253 | web-ui useWebSocket.ts | `useWebSocket.ts` | ✅ Excellent | Ring buffer 5k, exp backoff 30s cap, ping/pong latency, batch merge, outgoing queue, sync on reconnect, permessage-deflate, full cleanup |
| R254 | web-ui useWebSocket: no max reconnect limit | `useWebSocket.ts:214` | Low | Backoff capped at 30s but no max count. Reconnects indefinitely if server down |
| R255 | web-ui useWebSocket: console.error in prod | `useWebSocket.ts:200` | Low | console.error not stripped. Add esbuild.drop in vite.config |
| R256 | exchange_simulator config_validator.py | `config_validator.py` | Excellent | 5 required sections, 8 timeframes, 9 validators, cross-ref check, error/warning split |
| R257 | exchange_simulator liquidation_engine_v2.py | `liquidation_engine_v2.py` | Excellent | 4 liq types, cascade 10 depth, partial liq, insurance fund, ADL, bounded deques, seeded RNG |
| R258 | liquidation_engine_v2: ADL is a stub | `liquidation_engine_v2.py:211` | Low | ADL logs and resets fund but doesn't reduce counterparty positions. Acceptable for sim |
| R259 | liquidation_engine_v2: fixed seed RNG | `liquidation_engine_v2.py:73` | Low | seed=42 makes cascades deterministic. Make configurable for realistic simulation |
| R260 | liquidation_engine_v2: f-string logging | `liquidation_engine_v2.py:176` | Low | f-string formatted even when log level above WARNING. Use % formatting |
| R261 | exchange_simulator liquidation_engine_v2: no thread safety | `liquidation_engine_v2.py` | Low | No locks. insurance_fund, events, _cascade_depth are mutable. Add Lock or document single-thread |
| R262 | exchange_simulator arbitrage.py | `arbitrage.py` | Excellent | 14-field dataclass, fee/slippage model, TTL expiry, stats tracking, cross-exchange scan |
| R263 | exchange_simulator arbitrage: unbounded _closed_history | `arbitrage.py:84` | Low | _closed_history is plain list, no cap. Use deque(maxlen=1000) |
| R264 | exchange_simulator funding_rate.py | `funding_rate.py` | Excellent | 8h intervals, premium+base+noise, ±0.75% clamp, bounded deque, correct payment calc |
| R265 | exchange_simulator funding_rate: f-string logging | `funding_rate.py:86` | Low | f-string formatted even when log level above INFO. Use % formatting |
| R266 | exchange_simulator latency_simulation.py | `latency_simulation.py` | Excellent | 4 exchange profiles, Gaussian jitter, Poisson spikes, exp backoff reconnect, async delay |
| R267 | exchange_simulator market_microstructure.py | `market_microstructure.py` | Excellent | Student-t, Merton jumps, Heston SV, Markov 4-regime, U-shaped intraday. Most sophisticated |
| R268 | exchange_simulator spread_analytics.py | `spread_analytics.py` | Good | Rolling deque(maxlen=1000), p50/p90/p99, BUY/SELL slippage, zero-price guards |
| R269 | exchange_simulator order_book_realism.py | `order_book_realism.py` | Excellent | 4 order types, FIFO queue, iceberg reveal, spoofing, adverse selection, power-law decay |
| R270 | exchange_simulator order_book_realism: recent_fills unbounded | `order_book_realism.py:116` | Low | recent_fills is plain list, no cap. Use deque(maxlen=1000) |
| R271 | exchange_simulator options_simulator.py | `options_simulator.py` | Excellent | Black-Scholes, 5 Greeks, Newton-Raphson IV, put-call parity, option chain |
| R272 | exchange_simulator data_export.py | `data_export.py` | Good | CSV/Parquet, 3 export types, os.makedirs safe, UTC timestamps |
| R273 | exchange_simulator __main__.py | `__main__.py` | Clean | 15-line runpy entry point, sys.path manipulation, clean |
| R274 | exchange_simulator: all modules seed=42 | `5 modules` | Low | All 5 RNG modules hardcode seed=42. Simulation is deterministic. Make configurable |
| R275 | ai-signal-bot observability/health_checks.py | `health_checks.py` | ✅ Excellent | 3 endpoints (live/ready/status), 4 component checks, 3 states, metrics, status aggregation |
| R276 | ai-signal-bot health_checks: no liveness depth | `health_checks.py:76` | Medium | Liveness always returns "alive". Deadlocked loop reports alive. Use _last_signal_time for staleness |
| R277 | ai-signal-bot health_checks: __import__ anti-pattern | `health_checks.py:82` | Low | `__import__("os").getpid()` instead of `import os` at top |
| R278 | ai-signal-bot observability/logging.py | `logging.py` | ✅ Excellent | structlog with JSON, correlation IDs, graceful fallback, dual renderer, one-time config |
| R279 | ai-signal-bot observability/tracing.py | `tracing.py` | ✅ Excellent | OpenTelemetry + Jaeger, OTLP exporter, NoopTracer fallback, graceful shutdown, one-time init |
| R280 | ai-signal-bot tracing: f-string logging | `tracing.py:68,73` | Low | f-string formatted even when log level above INFO. Use % formatting |
| R281 | ai-signal-bot tracing: localhost endpoint | `tracing.py:31` | Low | Default Jaeger endpoint is localhost:4317. Won't work in K8s. Read from env |
| R282 | ai-signal-bot notifier.py | `notifier.py` | ✅ Good | Telegram+Discord, AlertEvent, remote commands, env vars, proper cleanup, chat ID verification |
| R283 | ai-signal-bot notifier: token in URL | `notifier.py:104,122` | Medium | Bot token embedded in URL. If URL logged on error, token exposed. Log endpoint name only |
| R284 | ai-signal-bot notifier: no rate limiting | `notifier.py` | Low | No rate limit on send_alert. Could hit Telegram/Discord API limits. Add 10msg/10s limiter |
| R285 | ai-signal-bot notifier: no retry on send failure | `notifier.py:111` | Low | Failed alerts are lost. No retry, no queue. Add 1-2 retries with backoff |
| R286 | ai-signal-bot llm_engine/engine.py | `engine.py` | ✅ Good | 4 providers, 3 analysis types, TTL cache, env API keys, rule-based fallback, 10s timeout |
| R287 | ai-signal-bot llm_engine: cache unbounded above 100 | `engine.py:163` | Low | Cache eviction only when >100. Can temporarily exceed. Use LRU with hard cap |
| R288 | ai-signal-bot llm_engine: no LLM response validation | `engine.py:177` | Medium | No schema validation on LLM output. Malformed JSON could produce incorrect analysis |
| R289 | ai-signal-bot llm_engine: f-string logging | `engine.py:93` | Low | f-string formatted even when log level above INFO. Use % formatting |
| R290 | ai-signal-bot networking/socket_transport.py | `socket_transport.py` | ✅ Good | Non-blocking UDP, 1MB buffers, binary protocol, 5 msg types, stats, CodeQL annotation |
| R291 | ai-signal-bot socket_transport: busy-poll 100μs | `socket_transport.py:105` | Low | time.sleep(0.0001) on BlockingIOError. Use selectors or asyncio |
| R292 | ai-signal-bot socket_transport: no graceful shutdown | `socket_transport.py:86` | Low | Blocking while loop. stop() closes socket from another thread. Use selectors with timeout |
| R293 | ai-signal-bot research/__init__.py: 35-module mega-import | `__init__.py` | High | 35 modules eagerly loaded, 200+ exports. Use lazy imports or __getattr__ |
| R294 | ai-signal-bot research: 22× duplicated compute_returns | `22 modules` | High | 22 identical 3-line copies. 66 lines wasted. Create _common.py |
| R295 | ai-signal-bot research: 35 modules code reduction | `research/` | High | 35 research-grade math modules, ~5000+ lines. Feature-flag or move to separate package |
| R296 | exchange_simulator health.py | `health.py` | ✅ Good | FastAPI /health + /metrics, lazy init, Prometheus format, 503 on error |
| R297 | exchange_simulator health.py: accesses private attrs | `health.py:87` | Low | Accesses _order_history, _audit_logger, _logs. Add public properties |
| R298 | exchange_simulator health.py: only first exchange | `health.py:79` | Low | Only checks first exchange. Others could be unhealthy |
| R299 | exchange_simulator tracing.py | `tracing.py` | ✅ Good | 4 trace ops, context propagation, Jaeger exporter, global singleton |
| R300 | exchange_simulator tracing: no graceful shutdown | `tracing.py` | Low | No shutdown() to flush spans. BatchSpanProcessor buffers async |
| R301 | exchange_simulator tracing: time.sleep in trace | `tracing.py:72` | Low | time.sleep(0.001) adds 1ms latency to every traced order. Tracing should be passive |
| R302 | exchange_simulator tracing: hardcoded localhost | `tracing.py:20` | Low | Default Jaeger host localhost. Read from env |
| R303 | exchange_simulator metrics.py | `metrics.py` | ✅ Good | Counter/Gauge/Histogram, order/fill/latency/error/system metrics, start_http_server |
| R304 | exchange_simulator: triple metrics systems | `3 files` | Medium | metrics.py (prometheus_client) + health.py (manual hft_*) + ws_prometheus.py (manual exchange_*). Consolidate |
| R305 | exchange_simulator audit_logger.py | `audit_logger.py` | ✅ Excellent | Thread-safe Lock, deque(maxlen=10000), JSON file persistence, callbacks, UUID, 6 event types |
| R306 | exchange_simulator audit_logger: f-string logging | `audit_logger.py:51` | Low | f-string formatted even when log level above INFO. Use % formatting |
| R307 | exchange_simulator ws_prometheus.py | `ws_prometheus.py` | Low | Manual Prometheus format duplicates prometheus_client. Tight coupling. Consolidate |
| R308 | f-string logging across project | `8+ modules` | Low | 8+ modules use f-string logging. Should use % formatting for lazy evaluation |
| R309 | ai-signal-bot communication/circuit_breaker.py | `circuit_breaker.py` | ✅ Excellent | 3-state CLOSED/OPEN/HALF_OPEN, configurable, half-open probes, stats, reset |
| R310 | ai-signal-bot: 3× CircuitBreaker duplication | `3 files` | High | 3 separate CircuitBreaker implementations. Consolidate into 1 |
| R311 | ai-signal-bot communication/ws_client.py | `ws_client.py` | ✅ Good | 3 encoding formats, compression, deque(maxlen=200), trading guard |
| R312 | ai-signal-bot ws_client: no reconnect | `ws_client.py:119` | Medium | On ConnectionClosed, just logs. No reconnect. Bot stops receiving data |
| R313 | ai-signal-bot communication/ws_connection_pool.py | `ws_connection_pool.py` | ✅ Excellent | Connection reuse, max 10, health checks ping/pong 5s, asyncio.Lock, stale eviction |
| R314 | ai-signal-bot ws_pool: fire-and-forget close | `ws_connection_pool.py:106` | Low | _evict_stale creates asyncio.create_task(conn.close()) — fire-and-forget |
| R315 | ai-signal-bot communication/fix_client.py | `fix_client.py` | ✅ Good | FIX 4.4, SOH delimiter, body length + checksum, session mgmt, seq persistence |
| R316 | ai-signal-bot health_check: catch-all exception | `health_check.py:73` | Low | `except Exception` masks bugs. Catch specific aiohttp.ClientError, OSError |
| R317 | ai-signal-bot communication/shm_ring_buffer.py | `shm_ring_buffer.py` | ✅ Excellent | SPSC lock-free, cache-line aligned, cross-platform, atomic ops, power-of-2, magic |
| R318 | ai-signal-bot communication/health_check.py | `health_check.py` | ✅ Good | 3-service aggregation, parallel gather, 503 on unhealthy, 3s timeout, cleanup |
| R319 | ai-signal-bot communication/metrics_server.py | `metrics_server.py` | ✅ Good | 7 metrics, Prometheus format, manual HTTP, no deps, proper cleanup |
| R320 | ai-signal-bot metrics_server: not thread-safe | `metrics_server.py:25` | Low | Plain int counters, += not atomic. Use asyncio.Lock or itertools.count |
| R321 | ai-signal-bot strategies/signal.py | `signal.py` | ✅ Excellent | SignalDirection enum, Signal dataclass, is_actionable, rr_ratio, to_dict, div-by-zero guard |
| R322 | ai-signal-bot risk/risk_manager.py | `risk_manager.py` | ✅ Good | 4 features (trailing/breakeven/partial TP/max hold), ATR-based, PositionRiskState |
| R323 | ai-signal-bot risk_manager: no thread safety | `risk_manager.py` | Low | PositionRiskState peak/trough could race across asyncio tasks. Use asyncio.Lock |
| R324 | ai-signal-bot: dual health check systems | `2 files` | Medium | observability/health_checks.py + communication/health_check.py. Consolidate |
| R325 | ai-signal-bot: dual metrics systems | `2 files` | Medium | communication/metrics_server.py + monitoring/. Consolidate |
| R326 | ai-signal-bot communication: f-string logging | `5+ files` | Low | 5+ communication modules use f-string logging. Use % formatting |
| R327 | ai-signal-bot: 4× health check implementations | `4 files` | Medium | observability/HealthChecker + communication/HealthAggregator + monitoring/health_server + exchange_simulator/health.py. Consolidate |
| R328 | ai-signal-bot portfolio/markowitz.py | `markowitz.py` | ✅ Good | Efficient frontier, scipy optimization, PortfolioResult, div-by-zero guard |
| R329 | ai-signal-bot: 5× PortfolioOptimizer duplication | `5 files` | High | portfolio/ (3 files) + risk/portfolio_optimizer.py + strategies/portfolio_optimizer.py. Consolidate |
| R330 | ai-signal-bot portfolio/rebalancing.py | `rebalancing.py` | ✅ Good | 3 triggers (time/drift/vol), RebalanceOrder, turnover, cost estimation |
| R331 | ai-signal-bot data_collection/exchange_factory.py | `exchange_factory.py` | ✅ Excellent | Protocol adapter, 3 modes (sim/real/fallback), lazy imports, proper cleanup |
| R332 | ai-signal-bot data_collection/real_exchange_client.py | `real_exchange_client.py` | ✅ Good | 3 exchanges, HMAC-SHA256 signing, usedforsecurity=False, shared session, testnet |
| R333 | ai-signal-bot real_exchange_client: api_key as attr | `real_exchange_client.py:68` | Low | API credentials as plain instance attrs. Visible in debugger/crash dump |
| R334 | ai-signal-bot ml/model_registry.py | `model_registry.py` | ✅ Excellent | 5 statuses, A/B testing, rollback, file persistence, ModelVersion + ABTest |
| R335 | ai-signal-bot ml/model_registry: no file lock | `model_registry.py:107` | Low | _save() writes JSON without lock. Concurrent saves could corrupt. Use flock |
| R336 | ai-signal-bot ml/feature_store.py | `feature_store.py` | ✅ Good | Redis backend, in-memory fallback, TTL, batch ops, 2s timeout, graceful degradation |
| R337 | ai-signal-bot feature_store: catch-all Exception | `feature_store.py:94` | Low | `except (OSError, ConnectionError, RuntimeError, Exception)` — Exception is catch-all |
| R338 | ai-signal-bot ml/price_predictor.py | `price_predictor.py` | ✅ Good | LSTM + Transformer, ONNX export, ModelConfig, 11 features, PyTorch |
| R339 | ai-signal-bot technical_analysis/: 25 files | `25 files` | High | 25 modules, many overlap with research/. Consolidate + feature-flag |
| R340 | ai-signal-bot technical_analysis/indicators.py | `indicators.py` | ✅ Good | 8 indicators, NumPy optional, NaN-padded, flexible input |
| R341 | ai-signal-bot monitoring/alerting.py | `alerting.py` | ✅ Good | 3 severity, 3 channels, rate limiting, parallel send, rule management |
| R342 | ai-signal-bot alerting: list slice not deque | `alerting.py:113` | Low | alert_history uses list slice to cap. Use deque(maxlen=1000) |
| R343 | ai-signal-bot alerting: aiohttp session leak | `alerting.py:150` | Medium | _send_discord/_send_telegram likely create session per call. Use shared session |
| R344 | ai-signal-bot monitoring/health_server.py | `health_server.py` | ✅ Good | 4 endpoints, registerable checks, aiohttp web, nosec annotation |
| R345 | ai-signal-bot: 4× health check implementations | `4 files` | Medium | observability + communication + monitoring + exchange_simulator. Consolidate |
| R346 | ai-signal-bot backtesting/backtester.py | `backtester.py` | ✅ Good | Candle replay, Trade dataclass, RiskManager integration, 4 exit reasons |
| R347 | ai-signal-bot backtesting/pnl_calculator.py | `pnl_calculator.py` | ✅ Excellent | 3 asset types (spot/futures/options), PnLBreakdown, DI into BacktestEngine |
| R348 | ai-signal-bot: technical_analysis + research overlap | `60 files` | High | 25 TA + 35 research = 60 files with overlapping math. Consolidate into quant/ |
| R349 | ai-signal-bot: dual metrics (monitoring + communication) | `2 files` | Medium | monitoring/metrics.py + communication/metrics_server.py. Consolidate |
| R350 | ai-signal-bot signal_validation/validator.py | `validator.py` | ✅ Excellent | 5 checks (confidence/RR/drawdown/positions/duplicate), early exit, div-by-zero guard |
| R351 | ai-signal-bot validator: datetime.now() no timezone | `validator.py:46` | Low | Naive datetime. Use datetime.now(UTC) |
| R352 | ai-signal-bot database/db.py | `db.py` | ✅ Good | WAL mode, 3 tables, 3 indexes, parameterized queries, Windows-safe close |
| R353 | ai-signal-bot db: new connection per operation | `db.py:21` | Medium | Every save creates new conn + PRAGMA WAL. Use persistent conn or aiosqlite |
| R354 | ai-signal-bot db: catch-all in close() | `db.py:33` | Low | `except Exception: pass` — silently swallows errors. Log at minimum |
| R355 | ai-signal-bot config/__init__.py | `config/__init__.py` | ✅ Excellent | 5 required sections, range validation, cross-field validation, warnings, yaml.safe_load |
| R356 | ai-signal-bot config: f-string logging | `config/__init__.py:29` | Low | f-string in config validation. Use % formatting |
| R357 | ai-signal-bot run.py | `run.py` | ✅ Good | Clean pipeline, config-driven, nosec annotation, sys.path documented |
| R358 | ai-signal-bot run.py: no graceful shutdown | `run.py:100` | Medium | _running flag but no SIGINT/SIGTERM handler. K8s kill = no cleanup |
| R359 | ai-signal-bot run.py: f-string logging | `run.py:111` | Low | Multiple f-string log calls in startup. Use % formatting |
| R360 | shared_config.yaml: 50 symbols × 4+ files | `4+ files` | High | 250+ symbol entries across configs. shared_config.yaml not referenced. Single source |
| R361 | shared_config.yaml: localhost in all configs | `5+ files` | Medium | All WS URLs default localhost. Won't work in K8s/Docker. Use env vars |
| R362 | Makefile | `Makefile` | ✅ Good | 12 targets, self-documenting, per-component dev/test, clean, benchmark |
| R363 | Makefile.prod | `Makefile.prod` | ✅ Excellent | 15 targets, DB migrate/backup/restore, 6-service health, one-command deploy |
| R364 | Makefile.prod: no migration tracking | `Makefile.prod:48` | Medium | Runs all SQL migrations every time. No schema_migrations table. Non-idempotent fail |
| R365 | Makefile.prod: /dev/tcp bash-specific | `Makefile.prod:82` | Low | /dev/tcp won't work with sh. Use curl or add SHELL := /bin/bash |
| R366 | hft-trade-bot bot_loop.cpp | `bot_loop.cpp` | ✅ Good | 3 process functions, atomic balance, risk check, position guard, spdlog |
| R367 | hft-trade-bot: arb_lock manual lock/unlock | `bot_loop.cpp:31` | Low | Manual lock/unlock — not RAII. Use std::lock_guard |
| R368 | hft-trade-bot: hardcoded 0.001 min quantity | `bot_loop.cpp:36` | Low | Hardcoded min arb quantity. Make configurable |
| R369 | hft-trade-bot: hardcoded 0.5 max quantity | `bot_loop.cpp:37` | Low | Hardcoded max arb quantity. Make configurable |
| R370 | hft-trade-bot: synthetic order book | `bot_loop.cpp:79` | Medium | Fake 10-level book with 1bp spacing, 1.0 qty. No warning. Unrealistic |
| R371 | ai-signal-bot: no SIGINT/SIGTERM handler | `run.py` | Medium | No signal handlers. K8s SIGTERM = ungraceful shutdown. DB/WS/SHM not cleaned |
| R372 | ai-signal-bot: no database migrations | `db.py` | Medium | CREATE TABLE IF NOT EXISTS only. No migration system. Use Alembic |
| R373 | docker-compose.yml | `docker-compose.yml` | ✅ Excellent | 6 services, all healthchecks, depends_on service_healthy, restart, volumes, network |
| R374 | docker-compose: no resource limits | `docker-compose.yml` | Medium | No mem_limit/cpus. Dev fine but prod risky. Add to docker-compose.prod.yml |
| R375 | helm/values.yaml | `values.yaml` | ✅ Good | 6+ components, resource limits, storage, pinned images, SHM 1Gi |
| R376 | helm: hardcoded localhost for web-ui WS | `values.yaml:104` | Medium | localhost in browser won't connect to K8s services. Use ingress URL |
| R377 | helm: Postgres password in plaintext | `values.yaml:17` | Medium | `change-me-in-production` in plaintext. Default to empty, require secret |
| R378 | .github/workflows/ci.yml | `ci.yml` | ✅ Excellent | 5 lint, 3 test, 2 compilers, concurrency, minimal perms, coverage, cache |
| R379 | ci.yml: no security scanning | `ci.yml` | Medium | No pip-audit/npm audit/trivy. CodeQL exists but no SCA |
| R380 | ci.yml: no integration tests | `ci.yml` | Medium | Unit tests only. No docker-compose integration test. docker-smoke-test exists |
| R381 | ci.yml: websocketpp sed patch | `ci.yml:136` | Low | Patches system headers with sed. Fragile. Pin version or use fork |
| R382 | docker-compose: healthcheck localhost in container | `docker-compose.yml:46` | Low | Health checks use localhost inside container. Works if 0.0.0.0 bind |
| R383 | hft-executor/src/lib.rs | `lib.rs` | ✅ Excellent | FFI, auto-reconnect backoff, atomics, tokio::select, batch submit, SmallVec, release profile |
| R384 | hft-executor: avg_latency_ns always 0 | `lib.rs:116` | Medium | Stats field never populated. No latency measurement implemented |
| R385 | hft-executor: serde_json unwrap_or_default | `lib.rs:159` | Low | Empty string sent on serialization failure. Handle error instead |
| R386 | hft-executor: is_fill_message string matching | `lib.rs:209` | Low | String contains check — fragile. Parse JSON and check type field |
| R387 | hft-executor: no graceful shutdown on channel close | `lib.rs:169` | Low | Returns immediately on channel close. No fill grace period |
| R388 | hft-executor: Cargo.toml | `Cargo.toml` | ✅ Good | cdylib+rlib, tokio full, release profile optimized for HFT |
| R389 | hft-executor: native-tls instead of rustls | `Cargo.toml:15` | Low | native-tls links system TLS. Use rustls for pure-Rust memory-safe TLS |
| R390 | terraform/environments/dev/main.tf | `main.tf` | ✅ Good | 5 modules, S3 backend with lock, version pinning, provider pinning |
| R391 | terraform: db_password default in plaintext | `main.tf:31` | High | `ChangeMeInProduction123!` as default. Remove default, require var or Secrets Manager |
| R392 | terraform: no prod environment | `environments/` | Medium | Only dev/ exists. No prod/ with production-grade settings |
| R393 | deploy/k8s/secrets.enc.yaml | `secrets.enc.yaml` | ✅ Good | SOPS template, 3 secrets, all CHANGE_ME placeholders, age encryption |
| R394 | deploy/k8s: only secrets, no manifests | `deploy/k8s/` | Medium | Only secrets.enc.yaml. No Deployment/Service/ConfigMap. Use Helm or add manifests |
| R395 | monitoring/ebpf_monitor.py | `ebpf_monitor.py` | ✅ Good | 6 monitoring targets, BCC optional, signal handler, eBPF C programs |
| R396 | ebpf_monitor: no Windows support | `ebpf_monitor.py:18` | Low | eBPF Linux-only. BCC_AVAILABLE=False on Windows. Dead code on Windows |
| R397 | scripts/benchmark_suite.py | `benchmark_suite.py` | ✅ Good | p50/p95/p99/p999, 6 benchmarks, perf_counter_ns, JSON output |
| R398 | benchmark_suite: no warmup | `benchmark_suite.py:29` | Low | No warmup phase. First iterations inflate p99/p999 |
| R399 | web-ui/panels/registry.js | `registry.js` | ✅ Good | 200+ lazy-loaded panels, categorized, localStorage, plugin architecture |
| R400 | web-ui: 200+ components over-engineering | `components/` | Medium | Math/research panels unlikely used by traders. Feature flag or separate package |
| R401 | .github/workflows/deploy.yml | `deploy.yml` | ✅ Good | 3 jobs, matrix build, semver tagging, conditional deploy, GHA cache |
| R402 | deploy.yml: localhost fallback for VITE_WS | `deploy.yml:90` | Medium | Defaults to localhost if GitHub vars not set. Build should fail instead |
| R403 | .github/workflows/release.yml | `release.yml` | ✅ Good | Tag-triggered, version detection, full git history, contents:write |
| R404 | .github/workflows/nightly-backtest.yml | `nightly-backtest.yml` | ✅ Good | Cron 02:00 UTC, issues:write for auto-alerting, walk-forward, artifact upload |
| R405 | docker-compose.prod.yml | `docker-compose.prod.yml` | ✅ Excellent | Resource limits, required secrets, pinned images, network segmentation, Redis config |
| R406 | docker-compose.prod: ports exposed to host | `docker-compose.prod.yml:16` | Medium | Postgres/Redis/Prometheus ports exposed. Security risk. Remove internal port mappings |
| R407 | hft-trade-bot/core/bot_context.h | `bot_context.h` | ✅ Good | 20+ components, atomics, SPSC queue, spinlock, 4 latency histograms, SHM IPC |
| R408 | hft-trade-bot: Spinlock for arb_lock | `bot_context.h:105` | Low | Spinlock appropriate for short critical section. Document constraint |
| R409 | hft-trade-bot: 3 engine versions loaded | `bot_context.h:74` | Medium | V1/V2/V3 all allocated. V1 never used in hot path. Remove V1, make V2/V3 exclusive |
| R410 | hft-trade-bot: prices_cache not thread-safe | `bot_context.h:107` | Medium | unordered_map without lock. Data race if multi-threaded. Use shared_mutex |
| R411 | Dockerfiles (3 services) | `Dockerfile.prod` ×2, `Dockerfile` | ✅ Excellent | Multi-stage, non-root, healthcheck, no-cache, apt cleanup, ABI matching |
| R412 | hft-trade-bot Dockerfile: websocketpp sed with || true | `Dockerfile:28` | Low | sed patch has || true — silent failure. Remove || true or pin websocketpp |
| R413 | hft-trade-bot: no Dockerfile.prod | `hft-trade-bot/` | Medium | Deploy workflow uses Dockerfile.prod but only Dockerfile exists. Deploy will fail |
| R414 | .pre-commit-config.yaml | `.pre-commit-config.yaml` | ✅ Good | ruff+eslint+trailing-ws+eof-fixer+check-yaml+large-files+detect-private-key |
| R415 | .pre-commit: no clang-format hook | `.pre-commit-config.yaml` | Low | No C++ formatting in pre-commit. CI catches it but not locally |
| R416 | .github/dependabot.yml | `dependabot.yml` | ✅ Excellent | 7 ecosystems, weekly, grouped, labeled, open-pull-requests-limit: 1 |
| R417 | exchange_simulator/liquidation_engine_v2.py | `liquidation_engine_v2.py` | ✅ Good | 4 liq types, cascade, ADL, insurance fund, partial liq, deque history |
| R418 | exchange_simulator/order_book_realism.py | `order_book_realism.py` | ✅ Good | Power-law decay, spoofing, icebergs, queue positions, adverse selection |
| R419 | exchange_simulator/config_validator.py | `config_validator.py` | ✅ Good | 5 required sections, 8 timeframes, errors+warnings, cross-references |
| R420 | exchange_simulator/latency_simulation.py | `latency_simulation.py` | ✅ Good | 4 exchange profiles, Gaussian jitter, Poisson spikes, reconnection backoff |
| R421 | ai-signal-bot/src/llm_engine/engine.py | `engine.py` | ✅ Good | 4 providers, env API key, TTL cache, 10s timeout, aiohttp optional, fallback |
| R422 | llm_engine: f-string logging | `engine.py:93` | Low | f-string evaluates even if log level disabled. Use % formatting |
| R423 | ai-signal-bot/src/notification/notifier.py | `notifier.py` | ✅ Good | Telegram+Discord, remote commands, AlertEvent, session lifecycle, polling task |
| R424 | notifier: token as instance attribute | `notifier.py:53` | Low | Token visible in repr/debugger. Add __repr__ mask or _token property |
| R425 | ai-signal-bot/scripts/migrate.py | `migrate.py` | ✅ Good | schema_migrations table, skip applied, sorted glob, per-migration error handling |
| R426 | migrate.py: no transaction wrapping | `migrate.py:72` | Medium | Migration SQL not in transaction. Partial state on failure. Use conn.transaction() |
| R427 | migrate.py: no --down support | `migrate.py:90` | Low | Docstring mentions --down N but not implemented. Only --up available |
| R428 | database/migrations/001_initial_schema.sql | `001_initial_schema.sql` | ✅ Good | 4 tables, pgcrypto, 7 indexes incl composite, BIGSERIAL, VARCHAR limits |
| R429 | hft-trade-bot/src/risk/kill_switch.h | `kill_switch.h` | ✅ Excellent | 3 triggers, 4 actions, 5 reasons, file-based, atomic flag, SHM notify, platform-aware |
| R430 | hft-trade-bot/src/risk/risk_manager.h | `risk_manager.h` | ✅ Good | V1+V2 checks, rate throttle, symbol blacklist, max exposure, margin ratio, leverage |
| R431 | web-ui/src/hooks/useWebSocket.ts | `useWebSocket.ts` | ✅ Excellent | Ring buffer, exponential backoff, batch merge, ping latency, sync on reconnect, TS |
| R432 | useWebSocket: no max reconnect limit | `useWebSocket.ts:74` | Low | Reconnects forever. Add maxReconnects option with "connection failed" UI |
| R433 | hft-trade-bot/src/data/signal.h | `signal.h` | ✅ Good | Helper methods, div-by-zero guard, leverage field, NEUTRAL→BUY documented |
| R434 | hft-trade-bot/src/core/config.h | `config.h` | ✅ Good | 60+ fields with defaults, V3 opt-in, thread pinning opt-in, histograms on |
| R435 | config.h: hardcoded localhost default | `config.h:14` | Medium | ws_url defaults to localhost:8765. Won't work in Docker/K8s. Default to empty |
| R436 | config.h: 60+ fields god object | `config.h` | Low | All config in one struct. Split into ConnectionConfig, RiskConfig, etc |
| R437 | hft-trade-bot/ipc/shm_ring_buffer.h | `shm_ring_buffer.h` | ✅ Excellent | SPSC lock-free, cache-line aligned, cross-platform SHM, power-of-2, static_assert |
| R438 | hft-trade-bot/ipc/shm_protocol.h | `shm_protocol.h` | ✅ Excellent | 3 msg types, #pragma pack, static_assert, Python format documented, ns timestamps |
| R439 | hft-trade-bot/ipc/shm_heartbeat.h | `shm_heartbeat.h` | ✅ Excellent | Bidirectional, seq-guarded, alignas(64), health fields, cross-platform |
| R440 | hft-trade-bot/exchange/ExchangeBase.h | `ExchangeBase.h` | ✅ Good | EMA latency (CAS loop), toxic counter, circuit breaker (toxic<5), DIP |
| R441 | hft-trade-bot/execution/order_executor.h | `order_executor.h` | ✅ Good | Auto-reconnect backoff, recreate client, manual JSON zero-alloc, [[unlikely]] |
| R442 | order_executor: detached reconnect thread | `order_executor.h:63` | Medium | Detached thread accesses this after destruction. Use jthread or join in dtor |
| R443 | order_executor: snprintf buffer truncation | `order_executor.h:108` | Low | 512-byte buffer, fragile truncation check. Use std::format or bound lengths |
| R444 | hft-trade-bot/execution/smart_order_router_v2.h | `smart_order_router_v2.h` | ✅ Excellent | 5 strategies, DIP (IExchange*), stack-allocated, toxic backoff, depth-aware |
| R445 | hft-trade-bot/execution/latency_tracker.h | `latency_tracker.h` | ✅ Excellent | 8 stages, P50-P99.9, budget enforcement, zero-alloc, stage names |
| R446 | hft-trade-bot/execution/adaptive_order_selector_v2.h | `adaptive_order_selector_v2.h` | ✅ Good | 4 order kinds, 6 factors, noexcept, SelectionResult with reason |
| R447 | hft-trade-bot/strategies/signal_engine_v2.h | `signal_engine_v2.h` | ✅ Excellent | 6 indicators, zero-alloc, branchless, alignas(64), cooldown, dynamic SL/TP/leverage |
| R448 | hft-trade-bot/strategies/signal_engine_v3.h | `signal_engine_v3.h` | ✅ Excellent | 4 HMM states, online Baum-Welch, Viterbi, regime-gated V2, O(1) per-tick |
| R449 | hft-trade-bot/strategies/simd_indicators.h | `simd_indicators.h` | ✅ Good | AVX2 8-wide, #if defined(__AVX2__), scalar fallback, SimdEMA + SimdRSI |
| R450 | simd_indicators: ema_array returns vector | `simd_indicators.h:45` | Low | SIMD negated by vector alloc. Remove if unused or use output span |
| R451 | hft-trade-bot/exchange/BinanceAdapter.h | `BinanceAdapter.h` | ✅ Good | Real Binance Futures, HMAC-SHA256, rate limits documented, spinlock, OrderResult |
| R452 | BinanceAdapter: nested spinlock acquisition | `BinanceAdapter.h:74` | Medium | Two spinlocks sequential. Latent deadlock risk. Use single lock or document ordering |
| R453 | BinanceAdapter: api_key/api_secret in Config | `BinanceAdapter.h:28` | Low | Credentials in plain string. Use Secret wrapper or env/secrets manager |
| R454 | hft-trade-bot/fix/fix_session.h | `fix_session.h` | ✅ Excellent | FIX 4.4, state machine, persistent seq nums, gap detection, destructor cleanup, atomic |
| R455 | deploy/helm/Chart.yaml | `Chart.yaml` | ✅ Good | apiVersion v2, appVersion 2.0.0, keywords, sources, maintainer |
| R456 | deploy/helm/values.yaml | `values.yaml` | ✅ Excellent | 8 services, resource limits, HPA, StatefulSet, pinned images, persistence, TLS, existingSecret |
| R457 | Helm values: no Redis password | `values.yaml:155` | Medium | No auth section for Redis. Add existingSecret and --requirepass |
| R458 | deploy/helm/templates/hft-trade-bot.yaml | `hft-trade-bot.yaml` | ✅ Excellent | StatefulSet, securityContext (non-root, drop ALL, readOnly), SHM volume, probes, Service |
| R459 | deploy/helm/templates/ai-signal-bot.yaml | `ai-signal-bot.yaml` | ✅ Excellent | Deployment, HPA, securityContext, SHM+data+logs volumes, probes, service discovery |
| R460 | ai-signal-bot livenessProbe: tcpSocket | `ai-signal-bot.yaml:71` | Low | tcpSocket only checks port open, not app health. Use httpGet /health if available |
| R461 | exchange_simulator/arbitrage.py | `arbitrage.py` | ✅ Good | ArbStatus enum, fee+slippage deduction, spread_bps, WebSocket broadcast |
| R462 | exchange_simulator/options_simulator.py | `options_simulator.py` | ✅ Good | Black-Scholes, 5 Greeks, Newton-Raphson IV, put-call parity, option chain |
| R463 | exchange_simulator/funding_rate.py | `funding_rate.py` | ✅ Good | 8-hour intervals, basis-driven rate, FundingRateEvent, deque history |
| R464 | exchange_simulator/market_microstructure.py | `market_microstructure.py` | ✅ Excellent | Student-t, Merton jumps, Heston SV, Markov 4-state, U-shaped intraday, VWAP volume |
| R465 | exchange_simulator/spread_analytics.py | `spread_analytics.py` | ✅ Good | SpreadRecord/Stats, percentile-based, per exchange/symbol, deque |
| R466 | exchange_simulator/data_export.py | `data_export.py` | ✅ Good | CSV+Parquet, 3 export types, summary stats, UTC timestamps |
| R467 | web-ui/vite.config.js | `vite.config.js` | ✅ Excellent | PWA, runtime caching, manual chunks (5 vendors), cssCodeSplit, es2020, alias, Docker host |
| R468 | vite.config: no sourcemap in production | `vite.config.js:56` | Low | No sourcemap setting. Consider 'hidden' for Sentry without exposing source |
| R469 | vite.config: PWA manifest says "204 panels" | `vite.config.js:15` | Info | Hardcoded panel count in description. Make generic to avoid maintenance |
| R470 | hft-trade-bot/communication/signal_receiver.h | `signal_receiver.h` | ✅ Good | Dual connection, callbacks, private inheritance, symbol_id fast path |
| R471 | signal_receiver_handlers.h | `signal_receiver_handlers.h` | ✅ Good | 11 msg types, non-throwing parse, string_view, atomic trading_active |
| R472 | hft-trade-bot/metrics/metrics_collector.h | `metrics_collector.h` | ✅ Good | 3 metric types (Counter/Gauge/Histogram), HistogramBuckets, domain methods |
| R473 | metrics_collector.cpp: mutex on every operation | `metrics_collector.cpp:43` | Medium | Global mutex blocks all metric ops. Use atomics or per-thread accumulation |
| R474 | metrics_collector: string key on every call | `metrics_collector.cpp:45` | Low | String concat + map lookup per call. Pre-register with int IDs |
| R475 | hft-trade-bot/monitoring/health_server.h | `health_server.h` | ✅ Good | Raw POSIX sockets, cross-platform, destructor joins, atomic shutdown |
| R476 | hft-trade-bot/monitoring/system_monitor.h | `system_monitor.h` | ✅ Excellent | 11 atomic metrics, memory_order_relaxed, computed rates, noexcept, Snapshot |
| R477 | hft-trade-bot/tracing/tracer.h | `tracer.h` | ✅ Good | OpenTelemetry, Span class, 4 trace methods, context propagation, Jaeger |
| R478 | tracer.h: mutex on Span operations | `tracer.h:11` | Low | Span uses map+vector with mutex. Use thread-local or compile-time disable |
| R479 | hft-trade-bot/utils/low_latency.h | `low_latency.h` | ✅ Excellent | Spinlock _mm_pause, CAS, SPSC queue, object pool, histogram, thread pin, alignas64 |
| R480 | hft-trade-bot/market_data/candle_aggregator.h | `candle_aggregator.h` | ✅ Excellent | 3 modes (TIME/VOLUME/TICK), noexcept, zero-alloc, ns timestamps, callback |
| R481 | hft-trade-bot/market_data/order_book_manager.h | `order_book_manager.h` | ✅ Excellent | Full L2, alignas64 PriceLevel, static_assert, 4 spread regimes, microprice, template |
| R482 | hft-trade-bot/market_data/trade_handler.h | `trade_handler.h` | ✅ Excellent | Aggressor detection, rolling VWAP O(1), circular buffer, large trade, noexcept |
| R483 | hft-trade-bot/position/position_manager_v2.h | `position_manager_v2.h` | ✅ Excellent | FIFO/weighted avg, realized+unrealized PnL, isolated+cross margin, liq price, noexcept |
| R484 | exchange_simulator/health.py | `health.py` | ✅ Good | FastAPI, 3 K8s endpoints (/health/live/ready), lazy init, YAML config |
| R485 | health.py: global mutable state | `health.py:31` | Low | Global _exchanges/_market. Race on concurrent _init(). Use asyncio.Lock |
| R486 | exchange_simulator/ws_prometheus.py | `ws_prometheus.py` | ✅ Good | 8 metrics, per-exchange labels, HELP+TYPE, mixin pattern |
| R487 | exchange_simulator/audit_logger.py | `audit_logger.py` | ✅ Excellent | 6 event types, thread-safe deque(maxlen=10000), file persistence, callbacks, UUID |
| R488 | ai-signal-bot/communication/circuit_breaker.py | `circuit_breaker.py` | ✅ Excellent | 3 states (CLOSED/OPEN/HALF_OPEN), configurable, statistics, signal outcome tracking |
| R489 | circuit_breaker: not thread-safe | `circuit_breaker.py:38` | Medium | No lock. Race on _state/_consecutive_failures. Use asyncio.Lock |
| R490 | ai-signal-bot/communication/health_check.py | `health_check.py` | ✅ Good | 3 services, 3s timeout, latency, 3 statuses, aiohttp web server |
| R491 | health_check: new ClientSession per check | `health_check.py:53` | Low | Creates session per call. Use shared session for connection pooling |
| R492 | ai-signal-bot/observability/tracing.py | `tracing.py` | ✅ Good | OpenTelemetry, OTLP gRPC, BatchSpanProcessor, graceful fallback, singleton, AsyncioInstrumentor |
| R493 | tracing.py: insecure=True for OTLP | `tracing.py:59` | Low | Disables TLS for trace export. Use TLS in production |
| R494 | exchange_simulator/exchange.py | `exchange.py` | ✅ Good | 3 mixins, per-exchange fee/slippage, account tracking, insurance fund |
| R495 | exchange.py: _order_history unbounded | `exchange.py:58` | Low | Unbounded list grows indefinitely. Use deque(maxlen=N) |
| R496 | exchange_simulator/websocket_server.py | `websocket_server.py` | ✅ Good | 3 mixins, protocol v2 with backwards compat, 5 msg types, ArbitrageDetector |
| R497 | websocket_server: sys.path manipulation | `websocket_server.py:30` | Low | sys.path hack at module level. Use pyproject.toml instead |
| R498 | exchange_simulator/ws_broadcast.py | `ws_broadcast.py` | ✅ Good | 3 encodings (JSON/orjson/msgpack), protocol versioning, SHM, optional imports |
| R499 | ws_broadcast: import inside method | `ws_broadcast.py:44` | Low | from import on every _send_json call. Move to module level |
| R500 | exchange_simulator/market_simulator.py | `market_simulator.py` | ✅ Good | GBM, per-exchange offset/vol, inter-symbol correlations, hybrid mode |
| R501 | market_simulator: no seed for per-exchange | `market_simulator.py:26` | Low | Seed controls main RNG but not per-exchange params. Use random.Random(seed+i) |
| R502 | exchange_simulator/ws_message_handler.py | `ws_message_handler.py` | ✅ Good | Rate limiting, 3 encodings, log sanitization, comprehensive msg types |
| R503 | ws_message_handler: rate limit not thread-safe | `ws_message_handler.py:37` | Low | Plain dict, fine for asyncio single-thread. Document per-worker |
| R504 | exchange_simulator/tracing.py | `tracing.py` | ✅ Good | Jaeger Thrift, BatchSpanProcessor, W3C context, 3 trace methods |
| R505 | tracing.py: no graceful fallback | `tracing.py:9` | Low | Hard-imports OpenTelemetry. Wrap in try/except ImportError |
| R506 | exchange_simulator/metrics.py | `metrics.py` | ✅ Good | prometheus_client, 3 types, order/fill/latency/error metrics, labeled |
| R507 | exchange_simulator/exchange_order_submission.py | `exchange_order_submission.py` | ✅ Good | 12 params, NaN check, hex order ID, force_close, mixin pattern |
| R508 | exchange_order_submission: no quantity upper bound | `exchange_order_submission.py:56` | Low | No max quantity check. Add MAX_QUANTITY (e.g., 1e9) |
| R509 | exchange_simulator/ws_constants.py | `ws_constants.py` | ✅ Good | Optional imports, PROTOCOL_VERSION=2, _sanitize_log, truncation [:200] |
| R510 | exchange_simulator/models.py | `models.py` | ✅ Good | 5 enums, dataclasses, to_dict, 13 AuditEventType |
| R511 | ai-signal-bot/utils/helpers.py | `helpers.py` | ✅ Good | JSON logging, YAML config, env casting, time helpers, format functions |
| R512 | helpers.py: load_config returns {} silently | `helpers.py:70` | Low | Returns {} on FileNotFoundError. Log warning or raise |
| R513 | helpers.py: bare Exception in CircuitBreaker | `helpers.py:119+` | Low | Broad exception catch masks errors. Catch specific or log |
| R514 | ai-signal-bot/database/db.py | `db.py` | ✅ Good | WAL mode, Row factory, 3 tables, 3 indexes, parameterized queries, Windows-safe close |
| R515 | db.py: new connection per operation | `db.py:21` | Medium | Every op creates conn + PRAGMA WAL. Use persistent conn, set WAL once |
| R516 | db.py: close() swallows all exceptions | `db.py:33` | Low | except Exception: pass. Log the exception |
| R517 | hft-trade-bot/core/main.cpp | `main.cpp` | ✅ Excellent | 10 init steps, graceful shutdown, ScopedLatency, atomic balance, V2/V1 fallback |
| R518 | main.cpp: no SIGTERM handler | `main.cpp:38` | Medium | No signal handler. K8s SIGTERM won't stop bot. Register signal(SIGTERM, ...) |
| R519 | main.cpp: no error handling on some init | `main.cpp:26` | Low | Some init functions don't return bool. Make all return bool and check |
| R520 | hft-trade-bot/core/bot_context.h | `bot_context.h` | ✅ Good | 24 includes, SimExchange adapter, SymbolEntry, ArbOpportunity, BotContext |
| R521 | bot_context: SimExchange holds reference | `bot_context.h:48` | Low | Reference to SignalReceiver. Document lifetime or use shared_ptr |
| R522 | hft-trade-bot/core/bot_loop.h | `bot_loop.h` | ✅ Good | 7 functions, header/impl separation, BotContext& by reference |
| R523 | hft-trade-bot/data/types.h | `types.h` | ✅ Good | 3 enums, inline helpers, Candle, OrderBook (spread/mid), Order |
| R524 | types.h: string_to_side defaults to BUY | `types.h:21` | Low | Non-BUY returns SELL. Case-insensitive or std::optional |
| R525 | hft-trade-bot/data/signal.h | `signal.h` | ✅ Good | 10 fields, is_long/short/actionable, side(), rr_ratio() |
| R526 | signal.h: NEUTRAL side() returns BUY | `signal.h:28` | Low | Footgun if caller forgets is_actionable(). Return optional or throw |
| R527 | hft-trade-bot/data/aligned_types.h | `aligned_types.h` | ✅ Excellent | alignas64, static_assert, FastSignal fixed-size, 7 score fields, set_symbol |
| R528 | hft-trade-bot/data/symbol_map.h | `symbol_map.h` | ✅ Good | FNV-1a constexpr hash, bidirectional, uint16_t IDs, 0xFFFF sentinel, nodiscard |
| R529 | symbol_map: get_id allocates string | `symbol_map.h:40` | Low | std::string(symbol) allocates per lookup. Use string_view or flat array |
| R530 | hft-trade-bot/risk/risk_manager.h | `risk_manager.h` | ✅ Excellent | V1+V2 params, blacklist, per-symbol limits, CheckResult with 8 codes |
| R531 | hft-trade-bot/risk/pre_trade_risk.h | `pre_trade_risk.h` | ✅ Excellent | TokenBucket lock-free CAS, try_acquire/try_acquire_n, noexcept, relaxed |
| R532 | pre_trade_risk: TokenBucket refill race | `pre_trade_risk.h:54` | Low | Multiple threads compute same refill. CAS ensures correctness. Document |
| R533 | hft-trade-bot/risk/portfolio_risk.h | `portfolio_risk.h` | ✅ Excellent | DrawdownTracker, historical+parametric VaR, CVaR, stress test, zero-alloc |
| R534 | exchange_simulator/exchange_advanced_orders.py | `exchange_advanced_orders.py` | ✅ Good | 3 types (stop-limit/trailing/iceberg), trigger logic, safe removal, mixin |
| R535 | exchange_simulator/exchange_liquidation.py | `exchange_liquidation.py` | ✅ Good | 3 triggers (full/partial/SL-TP), leverage-aware, PnL before check |
| R536 | exchange_liquidation: hardcoded 0.005 margin | `exchange_liquidation.py:50` | Low | Maintenance margin 0.5% hardcoded. Make configurable per exchange |
| R537 | exchange_simulator/options_pricing.py | `options_pricing.py` | ✅ Good | Black-Scholes, 5 Greeks, cdf/pdf, guard checks, configurable rate |
| R538 | options_pricing: duplicate of options_simulator | `options_pricing.py` vs `options_simulator.py` | Medium | Two modules implement Black-Scholes. Consolidate into one |
| R539 | exchange_simulator/price_feed_manager.py | `price_feed_manager.py` | ✅ Good | Multi-API (Binance/Coinbase), TTLCache, failover, profiling |
| R540 | price_feed_manager: hard-imports msgpack | `price_feed_manager.py:15` | Low | msgpack hard-imported. Wrap in try/except with JSON fallback |
| R541 | exchange_simulator/ws_metrics.py | `ws_metrics.py` | ✅ Good | deque(maxlen=10000), compression/delta ratios, P95 stats |
| R542 | ws_metrics: sorted() on every percentile | `ws_metrics.py:52` | Low | O(n log n) per query. Use quantiles or cache sorted result |
| R543 | exchange_simulator/visualizer.py | `visualizer.py` | ✅ Good | 2 mixins, cross-platform (msvcrt/select), ANSI colors, tabbed, pure Python |
| R544 | ai-signal-bot/strategies/__init__.py | `strategies/__init__.py` | ✅ Good | 7 strategies + 4 configs exported, __all__ explicit |
| R545 | strategies/__init__: missing CrossExchangeArb | `strategies/__init__.py` | Low | CrossExchangeArb and FundingRateArbDetector not exported. Add or document |
| R546 | hft-trade-bot/risk/kill_switch.h | `kill_switch.h` | ✅ Excellent | 3 activation methods, 5 reasons, 3 callbacks, SHM notification, destructor cleanup |
| R547 | kill_switch: file monitoring thread not joined | `kill_switch.h:52` | Medium | stop_monitoring may not join thread. Use jthread or join in stop_monitoring |
| R548 | hft-trade-bot/core/logger.h | `logger.h` | ✅ Good | spdlog, 2 modes (dev/JSON), rotating 50MB×5, timestamped filenames, cross-platform |
| R549 | logger: static log_dir_ not thread-safe | `logger.h:27` | Low | Static member assigned in init(). Document init-once requirement |
| R550 | hft-trade-bot/strategies/pressure_model.h | `pressure_model.h` | ✅ Excellent | Multi-level OBI single pass, toxicity, spread regime, noexcept, zero-alloc, [[unlikely]] |
| R551 | hft-trade-bot/strategies/signal_engine.h V1 | `signal_engine.h` | ✅ Good | 6 indicators (EMA/RSI/OBI/VWAP/Pressure/FFT), in-house FFT, cross-platform |
| R552 | signal_engine V1: FFT uses valarray | `signal_engine.h:27` | Low | valarray uncommon, perf pitfalls. Use iterative FFT or FFTW |
| R553 | signal_engine V1: recursive FFT allocs | `signal_engine.h:27` | Low | 20 allocs per FFT call. Use iterative in-place FFT with bit-reversal |
| R554 | ai-signal-bot/notification/notifier.py | `notifier.py` | ✅ Good | Telegram+Discord, 6 alert types, remote commands, session reuse, AlertEvent |
| R555 | notifier: token in plain attr | `notifier.py:54` | Low | Token stored as plain string. Mask in __repr__ or env-only |
| R556 | ai-signal-bot/llm_engine/engine.py | `engine.py` | ✅ Good | 4 providers, graceful fallback, optional aiohttp, MarketContext 12 fields, cache TTL |
| R557 | llm_engine: API key in plain dataclass | `engine.py:29` | Low | API key plain string. Mask in __repr__ or load from env at call time |
| R558 | ai-signal-bot/networking/socket_transport.py | `socket_transport.py` | ✅ Good | Non-blocking UDP, 1MB buffer, 4096 RX/TX queues, 5 msg types, packet stats |
| R559 | socket_transport: no error on packet parse | `socket_transport.py` | Low | struct.unpack can raise on malformed packets. Wrap in try/except |
| R560 | ai-signal-bot/signal_validation/validator.py | `validator.py` | ✅ Good | 5 checks, ValidationResult, daily PnL auto-reset, duplicate prevention |
| R561 | validator: not thread-safe | `validator.py:45` | Medium | _daily_pnl/_open_positions/_recent_signals no lock. Use asyncio.Lock |
| R562 | validator: _recent_signals unbounded | `validator.py:48` | Low | Dict grows indefinitely. Use TTLCache or periodic cleanup |
| R563 | trade_csv_logger.py | `trade_csv_logger.py` | ✅ Good | Thread-safe Lock, 10 CSV fields, timestamped filenames, symlink+Windows fallback |
| R564 | trade_csv_logger: no file rotation | `trade_csv_logger.py:46` | Low | New file per run, no cleanup. Add max_files and delete oldest |
| R565 | hft-trade-bot/core/config_parser.h | `config_parser.h` | ✅ Good | expand_env ${VAR}, per-exchange parsing, dev/prod split, rate limits, fees |
| R566 | config_parser: expand_env missing var silent | `config_parser.h:27` | Low | Missing env var → empty string, no warning. Log for credentials |
| R567 | hft-trade-bot/core/config_validate.h | `config_validate.h` | ✅ Good | 12 checks (6 risk + 6 trading), recommended values, ws:// validation |
| R568 | config_validate: warnings only no hard fail | `config_validate.h:11` | Low | All failures are warn(). Critical params should error and abort |
| R569 | hft-trade-bot/core/bot_loop.cpp | `bot_loop.cpp` | ✅ Good | 8 functions (SL/TP, arb, AI signals, V2/V1, SHM poll, shutdown), fetch_add balance |
| R570 | bot_loop: arb atomic set without lock | `bot_loop.cpp:34` | Low | has_arb_opportunity set outside lock. Move inside lock or use CAS |
| R571 | bot_loop: hardcoded 0.5 max arb qty | `bot_loop.cpp:37` | Low | Max arb qty hardcoded. Add max_arb_qty to Config |
| R572 | hft-trade-bot/core/bot_setup.cpp | `bot_setup.cpp` | ✅ Excellent | SIGINT+SIGTERM handlers, thread pinning, log banner, 15-param risk init, prod/sim split |
| R573 | CORRECTION: R518 false alarm | `bot_setup.cpp:62` | Info | SIGTERM handler EXISTS in bot_setup.cpp. R518 downgraded from Medium to Info |
| R574 | bot_setup: signal_handler only sets flag | `bot_setup.cpp:13` | Low | No logging in handler. Use async-signal-safe write() or flag+log in main |
| R575 | ai-signal-bot/strategies/strategies.py | `strategies.py` | ✅ Good | 3 strategies (Trend/MeanRev/FFT), EnsembleVoter, NaN guards, dual candle format |
| R576 | strategies.py: noqa E402 on imports | `strategies.py:15` | Low | Imports after logger. Move to top of file |
| R577 | ai-signal-bot/strategies/statistical_arbitrage.py | `statistical_arbitrage.py` | ✅ Excellent | OLS+ADF+half-life+Kalman+z-score+correlation, deque maxlen, LinAlgError fallback |
| R578 | ai-signal-bot/strategies/market_making.py | `market_making.py` | ✅ Excellent | Avellaneda-Stoikov, inventory skew, adverse selection, spread optimization, 10 params |
| R579 | market_making: inventory not thread-safe | `market_making.py:59` | Low | Plain float, no lock. Document single-task or use asyncio.Lock |
| R580 | ai-signal-bot/strategies/sentiment.py | `sentiment.py` | ✅ Good | 10 event types, sentiment/volatility maps, pre/post windows, decay 0.95/s |
| R581 | ai-signal-bot/strategies/ml_ensemble.py | `ml_ensemble.py` | ✅ Excellent | 3 ML libs (sklearn/LGB/XGB), HMM regime, IsolationForest, walk-forward, graceful fallback |
| R582 | ml_ensemble: HMMRegimeDetector not thread-safe | `ml_ensemble.py:57` | Low | Mutable state no lock. Document single-task or use asyncio.Lock |
| R583 | ai-signal-bot/technical_analysis/indicators.py | `indicators.py` | ✅ Good | 8 indicators, NumPy vectorized+scalar fallback, NaN-padded, dual candle, pure functions |
| R584 | indicators: EMA not fully vectorized | `indicators.py:60` | Low | Python loop for EMA. Use scipy.signal.lfilter or accept loop |
| R585 | ai-signal-bot/risk/risk_manager.py | `risk_manager.py` | ✅ Good | 4 features (trailing/breakeven/partial TP/max hold), ATR-based, 12-field state |
| R586 | risk_manager: not thread-safe | `risk_manager.py:66` | Medium | Same position concurrent update races on peak/trough/SL. Use asyncio.Lock per position |
| R587 | risk_manager: no config validation | `risk_manager.py:28` | Low | No __post_init__ validation. Negative trailing_distance moves SL wrong way |
| R588 | hft-trade-bot/strategies/signal_engine_v2.h | `signal_engine_v2.h` | ✅ Excellent | 6 indicators, composite score, zero-alloc, alignas64, cooldown, 4 split files |
| R589 | signal_engine_v2: get_cache allocates on emplace | `signal_engine_v2.h:64` | Low | std::string alloc on first call per symbol. Pre-populate at startup |
| R590 | hft-trade-bot/strategies/signal_engine_v3.h | `signal_engine_v3.h` | ✅ Excellent | 4-state HMM, online Baum-Welch, Viterbi, log-space, regime gating, O(1), zero-alloc |
| R591 | signal_engine_v3: HMM transition matrix hardcoded | `signal_engine_v3.h` | Low | Uniform initial. Allow loading pre-trained from config |
| R592 | hft-trade-bot/execution/smart_order_router_v2.h | `smart_order_router_v2.h` | ✅ Excellent | 5 strategies, DIP/SOLID IExchange, toxic backoff, stack-alloc MAX 16, [[unlikely]] |
| R593 | smart_order_router: no latency tracking impl | `smart_order_router_v2.h:1` | Low | Comment says latency tracking but route() doesn't use it. Add get_latency_ns() to IExchange |
| R594 | hft-trade-bot/execution/adaptive_order_selector_v2.h | `adaptive_order_selector_v2.h` | ✅ Excellent | 4 order types (IOC/FOK/GTD/PostOnly), 6 inputs, noexcept, 8 config params |
| R595 | hft-trade-bot/position/position_manager.h V1 | `position_manager.h` | ✅ Good | Mutex-protected, update-vs-duplicate, optional return, active_symbols set |
| R596 | position_manager V1: linear search | `position_manager.h:21` | Low | O(n) search in vector. Use unordered_map or accept for small n |
| R597 | position_manager V1: mutex in HFT hot path | `position_manager.h:19` | Low | Mutex on every tick via update_all_pnl. Consider lock-free or per-symbol locks |
| R598 | hft-trade-bot/position/position_manager_v2.h | `position_manager_v2.h` | ✅ Excellent | Weighted avg, realized+unrealized PnL, isolated+cross margin, liq price, symbol_id |
| R599 | position_manager_v2: hardcoded 0.005 margin | `position_manager_v2.h:72` | Low | Same as exchange_liquidation. Load from exchange config |
| R600 | ai-signal-bot/backtesting/backtester.py | `backtester.py` | ✅ Good | 10-field Trade, 18 metrics (Sharpe/Sortino/Calmar/recovery), RiskManager integration |
| R601 | backtester: no slippage model | `backtester.py` | Low | No slippage simulation. Results overly optimistic. Add configurable slippage |
| R602 | ai-signal-bot/data_collection/exchange_factory.py | `exchange_factory.py` | ✅ Good | 3 modes (sim/real/fallback), Protocol-based, 9 methods, SimulatorAdapter stub |
| R603 | exchange_factory: SimulatorAdapter hardcoded 50000 | `exchange_factory.py:55` | Low | BTC price for all symbols. Per-symbol dict or NotImplementedError |
| R604 | ai-signal-bot/portfolio/markowitz.py | `markowitz.py` | ✅ Good | PortfolioResult, EfficientFrontier, 3 calculations, max(0) guard, scipy integration |
| R605 | markowitz: no constraint validation | `markowitz.py:34` | Low | No validation on risk_free_rate. Negative inflates Sharpe |
| R606 | markowitz: no short-selling constraint | `markowitz.py` | Low | No non-negative weights constraint. May produce negative weights |
| R607 | hft-trade-bot/strategies/inline_indicators.h | `inline_indicators.h` | ✅ Excellent | 5 streaming indicators (EMA/RSI/ADX/VWAP/ATR), O(1), Wilder's, noexcept, constexpr, transparent hash |
| R608 | inline_indicators: no period validation | `inline_indicators.h:34` | Low | period=0 → wrong k_, period=-1 → inf. Add assert(period > 0) |
| R609 | hft-trade-bot/strategies/obi_utils.h | `obi_utils.h` | ✅ Excellent | 3 functions, single-pass 5/10/20-level, proximity weighting, noexcept, zero-guard |
| R610 | hft-trade-bot/exchange/IExchange.h | `IExchange.h` | ✅ Excellent | 11 pure virtual, DIP/SOLID, latency, toxic flow tracking, virtual dtor |
| R611 | CORRECTION: R593 no latency tracking | `IExchange.h:24` | Info | Interface HAS estimated_latency_us(). R593 downgraded to Info |
| R612 | ai-signal-bot/ml/price_predictor.py | `price_predictor.py` | ✅ Good | LSTM+Transformer, attention, 11 features, ONNX export, early stopping |
| R613 | price_predictor: hard-imports torch | `price_predictor.py:28` | Low | No try/except. Module fails if torch not installed. Wrap in try/except |
| R614 | ai-signal-bot/ml/model_registry.py | `model_registry.py` | ✅ Excellent | 5 statuses, semver, A/B testing, rollback, file persistence, promote-with-demotion |
| R615 | model_registry: not thread-safe | `model_registry.py:87` | Low | No lock on models/ab_tests. Use asyncio.Lock or document single-task |
| R616 | model_registry: _save not atomic | `model_registry.py:107` | Low | Direct write to registry.json. Crash corrupts. Write tmp + os.rename |
| R617 | ai-signal-bot/database/db.py | `db.py` | ✅ Good | 3 tables, 3 indexes, WAL, parameterized queries, Windows-safe close, COALESCE |
| R618 | db.py: new connection per operation | `db.py:21` | Medium | Every op creates new conn + PRAGMA WAL. Use persistent conn, set WAL once |
| R619 | db.py: no foreign key on signal_id | `db.py:67` | Low | trades.signal_id no FK to signals.id. Add FOREIGN KEY or PRAGMA foreign_keys=ON |
| R620 | ai-signal-bot/portfolio/risk_parity.py | `risk_parity.py` | ✅ Good | RiskContribution, marginal risk, equal risk contribution, risk budgeting, weight bounds |
| R621 | risk_parity: portfolio_return hardcoded 0 | `risk_parity.py:76` | Low | Return always 0. Accept expected_returns param and calculate np.dot |
| R622 | ai-signal-bot/portfolio/rebalancing.py | `rebalancing.py` | ✅ Good | 3 triggers (time/drift/vol), turnover, skip threshold, transaction cost |
| R623 | rebalancing: no min trade size | `rebalancing.py:77` | Low | 1% weight threshold only. Add min_trade_value for absolute size check |
| R624 | ai-signal-bot/monitoring/health_server.py | `health_server.py` | ✅ Excellent | 6 endpoints, K8s ready/live probes, pluggable checks, async, 200/503 |
| R625 | health_server: liveness always True | `health_server.py:123` | Low | Never checks if bot alive. Add heartbeat timestamp check |
| R626 | ai-signal-bot/monitoring/metrics.py | `metrics.py` | ✅ Excellent | 4 metric types, 5 counters, custom registry, optional imports, labels |
| R627 | metrics: __init__ returns None on missing prom | `metrics.py:41` | Low | No attributes set. AttributeError on next call. Set _enabled=False |
| R628 | ai-signal-bot/utils/helpers.py | `helpers.py` | ✅ Good | 10 utils, JsonFormatter, CircuitBreaker 3-state, RateLimiter token bucket |
| R629 | helpers: CircuitBreaker not thread-safe | `helpers.py:145` | Medium | No lock on _failure_count/_state. Race in async. Use asyncio.Lock |
| R630 | helpers: CircuitBreaker side effect in is_open | `helpers.py:156` | Low | Property mutates _state. Separate into try_reset() method |
| R631 | helpers: RateLimiter imports asyncio in method | `helpers.py:194` | Low | Lazy import in async method. Move to top of file |
| R632 | ai-signal-bot/observability/tracing.py | `tracing.py` | ✅ Good | OpenTelemetry+Jaeger, OTLP, BatchSpanProcessor, AsyncioInstrumentor, no-op fallback |
| R633 | tracing: OTLP exporter insecure=True | `tracing.py:59` | Medium | Disables TLS. Traces unencrypted in prod. Use insecure=False with certs |
| R634 | tracing: global mutable state not thread-safe | `tracing.py:25` | Low | _tracer/_initialized globals no lock. Use threading.Lock or document |
| R635 | hft-trade-bot/exchange/ExchangeBase.h | `ExchangeBase.h` | ✅ Excellent | Atomic EMA latency CAS, toxic tracking, auto circuit breaker, noexcept |
| R636 | ExchangeBase: is_available hardcoded 5 | `ExchangeBase.h:49` | Low | Toxic threshold hardcoded. Add to constructor or config |
| R637 | hft-trade-bot/utils/low_latency.h | `low_latency.h` | ✅ Excellent | Spinlock _mm_pause alignas64, SPSCQueue lock-free, ObjectPool, LatencyHistogram 35 buckets, thread pinning |
| R638 | low_latency: Spinlock no backoff limit | `low_latency.h:47` | Low | Spins indefinitely. Add max spin count + yield() fallback |
| R639 | low_latency: ObjectPool acquire O(n) | `low_latency.h:153` | Low | Linear scan. Use Treiber stack or accept for small pools |
| R640 | low_latency: LatencyHistogram atomic double | `low_latency.h:212` | Low | std::atomic<double> not portable. Use atomic<int64_t> + bit_cast |
| R641 | ai-signal-bot/config/__init__.py | `config/__init__.py` | ✅ Excellent | 5 required sections, 20+ validation rules, errors vs warnings, suspicious values, hard fail |
| R642 | config: no validation for duplicate symbols | `config/__init__.py:51` | Low | No dedup check. Duplicates cause double-processing. Add set() comparison |
| R643 | ai-signal-bot/data_collection/real_market_data.py | `real_market_data.py` | ✅ Good | 3 normalized dataclasses, multi-exchange, 3 callbacks, reconnection backoff |
| R644 | real_market_data: no reconnection state sync | `real_market_data.py:71` | Medium | No gap fill after reconnect. Trades on stale prices. Fetch historical candles |
| R645 | ai-signal-bot/communication/ws_client.py | `ws_client.py` | ✅ Good | 3 encodings, optional imports, compression, reconnection 5 attempts, trading state |
| R646 | ws_client: no TLS support | `ws_client.py:77` | Medium | No ssl param. ws:// sends data unencrypted. Add ssl for wss:// |
| R647 | ws_client: listen() doesn't reconnect | `ws_client.py:99` | Low | ConnectionClosed just logs. Caller must reconnect. Auto-reconnect or document |
| R648 | ai-signal-bot/communication/shm_ring_buffer.py | `shm_ring_buffer.py` | ✅ Excellent | SPSC lock-free, cross-platform, cache-line aligned, magic validation, __del__ safety |
| R649 | shm_ring_buffer: no overflow doc on head/tail | `shm_ring_buffer.py:173` | Low | uint64 overflow not documented. Document or add wraparound check |
| R650 | shm_ring_buffer: FlushViewOfFile every write | `shm_ring_buffer.py:38` | Low | Unnecessary flush for same-machine SHM. Adds 1-10μs latency. Remove |
| R651 | hft-trade-bot/data/types.h | `types.h` | ✅ Good | 5 structs, 3 enums, helper methods, optional price, side serialization |
| R652 | types: string_to_side silent default | `types.h:21` | Low | Unknown string → SELL. Case-insensitive + throw or optional<Side> |
| R653 | types: OrderBook returns 0.0 when empty | `types.h:48` | Low | 0.0 mistaken for real price. Return optional<double> or NaN |
| R654 | hft-trade-bot/data/aligned_types.h | `aligned_types.h` | ✅ Excellent | alignas(64), static_assert, FastSignal no string, FastOrder 5 kinds, dual clock |
| R655 | aligned_types: set_symbol no null check | `aligned_types.h:58` | Low | nullptr → UB. Add if (!s) guard |
| R656 | aligned_types: FastSignal 256 bytes 4 cache lines | `aligned_types.h:118` | Info | Larger than 1 cache line but justified. static_assert documents |
| R657 | ai-signal-bot/notification/notifier.py | `notifier.py` | ✅ Good | 2 notifiers (Telegram+Discord), 6 alert types, 5 commands, chat ID verify, optional import |
| R658 | notifier: Telegram token in URL | `notifier.py:104` | Medium | Token in URL path. Exposed in logs. Redact URLs or use header auth |
| R659 | notifier: no rate limiting on alerts | `notifier.py:89` | Low | No rate limit. Flash crash = 50+ messages. Telegram 429 ban. Add Semaphore |
| R660 | notifier: no auth for remote commands | `notifier.py:138` | Medium | Only chat_id check. chat_id not secret. Add command password/PIN |
| R661 | ai-signal-bot/llm_engine/engine.py | `engine.py` | ✅ Good | 4 providers, 3 prompt templates, cache TTL, rule-based fallback, optional import |
| R662 | llm_engine: API key empty string not None | `engine.py:86` | Low | Empty key stored as "". Use None for clearer semantics |
| R663 | llm_engine: cache key missing regime | `engine.py:151` | Low | symbol_price only. Regime change = stale cache. Add regime to key |
| R664 | ai-signal-bot/networking/socket_transport.py | `socket_transport.py` | ✅ Good | Non-blocking UDP, 1MB buffers, binary parser, 6 stats, configurable bind |
| R665 | socket_transport: blocking receive loop | `socket_transport.py:86` | Medium | Sync while loop + time.sleep blocks event loop. Use asyncio add_reader |
| R666 | socket_transport: no packet validation | `socket_transport.py:132` | Low | sym_len not validated. OOB read possible. Validate 9+sym_len+18 <= len |
| R667 | hft-trade-bot/risk/kill_switch.h | `kill_switch.h` | ✅ Excellent | 3 activation methods, 5 reasons, atomic idempotent, SHM notify, RAII |
| R668 | kill_switch: monitor thread not jthread | `kill_switch.h:117` | Low | std::thread not jthread. Use-after-free risk. Use std::jthread (C++20) |
| R669 | kill_switch: init_shm catch all exceptions | `kill_switch.h:60` | Low | catch(...) swallows errors. No log. Use catch(const std::exception& e) + log |
| R670 | hft-trade-bot/core/config.h | `config.h` | ✅ Good | 80+ fields, ExchangeConfig per-exchange, production risk limits, V2 weights |
| R671 | config: API keys in plaintext struct | `config.h:125` | Medium | api_key/api_secret as std::string. Not zeroed. Use SecureString or env vars |
| R672 | config: no validation in struct | `config.h:12` | Low | 80+ fields no in-struct validation. Add validate() method or builder pattern |
| R673 | ai-signal-bot/research/attribution.py | `attribution.py` | ✅ Excellent | Brinson-Fachler formulas, 2 dataclasses, multi-period, formatted report |
| R674 | attribution: no weight normalization check | `attribution.py:70` | Low | No sum=1 check. Incorrect attribution. Add tolerance check |
| R675 | ai-signal-bot/research/greeks_hedging.py | `greeks_hedging.py` | ✅ Good | All 5 Greeks, GBM paths, threshold rebalancing, P&L decomposition, Monte Carlo |
| R676 | greeks_hedging: np.random.seed global state | `greeks_hedging.py:112` | Low | Global seed shared across simulations. Use np.random.default_rng(seed) |
| R677 | hft-trade-bot/ipc/shm_protocol.h | `shm_protocol.h` | ✅ Excellent | 4 packed structs, static_assert, Python formats documented, 4 enums |
| R678 | shm_protocol: SymbolId only 10 symbols | `shm_protocol.h:83` | Low | 10 symbols vs 50 configured. Add dynamic registry or extend enum |
| R679 | hft-trade-bot/ipc/shm_ring_buffer.h | `shm_ring_buffer.h` | ✅ Excellent | SPSC lock-free, bulk ops, cache-line aligned, cross-platform, RAII, deleted copy |
| R680 | shm_ring_buffer C++: shm_open 0666 permissions | `shm_ring_buffer.h:101` | Medium | World read/write on SHM. Use 0600 or 0640 |
| R681 | shm_ring_buffer C++: no try_pop timeout | `shm_ring_buffer.h:220` | Low | Non-blocking only. Add pop_with_timeout for efficient waiting |
| R682 | ai-signal-bot/run.py | `run.py` | ✅ Good | AISignalBot orchestrator, reconnection, background listen, graceful shutdown, paper/live |
| R683 | run.py: no SIGTERM handler | `run.py:162` | Medium | Only KeyboardInterrupt. K8s SIGTERM kills without cleanup. Add signal handler |
| R684 | run.py: signal_publisher binds 0.0.0.0 | `run.py:77` | Low | All interfaces. Use 127.0.0.1 or firewall |
| R685 | run.py: no health check in main loop | `run.py:163` | Low | No stale data detection. Add periodic last_message_time check |
| R686 | ai-signal-bot/communication/signal_publisher.py | `signal_publisher.py` | ✅ Good | WS server, circuit breaker integration, bounded history, orjson optional, graceful stop |
| R687 | signal_publisher: no client authentication | `signal_publisher.py:106` | Medium | No auth on WS. Anyone gets signals. Add shared secret/token |
| R688 | signal_publisher: no TLS on WS server | `signal_publisher.py:80` | Medium | No ssl param. ws:// signals sniffed. Add ssl for wss:// |
| R689 | signal_publisher: backtest blocks signal broadcast | `signal_publisher.py:145` | Low | await _run_backtest blocks handler. Use asyncio.create_task |
| R690 | ai-signal-bot/communication/fix_client.py | `fix_client.py` | ✅ Good | FIX 4.4, persistent seq nums, checksum, callbacks, comprehensive msg types |
| R691 | fix_client: seq num file non-atomic save | `fix_client.py:159` | Medium | open('w') truncates on crash. Seq reset = session rejection. Use temp+rename |
| R692 | fix_client: no TLS on TCP connection | `fix_client.py:180` | Medium | asyncio.open_connection no ssl. FIX msgs plaintext. Add ssl param |
| R693 | fix_client: password in plaintext FIX field | `fix_client.py:199` | Low | Tag 554 plaintext. Don't log raw FIX at DEBUG. Use token |
| R694 | ai-signal-bot/communication/circuit_breaker.py | `circuit_breaker.py` | ✅ Excellent | 3 states, configurable, probe limiting, metrics, status dict, logging |
| R695 | circuit_breaker: state property has side effect | `circuit_breaker.py:47` | Low | state mutates OPEN→HALF_OPEN. Separate check from transition |
| R696 | circuit_breaker: not thread-safe | `circuit_breaker.py:34` | Low | No lock on state mutations. Use asyncio.Lock or single coroutine |
| R697 | ai-signal-bot/research/microstructure_lab.py | `microstructure_lab.py` | ✅ Good | 14 metrics, OFI/VPIN/Kyle's lambda, edge cases, numerical safety |
| R698 | microstructure_lab: no input validation | `microstructure_lab.py:84` | Low | qty not validated. Negative/string = silent wrong results |
| R699 | ai-signal-bot/monitoring/alerting.py | `alerting.py` | ✅ Good | 3 severities, 4 channels, rate limiting, bounded history, multi-channel send |
| R700 | alerting: check_fn is synchronous | `alerting.py:34` | Low | Can't do async checks. Change to Awaitable[bool] |
| R701 | alerting: alert_history list slice creates copy | `alerting.py:113` | Low | O(n) copy on overflow. Use deque(maxlen=1000) |
| R702 | ai-signal-bot/communication/shm_market_data_writer.py | `shm_market_data_writer.py` | ✅ Good | Seq-guarded writes, cross-platform, 0o600, context manager, bounds check |
| R703 | shm_market_data_writer: no memory barrier on seq write | `shm_market_data_writer.py:81` | Medium | struct.pack_into no barrier. ARM reordering = stale data. Use ctypes barrier |
| R704 | shm_market_data_writer: import time inside method | `shm_market_data_writer.py:99` | Low | import in method body. ~100ns per call. Move to top |
| R705 | ai-signal-bot/communication/shm_fill_consumer.py | `shm_fill_consumer.py` | ✅ Good | Non-blocking/bulk pop, async polling, graceful stop |
| R706 | shm_fill_consumer: callback is synchronous | `shm_fill_consumer.py:59` | Low | Can't do async work. Change to Awaitable[None] |
| R707 | shm_fill_consumer: 1ms poll interval wastes CPU | `shm_fill_consumer.py:62` | Low | 1ms default too fast. Use 10ms or adaptive |
| R708 | ai-signal-bot/communication/shm_signal_producer.py | `shm_signal_producer.py` | ✅ Good | Non-blocking push, dict conversion, confidence normalization, bulk push |
| R709 | shm_signal_producer: no fallback when buffer full | `shm_signal_producer.py:55` | Low | try_push False = silent drop. Log warning + metrics |
| R710 | ai-signal-bot/communication/health_check.py | `health_check.py` | ✅ Good | 3 services, concurrent checks, 3s timeout, K8s endpoints, graceful stop |
| R711 | health_check: creates new aiohttp session per check | `health_check.py:53` | Low | New session per check. Reuse single session |
| R712 | health_check: binds to 0.0.0.0 | `health_check.py:116` | Low | Exposes health status. Use 127.0.0.1 |
| R713 | ai-signal-bot/communication/metrics_server.py | `metrics_server.py` | ✅ Good | 7 Prometheus metrics, text format, no deps, graceful stop |
| R714 | metrics_server: raw HTTP parser | `metrics_server.py:109` | Low | Manual HTTP parsing. No max header size. Use aiohttp.web |
| R715 | metrics_server: counters not thread-safe | `metrics_server.py:34` | Low | Plain int increments. Use lock if multi-threaded |
| R716 | ai-signal-bot/research/competition.py | `competition.py` | ✅ Good | ELO ratings, round-robin, 10% win threshold, pluggable backtest |
| R717 | competition: _default_backtest returns all zeros | `competition.py:151` | Low | No-op default. Log warning to provide backtest_fn |
| R718 | ai-signal-bot/research/genetic_strategy.py | `genetic_strategy.py` | ✅ Good | 10 indicators, tournament selection, 5 mutation types, elitism, history |
| R719 | genetic_strategy: random not seeded | `genetic_strategy.py:30` | Low | Not reproducible. Add seed parameter |
| R720 | genetic_strategy: no convergence detection | `genetic_strategy.py:218` | Low | Runs all gens. Add early stopping on fitness plateau |
| R721 | ai-signal-bot/monitoring/tracker.py | `tracker.py` | ✅ Good | 11 fields, 3 properties, CSV loggers, tabulate dashboard |
| R722 | tracker: CSV loggers open/close file per write | `tracker.py:82` | Low | ~50 opens/min. Keep file open with buffered writer |
| R723 | tracker: no CSV injection protection | `tracker.py:82` | Low | Formula injection in CSV. Prefix =,+,-,@ with quote |
| R724 | ai-signal-bot/observability/health_checks.py | `health_checks.py` | ✅ Excellent | 3 K8s probes, 4 component checks, 3 status levels, metrics, factory function |
| R725 | health_checks: no timeout on component checks | `health_checks.py:85` | Medium | No timeout. DB hang blocks event loop. Use asyncio.wait_for |
| R726 | health_checks: sequential checks not concurrent | `health_checks.py:89` | Low | 4 checks sequential ~200ms. Use asyncio.gather ~50ms |
| R727 | ai-signal-bot/observability/logging.py | `logging.py` | ✅ Excellent | structlog optional, JSON+console, correlation IDs, service context, noise suppression |
| R728 | logging: file handler no rotation | `logging.py:121` | Low | FileHandler grows indefinitely. Use RotatingFileHandler |
| R729 | logging: root logger handlers.clear() | `logging.py:60` | Low | Removes all handlers. Only remove own handlers |
| R730 | ai-signal-bot/observability/tracing.py | `tracing.py` | ✅ Good | OpenTelemetry+Jaeger, optional NoopTracer, BatchSpanProcessor, shutdown |
| R731 | tracing: OTLP exporter insecure=True | `tracing.py:59` | Medium | Disables TLS. Traces plaintext on network. Use insecure=False with certs |
| R732 | tracing: no span attributes for trading data | `tracing.py:13` | Low | No attributes on spans. Add symbol/strategy/confidence |
| R733 | ai-signal-bot/monitoring/health_server.py | `health_server.py` | ✅ Good | 6 endpoints, K8s probes, pluggable checks, sync+async, graceful stop |
| R734 | health_server: binds to 0.0.0.0 | `health_server.py:24` | Low | Exposes health status. Use 127.0.0.1 |
| R735 | health_server: _check_all runs sequentially | `health_server.py:74` | Low | 3 checks sequential. Use asyncio.gather |
| R736 | ai-signal-bot/monitoring/metrics.py | `metrics.py` | ✅ Excellent | 5 counters, 9 gauges, 3 histograms, 1 summary, optional deps, custom registry |
| R737 | metrics: start_server binds to 0.0.0.0 | `metrics.py:211` | Low | Exposes trading metrics. Use 127.0.0.1 |
| R738 | metrics: no metric for circuit breaker state | `metrics.py:48` | Low | No CB state/trips metric. Add Gauge + Counter |
| R739 | ai-signal-bot/run_backtest.py | `run_backtest.py` | ✅ Good | Synthetic data, SQLite source, multi-strategy, optimization, walk-forward, plotting |
| R740 | run_backtest: SQLite connection not closed on exception | `run_backtest.py:80` | Low | No context manager. Use with sqlite3.connect() |
| R741 | run_backtest: no error handling for missing DB table | `run_backtest.py:80` | Low | Raw OperationalError. Add try/except with user-friendly message |
| R742 | run_backtest: no walk-forward for MeanReversion | `run_backtest.py:159` | Low | Only TF validated. Add WF for MR best params |
| R743 | Code reduction: duplicate health check infrastructure | 3 files | Info | 3 health check impls. Merge into one framework. ~150 lines |
| R744 | Code reduction: duplicate metrics infrastructure | 2 files | Info | 2 metrics impls. Merge with optional prometheus_client. ~100 lines |
| R745 | ai-signal-bot/data_collection/exchange_factory.py | `exchange_factory.py` | ✅ Good | 3 modes, Protocol interface, fallback with health check, runtime switching |
| R746 | exchange_factory: API key/secret in plaintext | `exchange_factory.py:172` | Medium | Plaintext strings in memory. Use env vars or secrets manager |
| R747 | exchange_factory: SimulatorAdapter hardcoded prices | `exchange_factory.py:55` | Low | 50000 for all symbols. Use per-symbol base price dict |
| R748 | ai-signal-bot/database/db.py | `db.py` | ✅ Good | WAL mode, 3 tables, 3 indexes, parameterized queries, Windows-safe close |
| R749 | db.py: new connection per operation | `db.py:21` | Medium | ~50 conn/min. Use connection pool or persistent connection |
| R750 | db.py: no connection timeout | `db.py:22` | Low | Default 5s timeout. Use timeout=1.0 |
| R751 | db.py: no migration version tracking | `db.py:36` | Low | CREATE IF NOT EXISTS only. Add schema_version table |
| R752 | hft-trade-bot/core/main.cpp | `main.cpp` | ✅ Good | Sequential init, error checking, comprehensive loop, latency tracking, graceful shutdown |
| R753 | main.cpp: no SIGINT/SIGTERM handler visible | `main.cpp:38` | Medium | No signal handler in main. Verify init installs handler. Without it no graceful shutdown |
| R754 | main.cpp: no exception handling in main loop | `main.cpp:38` | Medium | No try/catch. Exception = crash without graceful_shutdown. Wrap loop body |
| R755 | hft-trade-bot/core/config.h | `config.h` | ✅ Good | 60+ fields, defaults, per-exchange config, IPC/SHM, FIX, DB, Redis, metrics, risk limits |
| R756 | config.h: API keys in plaintext std::string | `config.h:125` | Medium | std::string not zeroed on destruction. Use SecureString |
| R757 | config.h: metrics_host defaults to 0.0.0.0 | `config.h:177` | Low | Exposes metrics. Default to 127.0.0.1 |
| R758 | hft-trade-bot/core/bot_loop.cpp | `bot_loop.cpp` | ✅ Good | SL/TP, arb, AI signals, V2/V1 loops, adaptive orders, latency tracking, status |
| R759 | bot_loop.cpp: arb_lock not exception-safe | `bot_loop.cpp:31` | Low | Manual lock/unlock. Use lock_guard |
| R760 | bot_loop.cpp: synthetic spread hardcoded | `bot_loop.cpp:79` | Low | 1bps for all symbols. Use per-symbol config |
| R761 | bot_loop.cpp: has_arb_opportunity store after unlock | `bot_loop.cpp:34` | Low | Race condition. Move inside lock |
| R762 | Code reduction: duplicate order book synthesis | `bot_loop.cpp:70+191` | Info | Same synthetic OB code in 2 places. Extract utility. ~10 lines |
| R763 | hft-trade-bot/execution/order_executor.h | `order_executor.h` | ✅ Good | WS, exponential backoff, manual JSON for HFT, buffer overflow protection, arbitrage |
| R764 | order_executor: detached reconnect thread race | `order_executor.h:57` | Medium | Detached thread accesses destroyed client. Use condition variable or join |
| R765 | order_executor: snprintf buffer truncation silent | `order_executor.h:108` | Low | Truncated JSON sent without closing brace. Check n >= sizeof(buf) |
| R766 | hft-trade-bot/exchange/ExchangeBase.h | `ExchangeBase.h` | ✅ Good | EWMA latency, toxic event tracking, auto-disable, atomic fields |
| R767 | hft-trade-bot/exchange/BinanceAdapter.h | `BinanceAdapter.h` | ✅ Good | IExchange, spinlock, HMAC signing, rate limiting, stream URLs, OrderResult |
| R768 | BinanceAdapter: API keys in plaintext std::string | `BinanceAdapter.h:28` | Medium | Not zeroed on destruction. Use SecureString |
| R769 | BinanceAdapter: on_depth_update only best level | `BinanceAdapter.h:83` | Low | Only top-of-book. Maintain full L2 from diffs |
| R770 | BinanceAdapter: double lock in on_book_ticker | `BinanceAdapter.h:74` | Low | Two spinlocks held simultaneously. Use single lock or enforce ordering |
| R771 | hft-trade-bot/risk/kill_switch.h | `kill_switch.h` | ✅ Excellent | 3 activation methods, 5 steps, 5 reasons, SHM notification, atomic, file monitoring |
| R772 | kill_switch: catch(...) in init_shm hides errors | `kill_switch.h:64` | Low | catch(...) loses error message. Use catch(std::exception) with logging |
| R773 | kill_switch: no auto-recovery from file trigger | `kill_switch.h:98` | Low | Stays active after file removed. Add recovery_file or document procedure |
| R774 | ai-signal-bot/ml/automl.py | `automl.py` | ✅ Good | Optuna TPE MedianPruner, 12-param space, strategy-specific, storage, timeout |
| R775 | automl: no validation set in optimize() | `automl.py:103` | Medium | No validation enforcement. Add validation_data param, enforce validation metric |
| R776 | automl: no early stopping on convergence | `automl.py:142` | Low | Runs all trials. Add callback for plateau detection |
| R777 | ai-signal-bot/ml/model_registry.py | `model_registry.py` | ✅ Good | 5 statuses, A/B testing, rollback, file persistence, error handling |
| R778 | model_registry: _save() not atomic | `model_registry.py:107` | Medium | open('w') truncates on crash. Use temp+rename (os.replace) |
| R779 | model_registry: select_ab_model not thread-safe | `model_registry.py:236` | Low | Counter race. Use lock. Move import random to top |
| R780 | ai-signal-bot/llm_engine/engine.py | `engine.py` | ✅ Good | 4 providers, env API key, rule-based fallback, caching, 3 prompts, session mgmt |
| R781 | llm_engine: API key in config dataclass plaintext | `engine.py:29` | Medium | Exposed in repr/logging. Use field(repr=False) or SecretStr |
| R782 | llm_engine: no rate limiting on API calls | `engine.py:149` | Medium | 50 symbols = 50 API calls/cycle. Add token bucket rate limiter |
| R783 | llm_engine: cache key based on rounded price | `engine.py:151` | Low | Rounding boundary causes cache misses. Use price buckets |
| R784 | Code reduction: duplicate API key plaintext pattern | 4 files | Info | 4 locations with same vulnerability. Unified SecureString/SecretStr. ~20 lines |
| R785 | hft-trade-bot/strategies/signal_engine_v2.h | `signal_engine_v2.h` | ✅ Excellent | 6 indicators, no heap alloc, incremental cache, cooldown, composite, adaptive SL/TP, branchless |
| R786 | signal_engine_v2: heap alloc in get_cache() | `signal_engine_v2.h:61` | Medium | emplace in analyze_incremental. Pre-populate cache or use flat array |
| R787 | signal_engine_v2: stack arrays 8KB per call | `signal_engine_v2.h:90` | Low | 256×4 doubles = 8KB. Use thread_local or pre-allocated buffers |
| R788 | signal_engine_v2: last_signal_ms_ not per-symbol | `signal_engine_v2.h:192` | Medium | Single cooldown for all symbols. Move to IndicatorCache |
| R789 | hft-trade-bot/strategies/pressure_model.h | `pressure_model.h` | ✅ Excellent | Multi-level OBI, weighted OBI, trade flow, toxicity, microprice, queue pos, price impact |
| R790 | pressure_model: compute_obi() static method unused | `pressure_model.h:134` | Info | Dead code from pre-optimization. Remove. ~10 lines |
| R791 | hft-trade-bot/position/position_manager.h | `position_manager.h` | ✅ Good | Mutex-protected, update-on-duplicate, SL/TP, active_symbols set |
| R792 | position_manager: linear search for close_position | `position_manager.h:45` | Low | O(N) search. Use unordered_map for O(1) |
| R793 | position_manager: no position size validation | `position_manager.h:17` | Low | No qty > 0 check. Add validation |
| R794 | hft-trade-bot/data/signal.h | `signal.h` | ✅ Good | 9 fields, convenience methods, R:R calculation |
| R795 | signal.h: NEUTRAL side() returns BUY | `signal.h:25` | Low | Footgun. Return optional<Side> or Side::NONE |
| R796 | Code reduction: position_manager V1 vs V2 | 2 files | Info | V1 (130 lines) may be dead if V2 supersedes. ~130 lines |
