#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-$SCRIPT_DIR/.env.smtp}"
IMAGE='boky/postfix:v5.1.0@sha256:aafc772384232497bed875e1eb66b4d3e54ba1ebc86e2e185a6dc1dbc48182ef'
NETWORK='tonia-mail-submission'
DKIM_DIR="$SCRIPT_DIR/runtime/dkim"

fail() { printf 'Préparation SMTP refusée : %s\n' "$1" >&2; exit 1; }

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPT_DIR/.env.smtp.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  fail "complétez TONIA_MAIL_PUBLIC_IPV4 dans $ENV_FILE, puis relancez."
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ "${TONIA_MAIL_RELEASE:-blocked}" == 'blocked' ]] \
  || fail 'la préparation initiale exige TONIA_MAIL_RELEASE=blocked.'
[[ "${TONIA_MAIL_FROM:-}" == 'administration@toniaconseil.com' ]] \
  || fail 'expéditeur inattendu.'
[[ "${TONIA_MAIL_DOMAIN:-}" == 'toniaconseil.com' ]] \
  || fail 'domaine inattendu.'
[[ "${TONIA_MAIL_HOSTNAME:-}" == 'mail.toniaconseil.com' ]] \
  || fail 'nom SMTP inattendu.'
[[ "${TONIA_MAIL_PUBLIC_IPV4:-}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] \
  || fail 'TONIA_MAIL_PUBLIC_IPV4 doit être une adresse IPv4.'

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  docker network create --internal --subnet 172.29.241.0/28 "$NETWORK" >/dev/null
fi

mkdir -p "$DKIM_DIR"
if [[ ! -s "$DKIM_DIR/$TONIA_MAIL_DOMAIN.private" ]]; then
  docker run --rm --network none \
    -e DOMAIN="$TONIA_MAIL_DOMAIN" -e SELECTOR=tonia \
    -v "$DKIM_DIR:/out" --entrypoint sh "$IMAGE" -ceu '
      cd /tmp
      opendkim-genkey -b 2048 -h rsa-sha256 -r -v --subdomains \
        -s "$SELECTOR" -d "$DOMAIN"
      sed -i "s/h=rsa-sha256/h=sha256/" "$SELECTOR.txt"
      mv "$SELECTOR.private" "/out/$DOMAIN.private"
      mv "$SELECTOR.txt" "/out/$DOMAIN.txt"
      chown 101:104 "/out/$DOMAIN.private" "/out/$DOMAIN.txt"
      chmod 0400 "/out/$DOMAIN.private"
      chmod 0644 "/out/$DOMAIN.txt"
    '
fi

[[ -s "$DKIM_DIR/$TONIA_MAIL_DOMAIN.private" ]] || fail 'clé DKIM privée absente.'
[[ -s "$DKIM_DIR/$TONIA_MAIL_DOMAIN.txt" ]] || fail 'enregistrement DKIM public absent.'

printf '\nPréparation terminée; aucun courriel externe n’est activé.\n'
printf 'Publiez ce TXT DNS (clé publique seulement) :\n\n'
docker run --rm --network none \
  -v "$DKIM_DIR:/keys:ro" --entrypoint cat "$IMAGE" \
  "/keys/$TONIA_MAIL_DOMAIN.txt"
printf '\nConservez TONIA_MAIL_RELEASE=blocked jusqu’au succès de verify-outbound-dns.sh.\n'
