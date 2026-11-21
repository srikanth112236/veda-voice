using '../main.bicep'

param environment = 'staging'
param appName = 'vagency'
param location = 'eastus2'
param postgresAdminPassword = readEnvironmentVariable('STAGING_PG_PASSWORD', 'StagingSecurePassword2026!ChangeMe')
param jwtSecret = readEnvironmentVariable('STAGING_JWT_SECRET', 'staging-jwt-secret-veda-voice-platform-must-be-at-least-32-chars-long')
param internalSigningKey = readEnvironmentVariable('STAGING_INTERNAL_SIGNING_KEY', 'staging-internal-hmac-signing-key-32-bytes-minimum-length-needed')
param alertActionGroupId = ''
param postgresSkuName = 'Standard_B2s'
param postgresSkuTier = 'Burstable'
