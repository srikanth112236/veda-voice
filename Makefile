.PHONY: dev test lint format clean

dev:
	docker compose up -d

test:
	python -m pytest api/tests agent/tests -v

lint:
	python -m ruff check .
	python -m ruff format --check .
	python -m mypy api agent

format:
	python -m ruff check --fix .
	python -m ruff format .

clean:
	docker compose down
