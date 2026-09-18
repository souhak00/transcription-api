# ADR-005 — Keycloak comme gestionnaire d’identité

**Statut :** accepté, implantation en cours
**Date :** 2026-08-09

## Contexte

Le CRM isole les données par représentant avec PostgreSQL RLS. L’identité ne
peut donc pas provenir du navigateur, d’un prompt, d’Ollama ou d’un paramètre
libre de workflow. Le MVP doit aussi rester local et exécutable avec Docker.

## Décision

Keycloak devient la source d’identité de la plateforme. L’interface React
utilise OpenID Connect avec Authorization Code et PKCE. Keycloak ajoute au
jeton d’accès le rôle `representant`, l’audience `crm-api` et l’attribut signé
`representant_id`.

L’API Node.js valide la signature RS256 avec le JWKS du realm, ainsi que
l’issuer, l’audience, le rôle et le format du `representant_id`. Elle transmet
ensuite cette identité à n8n. n8n initialise `app.role` et
`app.representant_id` dans la même requête que l’appel du service `crm.*`.

## Conséquences

- aucun mot de passe utilisateur n’est géré par l’API CRM;
- le navigateur ne choisit jamais l’identité PostgreSQL;
- Ollama ne reçoit ni jeton ni secret;
- les fonctions PostgreSQL et la RLS restent l’autorité d’accès aux données;
- un conteneur et une configuration Keycloak supplémentaires sont nécessaires;
- `start-dev` est réservé au MVP local et devra être remplacé par une
  configuration de production avec HTTPS et stockage persistant adapté.

## Rejeté

Un JWT signé directement par l’API avec un mot de passe stocké dans `.env` a
été écarté afin de ne pas construire un gestionnaire d’identité artisanal.
