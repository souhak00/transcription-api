#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-$SCRIPT_DIR/.env.smtp}"
IMAGE='boky/postfix:v5.1.0@sha256:aafc772384232497bed875e1eb66b4d3e54ba1ebc86e2e185a6dc1dbc48182ef'

fail() { printf 'Validation DNS refusée : %s\n' "$1" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || fail "fichier absent : $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

dns() { docker run --rm --entrypoint dig "$IMAGE" +time=5 +tries=1 +short "$@"; }
normalize() { tr -d '"[:space:]'; }

[[ "$(dns A "$TONIA_MAIL_HOSTNAME" | tr -d '\r' | grep -Fx "$TONIA_MAIL_PUBLIC_IPV4" || true)" == "$TONIA_MAIL_PUBLIC_IPV4" ]] \
  || fail "A $TONIA_MAIL_HOSTNAME ne pointe pas vers $TONIA_MAIL_PUBLIC_IPV4."

ptr="$(dns -x "$TONIA_MAIL_PUBLIC_IPV4" | tr -d '\r' | sed 's/\.$//' | head -n 1)"
[[ "$ptr" == "$TONIA_MAIL_HOSTNAME" ]] \
  || fail "PTR de $TONIA_MAIL_PUBLIC_IPV4 vaut '${ptr:-absent}', pas $TONIA_MAIL_HOSTNAME."

spf="$(dns TXT "$TONIA_MAIL_DOMAIN" | normalize)"
[[ "$spf" == *'v=spf1'* ]] || fail "SPF absent pour $TONIA_MAIL_DOMAIN."
[[ "$spf" == *"ip4:$TONIA_MAIL_PUBLIC_IPV4"* ]] \
  || fail 'SPF ne contient pas l’autorisation IPv4 explicite du VPS.'

dkim="$(dns TXT "tonia._domainkey.$TONIA_MAIL_DOMAIN" | normalize)"
[[ "$dkim" == *'v=DKIM1'* && "$dkim" == *'p='* ]] \
  || fail "DKIM tonia._domainkey.$TONIA_MAIL_DOMAIN absent."
local_dkim="$(docker run --rm --network none \
  -v "$SCRIPT_DIR/runtime/dkim:/keys:ro" --entrypoint cat "$IMAGE" \
  "/keys/$TONIA_MAIL_DOMAIN.txt" | normalize)"
local_p="$(printf '%s' "$local_dkim" | sed -E 's/.*p=([^)]*).*/\1/')"
dns_p="$(printf '%s' "$dkim" | sed -E 's/.*p=([^;)]*).*/\1/')"
[[ -n "$local_p" && "$dns_p" == "$local_p" ]] \
  || fail 'la clé DKIM publiée ne correspond pas à la clé privée locale.'

dmarc="$(dns TXT "_dmarc.$TONIA_MAIL_DOMAIN" | normalize)"
[[ "$dmarc" == *'v=DMARC1'* ]] || fail "DMARC absent pour $TONIA_MAIL_DOMAIN."

printf 'DNS A, PTR, SPF, DKIM et DMARC validés. Le service reste bloqué tant que les deux variables RELEASE ne valent pas approved.\n'
