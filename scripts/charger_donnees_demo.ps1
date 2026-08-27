[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$encodageUtf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $encodageUtf8
$OutputEncoding = $encodageUtf8

$racineDepot = Split-Path -Parent $PSScriptRoot
$fichierSeed = Join-Path $racineDepot 'database\seeds\001_mvp_demo.sql'
$fichierTest = Join-Path $racineDepot 'tests\sql\mvp_demo_seed_test.sql'

if (-not (Test-Path -LiteralPath $fichierSeed)) {
    throw "Jeu de données introuvable : $fichierSeed"
}

if (-not (Test-Path -LiteralPath $fichierTest)) {
    throw "Test du jeu de données introuvable : $fichierTest"
}

docker cp $fichierSeed 'postgres-crm:/tmp/001_mvp_demo.sql'
if ($LASTEXITCODE -ne 0) {
    throw 'Impossible de copier le jeu de données dans postgres-crm.'
}

docker exec postgres-crm psql `
    -U transcription_user `
    -d transcription_crm `
    -v ON_ERROR_STOP=1 `
    -f /tmp/001_mvp_demo.sql
if ($LASTEXITCODE -ne 0) {
    throw 'Le chargement des données de démonstration a échoué.'
}

docker cp $fichierTest 'postgres-crm:/tmp/mvp_demo_seed_test.sql'
if ($LASTEXITCODE -ne 0) {
    throw 'Impossible de copier le test dans postgres-crm.'
}

docker exec postgres-crm psql `
    -U transcription_user `
    -d transcription_crm `
    -v ON_ERROR_STOP=1 `
    -f /tmp/mvp_demo_seed_test.sql
if ($LASTEXITCODE -ne 0) {
    throw 'La validation des données de démonstration a échoué.'
}

Write-Host 'Donnees de demonstration chargees et validees.'
Write-Host 'Clients : 13 | Interactions : 4 | Documents : 7 | Taches : 4'
