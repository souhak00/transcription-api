[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TranscriptPath,

    [string]$WebhookUri = "http://localhost:5678/webhook/crm/analyser-transcription",

    [string]$OutputPath = "$env:USERPROFILE\resultat-analyse-crm.json",

    [ValidateRange(60, 7200)]
    [int]$TimeoutSec = 3600
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $TranscriptPath -PathType Leaf)) {
    throw "Fichier de transcription introuvable : $TranscriptPath"
}

$resolvedTranscriptPath = (Resolve-Path -LiteralPath $TranscriptPath).Path
$transcript = [System.IO.File]::ReadAllText(
    $resolvedTranscriptPath,
    [System.Text.Encoding]::UTF8
)

if ([string]::IsNullOrWhiteSpace($transcript)) {
    throw "Le fichier de transcription est vide : $resolvedTranscriptPath"
}

$payload = ConvertTo-Json -InputObject ([ordered]@{
    source     = [System.IO.Path]::GetFileName($resolvedTranscriptPath)
    transcript = $transcript
}) -Depth 10 -Compress

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Write-Host "Transcription : $resolvedTranscriptPath"
Write-Host "Taille        : $($transcript.Length) caracteres"
Write-Host "Webhook       : $WebhookUri"
Write-Host "Traitement sequentiel en cours; cette operation peut prendre plusieurs minutes."

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    $result = Invoke-RestMethod `
        -Uri $WebhookUri `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) `
        -TimeoutSec $TimeoutSec
}
catch {
    throw "Echec de l'analyse apres $([Math]::Round($stopwatch.Elapsed.TotalMinutes, 1)) minute(s) : $($_.Exception.Message)"
}
finally {
    $stopwatch.Stop()
}

if ($null -eq $result -or
    ($result -is [string] -and [string]::IsNullOrWhiteSpace($result))) {
    throw "Le webhook n'a retourne aucun resultat exploitable. Verifier l'execution n8n."
}

$resultJson = $result | ConvertTo-Json -Depth 50
$resultJson | Set-Content -LiteralPath $OutputPath -Encoding UTF8

Write-Host "Analyse terminee en $([Math]::Round($stopwatch.Elapsed.TotalMinutes, 1)) minute(s)."
Write-Host "Resultat      : $OutputPath"

$result
