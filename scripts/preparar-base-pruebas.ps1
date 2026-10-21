$ErrorActionPreference = "Stop"
$archivoCompose = Join-Path $PSScriptRoot "../docker-compose.yml"

& docker compose -f $archivoCompose up -d --no-recreate postgres
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# TCP avoids accepting the temporary Unix-socket server used during initdb.
$listo = $false
for ($intento = 0; $intento -lt 30; $intento++) {
    & docker compose -f $archivoCompose exec -T postgres pg_isready -h 127.0.0.1 -U postgres -d postgres *> $null
    if ($LASTEXITCODE -eq 0) { $listo = $true; break }
    if ($intento -lt 29) { Start-Sleep -Seconds 1 }
}
if (-not $listo) {
    Write-Error "PostgreSQL did not become ready within 30 bounded checks; test database preparation was not attempted."
    exit 1
}

# Fixed identifiers only: never drop a database or alter the development role.
$sql = @'
\set ON_ERROR_STOP on
SET lock_timeout = '5s';
SELECT pg_advisory_lock(18874001, 0);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'horarios_test'
    AND (pg_get_userbyid(datdba) <> 'pruebas_horarios'
      OR shobj_description(oid, 'pg_database') IS DISTINCT FROM 'PT-OptimizacionHorarios resettable test database')) THEN
    RAISE EXCEPTION 'Existing horarios_test is not the managed test database; no data was reset.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pruebas_horarios') THEN
    CREATE ROLE pruebas_horarios LOGIN PASSWORD 'pruebas_horarios' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pruebas_horarios'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='pruebas_horarios') THEN
    RAISE EXCEPTION 'Existing test role has unexpected privileges; no data was reset.';
  END IF;
END $$;
SELECT 'CREATE DATABASE horarios_test OWNER pruebas_horarios'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'horarios_test')
\gexec
COMMENT ON DATABASE horarios_test IS 'PT-OptimizacionHorarios resettable test database';
SELECT pg_advisory_unlock(18874001, 0);
'@

$sql | & docker compose -f $archivoCompose exec -T postgres psql -X -U postgres -d postgres --set=ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "horarios_test is ready in the existing PostgreSQL service."
