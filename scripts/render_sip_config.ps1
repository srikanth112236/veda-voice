<#
.SYNOPSIS
    Renders LiveKit SIP configuration templates by substituting environment variables into *.local.json.

.DESCRIPTION
    Replaces ${VAR_NAME} placeholders from current process environment or .env/.env.local files
    into local configuration files (e.g. infra/sip/outbound-trunk.local.json), which are git-ignored.

.EXAMPLE
    .\scripts\render_sip_config.ps1 -Template infra/sip/outbound-trunk.example.json -Output infra/sip/outbound-trunk.local.json
#>

[CmdletBinding()]
param (
    [string]$Template = "infra/sip/outbound-trunk.example.json",
    [string]$Output = "infra/sip/outbound-trunk.local.json"
)

$ErrorActionPreference = "Stop"

# Load .env.local first if it exists, then .env
function Load-EnvFile ([string]$Path) {
    if (Test-Path $Path) {
        Get-Content $Path | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $parts = $line.Split("=", 2)
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                    [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
                }
            }
        }
    }
}

Load-EnvFile ".env.local"
Load-EnvFile ".env"

if (-not (Test-Path $Template)) {
    Write-Error "Template file not found at: $Template"
}

$content = Get-Content $Template -Raw

# Match pattern ${VAR_NAME}
$pattern = '\$\{([A-Z0-9_]+)\}'
$matches = [regex]::Matches($content, $pattern)

foreach ($m in $matches) {
    $varName = $m.Groups[1].Value
    $envVal = [System.Environment]::GetEnvironmentVariable($varName)
    if ($null -eq $envVal) {
        Write-Warning "Environment variable `$$varName is not set. Leaving placeholder ${varName} intact."
    } else {
        $content = $content.Replace($m.Value, $envVal)
    }
}

$outputDir = Split-Path $Output -Parent
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Set-Content -Path $Output -Value $content -NoNewline
Write-Host "Rendered $Template -> $Output"
