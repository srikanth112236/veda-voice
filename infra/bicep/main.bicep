targetScope = 'resourceGroup'

@description('Deployment Environment: dev, staging, or prod')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string = 'prod'

@description('Base workload name')
param appName string = 'vagency'

@description('Azure Region')
param location string = resourceGroup().location

@description('PostgreSQL Admin Password')
@secure()
param postgresAdminPassword string

@description('JWT Secret for token generation')
@secure()
param jwtSecret string

@description('Internal HMAC service-to-service signing key')
@secure()
param internalSigningKey string

@description('Action Group resource ID for alerts (optional)')
param alertActionGroupId string = ''

@description('Optional initial API container image')
param apiImage string = ''

@description('Optional initial Dashboard container image')
param dashboardImage string = ''

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id)
var acrName = 'acr${appName}${environment}${take(uniqueSuffix, 5)}'
var logAnalyticsName = 'log-${appName}-${environment}'
var appInsightsName = 'appi-${appName}-${environment}'
var storageAccountName = 'st${appName}${environment}${take(uniqueSuffix, 5)}'
var keyVaultName = 'kv-${appName}-${environment}-${take(uniqueSuffix, 4)}'
var postgresServerName = 'pg-${appName}-${environment}'
var containerAppEnvName = 'cae-${appName}-${environment}'

// 1. Container Registry
module acrModule 'modules/acr.bicep' = {
  name: 'acrDeployment'
  params: {
    acrName: acrName
    location: location
    sku: environment == 'prod' ? 'Standard' : 'Basic'
  }
}

// 2. Monitoring (Log Analytics & Application Insights)
module monitoringModule 'modules/monitoring.bicep' = {
  name: 'monitoringDeployment'
  params: {
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
    location: location
  }
}

// 3. Blob Storage
module storageModule 'modules/storage.bicep' = {
  name: 'storageDeployment'
  params: {
    storageAccountName: storageAccountName
    location: location
    sku: environment == 'prod' ? 'Standard_ZRS' : 'Standard_LRS'
  }
}

// 4. Key Vault
module keyVaultModule 'modules/keyvault.bicep' = {
  name: 'keyVaultDeployment'
  params: {
    keyVaultName: keyVaultName
    location: location
  }
}

// 5. PostgreSQL Flexible Server
module postgresModule 'modules/postgres.bicep' = {
  name: 'postgresDeployment'
  params: {
    serverName: postgresServerName
    location: location
    adminLogin: 'vaadmin'
    adminPassword: postgresAdminPassword
    skuName: environment == 'prod' ? 'Standard_D2ds_v5' : 'Standard_B2s'
    skuTier: environment == 'prod' ? 'GeneralPurpose' : 'Burstable'
    storageSizeGB: environment == 'prod' ? 64 : 32
    backupRetentionDays: environment == 'prod' ? 30 : 7
  }
}

var databaseUrl = 'postgresql+psycopg://vaadmin:${postgresAdminPassword}@${postgresModule.outputs.postgresServerFqdn}:5432/${postgresModule.outputs.databaseName}?sslmode=require'

// 6. Container Apps & Workers
module containerAppsModule 'modules/containerapps.bicep' = {
  name: 'containerAppsDeployment'
  params: {
    environmentName: containerAppEnvName
    location: location
    logAnalyticsCustomerId: monitoringModule.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: monitoringModule.outputs.logAnalyticsSharedKey
    acrLoginServer: acrModule.outputs.acrLoginServer
    acrUsername: acrModule.outputs.acrName
    acrPassword: acrModule.outputs.acrAdminPassword
    apiImage: empty(apiImage) ? '${acrModule.outputs.acrLoginServer}/api:latest' : apiImage
    dashboardImage: empty(dashboardImage) ? '${acrModule.outputs.acrLoginServer}/dashboard:latest' : dashboardImage
    databaseUrl: databaseUrl
    jwtSecret: jwtSecret
    internalSigningKey: internalSigningKey
  }
}

// 7. Azure Monitor Metric Alerts
module alertsModule 'modules/alerts.bicep' = {
  name: 'alertsDeployment'
  params: {
    apiContainerAppId: resourceId('Microsoft.App/containerApps', 'api')
    postgresServerId: postgresModule.outputs.postgresServerId
    actionGroupId: alertActionGroupId
  }
  dependsOn: [
    containerAppsModule
  ]
}

// Outputs
output acrLoginServer string = acrModule.outputs.acrLoginServer
output acrName string = acrModule.outputs.acrName
output apiEndpoint string = 'https://${containerAppsModule.outputs.apiFqdn}'
output dashboardEndpoint string = 'https://${containerAppsModule.outputs.dashboardFqdn}'
output postgresFqdn string = postgresModule.outputs.postgresServerFqdn
output keyVaultUri string = keyVaultModule.outputs.keyVaultUri
output storageAccountName string = storageModule.outputs.storageAccountName
