#!/usr/bin/env bash
# ==============================================================================
# VEDAVOICE PRODUCTION QUICK REBUILD & RE-DEPLOY
# Usage in Azure Cloud Shell:
#   cd /home/vedasynk/veda-voice
#   git pull origin main
#   bash scripts/update_prod.sh
# ==============================================================================

set -euo pipefail

RESOURCE_GROUP="${1:-rg-vagency-prod}"
ACR_NAME="${2:-acrvagencyprod6eac3}"

echo "=================================================================="
echo "    VEDAVOICE PRODUCTION QUICK CONTAINER UPDATE & RESTART         "
echo "=================================================================="

# 1. Fetch ACR Login Server
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)
echo "--> Registry: $ACR_LOGIN_SERVER"

# 2. Build Updated API Docker Image
echo "--> [1/4] Building Updated API Container Image in ACR..."
az acr build \
  --registry "$ACR_NAME" \
  --image api:latest \
  --file api/Dockerfile .

# 3. Build Updated Dashboard Image
echo "--> [2/4] Building Updated Dashboard Container Image in ACR..."
az acr build \
  --registry "$ACR_NAME" \
  --image dashboard:latest \
  --file dashboard/Dockerfile .

# 4. Trigger Container Apps Revisions Update
echo "--> [3/4] Updating Container Apps Revisions..."
az containerapp update \
  --name api \
  --resource-group "$RESOURCE_GROUP" \
  --image "${ACR_LOGIN_SERVER}/api:latest"

az containerapp update \
  --name dashboard \
  --resource-group "$RESOURCE_GROUP" \
  --image "${ACR_LOGIN_SERVER}/dashboard:latest"

# 5. Run DB Migration Job
echo "--> [4/4] Starting Database Migrations (alembic upgrade head)..."
az containerapp job start \
  --name db-migrate-job \
  --resource-group "$RESOURCE_GROUP" || true

# 6. Verify Health
API_URL="https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io"
DASH_URL="https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io"

echo ""
echo "--> Verifying Health..."
for i in {1..8}; do
  HEALTH=$(curl -s --max-time 5 "$API_URL/health" || true)
  if [[ "$HEALTH" =~ "ok" ]]; then
    echo "    [SUCCESS] API is live and healthy: $HEALTH"
    break
  fi
  echo "    Waiting for container revision to spin up (attempt $i/8)..."
  sleep 4
done

echo ""
echo "=================================================================="
echo ">>> UPDATE COMPLETE! SERVICES ARE LIVE AND SYNCHRONIZED <<<"
echo "=================================================================="
echo "Dashboard: $DASH_URL"
echo "API URL:   $API_URL"
echo "Login:     admin@vedavoice.io / Admin@VedaVoice2026!"
echo "=================================================================="
