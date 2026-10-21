$ErrorActionPreference = "Stop"
$archivoCompose = Join-Path $PSScriptRoot "../docker-compose.yml"

& powershell -NoProfile -File (Join-Path $PSScriptRoot "preparar-base-pruebas.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# One-off backend container: no published ports, no development database override.
& docker compose -f $archivoCompose run --rm --no-deps `
    -e NODE_ENV=test -e BASE_PRUEBAS_REINICIABLE=yes `
    -e DATABASE_URL=postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test `
    backend pnpm test:excel-externos:integracion
$codigo = $LASTEXITCODE

if ($codigo -eq 0) {
    Write-Host "External Excel PostgreSQL integration checks passed in horarios_test. Development services remain running."
}
exit $codigo
