#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${CRM_RUNTIME_PASSWORD:-}" ]]; then
  echo "CRM_RUNTIME_PASSWORD est obligatoire." >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=crm_runtime_password="$CRM_RUNTIME_PASSWORD" <<'SQL'
ALTER ROLE crm_runtime PASSWORD :'crm_runtime_password';
SQL
