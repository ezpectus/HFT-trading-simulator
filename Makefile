.PHONY: help install dev dev-exchange dev-signals dev-ui test test-exchange test-signals lint build docker-up docker-down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	cd exchange-simulator && pip install -r requirements.txt
	cd ai-signal-bot && pip install -r requirements.txt
	cd web-ui && npm install

dev: ## Start all services in development mode
	docker-compose up

dev-exchange: ## Start only exchange simulator
	cd exchange-simulator && python -m exchange_simulator --no-visualizer

dev-signals: ## Start only AI signal bot
	cd ai-signal-bot && python run.py --dashboard

dev-ui: ## Start only web UI
	cd web-ui && npm run dev

test: ## Run all tests
	cd exchange-simulator && python -m pytest tests/ -v
	cd ai-signal-bot && python -m pytest tests/ -v

test-exchange: ## Run exchange simulator tests
	cd exchange-simulator && python -m pytest tests/ -v

test-signals: ## Run AI signal bot tests
	cd ai-signal-bot && python -m pytest tests/ -v

lint: ## Run linter on all Python code
	cd exchange-simulator && ruff check .
	cd ai-signal-bot && ruff check .

build: ## Build web UI for production
	cd web-ui && npm run build

docker-up: ## Start all services with Docker Compose
	docker-compose up --build

docker-down: ## Stop all Docker services
	docker-compose down

clean: ## Clean build artifacts
	rm -rf web-ui/dist web-ui/node_modules
	rm -rf hft-trade-bot/build
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
