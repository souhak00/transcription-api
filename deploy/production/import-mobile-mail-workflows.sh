#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"
RUNTIME_DIR="$SCRIPT_DIR/runtime/mobile-mail"

[[ -f "$ENV_FILE" ]] || { echo '.env.production absent.' >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
mobile_token="${N8N_MOBILE_TOKEN:-}"
[[ ${#mobile_token} -ge 43 ]] \
  || { echo 'N8N_MOBILE_TOKEN absent ou trop court.' >&2; exit 1; }

umask 077
mkdir -p "$RUNTIME_DIR"
cat > "$RUNTIME_DIR/mobile-header.credential.json" <<EOF
[
  {
    "id": "ToniaMobileHeaderAuthV1",
    "name": "Tonia mobile API privée",
    "type": "httpHeaderAuth",
    "data": {
      "name": "x-tonia-mobile-token",
      "value": "$mobile_token"
    }
  }
]
EOF

compose=(docker compose --env-file "$ENV_FILE" -f "$SCRIPT_DIR/compose.yml")
"${compose[@]}" cp "$RUNTIME_DIR/mobile-header.credential.json" n8n:/tmp/tonia-mobile-header.json
"${compose[@]}" cp "$ROOT_DIR/deploy/mail/n8n-smtp-outbound.credential.json" n8n:/tmp/tonia-smtp-outbound.json
"${compose[@]}" cp "$ROOT_DIR/n8n-workflows/mobile_synthese_segment_v1.json" n8n:/tmp/tonia-mobile-synthese.json
"${compose[@]}" cp "$ROOT_DIR/n8n-workflows/mobile_envoi_note_v1.json" n8n:/tmp/tonia-mobile-envoi.json

"${compose[@]}" exec -T n8n n8n import:credentials --input=/tmp/tonia-mobile-header.json
"${compose[@]}" exec -T n8n n8n import:credentials --input=/tmp/tonia-smtp-outbound.json
"${compose[@]}" exec -T n8n n8n import:workflow --input=/tmp/tonia-mobile-synthese.json
"${compose[@]}" exec -T n8n n8n import:workflow --input=/tmp/tonia-mobile-envoi.json

rm -f "$RUNTIME_DIR/mobile-header.credential.json"
printf 'Connexions et workflows importés. Les workflows restent désactivés et le courriel reste bloqué.\n'
