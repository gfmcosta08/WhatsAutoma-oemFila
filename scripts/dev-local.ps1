# Uso (PowerShell, na raiz do repo):
#   .\scripts\dev-local.ps1
#
# Exige Docker Desktop instalado e rodando (para PostgreSQL na porta 5433).
# Depois abre API :3000 e Web :3001 em processos separados.

$ErrorActionPreference = "Stop"
# scripts/ -> raiz do repositório
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker nao encontrado. Instale Docker Desktop e rode de novo, ou instale PostgreSQL e ajuste DATABASE_URL no .env" -ForegroundColor Yellow
  exit 1
}

docker compose up -d
$deadline = (Get-Date).AddSeconds(45)
do {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.ConnectAsync("127.0.0.1", 5433).Wait(2000) | Out-Null
    if ($tcp.Connected) { $tcp.Close(); break }
    $tcp.Dispose()
  } catch { }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $deadline)

npm run migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "API: http://localhost:3000  |  Web: http://localhost:3001" -ForegroundColor Green
Write-Host "Painel (senha unica): dev123  (se .env padrao local)" -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; npm run dev:api"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; npm run dev:web"
