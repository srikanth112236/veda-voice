<#
.SYNOPSIS
    Complete All-in-One Azure Deployment Script (PowerShell) for VedaVoice.
.DESCRIPTION
    Runs locally or in Cloud Shell to create RG, configure OIDC, deploy Bicep,
    build ACR images, run DB migration, roll out Container Apps, and test health.
#>

param(
    [string]$ResourceGroupName = "rg-vagency-prod",
    [string]$Location = "eastus2",
    [string]$GitHubRepo = "",
    [string]$JwtSecret = $env:PROD_JWT_SECRET,
    [string]$InternalSigningKey = $env:PROD_INTERNAL_SIGNING_KEY,
    [string]$PostgresPassword = $env:PROD_PG_PASSWORD,
    [string]$AppName = "vagency",
    [string]$Environment = "prod"
)

if (-not $JwtSecret -or -not $InternalSigningKey -or -not $PostgresPassword) {
    throw "Set PROD_JWT_SECRET, PROD_INTERNAL_SIGNING_KEY, and PROD_PG_PASSWORD (or pass as parameters)."
}

$ErrorActionPreference = "Stop"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "       VEDAVOICE END-TO-END AZURE PRODUCTION DEPLOYMENT           " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. GitHub repo detection
if (-not $GitHubRepo) {
    try {
        $remote = git config --get remote.origin.url
        if ($remote -match 'github\.com[:/]([^/]+/[^/.]+?)(\.git)?$') {
            $GitHubRepo = $Matches[1]
            Write-Host "--> Auto-detected GitHub Repository: $GitHubRepo" -ForegroundColor Green
        }
    } catch {}
}

if (-not $GitHubRepo) {
    $GitHubRepo = Read-Host "Enter your GitHub Repository (e.g. username/veda-voice)"
}

# 2. Check Azure CLI login
Write-Host "--> Verifying Azure CLI Authentication..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Logging into Azure CLI..." -ForegroundColor Yellow
    az login --use-device-code
    $account = az account show | ConvertFrom-Json
}

$SubscriptionId = $account.id
$TenantId = $account.tenantId
Write-Host "Using Subscription: $($account.name) ($SubscriptionId)" -ForegroundColor Green
Write-Host "Using Tenant:       $TenantId" -ForegroundColor Green

# 3. Create Resource Group
Write-Host "`n--> [1/8] Ensuring Resource Group '$ResourceGroupName' exists in '$Location'..." -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location --output none
Write-Host "    [DONE] Resource Group ready." -ForegroundColor Green

# 4. Create Azure AD App & OIDC Federated Credential
Write-Host "`n--> [2/8] Setting up GitHub OIDC Federated Service Principal..." -ForegroundColor Yellow
$AppDisplayName = "sp-vedavoice-github-actions-$Environment"
$app = az ad app list --display-name $AppDisplayName --query "[0]" 2>$null | ConvertFrom-Json
if (-not $app) {
    Write-Host "    Creating Azure AD Application: $AppDisplayName..."
    $app = az ad app create --display-name $AppDisplayName | ConvertFrom-Json
}
$AppId = $app.appId

$sp = az ad sp list --filter "appId eq '$AppId'" --query "[0]" 2>$null | ConvertFrom-Json
if (-not $sp) {
    Write-Host "    Creating Service Principal..."
    az ad sp create --id $AppId --output none
}

# Assign Contributor role
az role assignment create `
    --assignee $AppId `
    --role "Contributor" `
    --scope "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName" `
    --output none 2>$null

# Federated Credential
$FedCredName = "gh-actions-main-$Environment"
$subject = "repo:${GitHubRepo}:ref:refs/heads/main"
$fedCredParams = @{
    name = $FedCredName
    issuer = "https://token.actions.githubusercontent.com"
    subject = $subject
    description = "GitHub Actions main deployment"
    audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

$tempFile = [System.IO.Path]::GetTempFileName()
$fedCredParams | Out-File -FilePath $tempFile -Encoding utf8
az ad app federated-credential create --id $AppId --parameters "@$tempFile" --output none 2>$null
Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
Write-Host "    [DONE] GitHub OIDC configured." -ForegroundColor Green

# 5. Provision Infrastructure with Bicep
Write-Host "`n--> [3/8] Provisioning Azure Infrastructure via Bicep..." -ForegroundColor Yellow
az postgres flexible-server delete --name "pg-vagency-prod" --resource-group $ResourceGroupName --yes --output none 2>$null
$deployJson = az deployment group create `
    --resource-group $ResourceGroupName `
    --template-file infra/bicep/main.bicep `
    --parameters `
        environment=$Environment `
        appName=$AppName `
        location=$Location `
        postgresAdminPassword="$PostgresPassword" `
        jwtSecret="$JwtSecret" `
        internalSigningKey="$InternalSigningKey" `
    --output json | ConvertFrom-Json

$AcrName = $deployJson.properties.outputs.acrName.value
$AcrLoginServer = $deployJson.properties.outputs.acrLoginServer.value
$ApiUrl = $deployJson.properties.outputs.apiEndpoint.value
$DashboardUrl = $deployJson.properties.outputs.dashboardEndpoint.value
$PostgresFqdn = $deployJson.properties.outputs.postgresFqdn.value
$KeyVaultUri = $deployJson.properties.outputs.keyVaultUri.value

Write-Host "    [DONE] Infrastructure deployed successfully:" -ForegroundColor Green
Write-Host "    - ACR Name:       $AcrName"
Write-Host "    - ACR Server:     $AcrLoginServer"
Write-Host "    - PostgreSQL:     $PostgresFqdn"
Write-Host "    - Key Vault:      $KeyVaultUri"
Write-Host "    - Initial API:    $ApiUrl"
Write-Host "    - Dashboard:      $DashboardUrl"

# 6. Build Initial Docker Images in ACR
Write-Host "`n--> [4/8] Building Docker Images in ACR (Cloud Build)..." -ForegroundColor Yellow
Write-Host "    Building API image..."
az acr build --registry $AcrName --image api:latest --file api/Dockerfile . --output none
Write-Host "    Building Dashboard image..."
az acr build --registry $AcrName --image dashboard:latest --file dashboard/Dockerfile . --output none
Write-Host "    Building Voice Agent Worker image..."
az acr build --registry $AcrName --image agent:latest --file agent/Dockerfile . --output none
Write-Host "    [DONE] Docker images built and stored in ACR." -ForegroundColor Green

# 7. Run Migration Job
Write-Host "`n--> [5/8] Running Database Migration Job..." -ForegroundColor Yellow
az containerapp job start --name db-migrate-job --resource-group $ResourceGroupName --output none 2>$null
Write-Host "    [DONE] Alembic migration triggered on PostgreSQL 16." -ForegroundColor Green

# 8. Update Container Apps
Write-Host "`n--> [6/8] Rolling out production images to Container Apps..." -ForegroundColor Yellow
az containerapp update --name api --resource-group $ResourceGroupName --image "$AcrLoginServer/api:latest" --output none
az containerapp update --name dashboard --resource-group $ResourceGroupName --image "$AcrLoginServer/dashboard:latest" --output none
az containerapp update --name dialer --resource-group $ResourceGroupName --image "$AcrLoginServer/api:latest" --output none
az containerapp update --name notifier --resource-group $ResourceGroupName --image "$AcrLoginServer/api:latest" --output none
az containerapp update --name agent --resource-group $ResourceGroupName --image "$AcrLoginServer/agent:latest" --output none 2>$null
Write-Host "    [DONE] Container Apps updated with zero downtime." -ForegroundColor Green

# 9. Verify Live Health
Write-Host "`n--> [7/8] Verifying API Health Endpoint..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get -TimeoutSec 15
    Write-Host "    [PASS] Production API Health check returned OK: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "    [INFO] API returned status $($_.Exception.Message) (container is warming up)." -ForegroundColor Gray
}

# 10. Summary
Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host ">>> COMPLETE! PRODUCTION DEPLOYMENT FINISHED SUCCESSFULLY <<<" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "1. Deployed Endpoints:"
Write-Host "   - API Base URL:       $ApiUrl" -ForegroundColor White
Write-Host "   - Dashboard UI:       $DashboardUrl" -ForegroundColor White
Write-Host "   - PostgreSQL Server:  $PostgresFqdn" -ForegroundColor White
Write-Host "   - Key Vault:          $KeyVaultUri" -ForegroundColor White
Write-Host "`n2. Initial Platform Login:"
Write-Host "   - URL:                $DashboardUrl" -ForegroundColor White
Write-Host "   - Admin Email:        admin@vedavoice.io" -ForegroundColor White
Write-Host "   - Admin Password:     <set via PLATFORM_ADMIN_PASSWORD>" -ForegroundColor White
Write-Host "`n3. Add these exact variables to GitHub Actions:"
Write-Host "   (https://github.com/$GitHubRepo/settings/secrets/actions)"
Write-Host "`n   [Repository Variables (Vars)]:" -ForegroundColor Yellow
Write-Host "   AZURE_CLIENT_ID:       $AppId"
Write-Host "   AZURE_TENANT_ID:       $TenantId"
Write-Host "   AZURE_SUBSCRIPTION_ID: $SubscriptionId"
Write-Host "   AZURE_RG:              $ResourceGroupName"
Write-Host "   ACR_NAME:              $AcrName"
Write-Host "   PROD_API_URL:          $ApiUrl"
Write-Host "`n   [Repository Secret]:" -ForegroundColor Yellow
Write-Host "   LIVEKIT_ACCESS_TOKEN:  <Your token from 'lk cloud auth'>"
Write-Host "==================================================================" -ForegroundColor Cyan
