[CmdletBinding()]
param(
    [string]$Email = "admin-crm@example.test",
    [string]$DisplayName = "Administration CRM"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

function Read-EnvValue([string]$Name) {
    foreach ($line in [IO.File]::ReadAllLines($envPath)) {
        if ($line -match "^$([regex]::Escape($Name))=(.*)$") {
            return $Matches[1].Trim().Trim('"', "'")
        }
    }
    return $null
}

function New-TemporaryPassword {
    $bytes = New-Object byte[] 30
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return "Crm!" + [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "A").Replace("/", "7")
}

Push-Location $repoRoot
try {
    $adminUsername = Read-EnvValue "KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME"
    $adminPassword = Read-EnvValue "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD"
    if (-not $adminUsername -or -not $adminPassword) {
        throw "Les identifiants administrateur Keycloak locaux sont absents du fichier .env."
    }

    $token = Invoke-RestMethod `
        -Uri "http://localhost:8080/realms/master/protocol/openid-connect/token" `
        -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body @{ client_id = "admin-cli"; grant_type = "password"; username = $adminUsername; password = $adminPassword }
    $headers = @{ Authorization = "Bearer $($token.access_token)" }
    $adminBase = "http://localhost:8080/admin/realms/crm-local"
    $encodedEmail = [Uri]::EscapeDataString($Email)
    $response = Invoke-RestMethod -Uri "$adminBase/users?username=$encodedEmail&exact=true" -Headers $headers
    $users = @($response | ForEach-Object { $_ })

    $userPayload = @{
        username = $Email
        email = $Email
        firstName = $DisplayName
        enabled = $true
        emailVerified = $true
        requiredActions = @("UPDATE_PASSWORD")
    } | ConvertTo-Json -Depth 5

    if ($users.Count -eq 0) {
        $created = Invoke-WebRequest -UseBasicParsing -Uri "$adminBase/users" -Method Post `
            -Headers $headers -ContentType "application/json" `
            -Body ([Text.Encoding]::UTF8.GetBytes($userPayload))
        $userId = ($created.Headers.Location -split '/')[-1]
    }
    else {
        $userId = $users[0].id
        Invoke-RestMethod -Uri "$adminBase/users/$userId" -Method Put -Headers $headers `
            -ContentType "application/json" -Body ([Text.Encoding]::UTF8.GetBytes($userPayload))
    }

    $temporaryPassword = New-TemporaryPassword
    $credentialPayload = @{
        type = "password"
        value = $temporaryPassword
        temporary = $true
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$adminBase/users/$userId/reset-password" -Method Put -Headers $headers `
        -ContentType "application/json" -Body ([Text.Encoding]::UTF8.GetBytes($credentialPayload))

    $role = Invoke-RestMethod -Uri "$adminBase/roles/admin" -Headers $headers
    $rolePayload = ConvertTo-Json -InputObject @($role) -Depth 5
    Invoke-RestMethod -Uri "$adminBase/users/$userId/role-mappings/realm" -Method Post -Headers $headers `
        -ContentType "application/json" -Body ([Text.Encoding]::UTF8.GetBytes($rolePayload))

    Write-Host "Le compte administrateur $Email est configuré."
    Write-Host "Mot de passe temporaire : $temporaryPassword"
    Write-Host "Keycloak exigera son remplacement à la première connexion."
}
finally {
    $adminPassword = $null
    $temporaryPassword = $null
    $token = $null
    Pop-Location
}
