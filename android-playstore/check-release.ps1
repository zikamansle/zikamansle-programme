# Controle de la PWA officielle avant generation Android. N'effectue aucune publication.
param(
    [string]$BaseUrl = "https://app.zikamansle.fr"
)
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
if (-not $BaseUrl.StartsWith("https://")) { throw "L'origine doit etre en HTTPS." }
Write-Host "Verification de $BaseUrl" -ForegroundColor Cyan
$manifest = $null
$manifestUrl = $null
foreach ($p in @("manifest.webmanifest","manifest.json")) {
    try {
        $u = "$BaseUrl/$p"
        $response = Invoke-WebRequest -Uri $u -TimeoutSec 15 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $manifest = $response.Content | ConvertFrom-Json; $manifestUrl = $u; break }
    } catch { Write-Host "Indisponible : $p" -ForegroundColor Yellow }
}
if ($null -eq $manifest) { throw "Manifeste introuvable. Verifier l'adresse de la version mobile en service avant de creer Android." }
Write-Host "Manifeste trouve : $manifestUrl" -ForegroundColor Green
Write-Host "Nom : $($manifest.name); Short name : $($manifest.short_name); Display : $($manifest.display)"
if ($manifest.name -ne "ZikaMansle" -and $manifest.short_name -ne "ZikaMansle") { Write-Warning "Nom different de ZikaMansle" }
if ($manifest.display -notin @("standalone", "fullscreen", "minimal-ui")) { Write-Warning "Mode installable a controler." }
if (-not $manifest.icons) { throw "Aucune icone dans le manifeste." }
$has512 = $false
foreach ($icon in $manifest.icons) {
    $s = [string]$icon.src
    $url = [Uri]::new([Uri]$manifestUrl, $s).AbsoluteUri
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 15 -UseBasicParsing
        Write-Host "Icone $($icon.sizes) : HTTP $($r.StatusCode) — $url"
    } catch { Write-Warning "Icone indisponible : $url" }
    if ([string]$icon.sizes -match "512x512") { $has512 = $true }
}
if (-not $has512) { Write-Warning "Icone 512x512 manquante." }
Write-Host "A VERIFIER MANUELLEMENT : icone tete de Zika, push, lien domaine et tests sur appareil." -ForegroundColor Yellow
Write-Host "La presence du manifeste ne garantit pas la compatibilite TWA." -ForegroundColor Yellow
