[CmdletBinding()]
param(
    [string]$RepresentantCode = "2026999999",
    [string]$Email = "representant-mvp@example.test",
    [string]$DisplayName = "Représentant MVP",
    [switch]$GenerateTemporaryPassword
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

function Get-PlainText([Security.SecureString]$SecureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-UrlSafeSecret {
    $bytes = New-Object byte[] 36
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Read-EnvValue([string]$Name) {
    if (-not (Test-Path -LiteralPath $envPath)) { return $null }
    foreach ($line in [IO.File]::ReadAllLines($envPath)) {
        if ($line -match "^$([regex]::Escape($Name))=(.*)$") {
            return $Matches[1].Trim().Trim('"', "'")
        }
    }
    return $null
}

function Set-EnvValues([hashtable]$Values) {
    # Construire d’abord la liste évite que PowerShell transforme une collection
    # vide en $null lors de son passage dans le pipeline d’affectation.
    $lines = [Collections.Generic.List[string]]::new()
    if (Test-Path -LiteralPath $envPath) {
        $lines.AddRange([string[]][IO.File]::ReadAllLines($envPath))
    }

    foreach ($name in $Values.Keys) {
        $replacement = "$name=$($Values[$name])"
        $index = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^$([regex]::Escape($name))=") {
                $index = $i
                break
            }
        }
        if ($index -ge 0) { $lines[$index] = $replacement } else { $lines.Add($replacement) }
    }

    [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
}

Push-Location $repoRoot
try {
    $representantId = (docker exec postgres-crm psql `
        -U transcription_user `
        -d transcription_crm `
        -tA `
        -c "SELECT representant_id FROM public.representants WHERE code_representant = '$RepresentantCode' AND actif = true LIMIT 1;").Trim()

    if ($LASTEXITCODE -ne 0 -or $representantId -notmatch '^[0-9a-f-]{36}$') {
        throw "Le représentant actif $RepresentantCode est introuvable dans PostgreSQL."
    }

    if ($GenerateTemporaryPassword) {
        $password = New-UrlSafeSecret
        $confirmation = $password
    }
    else {
        $passwordSecure = Read-Host "Mot de passe du représentant Keycloak (12 caractères minimum)" -AsSecureString
        $confirmationSecure = Read-Host "Confirmez le mot de passe" -AsSecureString
        $password = Get-PlainText $passwordSecure
        $confirmation = Get-PlainText $confirmationSecure
        if ($password.Length -lt 12 -or $password -cne $confirmation) {
            throw "Les mots de passe diffèrent ou contiennent moins de 12 caractères."
        }
    }

    $adminUsername = Read-EnvValue "KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME"
    if (-not $adminUsername) { $adminUsername = "admin-local" }
    $adminPassword = Read-EnvValue "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD"
    if (-not $adminPassword -or $adminPassword -eq "remplacer-par-un-secret-local") {
        $adminPassword = New-UrlSafeSecret
    }

    Set-EnvValues @{
        KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME = $adminUsername
        KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD = $adminPassword
    }

    docker compose -p transcription-api up -d keycloak
    if ($LASTEXITCODE -ne 0) { throw "Le conteneur Keycloak n’a pas démarré." }

    $discoveryUrl = "http://localhost:8080/realms/crm-local/.well-known/openid-configuration"
    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            $null = Invoke-RestMethod -Uri $discoveryUrl -TimeoutSec 3
            $ready = $true
            break
        }
        catch { Start-Sleep -Seconds 2 }
    }
    if (-not $ready) { throw "Keycloak n’est pas prêt après deux minutes." }

    $tokenResponse = Invoke-RestMethod `
        -Uri "http://localhost:8080/realms/master/protocol/openid-connect/token" `
        -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body @{
            client_id = "admin-cli"
            grant_type = "password"
            username = $adminUsername
            password = $adminPassword
        }
    $headers = @{ Authorization = "Bearer $($tokenResponse.access_token)" }
    $adminBase = "http://localhost:8080/admin/realms/crm-local"

    # Keycloak 26 conserve uniquement les attributs déclarés dans le profil
    # utilisateur. Le claim CRM est administré côté serveur et n'est jamais
    # modifiable par le représentant lui-même.
    $userProfile = Invoke-RestMethod -Uri "$adminBase/users/profile" -Headers $headers
    $profileAttributeNames = @($userProfile.attributes | ForEach-Object { $_.name })
    if ($profileAttributeNames -notcontains "representant_id") {
        $representativeAttribute = [pscustomobject]@{
            name = "representant_id"
            displayName = "Identifiant représentant CRM"
            validations = @{
                length = @{ min = 36; max = 36 }
            }
            permissions = @{
                view = @("admin")
                edit = @("admin")
            }
            multivalued = $false
            group = "user-metadata"
        }
        $userProfile.attributes = @($userProfile.attributes) + $representativeAttribute
        $userProfilePayload = ConvertTo-Json -InputObject $userProfile -Depth 12
        Invoke-RestMethod `
            -Uri "$adminBase/users/profile" `
            -Method Put `
            -Headers $headers `
            -ContentType "application/json" `
            -Body ([Text.Encoding]::UTF8.GetBytes($userProfilePayload))
    }

    $encodedEmail = [Uri]::EscapeDataString($Email)
    # PowerShell 5 can wrap Keycloak's empty JSON array as one false item when
    # @() is applied directly to Invoke-RestMethod. Enumerating through the
    # pipeline preserves an actual empty collection.
    $usersResponse = Invoke-RestMethod `
        -Uri "$adminBase/users?username=$encodedEmail&exact=true" `
        -Headers $headers
    $users = @($usersResponse | ForEach-Object { $_ })

    $userPayload = @{
        username = $Email
        email = $Email
        firstName = $DisplayName
        enabled = $true
        emailVerified = $true
        attributes = @{ representant_id = @($representantId) }
    } | ConvertTo-Json -Depth 6

    if ($users.Count -eq 0) {
        $created = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri "$adminBase/users" `
            -Method Post `
            -Headers $headers `
            -ContentType "application/json" `
            -Body ([Text.Encoding]::UTF8.GetBytes($userPayload))
        $userId = ($created.Headers.Location -split '/')[-1]
    }
    else {
        $userId = $users[0].id
        Invoke-RestMethod `
            -Uri "$adminBase/users/$userId" `
            -Method Put `
            -Headers $headers `
            -ContentType "application/json" `
            -Body ([Text.Encoding]::UTF8.GetBytes($userPayload))
    }

    $credentialPayload = @{
        type = "password"
        value = $password
        temporary = [bool]$GenerateTemporaryPassword
    } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "$adminBase/users/$userId/reset-password" `
        -Method Put `
        -Headers $headers `
        -ContentType "application/json" `
        -Body ([Text.Encoding]::UTF8.GetBytes($credentialPayload))

    $role = Invoke-RestMethod -Uri "$adminBase/roles/representant" -Headers $headers
    $rolePayload = ConvertTo-Json -InputObject @($role) -Depth 5
    Invoke-RestMethod `
        -Uri "$adminBase/users/$userId/role-mappings/realm" `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body ([Text.Encoding]::UTF8.GetBytes($rolePayload))

    Write-Host "Keycloak est configuré pour $Email."
    Write-Host "Le representant_id est associé au jeton sans être affiché dans l’interface."
    if ($GenerateTemporaryPassword) {
        Write-Host "Mot de passe temporaire (à transmettre de façon sécurisée) : $password"
        Write-Host "Keycloak exigera son remplacement à la première connexion."
    }
    Write-Host "Recréez ensuite l’API avec : docker compose up -d --build transcription-api"
}
finally {
    $password = $null
    $confirmation = $null
    Pop-Location
}
