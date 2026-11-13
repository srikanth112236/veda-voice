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

For local agent development and console mode, place your personal LiveKit credentials and local overrides in `.env.local` (e.g. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). The application automatically loads `.env.local` first with fallback to `.env`. Both `.env` and `.env.local` are strictly git-ignored.

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
pip install -r api/requirements.txt
```

---

## Call Records & Data Privacy (PII Warning)

Call records are written upon call completion by the `FileCallStore` interface into individual JSON files:
- **Location**: `data/calls/<utc_timestamp>_<call_id>.json`
- **Contents**: Full caller phone number (for callback), dialed number, call duration, outcome, message payload, correction history, latency percentiles, and full conversation transcript.

> **CRITICAL PRIVACY & SECURITY WARNING**:
> Files inside `data/` contain **Personally Identifiable Information (PII)** including raw customer phone numbers, names, and call transcripts.
> The entire `data/` directory is strictly **git-ignored** (`.gitignore`) and must **NEVER** be committed to version control, uploaded to public storage, or exposed in public logs.
> All application and console logs redact phone numbers to the last 4 digits (e.g. `***-***-4567`).
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

## Running the Voice Agent (Console Mode on Windows)

Milestone **M1a** introduces the `receptionist` voice agent, which can be run locally in interactive `console` mode from a Windows laptop using your microphone and speakers.

### Prerequisites for Console Mode
Ensure your `.env` contains valid LiveKit credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
LiveKit Inference model strings are loaded from environment variables with defaults:
- `STT_MODEL`: defaults to `deepgram/nova-3`
- `LLM_MODEL`: defaults to `google/gemini-2.5-flash`
- `TTS_MODEL`: defaults to `rime/arcana`

### Launch Console Mode
```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Start the agent in interactive console mode
python -m agent.main console
```
You can speak to the agent directly from your terminal. It will greet you, answer questions using the `clients.json` knowledge base, adhere to safety and anti-hallucination rules, and call `end_call` when conversation completes.

---

## Running Tests and Linters

### Windows PowerShell (`tasks.ps1`)
```powershell
# Run unit tests (runs 100% offline without API keys)
.\tasks.ps1 test

# Run LLM scenario conversation tests (requires network/keys)
.\.venv\Scripts\python -m pytest -m llm -v

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
