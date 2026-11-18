using '../main.bicep'

param environment = 'dev'
param appName = 'vagency'
param location = 'eastus2'
param postgresAdminPassword = 'DevSecurePassword2026!ChangeMe'
param jwtSecret = 'dev-jwt-secret-veda-voice-platform-must-be-at-least-32-chars-long'
param internalSigningKey = 'dev-internal-hmac-signing-key-32-bytes-minimum-length-needed'
param alertActionGroupId = ''
