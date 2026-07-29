# Plateforme IA Hypothécaire
## Contexte du projet

**Dernière mise à jour :** 2026-07-28

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

Interface Web / Chat

↓

Ollama

↓

n8n

↓

Services PostgreSQL

↓

Base CRM

---

# Technologies

## Backend

- Node.js
- Express
- PostgreSQL

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

Toutes les fonctions retournent du JSON.

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

---

## À développer

- Agent conversationnel CRM

- Gestion documentaire

- Génération automatique des tâches

- Tableau de bord

- Authentification

- API REST complète

- Interface Web

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
