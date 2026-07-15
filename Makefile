.PHONY: help install dev dev-exchange dev-signals dev-ui test test-exchange test-signals test-js lint build docker-up docker-down clean logs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	cd exchange_simulator && pip install -r requirements.txt
	cd ai-signal-bot && pip install -r requirements.txt
	cd web-ui && npm install

dev: ## Start all services in development mode
	docker-compose up

dev-exchange: ## Start only exchange simulator
	cd exchange_simulator && python -m exchange_simulator --no-visualizer

dev-signals: ## Start only AI signal bot
	cd ai-signal-bot && python run.py --dashboard --metrics

dev-ui: ## Start only web UI
	cd web-ui && npm run dev

test: ## Run all tests
	cd exchange_simulator && python -m pytest tests/ -v
	cd ai-signal-bot && python -m pytest tests/ -v
	cd web-ui && npx vitest run --passWithNoTests

test-exchange: ## Run exchange simulator tests
	cd exchange_simulator && python -m pytest tests/ -v

test-signals: ## Run AI signal bot tests
	cd ai-signal-bot && python -m pytest tests/ -v

test-js: ## Run JS tests
	cd web-ui && npx vitest run --coverage

lint: ## Run linters on all code
	cd exchange_simulator && ruff check .
	cd ai-signal-bot && ruff check .
	cd web-ui && npx eslint src/

build: ## Build web UI for production
	cd web-ui && npm run build

docker-up: ## Start all services with Docker Compose
	docker-compose up --build

docker-down: ## Stop all Docker services
	docker-compose down

clean: ## Clean build artifacts
	rm -rf web-ui/dist web-ui/node_modules web-ui/coverage
	rm -rf hft-trade-bot/build
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +

logs: ## View latest log files
	@echo "=== Exchange Simulator ==="
	@tail -20 logs/exchange_simulator_latest.log 2>/dev/null || echo "No log file found"
	@echo ""
	@echo "=== AI Signal Bot ==="
	@tail -20 logs/ai_signal_bot_latest.log 2>/dev/null || echo "No log file found"
	@echo ""
	@echo "=== HFT Trade Bot ==="
	@tail -20 logs/hft_trade_bot_latest.log 2>/dev/null || echo "No log file found"
	@echo ""
	@echo "=== Latest Trades CSV ==="
	@head -5 logs/trades_latest.csv 2>/dev/null || echo "No trades CSV found"
