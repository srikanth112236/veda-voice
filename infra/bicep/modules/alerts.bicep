@description('Action Group Resource ID for alerting notifications (email/SMS/webhook)')
param actionGroupId string = ''

@description('API Container App ID')
param apiContainerAppId string

@description('PostgreSQL Server ID')
param postgresServerId string

@description('Azure Region')
param location string = 'global'

// Alert 1: High API 5xx Error Rate (> 2% or > 5 errors in 5 mins)
resource alertApi5xx 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-api-high-5xx-rate'
  location: location
  properties: {
    description: 'Triggers when API 5xx HTTP response count exceeds threshold'
    severity: 1
    enabled: true
    scopes: [
      apiContainerAppId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'High5xxResponses'
          metricNamespace: 'microsoft.app/containerapps'
          metricName: 'Requests'
          operator: 'GreaterThan'
          threshold: 10
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: empty(actionGroupId) ? [] : [
      {
        actionGroupId: actionGroupId
      }
    ]
  }
}

// Alert 2: High PostgreSQL CPU Usage (> 75%)
resource alertPostgresCpu 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-postgres-high-cpu'
  location: location
  properties: {
    description: 'PostgreSQL Flexible Server CPU usage exceeds 75%'
    severity: 2
    enabled: true
    scopes: [
      postgresServerId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpuPercent'
          metricNamespace: 'microsoft.dbforpostgresql/flexibleservers'
          metricName: 'cpu_percent'
          operator: 'GreaterThan'
          threshold: 75
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: empty(actionGroupId) ? [] : [
      {
        actionGroupId: actionGroupId
      }
    ]
  }
}

// Alert 3: High PostgreSQL Storage Usage (> 75%)
resource alertPostgresStorage 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-postgres-high-storage'
  location: location
  properties: {
    description: 'PostgreSQL Flexible Server storage percent exceeds 75%'
    severity: 1
    enabled: true
    scopes: [
      postgresServerId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighStoragePercent'
          metricNamespace: 'microsoft.dbforpostgresql/flexibleservers'
          metricName: 'storage_percent'
          operator: 'GreaterThan'
          threshold: 75
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: empty(actionGroupId) ? [] : [
      {
        actionGroupId: actionGroupId
      }
    ]
  }
}
