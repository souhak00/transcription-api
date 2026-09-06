# Architecture C4 — CRM hypothécaire Tonia Conseil

Ce dossier décrit l’architecture actuellement livrée, puis isole explicitement
la cible documentaire qui n’est pas encore déployée. Le modèle
[`workspace.dsl`](./workspace.dsl) est la source C4 structurée; les vues Mermaid
sont lisibles directement dans GitHub.

## Périmètre et statut

- **Actuel** : interface React, API Node.js, Keycloak, n8n, PostgreSQL avec RLS,
  Ollama, transcription locale et déploiement Docker derrière Caddy.
- **Cible acceptée** : chaîne documentaire privée avec stockage objet,
  antivirus, file persistante et OCR. Cette cible vient de l’ADR-006 et n’est
  pas représentée comme si elle était déjà en production.
- **Historique** : les flux Google Drive/Gmail présents dans certains exports
  n8n sont documentés comme intégrations héritées, pas comme dépendances du CRM
  de production.

## Artefacts

| Vue | Question couverte | Fichier |
|---|---|---|
| C4 niveau 1 — Contexte | Qui utilise la solution et quels systèmes l’entourent? | [`01-contexte.md`](./01-contexte.md) |
| C4 niveau 2 — Conteneurs | Quels blocs exécutables et magasins composent la solution? | [`02-conteneurs.md`](./02-conteneurs.md) |
| C4 niveau 3 — Composants | Comment le Web, l’API, n8n et PostgreSQL coopèrent-ils? | [`03-composants.md`](./03-composants.md) |
| Vues dynamiques | Comment circulent l’identité, une demande CRM, un rendez-vous et une action admin? | [`04-flux-dynamiques.md`](./04-flux-dynamiques.md) |
| Déploiement | Où tournent les conteneurs en production et en local? | [`05-deploiement.md`](./05-deploiement.md) |
| C4 niveau 4 — Code | Où chaque responsabilité se trouve-t-elle dans le dépôt? | [`06-code-et-tracabilite.md`](./06-code-et-tracabilite.md) |
| Architecture cible | Comment ajouter le traitement documentaire sans confondre cible et existant? | [`07-cible-documentaire.md`](./07-cible-documentaire.md) |
| Modèle exécutable | Source Structurizr DSL regroupant modèle et vues | [`workspace.dsl`](./workspace.dsl) |

## Règles structurantes

1. Le navigateur ne communique jamais directement avec PostgreSQL, n8n ou
   Ollama.
2. L’API valide le jeton Keycloak et construit elle-même le contexte de sécurité.
3. PostgreSQL et ses fonctions `crm.*` sont l’autorité métier; n8n orchestre les
   appels sans devenir la source de vérité.
4. La RLS isole les données par `representant_id`.
5. Ollama ne reçoit que le contexte minimal et ne possède aucun accès direct à
   la base.
6. Toute mutation sensible est authentifiée; les opérations d’administration
   exigent le rôle `admin`.

## Lecture et rendu

GitHub rend les blocs Mermaid des fichiers Markdown. Pour explorer le modèle
Structurizr, ouvrir `workspace.dsl` avec Structurizr Lite ou la CLI Structurizr.
Les noms DNS et technologies reflètent le déploiement de production décrit dans
`deploy/production/compose.yml`.

## Sources d’autorité

En cas d’écart, l’ordre de priorité est : migrations SQL appliquées, ADR
acceptées, configuration de déploiement, contrat de l’agent, puis diagrammes C4.
Le présent dossier doit être mis à jour dans la même modification qu’un
changement d’architecture.
