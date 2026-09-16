#!/usr/bin/env bash
set -euo pipefail

fail() { echo 'Tonia : SMTP externe verrouillé. Valider expéditeur, domaine, DNS et clés DKIM avant activation.' >&2; exit 1; }
[[ "${TONIA_MAIL_RELEASE:-blocked}" == 'approved' ]] || fail
domain="${ALLOWED_SENDER_DOMAINS:-}"
sender="${TONIA_MAIL_FROM:-}"
hostname="${POSTFIX_myhostname:-}"
[[ "$domain" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || fail
[[ "$hostname" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || fail
[[ "$domain" != *.invalid && "$domain" != example.* && "$hostname" == *."$domain" ]] || fail
[[ "$sender" =~ ^[a-zA-Z0-9._+-]+@ ]] && [[ "${sender#*@}" == "$domain" ]] || fail
[[ -s "/etc/opendkim/keys/$domain.private" && -s "/etc/opendkim/keys/$domain.txt" ]] || fail
[[ -n "$(postconf -h smtpd_milters)" ]] || fail

# Le domaine seul ne suffit pas : l'enveloppe doit utiliser l'expéditeur validé.
# static: et reject n'autorisent aucune donnée de configuration provenant du LLM.
printf '%s OK\n' "$sender" > /etc/postfix/tonia-senders
postmap lmdb:/etc/postfix/tonia-senders
postconf -e 'smtpd_sender_restrictions=check_sender_access lmdb:/etc/postfix/tonia-senders,reject'
postconf -e 'smtpd_relay_restrictions=permit_mynetworks,reject'
postconf -e 'smtpd_client_restrictions=permit_mynetworks,reject'
postconf -e 'smtp_fallback_relay='
# Limite également le nombre de processus SMTP sortants simultanés.
postconf -F 'smtp/unix/process_limit=1'
