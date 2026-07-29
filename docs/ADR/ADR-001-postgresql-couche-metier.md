# ADR-001 — PostgreSQL comme couche de services métier

- Statut : accepté
- Date : 2026-07-28

## Contexte

Le workflow CRM validé répartit la déduplication, la création, l'enrichissement
et l'historisation entre plusieurs nœuds n8n contenant du SQL. Cette approche a
permis de valider rapidement le besoin, mais rend les règles difficiles à
réutiliser depuis un futur agent conversationnel et fragilise l'atomicité.

PostgreSQL contient déjà les tables CRM, les contraintes uniques et les
politiques RLS.

## Décision

PostgreSQL devient la couche de services métier CRM. Les opérations publiques
sont exposées par des fonctions recevant du `jsonb` et retournant du `jsonb`.
Elles portent les transactions, validations, règles de déduplication,
autorisations et mécanismes d'idempotence.

Les tables restent internes à cette couche. n8n et les futurs canaux appellent
les fonctions au lieu de réimplémenter les règles.

Cette décision décrit la cible; les fonctions doivent encore être ajoutées aux
migrations.

## Conséquences

Positives :

- une seule implémentation des invariants;
- écritures atomiques;
- contrat réutilisable par n8n et l'agent;
- meilleure testabilité et protection contre la concurrence;
- sécurité proche des données.

Contraintes :

- logique PL/pgSQL à versionner et tester;
- discipline nécessaire pour ne pas contourner les fonctions;
- migrations coordonnées avec les schémas JSON et workflows;
- observabilité à concevoir explicitement.

## Options écartées

- Garder toute la logique dans n8n : duplication et transactions fragmentées.
- Ajouter immédiatement un microservice CRM : composant opérationnel
  supplémentaire sans besoin démontré à ce stade.
- Accès direct aux tables depuis Ollama : sécurité et déterminisme insuffisants.

## Critères de réévaluation

La décision sera réévaluée si les règles exigent un domaine trop complexe pour
PL/pgSQL, si plusieurs systèmes de stockage doivent être coordonnés, ou si les
besoins de montée en charge imposent une API métier indépendante.
