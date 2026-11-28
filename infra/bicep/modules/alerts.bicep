@description('Action Group Resource ID for alerting notifications (email/SMS/webhook)')
param actionGroupId string = ''

@description('API Container App ID')
param apiContainerAppId string

@description('PostgreSQL Server ID')
param postgresServerId string

@description('Azure Region')
param location string = 'global'

// Alert 1: High API 5xx Error Rate (> 2% or excessive 5xx responses in 5 mins - SRS 17.1)
resource alertApi5xx 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-api-high-5xx-rate'
  location: location
  properties: {
    description: 'Triggers when API 5xx HTTP response count exceeds threshold (SRS 17.1)'
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
          dimensions: [
            {
              name: 'statusCode'
              operator: 'Include'
              values: [
                '5xx'
              ]
            }
          ]
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

// Alert 2: API Response Latency Degradation (> 2.5s P95 latency - SRS 17.1)
resource alertApiLatency 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-api-latency-sla'
  location: location
  properties: {
    description: 'Triggers when API average response time exceeds 2500ms (SRS 17.1)'
    severity: 2
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
          name: 'HighResponseTime'
          metricNamespace: 'microsoft.app/containerapps'
          metricName: 'ResponseTime'
          operator: 'GreaterThan'
          threshold: 2500
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

// Alert 3: Container Replica Crash / Restart Loop (> 2 restarts in 5m)
resource alertContainerRestarts 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-api-restart-loop'
  location: location
  properties: {
    description: 'Triggers when Container App replica restarts exceed threshold'
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
          name: 'ContainerRestartCount'
          metricNamespace: 'microsoft.app/containerapps'
          metricName: 'RestartCount'
          operator: 'GreaterThan'
          threshold: 2
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

// Alert 4: High PostgreSQL CPU Usage (> 75% - SRS 17.1)
resource alertPostgresCpu 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(postgresServerId)) {
  name: 'alert-postgres-high-cpu'
  location: location
  properties: {
    description: 'PostgreSQL Flexible Server CPU usage exceeds 75% (SRS 17.1)'
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

// Alert 5: High PostgreSQL Storage Usage (> 75% - SRS 17.1)
resource alertPostgresStorage 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(postgresServerId)) {
  name: 'alert-postgres-high-storage'
  location: location
  properties: {
    description: 'PostgreSQL Flexible Server storage percent exceeds 75% (SRS 17.1)'
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
