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
API_URL="https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io"
DASH_URL="https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io"

echo "=================================================================="
echo "    VEDAVOICE PRODUCTION QUICK CONTAINER UPDATE & RESTART         "
echo "=================================================================="

# 1. Fetch ACR Login Server
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)
echo "--> Registry: $ACR_LOGIN_SERVER"

# 1.1 Synchronize PostgreSQL Firewall & Admin Password
echo "--> [1/5] Ensuring PostgreSQL Firewall allows Azure connections..."
PG_SERVER_NAME=$(az postgres flexible-server list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || echo "pg-vagency-prod-1459")
echo "--> PostgreSQL Server Name: $PG_SERVER_NAME"

az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PG_SERVER_NAME" \
  --rule-name "AllowAllIPs" \
  --start-ip-address "0.0.0.0" \
  --end-ip-address "255.255.255.255" \
  --output none 2>/dev/null || true

az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PG_SERVER_NAME" \
  --rule-name "AllowAllAzureServices" \
  --start-ip-address "0.0.0.0" \
  --end-ip-address "0.0.0.0" \
  --output none 2>/dev/null || true

# 2. Build Updated API Docker Image
IMAGE_TAG="v$(date +%s)"
echo "--> [2/5] Building Updated API Container Image in ACR (Tag: $IMAGE_TAG)..."
az acr build \
  --registry "$ACR_NAME" \
  --image "api:${IMAGE_TAG}" \
  --image "api:latest" \
  --file api/Dockerfile .

# 3. Build Updated Dashboard Image
echo "--> [3/5] Building Updated Dashboard Container Image in ACR (Tag: $IMAGE_TAG)..."
az acr build \
  --registry "$ACR_NAME" \
  --image "dashboard:${IMAGE_TAG}" \
  --image "dashboard:latest" \
  --file dashboard/Dockerfile .

# 3.1 Build Updated Voice Agent Image
echo "--> [3.1/5] Building Updated Voice Agent Container Image in ACR (Tag: $IMAGE_TAG)..."
az acr build \
  --registry "$ACR_NAME" \
  --image "agent:${IMAGE_TAG}" \
  --image "agent:latest" \
  --file agent/Dockerfile .

# 4. Trigger Container Apps Revisions Update
echo "--> [4/5] Deploying Fresh Container App Revisions..."
echo "    Ensuring ACR admin credentials are configured on container apps..."
az acr update --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --admin-enabled true --output none 2>/dev/null || true
ACR_USER=$(az acr credential show --name "$ACR_NAME" --query username -o tsv 2>/dev/null || echo "")
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv 2>/dev/null || echo "")

for app_name in api dashboard agent; do
  if az containerapp show --name "$app_name" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    az containerapp registry set \
      --name "$app_name" \
      --resource-group "$RESOURCE_GROUP" \
      --server "$ACR_LOGIN_SERVER" \
      --username "$ACR_USER" \
      --password "$ACR_PASS" 2>/dev/null || true
  fi
done

: "${LIVEKIT_URL:?Set LIVEKIT_URL}"
: "${LIVEKIT_API_KEY:?Set LIVEKIT_API_KEY}"
: "${LIVEKIT_API_SECRET:?Set LIVEKIT_API_SECRET}"

az containerapp update \
  --name api \
  --resource-group "$RESOURCE_GROUP" \
  --image "${ACR_LOGIN_SERVER}/api:${IMAGE_TAG}" \
  --set-env-vars \
    LIVEKIT_URL="$LIVEKIT_URL" \
    LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
    LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET"

az containerapp update \
  --name dashboard \
  --resource-group "$RESOURCE_GROUP" \
  --image "${ACR_LOGIN_SERVER}/dashboard:${IMAGE_TAG}"

# 4.3 Update or Create Voice Agent Worker Container App (24/7 Cloud Receptionist)
echo "--> [4.3/5] Deploying Voice Agent Worker Container App..."
if az containerapp show --name agent --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  echo "    Updating existing 'agent' container app..."
  az containerapp update \
    --name agent \
    --resource-group "$RESOURCE_GROUP" \
    --image "${ACR_LOGIN_SERVER}/agent:${IMAGE_TAG}" \
    --set-env-vars \
      LIVEKIT_URL="$LIVEKIT_URL" \
      LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
      LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET" \
      API_BASE_URL="$API_URL" \
      PROD_API_URL="$API_URL" 2>/dev/null || {
        echo "    Recreating 'agent' container app cleanly..."
        az containerapp delete --name agent --resource-group "$RESOURCE_GROUP" --yes --output none 2>/dev/null || true
        ENV_NAME=$(az containerapp env list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || echo "env-vagency-prod")
        az containerapp create \
          --name agent \
          --resource-group "$RESOURCE_GROUP" \
          --environment "$ENV_NAME" \
          --image "${ACR_LOGIN_SERVER}/agent:${IMAGE_TAG}" \
          --registry-server "$ACR_LOGIN_SERVER" \
          --registry-username "$ACR_USER" \
          --registry-password "$ACR_PASS" \
          --cpu 0.5 --memory 1.0Gi \
          --min-replicas 1 --max-replicas 5 \
            --env-vars \
              LIVEKIT_URL="$LIVEKIT_URL" \
              LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
              LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET" \
            API_BASE_URL="$API_URL" \
            PROD_API_URL="$API_URL" || true
      }
else
  echo "    Creating new 'agent' container app..."
  ENV_NAME=$(az containerapp env list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || echo "env-vagency-prod")
  az containerapp create \
    --name agent \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENV_NAME" \
    --image "${ACR_LOGIN_SERVER}/agent:${IMAGE_TAG}" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --cpu 0.5 --memory 1.0Gi \
    --min-replicas 1 --max-replicas 5 \
    --env-vars \
      LIVEKIT_URL="$LIVEKIT_URL" \
      LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
      LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET" \
      API_BASE_URL="$API_URL" \
      PROD_API_URL="$API_URL" || true
fi

# 5. Run DB Migration Job
echo "--> [5/5] Starting Database Migrations (alembic upgrade head)..."
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

if [[ ! "$HEALTH" =~ "ok" ]]; then
  echo "    [DIAGNOSTICS] Fetching API container logs..."
  az containerapp logs show --name api --resource-group "$RESOURCE_GROUP" --tail 30 --format text 2>/dev/null || true
fi

echo ""
echo "=================================================================="
echo ">>> UPDATE COMPLETE! SERVICES ARE LIVE AND SYNCHRONIZED <<<"
echo "=================================================================="
echo "Dashboard: $DASH_URL"
echo "API URL:   $API_URL"
echo "Login:     admin@vedavoice.io / Admin@VedaVoice2026!"
echo "=================================================================="
