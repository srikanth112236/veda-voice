# AI Voice Agent Platform (Monorepo)

Multi-tenant AI voice receptionist and outbound calling platform.

## Architecture Overview

- **`agent/`**: Real-time voice agent running on LiveKit Agents (`Python 3.12`).
- **`api/`**: Control plane API running on FastAPI, SQLAlchemy 2, Alembic, and PostgreSQL 16.
- **`docs/`**: Platform specifications (`SRS.md`) and execution plans (`3_Week_Plan_and_Test_Scripts.md`).
- **`infra/`**: Infrastructure as Code (Bicep / Terraform) for cloud deployments.

---

## Prerequisites

1. **Python 3.12** (managed via `.python-version` or system installation).
2. **Docker Desktop** (required for local PostgreSQL 16 container; WSL2 backend recommended on Windows).
3. **Git** and **PowerShell** (Windows) or **Make** (macOS/Linux/WSL).

---

## Local Setup

### 1. Environment Configuration

Copy the example environment file:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS / WSL
cp .env.example .env
```

Review `.env` and configure credentials when moving beyond scaffold milestones.

### 2. Python Virtual Environment

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux / macOS / WSL:
source .venv/bin/activate

# Install dependencies
pip install -r api/requirements-dev.txt
pip install -r agent/requirements-dev.txt
```

### 3. Local Database (Docker Compose)

Docker Desktop must be running.

```bash
# Windows PowerShell task runner:
.\tasks.ps1 dev

# Using Make:
make dev

# Or directly using Docker Compose:
docker compose up -d
```
PostgreSQL 16 is bound to `127.0.0.1:5432`.

---

## Running Tests and Linters

### Windows PowerShell (`tasks.ps1`)
```powershell
# Run unit tests
.\tasks.ps1 test

# Run code linters and type checkers (ruff + mypy)
.\tasks.ps1 lint

# Auto-format code
.\tasks.ps1 format

# Stop local database container
.\tasks.ps1 clean
```

### Make (`Makefile`)
```bash
make test    # Run unit tests across api and agent
make lint    # Run ruff check, format check, and mypy
make format  # Auto-format code with ruff
make clean   # Stop containers
```
