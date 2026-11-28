using '../main.bicep'

param environment = 'prod'
param appName = 'vagency'
param location = 'eastus2'
param postgresAdminPassword = readEnvironmentVariable('PROD_PG_PASSWORD')
param jwtSecret = readEnvironmentVariable('PROD_JWT_SECRET')
param internalSigningKey = readEnvironmentVariable('PROD_INTERNAL_SIGNING_KEY')
param alertActionGroupId = ''
