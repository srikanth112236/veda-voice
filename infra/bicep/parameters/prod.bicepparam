using '../main.bicep'

param environment = 'prod'
param appName = 'vagency'
param location = 'eastus2'
param postgresAdminPassword = readEnvironmentVariable('PROD_PG_PASSWORD', 'ProdSecurePassword2026!ChangeMeNow')
param jwtSecret = readEnvironmentVariable('PROD_JWT_SECRET', 'prod-jwt-secret-veda-voice-platform-must-be-at-least-32-chars-long')
param internalSigningKey = readEnvironmentVariable('PROD_INTERNAL_SIGNING_KEY', 'prod-internal-hmac-signing-key-32-bytes-minimum-length-needed')
param alertActionGroupId = ''
