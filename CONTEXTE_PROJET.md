# Plateforme IA Hypothécaire
## Contexte du projet

**Dernière mise à jour :** 2026-07-30

---

# Vision

Développer une plateforme locale d'assistance aux représentants hypothécaires.

La plateforme doit permettre :

- la transcription automatique des appels;
- la gestion CRM des clients;
- la génération de résumés IA;
- le suivi des dossiers;
- la production de documents;
- l'assistance conversationnelle;
- l'automatisation des tâches via n8n.

Toute la solution fonctionne localement (Docker).

---

# Objectifs

Créer une plateforme modulaire composée de plusieurs services indépendants :

- API de transcription
- PostgreSQL
- n8n
- Ollama
- Interface Web
- Agents IA

---

# Architecture générale

Utilisateur

↓

Interface Web authentifiée

↓

Keycloak local (OpenID Connect + PKCE)

↓

API REST Node.js / Express

↓

n8n

↓

Services PostgreSQL

↓

Base CRM

n8n transmet à Ollama uniquement le contexte JSON autorisé nécessaire à la
compréhension de l’intention et à la génération de la réponse.

Architecture cible de référence :

```text
Utilisateur
→ Interface Web React
→ Authentification
→ JWT validé + representant_id établi par le serveur
→ Agent conversationnel avec outils CRM
→ n8n
→ services PostgreSQL crm.*
→ PostgreSQL + RLS
```

Outils CRM initiaux de l’agent : rechercher un client, obtenir ses documents
et obtenir ses tâches. Le navigateur, l’agent, Ollama et n8n ne lisent jamais
directement les tables CRM.

---

# Technologies

## Backend

- Node.js
- Express
- PostgreSQL

## Identité

- Keycloak
- OpenID Connect
- JWT RS256
- Authorization Code avec PKCE

## IA

- Ollama
- mistral-nemo

## Workflow

- n8n

## Infrastructure

- Docker Desktop

---

# Décisions d'architecture

## ADR-001

PostgreSQL constitue la couche métier.

Aucune logique métier dans n8n.

---

## ADR-002

Toutes les fonctions PostgreSQL retournent du JSON.

---

## ADR-003

n8n orchestre uniquement les services.

Aucune requête SQL directe dans les workflows.

---

## ADR-004

Les agents IA ne lisent jamais directement les tables.

Ils utilisent exclusivement les services PostgreSQL.

---

# Schéma PostgreSQL

Schéma principal :

crm

---

# Services PostgreSQL existants

Fonctions validées :

- crm.rechercher_clients()
- crm.obtenir_client()
- crm.obtenir_interactions()
- crm.obtenir_documents()
- crm.obtenir_taches()
- crm.obtenir_etat_dossier()
- crm.obtenir_derniers_clients()
- crm.rechercher_clients_agent()
- crm.obtenir_documents_client()
- crm.obtenir_taches_client()
- crm.obtenir_dossier_client()
- crm.obtenir_clients_documents_manquants()

Toutes les fonctions retournent du JSON.

Définitions versionnées :

- `database/004_crm_services.sql`
- `database/006_derniers_clients.sql`
- `database/007_recherche_clients_minimisee.sql`
- `database/008_code_client_metier.sql`

Chaque client possède aussi un identifiant métier immuable au format
`CLI-AAAA-II-NNNNNN`, par exemple `CLI-2026-OB-000012`. L’UUID reste interne;
les outils conversationnels utilisent le `code_client`.

Sécurité appliquée durablement et tests complétés jusqu’au 9 août 2026 :

- `database/005_crm_runtime_security.sql`
- rôle non privilégié `crm_runtime`
- test d’isolation entre représentants
- fonctions `crm.*` détenues par `crm_service_owner` en `SECURITY DEFINER`
- aucun accès direct de `crm_runtime` aux tables
- mot de passe local de `crm_runtime` défini hors dépôt
- quatre appels d’outils validés sous `crm_runtime` : recherche, documents,
  tâches et derniers clients

---

# Workflow CRM validé

Manual Trigger

↓

Définir recherche client

↓

CRM - Rechercher clients

↓

Sélectionner client

↓

CRM - Obtenir état du dossier

↓

Préparer contexte IA

↓

IA - Résumer état du dossier

↓

Réponse CRM

---

Workflow importé dans n8n :

- nom : `CRM - État du dossier - Validation`
- identifiant : `CrmEtatDossierV1`
- état n8n : importé, non publié et exécutable manuellement dans l’éditeur
- contexte du test : `app.role = representant` et `representant_id` local;
  l’architecture cible remplacera cette valeur par l’identité issue du JWT
- exécution complète réussie le 2026-07-30
- PostgreSQL et Ollama validés de bout en bout

Limite actuelle :

- entrée manuelle avec le terme fixe `Tremblay`
- trois variantes du nom nécessitent une clarification dans l’agent cible

---

# Workflow transcription

Le workflow actuel :

Google Drive

↓

Téléchargement

↓

API Transcription

↓

Conversion

↓

Résumé IA

↓

Envoi Gmail

---

# État actuel

## Fonctionnel

✔ API transcription

✔ PostgreSQL

✔ CRM

✔ Workflow n8n

✔ Ollama

✔ Résumé IA

✔ Interface React responsive construite et validée visuellement

✔ Route serveur `POST /api/agent/messages` testée unitairement

✔ Workflow Web sécurisé publié localement le 2026-08-10 avec identité Keycloak
validée par l’API et contexte PostgreSQL dynamique

✔ Workflow manuel de l’agent enrichi d’un routeur d’intention à quatre sorties :
clients récents, documents, tâches et conversation libre

✔ Clients récents, documents et tâches validés par appels PostgreSQL
déterministes; Ollama demeure réservé à la compréhension et à la réponse libre

✔ Affichage structuré d’un dossier client par nom ou `code_client`, avec profil,
documents, tâches et prochaine action, sans UUID

✔ Commande conversationnelle « afficher le dossier CLI-… » routée de façon
déterministe vers `crm.obtenir_dossier_client()`

✔ Parcours Web authentifié validé le 2026-08-10 : clients récents, dossier,
documents et tâches par référence contextuelle, clarification et question libre
Ollama; aucun avertissement ni erreur dans la console du navigateur

✔ Consultation portefeuille des documents manquants validée de bout en bout :
intention déterministe, migration 010, service CRM JSON, webhook n8n et bouton
React; aucune référence au client actif ni aucun UUID dans la réponse

✔ Services PostgreSQL JSON versionnés

✔ Jeu de démonstration local : 12 clients, 3 interactions, 4 documents et
3 tâches fictives

✔ Workflow CRM réimportable et exécuté

✔ Migration d’isolation validée en transaction annulée

✔ Workflow d’entrée texte versionné, publié, actif et testé

✔ Validation déterministe des preuves avant utilisation des faits par le CRM

✔ Analyse complète de 57 445 caractères : 5 segments, 0 JSON invalide et
8 faits prévalidés, sans écriture automatique dans PostgreSQL

---

## À développer

- Étendre les tests conversationnels authentifiés de bout en bout et ajouter
  l’observabilité structurée autour du `request_id` versionné.

- Étendre le routage déterministe seulement aux nouvelles actions métier qui
  exigent une réponse reproductible. Les questions libres restent
  interprétées par `mistral-nemo`.

- Gestion documentaire

- Génération automatique des tâches

- Tableau de bord

- Authentification

- API REST complète

- Désactivation du webhook Web après la démonstration ou protection par JWT
  avant toute exposition hors de l’environnement local

- Création et association dans n8n de l’identifiant `Postgres CRM Runtime`
  avec le secret externe déjà défini côté PostgreSQL

- Transmission d’un contexte représentant provenant d’une authentification

- Entrée webhook/API pour les questions libres

- Gestion des résultats absents ou ambigus

---

# Structure cible

docs/

database/

src/

n8n-workflows/

prompts/

docker/

tests/

---

# Standards

## PostgreSQL

Une fonction = une responsabilité.

Toujours retourner du JSON.

---

## n8n

Pas de logique métier.

Seulement de l'orchestration.

---

## IA

Les prompts sont versionnés.

Les réponses consommées par les workflows doivent être en JSON.

---

# Roadmap

## Phase 1

API transcription

✔ terminé

---

## Phase 2

CRM PostgreSQL

✔ terminé

---

## Phase 3

Workflow CRM

✔ terminé

---

## Phase 4

Agent conversationnel

En cours

---

## Phase 5

Interface Web

À faire

---

## Phase 6

Production

À faire

---

# Avant toute modification

Toujours :

1. analyser le dépôt;

2. vérifier les ADR;

3. vérifier ARCHITECTURE.md;

4. vérifier les workflows n8n;

5. vérifier les fonctions PostgreSQL;

6. proposer un plan;

7. attendre la validation avant les gros changements.

---

# Instructions pour Codex

À chaque nouvelle session :

1. Lire ce document.

2. Lire README.md.

3. Lire ARCHITECTURE.md.

4. Lire les ADR.

5. Lire les workflows.

6. Produire un état des lieux.

7. Continuer à partir de la prochaine étape de la roadmap.

Ne jamais supprimer du code sans validation.

Ne jamais modifier directement la branche develop.

Créer une branche dédiée pour chaque fonctionnalité.

Toujours produire :

- un résumé;

- la liste des fichiers modifiés;

- le diff Git;

- le message de commit proposé.
