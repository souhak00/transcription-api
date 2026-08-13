#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
umask 077

ENV_FILE="$SCRIPT_DIR/.env.production"
MIGRATION_DIR="$SCRIPT_DIR/runtime/migration"
ADMIN_CLIENT_FILE="$MIGRATION_DIR/keycloak-admin-client.env"
INITIAL_SECRETS_FILE="$SCRIPT_DIR/runtime/initial-secrets.txt"

if [[ -e "$ENV_FILE" ]]; then
  echo ".env.production existe déjà; aucune valeur n'a été remplacée." >&2
  exit 1
fi

if [[ ! -f "$ADMIN_CLIENT_FILE" ]]; then
  echo "Fichier requis absent : $ADMIN_CLIENT_FILE" >&2
  echo "Transférez keycloak-admin-client.env depuis la sauvegarde locale." >&2
  exit 1
fi

# Le fichier transféré contient uniquement les deux variables du compte technique.
set -a
# shellcheck disable=SC1090
source "$ADMIN_CLIENT_FILE"
set +a

if [[ "${KEYCLOAK_ADMIN_CLIENT_ID:-}" != "crm-admin-api" \
   || -z "${KEYCLOAK_ADMIN_CLIENT_SECRET:-}" ]]; then
  echo "Le compte technique Keycloak transféré est invalide." >&2
  exit 1
fi

random_hex() {
  openssl rand -hex 32
}

POSTGRES_PASSWORD="$(random_hex)"
KEYCLOAK_DB_PASSWORD="$(random_hex)"
CRM_RUNTIME_PASSWORD="$(random_hex)"
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD="$(random_hex)"
N8N_PROXY_PASSWORD="$(openssl rand -hex 20)"
N8N_PROXY_PASSWORD_HASH="$(printf '%s\n' "$N8N_PROXY_PASSWORD" \
  | docker run --rm -i caddy:2.10.2-alpine caddy hash-password)"

cat > "$ENV_FILE" <<EOF
CRM_DOMAIN=crm.toniaconseil.com
AUTH_DOMAIN=auth.toniaconseil.com
N8N_DOMAIN=n8n.toniaconseil.com
ACME_EMAIL=administration@toniaconseil.com
TZ=America/Toronto

POSTGRES_DB=transcription_crm
POSTGRES_USER=transcription_admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
KEYCLOAK_DB_PASSWORD=$KEYCLOAK_DB_PASSWORD
CRM_RUNTIME_PASSWORD=$CRM_RUNTIME_PASSWORD

KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=admin-crm
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD
KEYCLOAK_ADMIN_CLIENT_ID=$KEYCLOAK_ADMIN_CLIENT_ID
KEYCLOAK_ADMIN_CLIENT_SECRET=$KEYCLOAK_ADMIN_CLIENT_SECRET
KEYCLOAK_REALM_IMPORT_PATH=./runtime/migration/keycloak-realm-production.json

N8N_PROXY_USER=administrateur
N8N_PROXY_PASSWORD_HASH='$N8N_PROXY_PASSWORD_HASH'

HUGGINGFACE_TOKEN=
OLLAMA_MODEL=mistral-nemo
EOF

mkdir -p "$(dirname "$INITIAL_SECRETS_FILE")"
cat > "$INITIAL_SECRETS_FILE" <<EOF
Secrets initiaux du déploiement CRM — à copier dans un gestionnaire de mots de passe

Keycloak administration
URL: https://auth.toniaconseil.com
Utilisateur: admin-crm
Mot de passe: $KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD

n8n — protection HTTP additionnelle
URL: https://n8n.toniaconseil.com
Utilisateur: administrateur
Mot de passe: $N8N_PROXY_PASSWORD

PostgreSQL administration
Base: transcription_crm
Utilisateur: transcription_admin
Mot de passe: $POSTGRES_PASSWORD

PostgreSQL CRM Runtime
Base: transcription_crm
Utilisateur: crm_runtime
Mot de passe: $CRM_RUNTIME_PASSWORD

Compte technique Keycloak
Client ID: $KEYCLOAK_ADMIN_CLIENT_ID
Client secret: $KEYCLOAK_ADMIN_CLIENT_SECRET
EOF

chmod 600 "$ENV_FILE" "$INITIAL_SECRETS_FILE" "$ADMIN_CLIENT_FILE"

echo "Secrets générés sans être affichés dans le terminal."
echo "Configuration : $ENV_FILE"
echo "Copie à placer dans le gestionnaire de mots de passe : $INITIAL_SECRETS_FILE"
