@echo off
title AxisPanel - Docker Scraper (Admin)
echo ============================================
echo AxisPanel - Google Maps Scraper via Docker
echo ============================================
echo.
echo Pulling Docker image...
docker pull gosom/google-maps-scraper
echo.
echo Creating queries file...
echo clinicas dentales Santiago> "%USERPROFILE%\.config\gmaps_output\queries.txt"
echo odontologos Santiago>> "%USERPROFILE%\.config\gmaps_output\queries.txt"
echo traumatologos Santiago>> "%USERPROFILE%\.config\gmaps_output\queries.txt"
echo.
if not exist "%USERPROFILE%\.config\gmaps_output" mkdir "%USERPROFILE%\.config\gmaps_output"
echo Running scraper...
docker run --rm ^
  -v "%USERPROFILE%\.config\gmaps_output:/out" ^
  -v "%USERPROFILE%\.config\gmaps_output\queries.txt:/queries.txt:ro" ^
  -v gmaps-playwright-cache:/opt ^
  gosom/google-maps-scraper ^
  -input /queries.txt ^
  -results /out/result.json ^
  -json -depth 1 -lang es -c 2 -zoom 15 -exit-on-inactivity 5m
echo.
echo ============================================
echo Scrape complete! Results in:
echo %USERPROFILE%\.config\gmaps_output\result.json
echo ============================================
echo.
echo Now import to AxisPanel via:
echo curl -X POST http://localhost:3030/api/scrape/gosom/import ^
echo   -H "Authorization: Bearer Pr0sp3r1d4d...C0m"
pause
