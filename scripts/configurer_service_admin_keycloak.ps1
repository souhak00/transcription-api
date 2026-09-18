[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$clientId = "crm-admin-api"

function Read-EnvValue([string]$Name) {
    foreach ($line in [IO.File]::ReadAllLines($envPath)) {
        if ($line -match "^$([regex]::Escape($Name))=(.*)$") {
            return $Matches[1].Trim().Trim('"', "'")
        }
    }
    return $null
}

function Set-EnvValue([string]$Name, [string]$Value) {
    $lines = [Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]][IO.File]::ReadAllLines($envPath))
    $replacement = "$Name=$Value"
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$([regex]::Escape($Name))=") {
            $lines[$i] = $replacement
            [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
            return
        }
    }
    $lines.Add($replacement)
    [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
}

function Invoke-KeycloakJson {
    param(
        [string]$Uri,
        [string]$Method = "Get",
        [hashtable]$Headers,
        $Body
    )
    $parameters = @{
        Uri = $Uri
        Method = $Method
        Headers = $Headers
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $parameters.Body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Body -Depth 12))
    }
    try {
        Invoke-RestMethod @parameters
    }
    catch {
        Write-Host "Échec de l’appel Keycloak : $Method $Uri" -ForegroundColor Red
        throw
    }
}

Push-Location $repoRoot
try {
    $adminUsername = Read-EnvValue "KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME"
    $adminPassword = Read-EnvValue "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD"
    if (-not $adminUsername -or -not $adminPassword) {
        throw "Les identifiants administrateur Keycloak locaux sont absents du fichier .env."
    }

    docker compose up -d keycloak
    if ($LASTEXITCODE -ne 0) { throw "Keycloak n’a pas démarré." }

    $token = Invoke-RestMethod `
        -Uri "http://localhost:8080/realms/master/protocol/openid-connect/token" `
        -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body @{
            client_id = "admin-cli"
            grant_type = "password"
            username = $adminUsername
            password = $adminPassword
        }
    $headers = @{ Authorization = "Bearer $($token.access_token)" }
    $realmAdminBase = "http://localhost:8080/admin/realms/crm-local"

    try {
        $null = Invoke-KeycloakJson -Uri "$realmAdminBase/roles/admin" -Headers $headers
    }
    catch {
        $null = Invoke-KeycloakJson -Uri "$realmAdminBase/roles" -Method Post -Headers $headers -Body @{
            name = "admin"
            description = "Administration des comptes et de la plateforme CRM"
        }
    }

    $clientResponse = Invoke-KeycloakJson `
        -Uri "$realmAdminBase/clients?clientId=$clientId" `
        -Headers $headers
    $clients = @($clientResponse | ForEach-Object { $_ })
    if ($clients.Count -eq 0) {
        $null = Invoke-KeycloakJson -Uri "$realmAdminBase/clients" -Method Post -Headers $headers -Body @{
            clientId = $clientId
            name = "Service d’administration CRM"
            enabled = $true
            publicClient = $false
            bearerOnly = $false
            serviceAccountsEnabled = $true
            standardFlowEnabled = $false
            directAccessGrantsEnabled = $false
            protocol = "openid-connect"
        }
        $clientResponse = Invoke-KeycloakJson `
            -Uri "$realmAdminBase/clients?clientId=$clientId" `
            -Headers $headers
        $clients = @($clientResponse | ForEach-Object { $_ })
    }
    $clientUuid = $clients[0].id

    $serviceUser = Invoke-KeycloakJson `
        -Uri "$realmAdminBase/clients/$clientUuid/service-account-user" `
        -Headers $headers
    $realmManagement = @(Invoke-KeycloakJson `
        -Uri "$realmAdminBase/clients?clientId=realm-management" `
        -Headers $headers)[0]
    $manageUsersRole = Invoke-KeycloakJson `
        -Uri "$realmAdminBase/clients/$($realmManagement.id)/roles/manage-users" `
        -Headers $headers
    $null = Invoke-KeycloakJson `
        -Uri "$realmAdminBase/users/$($serviceUser.id)/role-mappings/clients/$($realmManagement.id)" `
        -Method Post `
        -Headers $headers `
        -Body @($manageUsersRole)

    $secret = Invoke-KeycloakJson `
        -Uri "$realmAdminBase/clients/$clientUuid/client-secret" `
        -Headers $headers
    Set-EnvValue "KEYCLOAK_ADMIN_CLIENT_ID" $clientId
    Set-EnvValue "KEYCLOAK_ADMIN_CLIENT_SECRET" $secret.value

    Write-Host "Le compte technique Keycloak $clientId est configuré."
    Write-Host "Seul le rôle realm-management/manage-users lui est attribué."
}
finally {
    $adminPassword = $null
    $token = $null
    $secret = $null
    Pop-Location
}
