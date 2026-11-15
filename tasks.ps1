param (
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet("dev", "test", "lint", "format", "clean", "load-test")]
    [string]$Task
)

$ErrorActionPreference = "Stop"

$python = "python"
if (Test-Path ".\.venv\Scripts\python.exe") {
    $python = ".\.venv\Scripts\python.exe"
}

switch ($Task) {
    "dev" {
        Write-Host "Starting PostgreSQL container via docker compose..." -ForegroundColor Cyan
        docker compose up -d
    }
    "test" {
        Write-Host "Running unit tests (api and agent)..." -ForegroundColor Cyan
        & $python -m pytest api/tests agent/tests -v
    }
    "lint" {
        Write-Host "Running ruff check, ruff format check, and mypy..." -ForegroundColor Cyan
        & $python -m ruff check .
        & $python -m ruff format --check .
        & $python -m mypy api agent
    }
    "format" {
        Write-Host "Formatting code with ruff..." -ForegroundColor Cyan
        & $python -m ruff check --fix .
        & $python -m ruff format .
    }
    "clean" {
        Write-Host "Stopping docker compose containers..." -ForegroundColor Cyan
        docker compose down
    }
    "load-test" {
        Write-Host "Running 50-concurrent-call staging load test harness..." -ForegroundColor Cyan
        & $python -m scripts.load_test.simulate_calls --concurrency 50 --tenants 5
    }
}
