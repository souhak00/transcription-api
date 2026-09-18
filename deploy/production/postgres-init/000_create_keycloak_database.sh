#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${KEYCLOAK_DB_PASSWORD:-}" ]]; then
  echo "KEYCLOAK_DB_PASSWORD est obligatoire." >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=keycloak_password="$KEYCLOAK_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE keycloak_app LOGIN PASSWORD %L', :'keycloak_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak_app')
\gexec

ALTER ROLE keycloak_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS
  PASSWORD :'keycloak_password';

SELECT 'CREATE DATABASE keycloak OWNER keycloak_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak')
\gexec
SQL
