@description('Container Apps Environment Name')
param environmentName string

@description('Log Analytics Workspace Customer ID')
param logAnalyticsCustomerId string

@description('Log Analytics Workspace Shared Key')
@secure()
param logAnalyticsSharedKey string

@description('ACR Login Server')
param acrLoginServer string

@description('ACR Admin Username')
param acrUsername string

@description('ACR Admin Password')
@secure()
param acrPassword string

@description('API Container Image')
param apiImage string

@description('Dashboard Container Image')
param dashboardImage string

@description('Voice Agent Worker Container Image')
param agentImage string = ''

@description('Database Connection URL')
@secure()
param databaseUrl string

@description('JWT Secret Key')
@secure()
param jwtSecret string

@description('Internal Service Signing Key')
@secure()
param internalSigningKey string

@description('LiveKit Cloud WebSocket URL')
param livekitUrl string = ''

@description('LiveKit API Key')
@secure()
param livekitApiKey string = ''

@description('LiveKit API Secret')
@secure()
param livekitApiSecret string = ''

@description('LiveKit SIP Inbound Trunk ID')
param livekitInboundTrunkId string = 'ST_inbound_livekit_scale'

@description('LiveKit SIP Outbound Trunk ID')
param livekitOutboundTrunkId string = 'ST_outbound_twilio_elastic'

@description('Azure Region')
param location string = resourceGroup().location

// 1. Container Apps Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

// 2. FastAPI API Service
resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'api'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        allowInsecure: false
        transport: 'auto'
      }
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'db-url'
          value: databaseUrl
        }
        {
          name: 'jwt-sec'
          value: jwtSecret
        }
        {
          name: 'signing-key'
          value: internalSigningKey
        }
        {
          name: 'livekit-api-key'
          value: livekitApiKey
        }
        {
          name: 'livekit-api-secret'
          value: livekitApiSecret
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'db-url'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-sec'
            }
            {
              name: 'INTERNAL_SIGNING_KEY'
              secretRef: 'signing-key'
            }
            {
              name: 'LIVEKIT_SIP_INBOUND_TRUNK_ID'
              value: livekitInboundTrunkId
            }
            {
              name: 'LIVEKIT_SIP_OUTBOUND_TRUNK_ID'
              value: livekitOutboundTrunkId
            }
            {
              name: 'LIVEKIT_URL'
              value: livekitUrl
            }
            {
              name: 'LIVEKIT_API_KEY'
              secretRef: 'livekit-api-key'
            }
            {
              name: 'LIVEKIT_API_SECRET'
              secretRef: 'livekit-api-secret'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 4
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// 3. Next.js Dashboard Frontend
resource dashboardApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'dashboard'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        transport: 'auto'
      }
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dashboard'
          image: dashboardImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'NEXT_PUBLIC_API_URL'
              value: 'https://${apiApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'INTERNAL_API_URL'
              value: 'https://${apiApp.properties.configuration.ingress.fqdn}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// 4. Outbound Dialer Worker
resource dialerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'dialer'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'db-url'
          value: databaseUrl
        }
        {
          name: 'signing-key'
          value: internalSigningKey
        }
        {
          name: 'livekit-api-key'
          value: livekitApiKey
        }
        {
          name: 'livekit-api-secret'
          value: livekitApiSecret
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dialer'
          image: apiImage
          command: ['python', '-m', 'agent.outbound.dialer']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'db-url'
            }
            {
              name: 'INTERNAL_SIGNING_KEY'
              secretRef: 'signing-key'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

// 5. Notifier Worker (Emails, SMS & Reminders)
resource notifierApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'notifier'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'db-url'
          value: databaseUrl
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'notifier'
          image: apiImage
          command: ['python', '-m', 'api.app.services.notifier']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'db-url'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

// 6. Voice Agent Worker (LiveKit Cloud Voice Receptionist)
resource agentApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'agent'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'signing-key'
          value: internalSigningKey
        }
        {
          name: 'livekit-api-key'
          value: livekitApiKey
        }
        {
          name: 'livekit-api-secret'
          value: livekitApiSecret
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'agent'
          image: !empty(agentImage) ? agentImage : '${acrLoginServer}/agent:latest'
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            {
              name: 'LIVEKIT_URL'
              value: livekitUrl
            }
            {
              name: 'LIVEKIT_API_KEY'
              secretRef: 'livekit-api-key'
            }
            {
              name: 'LIVEKIT_API_SECRET'
              secretRef: 'livekit-api-secret'
            }
            {
              name: 'API_BASE_URL'
              value: 'https://${apiApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'INTERNAL_SIGNING_KEY'
              secretRef: 'signing-key'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

// 7. Database Migration Job (One-shot execution triggered before release)
resource migrationJob 'Microsoft.App/jobs@2023-05-01' = {
  name: 'db-migrate-job'
  location: location
  properties: {
    environmentId: containerAppEnv.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 1
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'db-url'
          value: databaseUrl
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migration'
          image: apiImage
          command: ['alembic', '-c', 'api/alembic.ini', 'upgrade', 'head']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'db-url'
            }
          ]
        }
      ]
    }
  }
}

output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output dashboardFqdn string = dashboardApp.properties.configuration.ingress.fqdn
output apiPrincipalId string = apiApp.identity.principalId
output dialerPrincipalId string = dialerApp.identity.principalId
output notifierPrincipalId string = notifierApp.identity.principalId
output migrationJobName string = migrationJob.name
