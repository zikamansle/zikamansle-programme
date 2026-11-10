# Script d'initialisation du projet Android TWA (Windows)
# N'effectue ni envoi Google Play ni modification du site.
# Necessite Node.js/npm, @bubblewrap/cli, Java/SDK Android.
param(
 [string]$BaseUrl = "https://app.zikamansle.fr",
 [string]$OutputDir = "ZikaMansle-Android"
)
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
if (-not $BaseUrl.StartsWith("https://")) { throw "HTTPS obligatoire" }
$manifestUrl = "$BaseUrl/manifest.webmanifest"
try {
 $response = Invoke-WebRequest -Uri $manifestUrl -TimeoutSec 20 -UseBasicParsing
 if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
 $manifest = $response.Content | ConvertFrom-Json
} catch {
 throw "Impossible de lire $manifestUrl : le domaine ou le manifeste ne sont pas disponibles. Verifier d'abord la version exacte de l'app."
}
if (-not (Get-Command bubblewrap -ErrorAction SilentlyContinue)) {
 throw "Installer Node.js puis executer : npm install -g @bubblewrap/cli"
}
if (Test-Path $OutputDir) { throw "Le dossier $OutputDir existe deja. Aucune modification pour eviter l'ecrasement." }
Write-Host "ATTENTION : verifier le contenu affiche et l'icone Zika avant confirmation." -ForegroundColor Yellow
Write-Host "Nom du manifeste : $($manifest.name) — adresse : $manifestUrl"
bubblewrap init --manifest $manifestUrl --directory $OutputDir
if ($LASTEXITCODE -ne 0) { throw "L'initialisation Bubblewrap a echoue." }
$project = Resolve-Path $OutputDir
$gradle = @((Join-Path $project "app/build.gradle"), (Join-Path $project "app/build.gradle.kts")) |
 Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $gradle) { throw "Projet genere, mais impossible de verifier automatiquement le fichier Gradle. Verifier manuellement targetSdk >= 36." }
$gradleText = Get-Content $gradle -Raw
$matches = [regex]::Matches($gradleText, 'targetSdk(?:Version)?\s*(?:=|\s)\s*(\d+)')
if ($matches.Count -eq 0) { throw "Projet genere, mais targetSdk introuvable. Verifier/adapter a 36 ou plus avant compilation." }
$target = [int]$matches[0].Groups[1].Value
Write-Host "targetSdk detecte : $target"
if ($target -lt 36) { throw "Le projet genere cible API $target ; configurer API 36 minimum et revalider le build." }
Write-Host "Projet Android initialise : $project" -ForegroundColor Green
Write-Host "Verifiez le nom, fr.zikamansle.app, l'icone tete de Zika et la configuration de signature."
Write-Host "Ensuite : cd '$project' ; bubblewrap build"
Write-Host "Ne jamais partager ni committer de cle .jks/.keystore ou mot de passe."
