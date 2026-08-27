[CmdletBinding()]
param(
    [string]$PostgresContainer = "postgres-crm"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$migrations = @(
    "database\018_suivi_statut_dossier.sql",
    "database\009_dossier_client_agent.sql",
    "database\012_consultation_portefeuille.sql"
)

$running = docker inspect --format '{{.State.Running}}' $PostgresContainer 2>$null
if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
    throw "Le conteneur local '$PostgresContainer' doit être démarré."
}

foreach ($relativePath in $migrations) {
    $migration = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $migration)) {
        throw "Migration introuvable: $migration"
    }

    $targetName = Split-Path -Leaf $migration
    Write-Host "Application de $targetName..."
    docker cp $migration "${PostgresContainer}:/tmp/$targetName"
    if ($LASTEXITCODE -ne 0) { throw "Copie de $targetName impossible." }
    $psqlCommand = 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set ON_ERROR_STOP=1 --file=/tmp/' + $targetName
    docker exec $PostgresContainer sh -c $psqlCommand
    if ($LASTEXITCODE -ne 0) { throw "La migration $targetName a échoué." }
}

Write-Host "Suivi temporel des statuts installé localement."
