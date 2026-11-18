<#
.SYNOPSIS
    Bootstrap script for Azure Resource Group, Bicep Deployment, and GitHub OIDC.
.DESCRIPTION
    Creates resource group, provisions Azure resources using Bicep, and creates
    the GitHub OIDC service principal so GitHub Actions can push and deploy.
#>

param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName = "rg-vagency-prod",
    [string]$Location = "eastus2",
    [string]$GitHubOrgOrUser = "your-github-username",
    [string]$GitHubRepo = "veda-voice",
    [string]$Environment = "prod"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         VEDAVOICE AZURE INFRASTRUCTURE BOOTSTRAP           " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Login check
Write-Host "--> Checking Azure CLI authentication..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Please login to Azure using 'az login' first." -ForegroundColor Red
    az login
    $account = az account show | ConvertFrom-Json
}

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
} else {
    $SubscriptionId = $account.id
}
$TenantId = $account.tenantId
Write-Host "Using Subscription: $SubscriptionId ($($account.name))" -ForegroundColor Green
Write-Host "Using Tenant:       $TenantId" -ForegroundColor Green

# 2. Create Resource Group
Write-Host "--> Ensuring Resource Group '$ResourceGroupName' exists in '$Location'..." -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location --output none
Write-Host "Resource Group ready." -ForegroundColor Green

# 3. Create Azure AD App for GitHub OIDC
$AppName = "sp-vedavoice-github-actions-$Environment"
Write-Host "--> Configuring GitHub OIDC Application: $AppName..." -ForegroundColor Yellow

$app = az ad app list --display-name $AppName --query "[0]" 2>$null | ConvertFrom-Json
if (-not $app) {
    Write-Host "Creating Azure AD Application..."
    $app = az ad app create --display-name $AppName | ConvertFrom-Json
}
$AppId = $app.appId
Write-Host "App ID: $AppId" -ForegroundColor Green

# Create Service Principal
$sp = az ad sp list --filter "appId eq '$AppId'" --query "[0]" 2>$null | ConvertFrom-Json
if (-not $sp) {
    Write-Host "Creating Service Principal..."
    $sp = az ad sp create --id $AppId | ConvertFrom-Json
}

# Assign Contributor role on the Resource Group
Write-Host "--> Assigning 'Contributor' role on Resource Group..." -ForegroundColor Yellow
az role assignment create `
    --assignee $AppId `
    --role "Contributor" `
    --scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName" `
    --output none 2>$null

# Configure Federated Identity Credential for main branch
$FedCredName = "github-actions-main"
Write-Host "--> Configuring Federated Identity Credential for repo $GitHubOrgOrUser/$GitHubRepo (branch: main)..." -ForegroundColor Yellow

$subject = "repo:${GitHubOrgOrUser}/${GitHubRepo}:ref:refs/heads/main"
$fedCredParams = @{
    name = $FedCredName
    issuer = "https://token.actions.githubusercontent.com"
    subject = $subject
    description = "GitHub Actions CI/CD for VedaVoice main branch"
    audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

# Save temporary json for az ad app federated-credential
$tempFile = [System.IO.Path]::GetTempFileName()
$fedCredParams | Out-File -FilePath $tempFile -Encoding utf8

az ad app federated-credential create --id $AppId --parameters "@$tempFile" 2>$null
Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "`n>>> GITHUB ACTIONS SECRETS & VARIABLES TO CONFIGURE <<<" -ForegroundColor Green
Write-Host "Add these variables under GitHub Repository Settings -> Secrets and variables -> Actions:" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Repository Variables (Vars):" -ForegroundColor Cyan
Write-Host "  AZURE_CLIENT_ID:       $AppId"
Write-Host "  AZURE_TENANT_ID:       $TenantId"
Write-Host "  AZURE_SUBSCRIPTION_ID: $SubscriptionId"
Write-Host "  AZURE_RG:              $ResourceGroupName"
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

Write-Host "`n--> Next: To deploy initial infrastructure with Bicep, run:" -ForegroundColor Yellow
Write-Host "az deployment group create --resource-group $ResourceGroupName --template-file infra/bicep/main.bicep --parameters infra/bicep/parameters/prod.bicepparam" -ForegroundColor White
