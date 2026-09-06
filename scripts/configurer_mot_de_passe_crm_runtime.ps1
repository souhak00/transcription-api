[CmdletBinding()]
param(
    [string]$ContainerName = "postgres-crm",
    [string]$AdminUser = "transcription_user",
    [string]$DatabaseName = "transcription_crm"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker est introuvable dans le PATH."
}

$containerStatus = & docker inspect `
    --format "{{.State.Running}}" `
    $ContainerName 2>$null

if ($LASTEXITCODE -ne 0 -or $containerStatus -ne "true") {
    throw "Le conteneur PostgreSQL '$ContainerName' n'est pas actif."
}

$firstSecure = Read-Host `
    "Nouveau mot de passe crm_runtime (16 caractères minimum)" `
    -AsSecureString
$secondSecure = Read-Host "Confirmer le mot de passe" -AsSecureString

$firstPointer = [IntPtr]::Zero
$secondPointer = [IntPtr]::Zero
$firstPlain = $null
$secondPlain = $null

try {
    $firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $firstSecure
    )
    $secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $secondSecure
    )
    $firstPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        $firstPointer
    )
    $secondPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        $secondPointer
    )

    if ($firstPlain.Length -lt 16) {
        throw "Le mot de passe doit contenir au moins 16 caractères."
    }
    if ($firstPlain -ne $secondPlain) {
        throw "Les deux mots de passe ne correspondent pas."
    }
    if ($firstPlain.IndexOfAny([char[]]@("`r", "`n", [char]0)) -ge 0) {
        throw "Le mot de passe ne peut pas contenir de retour de ligne."
    }

    $escapedPassword = $firstPlain.Replace("'", "''")
    $sql = "ALTER ROLE crm_runtime PASSWORD '$escapedPassword';"

    $sql | & docker exec -i $ContainerName `
        psql `
        -U $AdminUser `
        -d $DatabaseName `
        -v ON_ERROR_STOP=1 `
        -q

    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL a refusé la modification du rôle crm_runtime."
    }

    Write-Host "Mot de passe crm_runtime configuré avec succès."
    Write-Host "Créez maintenant l'identifiant PostgreSQL crm_runtime dans n8n."
}
finally {
    $firstPlain = $null
    $secondPlain = $null
    $sql = $null
    $escapedPassword = $null

    if ($firstPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)
    }
    if ($secondPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)
    }
}
