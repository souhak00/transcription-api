param(
  # Dossier qui contient les sauvegardes privees recuperees du ZIP Google Drive.
  [string]$BackupDir = ".\backups",

  # Nom du fichier dump PostgreSQL a restaurer.
  [string]$DumpFile = "transcription_crm_2026-07-13.dump",

  # Modele Ollama attendu par le workflow n8n.
  [string]$OllamaModel = "mistral-nemo:latest",

  # Code metier du representant de reference utilise par le workflow.
  [string]$RepresentantCode = "2026999999",

  # Execute la restauration PostgreSQL seulement si ce commutateur est fourni.
  [switch]$RestoreDatabase,

  # Telecharge le modele Ollama s'il est absent.
  [switch]$PullOllamaModel,

  # Saute la construction Docker et demarre seulement les conteneurs existants.
  [switch]$NoBuild
)

# Arrete le script des qu'une commande critique echoue.
$ErrorActionPreference = "Stop"

# Memorise le dossier du projet pour produire des chemins absolus fiables.
$ProjectRoot = (Resolve-Path ".").Path

# Prepare une liste de resultats lisibles en fin d'execution.
$Results = New-Object System.Collections.Generic.List[string]

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Add-Result {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail = ""
  )

  $status = if ($Ok) { "OK" } else { "ECHEC" }
  $line = if ($Detail) { "$status - $Name - $Detail" } else { "$status - $Name" }
  $Results.Add($line) | Out-Null

  if ($Ok) {
    Write-Host $line -ForegroundColor Green
  } else {
    Write-Host $line -ForegroundColor Red
  }
}

function Test-CommandAvailable {
  param([string]$CommandName)

  return [bool](Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Invoke-TextCommand {
  param([scriptblock]$Command)

  return ((& $Command 2>&1) -join "`n").Trim()
}

Write-Step "1. Verification du dossier projet"

if (-not (Test-Path ".\docker-compose.yml")) {
  throw "Le fichier docker-compose.yml est introuvable. Lance ce script depuis la racine du projet."
}

if (-not (Test-Path ".\Dockerfile")) {
  throw "Le fichier Dockerfile est introuvable. Lance ce script depuis la racine du projet."
}

Add-Result "Dossier projet" $true $ProjectRoot

Write-Step "2. Verification des prerequis"

$requiredCommands = @("git", "docker", "node", "npm", "curl.exe")

foreach ($command in $requiredCommands) {
  Add-Result "Commande $command disponible" (Test-CommandAvailable $command)
}

if (-not (Test-CommandAvailable "docker")) {
  throw "Docker est requis pour continuer."
}

Write-Step "3. Verification des sauvegardes locales"

$backupPath = Join-Path $ProjectRoot $BackupDir
$dumpPath = Join-Path $backupPath $DumpFile
$workflowBackup = Join-Path $backupPath "n8n_workflow_transcription_local_batch_2026-07-13.json"
$configBackup = Join-Path $backupPath "CONFIG_REPRISE_N8N_2026-07-13.txt"

Add-Result "Dossier backups" (Test-Path $backupPath) $backupPath
Add-Result "Dump PostgreSQL" (Test-Path $dumpPath) $dumpPath
Add-Result "Export n8n prive" (Test-Path $workflowBackup) $workflowBackup
Add-Result "Fiche de reprise" (Test-Path $configBackup) $configBackup

Write-Step "4. Verification Git"

$gitBranch = Invoke-TextCommand { git branch --show-current }
$gitStatus = Invoke-TextCommand { git status --short }

Add-Result "Branche Git" ($gitBranch -eq "develop") "branche=$gitBranch"
Add-Result "Etat Git propre ou seulement backups ignores" ([string]::IsNullOrWhiteSpace($gitStatus)) $gitStatus

Write-Step "5. Demarrage Docker Compose"

if ($NoBuild) {
  & docker compose up -d
} else {
  & docker compose up --build -d
}

Add-Result "docker compose up" $true "conteneurs demandes"

Write-Step "6. Attente API transcription"

$apiReady = $false

for ($i = 1; $i -le 30; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -Method Get -TimeoutSec 3
    if ($health.ok -eq $true) {
      $apiReady = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

Add-Result "API /health" $apiReady "http://127.0.0.1:3000/health"

if (-not $apiReady) {
  throw "L'API de transcription ne repond pas apres attente."
}

Write-Step "7. Verification PostgreSQL"

$postgresName = Invoke-TextCommand { docker ps --filter "name=postgres-crm" --format "{{.Names}}" }
$postgresRunning = $postgresName -eq "postgres-crm"
Add-Result "Conteneur postgres-crm actif" $postgresRunning

if (-not $postgresRunning) {
  throw "Le conteneur postgres-crm n'est pas actif ou Docker est inaccessible. Detail: $postgresName"
}

$postgresCheck = Invoke-TextCommand { docker exec postgres-crm psql -U transcription_user -d transcription_crm -tAc "select current_database();" }
Add-Result "Connexion PostgreSQL interne" ($postgresCheck -eq "transcription_crm") $postgresCheck

Write-Step "8. Restauration PostgreSQL optionnelle"

if ($RestoreDatabase) {
  if (-not (Test-Path $dumpPath)) {
    throw "Restauration demandee, mais le dump est introuvable: $dumpPath"
  }

  & docker cp $dumpPath "postgres-crm:/tmp/$DumpFile"
  & docker exec postgres-crm psql -U transcription_user -d transcription_crm -c "truncate table documents_requis, taches, interactions, clients restart identity cascade;"
  & docker exec postgres-crm pg_restore -U transcription_user -d transcription_crm --clean --if-exists "/tmp/$DumpFile"

  Add-Result "Restauration PostgreSQL" $true $DumpFile
} else {
  Add-Result "Restauration PostgreSQL" $true "sautee; ajouter -RestoreDatabase pour restaurer le dump"
}

Write-Step "9. Validation representant CRM"

$representantSql = "select count(*) from representants where code_representant = '$RepresentantCode';"
$representantCount = Invoke-TextCommand { docker exec postgres-crm psql -U transcription_user -d transcription_crm -tAc $representantSql }
Add-Result "Representant $RepresentantCode present" ($representantCount -ge 1) "count=$representantCount"

Write-Step "10. Verification Ollama"

if (Test-CommandAvailable "ollama") {
  $ollamaList = (& ollama list) -join "`n"
  $modelExists = $ollamaList -match [regex]::Escape($OllamaModel)

  if (-not $modelExists -and $PullOllamaModel) {
    & ollama pull $OllamaModel
    $ollamaList = (& ollama list) -join "`n"
    $modelExists = $ollamaList -match [regex]::Escape($OllamaModel)
  }

  Add-Result "Modele Ollama $OllamaModel" $modelExists

  try {
    $body = @{
      model  = $OllamaModel
      stream = $false
      prompt = "Retourne uniquement ce JSON: {`"test`":`"ok`"}"
    } | ConvertTo-Json

    $ollamaResponse = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60
    Add-Result "Ollama generate" ($ollamaResponse.done -eq $true) $ollamaResponse.response
  } catch {
    Add-Result "Ollama generate" $false $_.Exception.Message
  }
} else {
  Add-Result "Ollama installe" $false "commande ollama absente"
}

Write-Step "11. Verification exports n8n"

$versionedWorkflow = Join-Path $ProjectRoot "n8n-workflows\transcription_local_batch_google_drive.json"
Add-Result "Workflow n8n versionne" (Test-Path $versionedWorkflow) $versionedWorkflow
Add-Result "Workflow n8n backup prive" (Test-Path $workflowBackup) $workflowBackup

Write-Step "12. Rapport final"

$reportPath = Join-Path $backupPath ("restore_report_{0}.txt" -f (Get-Date -Format "yyyy-MM-dd_HHmmss"))

$report = @()
$report += "RAPPORT INSTALLATION / RESTAURATION"
$report += "Date: $(Get-Date -Format o)"
$report += "Projet: $ProjectRoot"
$report += ""
$report += $Results

if (Test-Path $backupPath) {
  $report | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host "Rapport ecrit: $reportPath" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Etapes manuelles restantes si nouvelle machine:" -ForegroundColor Yellow
Write-Host "1. Importer le workflow n8n depuis backups ou n8n-workflows."
Write-Host "2. Reconnecter les credentials Google Drive, Gmail et PostgreSQL."
Write-Host "3. Verifier les IDs des dossiers Google Drive."
Write-Host "4. Executer scripts\test_solution.ps1 avec un fichier audio de test."
