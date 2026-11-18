# VedaVoice: Complete End-to-End Azure Production Deployment Guide

This guide details the step-by-step process to deploy VedaVoice to Microsoft Azure with automated CI/CD via GitHub Actions.

---

## Architecture Summary

- **Voice Layer (LiveKit Cloud)**:
  - Agent worker `receptionist` runs on LiveKit Cloud (`lk agent deploy`).
  - Media, WebRTC, SIP inbound/outbound, and AI inference (STT, LLM, TTS).
- **Control Plane (Azure Container Apps)**:
  - `api`: FastAPI (HTTPS ingress, 2–6 autoscale replicas).
  - `dashboard`: Next.js (HTTPS ingress, 1–3 replicas).
  - `dialer`: Speed-to-lead outbound dialer worker.
  - `notifier`: Email & SMS notification worker.
  - `db-migrate-job`: One-shot Alembic migration job running before API updates.
- **Database**:
  - Azure Database for PostgreSQL Flexible Server (v16, pg_trgm, RLS, PgBouncer).
- **Secrets & Storage**:
  - Azure Key Vault with RBAC and Managed Identity.
  - Azure Blob Storage (`recordings`, `transcripts`, `reports`).
- **Observability**:
  - Azure Log Analytics & Application Insights with SLA metric alerts.

---

## Phase 1: One-Time Account Prerequisites

Before running the deployment scripts, make sure you have:
1. **Azure CLI installed and authenticated**:
   ```bash
   az login
   az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
   ```
2. **LiveKit Cloud Project**:
   - URL: `wss://<your-project>.livekit.cloud`
   - API Key & Secret from LiveKit Cloud console.
3. **Twilio or Telnyx SIP Trunk**:
   - Configured pointing to `sip.livekit.cloud` (see `infra/sip/`).
4. **GitHub Repository**:
   - Code pushed to your repository (e.g. `your-org/veda-voice`).

---

## Phase 2: Bootstrap Azure & GitHub OIDC (No Stored Secrets)

Run the bootstrap script from the repository root:

### On Windows PowerShell:
```powershell
.\scripts\azure_bootstrap.ps1 `
    -ResourceGroupName "rg-vagency-prod" `
    -Location "eastus2" `
    -GitHubOrgOrUser "YOUR_GITHUB_USERNAME" `
    -GitHubRepo "veda-voice" `
    -Environment "prod"
```

### On Linux / macOS / Azure Cloud Shell:
```bash
chmod +x scripts/azure_bootstrap.sh
./scripts/azure_bootstrap.sh "rg-vagency-prod" "eastus2" "YOUR_GITHUB_USERNAME/veda-voice" "prod"
```

This script:
1. Creates the Resource Group `rg-vagency-prod`.
2. Creates an Azure AD Application & Service Principal for GitHub Actions.
3. Configures **Federated Credentials (OIDC)** matching your repository's `main` branch.
4. Grants **Contributor** role on the resource group.
5. Prints the exact variables to paste into GitHub.

---

## Phase 3: Configure GitHub Actions Variables & Secrets

In your GitHub repository, navigate to:
**Settings** -> **Secrets and variables** -> **Actions**

### 1. Variables (`Repository Variables`)
- `AZURE_CLIENT_ID`: The App ID from the bootstrap script output.
- `AZURE_TENANT_ID`: Your Azure Tenant ID.
- `AZURE_SUBSCRIPTION_ID`: Your Azure Subscription ID.
- `AZURE_RG`: `rg-vagency-prod`
- `ACR_NAME`: Name of your ACR registry (e.g., `acrvagencyprod12345` created by Bicep).
- `PROD_API_URL`: Your public API URL (e.g., `https://api.yourdomain.com`).

### 2. Secrets (`Repository Secrets`)
- `LIVEKIT_ACCESS_TOKEN`: LiveKit CLI authentication token for deploying the agent in CI.

---

## Phase 4: Deploy Infrastructure as Code (Bicep)

Run Bicep to provision all Azure resources:

```bash
az deployment group create \
    --resource-group rg-vagency-prod \
    --template-file infra/bicep/main.bicep \
    --parameters infra/bicep/parameters/prod.bicepparam
```

This provisions:
- Azure Container Registry (ACR)
- Log Analytics Workspace & Application Insights
- Azure Blob Storage with containers
- Azure Key Vault
- PostgreSQL Flexible Server v16 with PgBouncer and `pg_trgm`
- Container Apps Environment & Apps (`api`, `dashboard`, `dialer`, `notifier`)
- Database Migration Job (`db-migrate-job`)
- Metric Alert Rules for 5xx errors and high DB CPU

---

## Phase 5: Voice Agent Deployment (LiveKit Cloud)

The voice agent runs directly on LiveKit Cloud:

```bash
cd agent
# Authenticate LiveKit CLI
lk cloud auth

# Deploy agent
lk agent deploy

# Stream agent logs
lk agent logs
```

---

## Phase 6: Automated CI/CD Execution (On Every Push)

Every time code is pushed to `main`:
1. `.github/workflows/ci.yml` runs tests, linting, formatting checks, and frontend build.
2. `.github/workflows/deploy.yml` logs in via OIDC, builds Docker images, pushes to ACR, runs `alembic upgrade head` via the Container Apps job, and rolls out zero-downtime container updates to Azure Container Apps.
3. LiveKit agent updates are deployed.
4. Automated production smoke tests verify endpoint health.
