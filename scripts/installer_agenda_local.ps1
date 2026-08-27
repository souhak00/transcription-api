[CmdletBinding()]
param(
    [string]$PostgresContainer = "postgres-crm",
    [string]$N8nContainer = "N8N_Local",
    [string]$ComposeProject = "transcription-api"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $projectRoot "database\017_agenda_rappels.sql"
$workflow = Join-Path $projectRoot "n8n-workflows\crm_agenda_mvp.json"

if (-not (Test-Path -LiteralPath $migration) -or -not (Test-Path -LiteralPath $workflow)) {
    throw "Les fichiers Agenda requis sont introuvables."
}

foreach ($container in @($PostgresContainer, $N8nContainer)) {
    $running = docker inspect --format '{{.State.Running}}' $container 2>$null
    if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
        throw "Le conteneur local '$container' doit être démarré."
    }
}

Write-Host "Application de la migration PostgreSQL Agenda..."
docker cp $migration "${PostgresContainer}:/tmp/017_agenda_rappels.sql"
if ($LASTEXITCODE -ne 0) { throw "Copie de la migration impossible." }
docker exec $PostgresContainer sh -c 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set ON_ERROR_STOP=1 --file=/tmp/017_agenda_rappels.sql'
if ($LASTEXITCODE -ne 0) { throw "La migration PostgreSQL a échoué." }

Write-Host "Import et activation du workflow n8n Agenda..."
docker cp $workflow "${N8nContainer}:/tmp/crm_agenda_mvp.json"
docker exec $N8nContainer n8n import:workflow --input=/tmp/crm_agenda_mvp.json
docker exec $N8nContainer n8n update:workflow --id=CrmAgendaV1 --active=true
docker restart $N8nContainer | Out-Null

Write-Host "Reconstruction de l'API et de l'interface locale..."
Push-Location $projectRoot
try {
    docker compose -p $ComposeProject up -d --build --no-deps transcription-api
    if ($LASTEXITCODE -ne 0) { throw "La reconstruction du service transcription-api a échoué." }
}
finally {
    Pop-Location
}

Write-Host "Agenda local installé. Ouvrez http://localhost:3000/ puis Agenda."
