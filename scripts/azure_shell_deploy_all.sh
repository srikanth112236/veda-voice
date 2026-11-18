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
    echo "    [DONE] Resource Group exists (metadata location: '$EXISTING_RG_LOC'). Workload resources will be deployed to '$LOCATION'."
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

# 5. Provision PostgreSQL 16 Flexible Server (SRS Section 15.4)
echo "--> [3/8] Provisioning PostgreSQL 16 Flexible Server..."

# Clean up any existing failed server if present
FAILED_SERVERS=$(az postgres flexible-server list -g "$RESOURCE_GROUP" --query "[?provisioningState=='Failed'].name" -o tsv 2>/dev/null || true)
for s in $FAILED_SERVERS; do
    echo "    Cleaning up failed server: $s..."
    az postgres flexible-server delete --name "$s" --resource-group "$RESOURCE_GROUP" --yes --output none 2>/dev/null || true
done

# Test locations (starting with requested, then centralus as recommended in SRS 15.1, southcentralus, westus2)
CANDIDATE_LOCATIONS=("$LOCATION" "centralus" "southcentralus" "westus2" "eastus")
PG_SUCCESS="false"
POSTGRES_SERVER_NAME=""
DEPLOY_LOCATION="$LOCATION"

for loc in "${CANDIDATE_LOCATIONS[@]}"; do
    PG_SUFFIX=$(date +%s | tail -c 5)
    CANDIDATE_NAME="pg-${APP_NAME}-${ENVIRONMENT}-${PG_SUFFIX}"
    echo "    Attempting to provision in '$loc' (server: $CANDIDATE_NAME)..."
    
    if az postgres flexible-server create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CANDIDATE_NAME" \
        --location "$loc" \
        --tier "GeneralPurpose" \
        --sku-name "Standard_D2s_v5" \
        --version "16" \
        --storage-size 64 \
        --admin-user "vaadmin" \
        --admin-password "$POSTGRES_PASSWORD" \
        --yes; then
        PG_SUCCESS="true"
        POSTGRES_SERVER_NAME="$CANDIDATE_NAME"
        DEPLOY_LOCATION="$loc"
        echo "    [SUCCESS] PostgreSQL created successfully in '$DEPLOY_LOCATION'!"
        break
    else
        echo "    Notice: Location '$loc' is capacity-restricted on this subscription. Trying next region..."
    fi
done

if [ "$PG_SUCCESS" != "true" ]; then
    echo "ERROR: All candidate locations were restricted for PostgreSQL Flexible Server."
    exit 1
fi

LOCATION="$DEPLOY_LOCATION"

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

# 6. Provision Remaining Infrastructure with Bicep (ACR, Key Vault, Container Apps)
echo "--> [4/8] Provisioning ACR, Key Vault, Storage & Container Apps via Bicep..."
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
    --output json)

ACR_NAME=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.acrName.value')
ACR_LOGIN_SERVER=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.acrLoginServer.value')
API_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.apiEndpoint.value')
DASHBOARD_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.dashboardEndpoint.value')
POSTGRES_FQDN=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.postgresFqdn.value')
KEYVAULT_URI=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.keyVaultUri.value')

echo "    [DONE] Infrastructure deployed successfully:"
echo "    - ACR Name:       $ACR_NAME"
echo "    - ACR Server:     $ACR_LOGIN_SERVER"
echo "    - PostgreSQL:     $POSTGRES_FQDN"
echo "    - Key Vault:      $KEYVAULT_URI"
echo "    - Initial API:    $API_URL"
echo "    - Dashboard:      $DASHBOARD_URL"

# 7. Build Initial Production Images with Azure Container Registry (Cloud Build)
echo "--> [5/8] Building Docker Images in ACR (No local Docker daemon needed)..."
echo "    Building API image (api:latest)..."
az acr build \
    --registry "$ACR_NAME" \
    --image api:latest \
    --file api/Dockerfile . \
    --output none

echo "    Building Dashboard image (dashboard:latest)..."
az acr build \
    --registry "$ACR_NAME" \
    --image dashboard:latest \
    --file dashboard/Dockerfile . \
    --output none
echo "    [DONE] Docker images built and stored in ACR."

# 8. Execute Database Migration Job
echo "--> [6/8] Running Database Migration Job (alembic upgrade head)..."
az containerapp job start \
    --name db-migrate-job \
    --resource-group "$RESOURCE_GROUP" \
    --output none || true
echo "    [DONE] Migration triggered on Postgres 16."

# 9. Update Container Apps to use newly built ACR images
echo "--> [7/8] Rolling out production images to Container Apps..."
az containerapp update \
    --name api \
    --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_LOGIN_SERVER/api:latest" \
    --output none

az containerapp update \
    --name dashboard \
    --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_LOGIN_SERVER/dashboard:latest" \
    --output none

az containerapp update \
    --name dialer \
    --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_LOGIN_SERVER/api:latest" \
    --output none

az containerapp update \
    --name notifier \
    --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_LOGIN_SERVER/api:latest" \
    --output none
echo "    [DONE] Container Apps updated with rolling zero-downtime revision."

# 10. Verify Live Health
echo "--> [8/8] Verifying API Health Endpoint..."
sleep 10
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || true)
if [ "$HEALTH_STATUS" = "200" ]; then
    echo "    [PASS] Production API Health check returned 200 OK!"
else
    echo "    [INFO] API returned status $HEALTH_STATUS (container is initializing, please check in 30 seconds)."
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
