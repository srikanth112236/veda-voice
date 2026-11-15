.PHONY: dev test lint format clean load-test

dev:
	docker compose up -d

test:
	python -m pytest api/tests agent/tests -v

load-test:
	python -m scripts.load_test.simulate_calls --concurrency 50 --tenants 5

lint:
	python -m ruff check .
	python -m ruff format --check .
	python -m mypy api agent

format:
	python -m ruff check --fix .
	python -m ruff format .

clean:
	docker compose down
