# Project rules for the AI coding agent

- Read docs/SRS.md before any task. Implement only the milestone I name.
- Stack: Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic (api/), LiveKit Agents Python (agent/), Next.js + TypeScript (dashboard/), Bicep or Terraform (infra/).
- Plan first: list files you will change and the tests you will add. Wait for approval on large changes.
- Never invent library, LiveKit, Google or Azure APIs. Read the current docs (use the LiveKit docs MCP server when available) and mention which page you used.
- Every feature ships with tests. Run `make test` before saying a task is done.
- Multi-tenancy is mandatory: every tenant table has tenant_id and RLS. Tenant users never supply tenant_id. The voice agent never accesses the database or calendar directly; it calls internal API endpoints with a call-scoped token.
- Outbound calls must pass the compliance gate (consent, suppression, calling window, caps). Never bypass it, even for tests; use fixtures.
- No secrets in code, logs, images or commits. Use .env.example for names only.
- Keep PRs small. One logical change per commit with a clear message.
- If something in the spec is ambiguous or contradicts the docs, stop and ask.
