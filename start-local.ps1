$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$node = "C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$pythonPackages = Join-Path $projectRoot ".runtime\python-packages"
$ffmpegBin = Join-Path $projectRoot ".runtime\ffmpeg\ffmpeg-8.1.2-essentials_build\bin"

if (-not (Test-Path -LiteralPath $node)) {
    throw "Node.js est introuvable: $node"
}

if (-not (Test-Path -LiteralPath (Join-Path $ffmpegBin "ffmpeg.exe"))) {
    throw "FFmpeg est introuvable dans .runtime."
}

$env:PYTHONPATH = $pythonPackages
$env:PATH = "$ffmpegBin;$env:PATH"

Set-Location -LiteralPath $projectRoot
& $node "src/server.js"
