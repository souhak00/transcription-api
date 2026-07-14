param(
  # Modele Ollama attendu par les noeuds d'extraction et de synthese.
  [string]$OllamaModel = "mistral-nemo:latest",

  # Code representant attendu dans la base CRM.
  [string]$RepresentantCode = "2026999999",

  # Chemin optionnel vers un fichier audio pour tester /transcribe/upload.
  [string]$AudioFile = "",

  # Temps maximal d'attente pour l'API, en secondes.
  [int]$ApiTimeoutSeconds = 30
)

# Le script continue les tests meme si un test echoue, puis resume tout a la fin.
$ErrorActionPreference = "Continue"

# Liste globale des resultats de tests.
$Results = New-Object System.Collections.Generic.List[object]

function Add-TestResult {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Detail = ""
  )

  $Results.Add([pscustomobject]@{
    Test   = $Name
    Passed = $Passed
    Detail = $Detail
  }) | Out-Null

  if ($Passed) {
    Write-Host "OK    $Name $Detail" -ForegroundColor Green
  } else {
    Write-Host "ECHEC $Name $Detail" -ForegroundColor Red
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

function Test-IntegerGreaterOrEqual {
  param(
    [string]$Value,
    [int]$Minimum
  )

  $parsed = 0
  if (-not [int]::TryParse($Value, [ref]$parsed)) {
    return $false
  }

  return $parsed -ge $Minimum
}

Write-Host ""
Write-Host "=== TESTS SOLUTION TRANSCRIPTION / CRM ===" -ForegroundColor Cyan

if (-not (Test-Path ".\docker-compose.yml")) {
  Add-TestResult "Racine projet" $false "docker-compose.yml introuvable"
  exit 1
}

Add-TestResult "Racine projet" $true (Resolve-Path ".").Path

foreach ($command in @("git", "docker", "node", "npm", "curl.exe")) {
  Add-TestResult "Commande $command" (Test-CommandAvailable $command)
}

$dockerInfo = ""
$dockerAvailable = $false

if (Test-CommandAvailable "docker") {
  $dockerInfo = Invoke-TextCommand { docker info --format "{{.ServerVersion}}" }
  $dockerAvailable = $dockerInfo -match '^\d+(\.\d+)*'
}

Add-TestResult "Docker Engine accessible" $dockerAvailable $dockerInfo

try {
  $gitBranch = Invoke-TextCommand { git branch --show-current }
  Add-TestResult "Branche Git develop" ($gitBranch -eq "develop") "branche=$gitBranch"
} catch {
  Add-TestResult "Branche Git develop" $false $_.Exception.Message
}

if ($dockerAvailable) {
  try {
    $apiContainer = Invoke-TextCommand { docker ps --filter "name=transcription-api" --format "{{.Names}}" }
    Add-TestResult "Conteneur transcription-api actif" ($apiContainer -eq "transcription-api") $apiContainer
  } catch {
    Add-TestResult "Conteneur transcription-api actif" $false $_.Exception.Message
  }

  try {
    $postgresContainer = Invoke-TextCommand { docker ps --filter "name=postgres-crm" --format "{{.Names}}" }
    Add-TestResult "Conteneur postgres-crm actif" ($postgresContainer -eq "postgres-crm") $postgresContainer
  } catch {
    Add-TestResult "Conteneur postgres-crm actif" $false $_.Exception.Message
  }
} else {
  Add-TestResult "Conteneur transcription-api actif" $false "Docker Engine inaccessible"
  Add-TestResult "Conteneur postgres-crm actif" $false "Docker Engine inaccessible"
}

$apiReady = $false
$healthDetail = ""

for ($i = 1; $i -le $ApiTimeoutSeconds; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -Method Get -TimeoutSec 3
    $apiReady = $health.ok -eq $true
    $healthDetail = ($health | ConvertTo-Json -Compress)
    if ($apiReady) {
      break
    }
  } catch {
    $healthDetail = $_.Exception.Message
    Start-Sleep -Seconds 1
  }
}

Add-TestResult "API health" $apiReady $healthDetail

if ($dockerAvailable) {
  try {
    $dbName = Invoke-TextCommand { docker exec postgres-crm psql -U transcription_user -d transcription_crm -tAc "select current_database();" }
    Add-TestResult "PostgreSQL database" ($dbName -eq "transcription_crm") $dbName
  } catch {
    Add-TestResult "PostgreSQL database" $false $_.Exception.Message
  }

  try {
    $representantCount = Invoke-TextCommand { docker exec postgres-crm psql -U transcription_user -d transcription_crm -tAc "select count(*) from representants where code_representant = '$RepresentantCode';" }
    Add-TestResult "Representant $RepresentantCode" (Test-IntegerGreaterOrEqual $representantCount 1) "count=$representantCount"
  } catch {
    Add-TestResult "Representant $RepresentantCode" $false $_.Exception.Message
  }

  try {
    $badClients = Invoke-TextCommand { docker exec postgres-crm psql -U transcription_user -d transcription_crm -tAc "select count(*) from clients where nom_client in ('undefined', 'null', '') or telephone = 'undefined' or courriel = 'undefined';" }
    Add-TestResult "Aucun client invalide undefined/null" ($badClients -eq "0") "count=$badClients"
  } catch {
    Add-TestResult "Aucun client invalide undefined/null" $false $_.Exception.Message
  }

  try {
    $crmSummary = Invoke-TextCommand { docker exec postgres-crm psql -U transcription_user -d transcription_crm -tAc "select count(*) from clients; select count(*) from interactions;" }
    Add-TestResult "Resume CRM accessible" ($crmSummary -notmatch "permission denied|error|failed") ($crmSummary -replace "`n", " / ")
  } catch {
    Add-TestResult "Resume CRM accessible" $false $_.Exception.Message
  }
} else {
  Add-TestResult "PostgreSQL database" $false "Docker Engine inaccessible"
  Add-TestResult "Representant $RepresentantCode" $false "Docker Engine inaccessible"
  Add-TestResult "Aucun client invalide undefined/null" $false "Docker Engine inaccessible"
  Add-TestResult "Resume CRM accessible" $false "Docker Engine inaccessible"
}

if (Test-CommandAvailable "ollama") {
  try {
    $ollamaList = (& ollama list) -join "`n"
    Add-TestResult "Modele Ollama $OllamaModel" ($ollamaList -match [regex]::Escape($OllamaModel))
  } catch {
    Add-TestResult "Modele Ollama $OllamaModel" $false $_.Exception.Message
  }

  try {
    $body = @{
      model  = $OllamaModel
      stream = $false
      prompt = "Dis bonjour en francais."
    } | ConvertTo-Json

    $ollamaResponse = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60
    Add-TestResult "Ollama API generate" ($ollamaResponse.done -eq $true) $ollamaResponse.response
  } catch {
    Add-TestResult "Ollama API generate" $false $_.Exception.Message
  }
} else {
  Add-TestResult "Commande ollama" $false "absente"
}

$workflowVersioned = ".\n8n-workflows\transcription_local_batch_google_drive.json"
$workflowBackup = ".\backups\n8n_workflow_transcription_local_batch_2026-07-13.json"

Add-TestResult "Workflow n8n versionne" (Test-Path $workflowVersioned) $workflowVersioned
Add-TestResult "Workflow n8n backup" (Test-Path $workflowBackup) $workflowBackup

if ($AudioFile -and (Test-Path $AudioFile)) {
  try {
    $curlOutput = & curl.exe -s -X POST "http://127.0.0.1:3000/transcribe/upload" -F "file=@$AudioFile" -F "language=fr"
    $hasTranscript = $curlOutput -match '"transcript"'
    Add-TestResult "Transcription fichier audio" $hasTranscript "fichier=$AudioFile"
  } catch {
    Add-TestResult "Transcription fichier audio" $false $_.Exception.Message
  }
} elseif ($AudioFile) {
  Add-TestResult "Transcription fichier audio" $false "fichier introuvable: $AudioFile"
} else {
  Add-TestResult "Transcription fichier audio" $true "sautee; fournir -AudioFile pour tester"
}

Write-Host ""
Write-Host "=== RESUME ===" -ForegroundColor Cyan

$failed = @($Results | Where-Object { -not $_.Passed })
$passed = @($Results | Where-Object { $_.Passed })

Write-Host ("Tests reussis: {0}" -f $passed.Count) -ForegroundColor Green
Write-Host ("Tests echoues: {0}" -f $failed.Count) -ForegroundColor $(if ($failed.Count -eq 0) { "Green" } else { "Red" })

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "Tests a corriger:" -ForegroundColor Yellow
  $failed | Format-Table -AutoSize
  exit 1
}

Write-Host ""
Write-Host "Tous les tests automatisables sont passes." -ForegroundColor Green
