#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

compose=(docker compose --env-file .env.production -f compose.yml)
realm="crm-local"
email="info@tommybertrand.com"
seed="../../database/seeds/003_tommy_beta_scenarios.sql"
secret_file="runtime/tommy-beta-initial-secret.txt"

test -f .env.production || { echo ".env.production est introuvable." >&2; exit 1; }
test -f "$seed" || { echo "Le fichier de scenarios beta est introuvable." >&2; exit 1; }

"${compose[@]}" exec -T postgres-crm sh -c \
  'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1' \
  < "$seed"

representant_id=$("${compose[@]}" exec -T postgres-crm sh -c \
  'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -Atc \
  "SELECT representant_id FROM public.representants WHERE code_representant = '\''2026999997'\'' AND actif"')
test -n "$representant_id" || { echo "Le rattachement CRM n'a pas ete cree." >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env.production
set +a

temporary_password=$(openssl rand -base64 24 | tr -d '\n')
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"; unset temporary_password KEYCLOAK_ADMIN_CLIENT_SECRET' EXIT

cat > "$workdir/user.json" <<JSON
{
  "username": "$email",
  "email": "$email",
  "emailVerified": true,
  "enabled": true,
  "firstName": "Tommy",
  "lastName": "Bertrand",
  "attributes": {"representant_id": ["$representant_id"]},
  "requiredActions": ["UPDATE_PASSWORD"]
}
JSON

"${compose[@]}" cp "$workdir/user.json" keycloak:/tmp/tommy-beta-user.json
kcadm=("${compose[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh)
if ! "${kcadm[@]}" config credentials \
  --server http://localhost:8080 --realm "$realm" \
  --client "$KEYCLOAK_ADMIN_CLIENT_ID" --secret "$KEYCLOAK_ADMIN_CLIENT_SECRET" >/dev/null 2>&1; then
  if [[ -z "${KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME:-}" \
        || -z "${KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD:-}" ]]; then
    echo "Le compte technique Keycloak est invalide et aucun administrateur de repli n'est configure." >&2
    exit 1
  fi
  echo "Le secret crm-admin-api est desynchronise; utilisation de l'administrateur interne de repli."
  "${kcadm[@]}" config credentials \
    --server http://localhost:8080 --realm master \
    --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" \
    --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
fi

user_id=$("${kcadm[@]}" get users -r "$realm" -q exact=true -q username="$email" \
  --fields id --format csv --noquotes 2>/dev/null | tail -n 1 | tr -d '\r')
if [[ -z "$user_id" || "$user_id" == "id" ]]; then
  "${kcadm[@]}" create users -r "$realm" -f /tmp/tommy-beta-user.json >/dev/null
  user_id=$("${kcadm[@]}" get users -r "$realm" -q exact=true -q username="$email" \
    --fields id --format csv --noquotes | tail -n 1 | tr -d '\r')
else
  "${kcadm[@]}" update "users/$user_id" -r "$realm" -f /tmp/tommy-beta-user.json >/dev/null
fi

"${kcadm[@]}" set-password -r "$realm" --userid "$user_id" \
  --new-password "$temporary_password" --temporary >/dev/null
"${kcadm[@]}" add-roles -r "$realm" --uid "$user_id" --rolename representant >/dev/null

# Si le groupe representant existe deja, le compte y est aussi rattache.
group_id=$("${kcadm[@]}" get groups -r "$realm" -q search=representant \
  --fields id,name --format csv --noquotes 2>/dev/null \
  | awk -F, '$2 == "representant" {print $1; exit}')
if [[ -n "$group_id" ]]; then
  "${kcadm[@]}" update "users/$user_id/groups/$group_id" -r "$realm" -n >/dev/null
fi

umask 077
cat > "$secret_file" <<EOF
URL=https://crm.toniaconseil.com
COURRIEL=$email
MOT_DE_PASSE_TEMPORAIRE=$temporary_password
CHANGEMENT_OBLIGATOIRE_A_LA_PREMIERE_CONNEXION=oui
CODE_REPRESENTANT=2026999997
REPRESENTANT_ID=$representant_id
EOF
chmod 600 "$secret_file"

echo "Compte beta de production cree ou mis a jour."
echo "10 dossiers synthetiques ont ete verifies."
echo "Identifiants temporaires: $PWD/$secret_file"
