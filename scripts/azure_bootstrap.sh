#!/usr/bin/env bash
set -euo pipefail

# Azure Infrastructure & GitHub OIDC Bootstrap Script for VedaVoice
RESOURCE_GROUP="${1:-rg-vagency-prod}"
LOCATION="${2:-eastus2}"
GITHUB_REPO="${3:-your-username/veda-voice}"
ENVIRONMENT="${4:-prod}"

echo "============================================================"
echo "         VEDAVOICE AZURE INFRASTRUCTURE BOOTSTRAP           "
echo "============================================================"

# Check login
if ! az account show >/dev/null 2>&1; then
    echo "Please log in to Azure CLI..."
    az login
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Subscription ID: $SUBSCRIPTION_ID"
echo "Tenant ID:       $TENANT_ID"

# 1. Create Resource Group
echo "--> Creating Resource Group $RESOURCE_GROUP in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none

# 2. Azure AD Application for OIDC
APP_NAME="sp-vedavoice-github-actions-$ENVIRONMENT"
echo "--> Creating Azure AD App: $APP_NAME..."
APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv || true)

if [ -z "$APP_ID" ]; then
    APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
fi

# Service Principal
SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv || true)
if [ -z "$SP_ID" ]; then
    az ad sp create --id "$APP_ID" -o none
fi

# Assign Contributor role
echo "--> Assigning Contributor role to App on Resource Group..."
az role assignment create \
    --assignee "$APP_ID" \
    --role "Contributor" \
    --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
    -o none || true

# Federated Credential for GitHub Actions
echo "--> Creating Federated Credential for $GITHUB_REPO (main branch)..."
FED_NAME="gh-actions-main-$ENVIRONMENT"
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

az ad app federated-credential create --id "$APP_ID" --parameters "$FED_BODY" -o none || true

echo ""
echo "============================================================"
echo "    GITHUB REPOSITORY VARIABLES TO CONFIGURE IN ACTIONS:   "
echo "============================================================"
echo "AZURE_CLIENT_ID:       $APP_ID"
echo "AZURE_TENANT_ID:       $TENANT_ID"
echo "AZURE_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
echo "AZURE_RG:              $RESOURCE_GROUP"
echo "============================================================"
