@description('Azure Container Registry Name')
param acrName string

@description('Azure Region')
param location string = resourceGroup().location

@description('ACR SKU')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param sku string = 'Basic'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
}

output acrId string = acr.id
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
#disable-next-line outputs-should-not-contain-secrets
@secure()
output acrAdminPassword string = acr.listCredentials().passwords[0].value
