@description('Azure Container Registry Name')
param acrName string

@description('Array of Service Principal Object IDs to grant AcrPull role')
param principalIds array

// Azure Built-in Role ID: AcrPull (7f951dda-4ed3-4680-a7ca-43fe172d538d)
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (principalId, i) in principalIds: if (!empty(principalId)) {
  name: guid(acr.id, principalId, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]
