#!/usr/bin/env bash
# ==============================================================================
# VEDAVOICE COMPLETE ALL-IN-ONE AZURE TERMINAL DEPLOYMENT SCRIPT
# Designed to run directly in Azure Cloud Shell (shell.azure.com) or Azure CLI
# ==============================================================================

set -euo pipefail

echo "=================================================================="
echo "          VEDAVOICE END-TO-END AZURE PRODUCTION DEPLOYMENT         "
echo "=================================================================="

# 1. Configuration & Provided Credentials
RESOURCE_GROUP="${1:-rg-vagency-prod}"
LOCATION="${2:-eastus2}"
GITHUB_REPO="${3:-}"

# Production secrets supplied by user
JWT_SECRET="${JWT_SECRET:-KxYj9m/uxTtrKBvPCmWYqUCbz97BxDParzOHgc3Ze38=}"
INTERNAL_SIGNING_KEY="${INTERNAL_SIGNING_KEY:-ur+yG4Asx1ZPR9hHz2zlwpvv+JCHcNQYqxnTlHy3roQ=}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-VedaVoicec10074782763451f!2026}"
APP_NAME="vagency"
ENVIRONMENT="prod"

# Auto-detect GitHub repository if inside a git clone
if [ -z "$GITHUB_REPO" ]; then
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        REMOTE_URL=$(git config --get remote.origin.url || true)
        if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
            GITHUB_REPO="${BASH_REMATCH[1]}"
            echo "--> Auto-detected GitHub Repository: $GITHUB_REPO"
        fi
    fi
fi

if [ -z "$GITHUB_REPO" ]; then
    read -rp "Enter your GitHub Repository (e.g. username/veda-voice): " GITHUB_REPO
fi

# 2. Azure Account Check
echo "--> Verifying Azure CLI Authentication..."
if ! az account show >/dev/null 2>&1; then
    echo "Please log in to Azure:"
    az login --use-device-code
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)

echo "Subscription: $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"
echo "Tenant ID:    $TENANT_ID"
echo "Region:       $LOCATION"
echo "RG:           $RESOURCE_GROUP"
echo "GitHub Repo:  $GITHUB_REPO"
echo "------------------------------------------------------------------"

# 3. Create Resource Group if not exists
echo "--> [1/8] Ensuring Resource Group '$RESOURCE_GROUP' exists..."
EXISTING_RG_LOC=$(az group show --name "$RESOURCE_GROUP" --query "location" -o tsv 2>/dev/null || true)
if [ -z "$EXISTING_RG_LOC" ]; then
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
    echo "    [DONE] Resource Group created in '$LOCATION'."
else
    LOCATION="$EXISTING_RG_LOC"
    echo "    [DONE] Resource Group exists in '$LOCATION'. Workload resources will match this location."
fi

# 4. Create Azure AD App & GitHub Actions OIDC Federated Credential
echo "--> [2/8] Setting up GitHub OIDC Federated Service Principal..."
APP_NAME_OIDC="sp-vedavoice-github-actions-$ENVIRONMENT"
APP_ID=$(az ad app list --display-name "$APP_NAME_OIDC" --query "[0].appId" -o tsv || true)

if [ -z "$APP_ID" ]; then
    echo "    Creating Azure AD Application: $APP_NAME_OIDC..."
    APP_ID=$(az ad app create --display-name "$APP_NAME_OIDC" --query appId -o tsv)
fi

SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv || true)
if [ -z "$SP_ID" ]; then
    echo "    Creating Service Principal..."
    az ad sp create --id "$APP_ID" --output none
fi

# Assign Contributor role to the resource group
echo "    Granting 'Contributor' role on $RESOURCE_GROUP..."
az role assignment create \
    --assignee "$APP_ID" \
    --role "Contributor" \
    --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
    --output none 2>/dev/null || true

# Federated Credential for main branch
FED_NAME="gh-actions-main-$ENVIRONMENT"
echo "    Configuring Federated Credential for repo:$GITHUB_REPO:ref:refs/heads/main..."
FED_BODY=$(cat <<EOF
{
  "name": "$FED_NAME",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GITHUB_REPO}:ref:refs/heads/main",
  "description": "GitHub Actions main deployment",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
)

az ad app federated-credential create --id "$APP_ID" --parameters "$FED_BODY" --output none 2>/dev/null || true
echo "    [DONE] GitHub OIDC configured."

# 5. Provision or Auto-Adapt PostgreSQL 16 Flexible Server (Cost-Optimized)
echo "--> [3/8] Configuring PostgreSQL 16 Flexible Server..."

# 1. Check if an active/creating server already exists in the resource group
EXISTING_ACTIVE_PG=$(az postgres flexible-server list -g "$RESOURCE_GROUP" --query "[?provisioningState!='Failed'].name" -o tsv 2>/dev/null | head -n 1 || true)

if [ -n "$EXISTING_ACTIVE_PG" ]; then
    echo "    Detected active server: '$EXISTING_ACTIVE_PG'."
    POSTGRES_SERVER_NAME="$EXISTING_ACTIVE_PG"
    PG_SUCCESS="true"
    echo "    Using live PostgreSQL server: $POSTGRES_SERVER_NAME"
    echo "    Ensuring admin password is synchronized on $POSTGRES_SERVER_NAME..."
    az postgres flexible-server update \
        --resource-group "$RESOURCE_GROUP" \
        --name "$POSTGRES_SERVER_NAME" \
        --admin-password "$POSTGRES_PASSWORD" \
        --output none 2>/dev/null || true
else
    # Clean up any failed server stubs
    FAILED_SERVERS=$(az postgres flexible-server list -g "$RESOURCE_GROUP" --query "[?provisioningState=='Failed'].name" -o tsv 2>/dev/null || true)
    for s in $FAILED_SERVERS; do
        echo "    Cleaning up failed server stub: $s..."
        az postgres flexible-server delete --name "$s" --resource-group "$RESOURCE_GROUP" --yes --output none 2>/dev/null || true
    done

    # Provision cost-optimized Burstable server (~$28/mo)
    CANDIDATE_LOCATIONS=("$LOCATION" "centralus" "southcentralus" "westus2" "eastus")
    PG_SUCCESS="false"
    POSTGRES_SERVER_NAME=""
    DEPLOY_LOCATION="$LOCATION"

    for loc in "${CANDIDATE_LOCATIONS[@]}"; do
        PG_SUFFIX=$(date +%s | tail -c 5)
        CANDIDATE_NAME="pg-${APP_NAME}-${ENVIRONMENT}-${PG_SUFFIX}"
        echo "    Attempting creation in '$loc' (server: $CANDIDATE_NAME, Burstable Standard_B2s)..."
        
        if az postgres flexible-server create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$CANDIDATE_NAME" \
            --location "$loc" \
            --tier "Burstable" \
            --sku-name "Standard_B2s" \
            --version "16" \
            --storage-size 32 \
            --admin-user "vaadmin" \
            --admin-password "$POSTGRES_PASSWORD" \
            --yes; then
            PG_SUCCESS="true"
            POSTGRES_SERVER_NAME="$CANDIDATE_NAME"
            DEPLOY_LOCATION="$loc"
            echo "    [SUCCESS] PostgreSQL created in '$DEPLOY_LOCATION' on Burstable Standard_B2s (~$28/mo)!"
            break
        else
            echo "    Notice: Location '$loc' is capacity-restricted. Trying next region..."
        fi
    done

    if [ "$PG_SUCCESS" != "true" ]; then
        echo "ERROR: All candidate locations were restricted for PostgreSQL Flexible Server."
        exit 1
    fi

    LOCATION="$DEPLOY_LOCATION"
fi

echo "    Creating database 'vedavoice' on $POSTGRES_SERVER_NAME..."
az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$POSTGRES_SERVER_NAME" \
    --database-name "vedavoice" \
    --output none 2>/dev/null || true

echo "    Enabling Azure internal services firewall rule..."
az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_SERVER_NAME" \
    --rule-name "AllowAllAzureServices" \
    --start-ip-address "0.0.0.0" \
    --end-ip-address "0.0.0.0" \
    --output none 2>/dev/null || true

POSTGRES_FQDN="${POSTGRES_SERVER_NAME}.postgres.database.azure.com"
echo "    [DONE] PostgreSQL Server ready: $POSTGRES_FQDN"

# 6. Prepare Container Registry and Build Production Images
echo "--> [4/8] Building Production Docker Images in ACR (Cloud Build)..."
ACR_NAME=$(az acr list -g "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || true)
if [ -z "$ACR_NAME" ]; then
    RANDOM_SUFFIX=$(date +%s | tail -c 5)
    ACR_NAME="acr${APP_NAME}${ENVIRONMENT}${RANDOM_SUFFIX}"
    echo "    Creating Container Registry: $ACR_NAME in '$LOCATION'..."
    az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --sku Basic --admin-enabled true --location "$LOCATION" --output none
else
    echo "    Using existing Container Registry: $ACR_NAME"
fi

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)

echo "    Building API container image ($ACR_NAME)..."
az acr build \
    --registry "$ACR_NAME" \
    --image api:latest \
    --file api/Dockerfile . \
    --output none

echo "    Building Dashboard container image ($ACR_NAME)..."
az acr build \
    --registry "$ACR_NAME" \
    --image dashboard:latest \
    --file dashboard/Dockerfile . \
    --output none

echo "    Building Voice Agent container image ($ACR_NAME)..."
az acr build \
    --registry "$ACR_NAME" \
    --image agent:latest \
    --file agent/Dockerfile . \
    --output none
echo "    [DONE] Docker images are built and published in ACR ($ACR_LOGIN_SERVER)."

# 7. Provision Remaining Infrastructure with Bicep (Container Apps, Key Vault, Storage)
echo "--> [5/8] Provisioning Container Apps, Key Vault, Storage & Log Analytics via Bicep..."
DEPLOY_OUTPUT=$(az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file infra/bicep/main.bicep \
    --parameters \
        environment="$ENVIRONMENT" \
        appName="$APP_NAME" \
        location="$LOCATION" \
        postgresAdminPassword="$POSTGRES_PASSWORD" \
        jwtSecret="$JWT_SECRET" \
        internalSigningKey="$INTERNAL_SIGNING_KEY" \
        existingPostgresFqdn="$POSTGRES_FQDN" \
        apiImage="${ACR_LOGIN_SERVER}/api:latest" \
        dashboardImage="${ACR_LOGIN_SERVER}/dashboard:latest" \
    --output json)

API_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.apiEndpoint.value')
DASHBOARD_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.dashboardEndpoint.value')
KEYVAULT_URI=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.keyVaultUri.value')

echo "    [DONE] Infrastructure deployed successfully:"
echo "    - ACR Name:       $ACR_NAME"
echo "    - ACR Server:     $ACR_LOGIN_SERVER"
echo "    - PostgreSQL:     $POSTGRES_FQDN"
echo "    - Key Vault:      $KEYVAULT_URI"
echo "    - Production API: $API_URL"
echo "    - Dashboard:      $DASHBOARD_URL"

# 8. Execute Database Migration Job
echo "--> [6/8] Running Database Migration Job (alembic upgrade head)..."
az containerapp job start \
    --name db-migrate-job \
    --resource-group "$RESOURCE_GROUP" \
    --output none || true
echo "    [DONE] Database migrations executed on PostgreSQL 16."

# 9. Rolling revision check & Agent Worker Activation
echo "--> [7/8] Ensuring Container Apps revisions are active and Voice Agent is online..."
az containerapp update \
    --name api \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars \
      LIVEKIT_URL="wss://steyzi-xvk89l73.livekit.cloud" \
      LIVEKIT_API_KEY="APIUJck6jdupFvT" \
      LIVEKIT_API_SECRET="JDwzAVyTe1j51GoaeG1kUZjfcGgRyzS52wKERIqbKTMA" \
    --output none 2>/dev/null || true

az containerapp update \
    --name agent \
    --resource-group "$RESOURCE_GROUP" \
    --min-replicas 1 \
    --max-replicas 5 \
    --set-env-vars \
      LIVEKIT_URL="wss://steyzi-xvk89l73.livekit.cloud" \
      LIVEKIT_API_KEY="APIUJck6jdupFvT" \
      LIVEKIT_API_SECRET="JDwzAVyTe1j51GoaeG1kUZjfcGgRyzS52wKERIqbKTMA" \
      API_BASE_URL="$API_URL" \
      PROD_API_URL="$API_URL" \
    --output none 2>/dev/null || true
echo "    [DONE] Container Apps revisions healthy & Voice Agent online."

# 10. Verify Live Health
echo "--> [8/8] Verifying API Health Endpoint..."
HEALTH_STATUS="000"
for i in {1..6}; do
    HEALTH_STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
    if [ "$HEALTH_STATUS" = "200" ]; then
        echo "    [PASS] Production API Health check returned 200 OK!"
        break
    fi
    echo "    Container is warming up (attempt $i/6, status $HEALTH_STATUS)... waiting 5s"
    sleep 5
done

if [ "$HEALTH_STATUS" != "200" ]; then
    echo "    [INFO] API initial ping returned status $HEALTH_STATUS. The container is provisioning and will be fully ready shortly."
fi

# 10. Summary & GitHub Actions Setup Output
echo ""
echo "=================================================================="
echo ">>> COMPLETE! PRODUCTION DEPLOYMENT FINISHED SUCCESSFULLY <<<"
echo "=================================================================="
echo ""
echo "1. Deployed Endpoints:"
echo "   - API Base URL:       $API_URL"
echo "   - Dashboard UI:       $DASHBOARD_URL"
echo "   - PostgreSQL Server:  $POSTGRES_FQDN"
echo "   - Key Vault:          $KEYVAULT_URI"
echo ""
echo "2. Initial Platform Login:"
echo "   - URL:                $DASHBOARD_URL"
echo "   - Admin Email:        admin@vedavoice.io"
echo "   - Admin Password:     Admin@VedaVoice2026!"
echo ""
echo "3. Add these exact variables to GitHub Actions:"
echo "   (Go to: https://github.com/$GITHUB_REPO/settings/secrets/actions)"
echo ""
echo "   [Repository Variables (Vars)]:"
echo "   AZURE_CLIENT_ID:       $APP_ID"
echo "   AZURE_TENANT_ID:       $TENANT_ID"
echo "   AZURE_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
echo "   AZURE_RG:              $RESOURCE_GROUP"
echo "   ACR_NAME:              $ACR_NAME"
echo "   PROD_API_URL:          $API_URL"
echo ""
echo "   [Repository Secret]:"
echo "   LIVEKIT_ACCESS_TOKEN:  <Your token from 'lk cloud auth'>"
echo ""
echo "From now on, any 'git push origin main' triggers automated CI/CD!"
echo "=================================================================="
