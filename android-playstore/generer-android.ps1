# Préparer un projet Android TWA ZikaMansle sur Windows.
# Ce script ne publie rien et ne touche pas a l'application en service.
param(
  [string]$BaseUrl = "https://app.zikamansle.fr",
  [string]$OutputDir = "ZikaMansle-Android"
)
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
if (-not $BaseUrl.StartsWith("https://")) { throw "Une origine HTTPS est obligatoire." }
$manifestUrl = "$BaseUrl/manifest.webmanifest"
try {
  $res = Invoke-WebRequest -Uri $manifestUrl -TimeoutSec 20 -UseBasicParsing
  if ($res.StatusCode -ne 200) { throw "HTTP $($res.StatusCode)" }
  $manifest = $res.Content | ConvertFrom-Json
} catch {
  throw "Manifeste introuvable a $manifestUrl. Il faut utiliser l'URL de la version mobile reellement publiee."
}
if (-not $manifest.name) { throw "Manifeste incorrect : name absent." }
if (-not (Get-Command bubblewrap -ErrorAction SilentlyContinue)) {
  throw "Installer Node.js puis executer : npm install -g @bubblewrap/cli"
}
$dest = [System.IO.Path]::GetFullPath($OutputDir)
if (Test-Path $dest) { throw "Dossier deja existant : $dest. Refus d'ecraser une version precedente." }
Write-Host "PWA detectee : $($manifest.name) / $manifestUrl" -ForegroundColor Cyan
Write-Warning "Avant de continuer : le manifeste de la version programme contient une icone Z, alors que l'application officielle doit utiliser la tete de Zika. Verifier l'icone actuelle du domaine."
Write-Warning "Verifiez aussi les notifications push sur le domaine final : cette version de depot ne montre pas de gestionnaire push."
$confirmation = Read-Host "Tapez OUI seulement apres avoir verifie l'icone tete Zika, les notifications et le domaine final"
if ($confirmation -cne "OUI") { throw "Arret sans generation : prerequis a verifier." }
New-Item -ItemType Directory -Path $dest | Out-Null
Push-Location $dest
try {
  # Commande officielle Bubblewrap : init lit le manifeste public et demande les parametres.
  bubblewrap init "--manifest=$manifestUrl"
  if ($LASTEXITCODE -ne 0) { throw "Initialisation Bubblewrap interrompue." }
} finally { Pop-Location }
$gradleCandidates = @(
  (Join-Path $dest "app/build.gradle"),
  (Join-Path $dest "app/build.gradle.kts")
)
$gradle = $gradleCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $gradle) { throw "Projet genere, mais build.gradle introuvable : verifier targetSdk manuellement." }
$gradleText = Get-Content $gradle -Raw
$matches = [regex]::Matches($gradleText, 'targetSdk(?:Version)?\s*(?:=|\s)\s*(\d+)')
if ($matches.Count -eq 0) { throw "Projet genere ; targetSdk introuvable : verifier l'API cible 36 ou superieure." }
$target = [int]$matches[0].Groups[1].Value
if ($target -lt 36) { throw "Projet genere avec API $target. Adapter targetSdk a 36 ou plus avant de compiler." }
Write-Host "Projet Android genere dans $dest ; targetSdk=$target" -ForegroundColor Green
Write-Host "Verifier le package fr.zikamansle.app, les icones officielles et la signature avant la commande bubblewrap build."
Write-Host "La cle privee Android et les mots de passe ne doivent jamais etre commites dans GitHub."
