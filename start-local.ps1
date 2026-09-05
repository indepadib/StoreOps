$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.env')) {
  Write-Host 'StoreOps : fichier .env introuvable à la racine du projet.' -ForegroundColor Red
  Write-Host 'Copie .env.example vers .env, renseigne les variables locales, puis relance.' -ForegroundColor Yellow
  exit 1
}

Write-Host 'StoreOps : démarrage local avec .env (le secret reste uniquement sur ce PC).' -ForegroundColor Green
node --env-file=.env backend/server.mjs
