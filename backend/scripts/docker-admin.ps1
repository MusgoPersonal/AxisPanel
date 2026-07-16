param(
  [string]$Action = "info",
  [string]$QueriesFile = "",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

switch ($Action) {
  "info" {
    docker info --format "{{.ServerVersion}}"
    docker image inspect gosom/google-maps-scraper 2>$null | Out-Null
    if ($?) { Write-Host "IMAGE_EXISTS" } else { Write-Host "IMAGE_MISSING" }
  }
  "pull" {
    Write-Host "Pulling gosom/google-maps-scraper..."
    docker pull gosom/google-maps-scraper
    Write-Host "PULL_COMPLETE"
  }
  "scrape" {
    if (-not $QueriesFile -or -not (Test-Path $QueriesFile)) {
      Write-Error "Queries file not found: $QueriesFile"
      exit 1
    }
    if (-not $OutputDir) { $OutputDir = "$env:USERPROFILE\.config\gmaps_output" }
    if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

    $timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $resultsFile = Join-Path $OutputDir "result.json"

    docker run --rm `
      -v "${OutputDir}:/out" `
      -v "${QueriesFile}:/queries.txt:ro" `
      -v gmaps-playwright-cache:/opt `
      gosom/google-maps-scraper `
      -input /queries.txt `
      -results /out/result.json `
      -json -depth 1 -lang es -c 2 -zoom 15 -exit-on-inactivity 5m

    if ($LASTEXITCODE -eq 0) {
      Write-Host "SCRAPE_COMPLETE"
      Get-Content $resultsFile -Raw
    } else {
      Write-Error "Scrape failed with exit code $LASTEXITCODE"
      exit 1
    }
  }
}
