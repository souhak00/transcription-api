# ADR-003 — JSON comme format d'échange interne

- Statut : accepté
- Date : 2026-07-28

## Contexte

L'API de transcription retourne déjà du JSON, Ollama extrait une fiche JSON et
n8n manipule naturellement des items JSON. Les futurs services PostgreSQL et
l'agent conversationnel ont besoin d'un contrat commun qui ne révèle pas la
structure physique des tables.

## Décision

JSON est le format d'échange interne entre n8n, Ollama, l'API de transcription
et les fonctions CRM PostgreSQL.

Les messages métier utilisent une enveloppe versionnée avec :

- `schema_version`;
- `request_id`;
- `operation`;
- `context`;
- `data`;
- `meta`;
- pour une réponse : `ok`, `warnings` et `error`.

Les fonctions PostgreSQL acceptent et retournent `jsonb`. Les schémas sont
validés aux frontières. Une donnée absente est `null`, jamais la chaîne
`"undefined"` ou `"null"`.

## Conséquences

Positives :

- contrat homogène entre composants;
- évolution indépendante du schéma relationnel;
- audit et rejeu facilités;
- format compatible avec n8n et Ollama;
- réponses métier faciles à fournir au générateur de texte.

Contraintes :

- JSON ne garantit pas seul les types; une validation de schéma est obligatoire;
- les changements doivent être versionnés;
- les gros documents ne remplacent pas une modélisation relationnelle;
- les données sensibles doivent être filtrées avant les prompts et les logs.

## Options écartées

- Exposer directement les lignes SQL : couplage aux tables.
- Utiliser du texte libre entre Ollama et n8n : ambigu et non validable.
- Introduire immédiatement Protobuf : outillage disproportionné pour les
  composants actuels.

## Règles

- dates et heures au format ISO 8601 avec fuseau;
- identifiants UUID sous forme de chaînes;
- montants sous forme numérique et devise explicite lorsque nécessaire;
- tableaux JSON pour les documents, tâches et avertissements;
- erreurs avec code stable, message humain, caractère rejouable et détails;
- aucune rupture silencieuse d'une version existante.
