# Feuille de route - Assistant hypothecaire intelligent

Cette feuille de route reprend l'etat actuel de la solution et decrit les prochaines evolutions pour passer d'un workflow de transcription/synthese a un assistant hypothecaire intelligent.

## Etat actuel valide

La solution dispose deja de:

- transcription locale avec Vosk;
- extraction audio avec FFmpeg;
- conteneur Docker;
- orchestration n8n locale;
- lecture de fichiers depuis Google Drive;
- sauvegarde de la transcription originale dans Google Drive;
- synthese IA avec Ollama;
- sauvegarde de la synthese IA dans Google Drive;
- envoi Gmail;
- extraction JSON client avec Ollama, segmentation séquentielle et preuves
  verbatim;
- prévalidation déterministe des champs CRM, sans écriture automatique;
- services métier PostgreSQL `crm.*` retournant du JSON;
- workflow CRM de consultation du dossier Tremblay validé;
- workflow d'analyse de transcription texte publié et testé sur cinq segments;
- documentation et procedure de reprise.

Workflow actuel:

```text
Google Drive audio
-> API transcription
-> transcription originale
-> Ollama synthese
-> fichiers Drive
-> courriel Gmail
```

Workflow cible:

```text
Audio
-> transcription
-> extraction IA JSON
-> detection type dossier
-> base client
-> deduplication
-> interaction
-> documents requis
-> taches
-> fiche client
-> courriel
-> tableau de bord
```

## Phase 1 - Gains rapides (1 a 2 semaines)

Objectif: transformer la transcription en donnees exploitables immediatement par le conseiller.

### 1. Extraction automatique des informations client

Remplacer la simple synthese par une extraction JSON structuree.

JSON minimal attendu:

```json
{
  "nom_client": "",
  "telephone": "",
  "courriel": "",
  "revenu_annuel": "",
  "revenu_conjoint": "",
  "valeur_propriete": "",
  "solde_hypothecaire": "",
  "dettes_totales": "",
  "objectif": "",
  "date_rappel": ""
}
```

JSON recommande pour la suite:

```json
{
  "nom_client": null,
  "telephone": null,
  "courriel": null,
  "type_emploi": null,
  "employeur": null,
  "revenu_annuel": null,
  "revenu_conjoint": null,
  "type_transaction": null,
  "prix_achat": null,
  "valeur_propriete": null,
  "solde_hypothecaire": null,
  "montant_financement": null,
  "mise_de_fonds": null,
  "provenance_mise_de_fonds": null,
  "dettes_totales": null,
  "objectif": null,
  "date_rappel": null,
  "informations_fiscales": null,
  "documents_requis": [],
  "points_a_valider": [],
  "prochaines_actions": [],
  "niveau_confiance": null,
  "resume": null
}
```

Valeur:

- evite la saisie manuelle;
- prepare la creation automatique du client;
- permet les recherches futures;
- rend les donnees exploitables par Google Sheets, PostgreSQL ou Supabase.

Critere de validation:

```text
Le noeud Parse JSON client retourne des champs separes et exploitables.
```

### 2. Detection du type de dossier

L'IA doit classifier le dossier dans une categorie controlee:

```text
Refinancement
Renouvellement
Achat
Consolidation de dettes
Investissement locatif
Marge de credit
Autre
A valider
```

Valeur:

- oriente automatiquement le dossier;
- facilite les tableaux de bord;
- aide a prioriser les suivis.

Critere de validation:

```text
type_transaction est toujours rempli avec une valeur de la liste controlee.
```

### 3. Generation automatique des taches

Exemple:

Transcription:

```text
Le client doit envoyer son avis de cotisation.
```

Sortie attendue:

```json
{
  "titre": "Attendre avis de cotisation",
  "description": "Le client doit envoyer son avis de cotisation.",
  "date_echeance": "dans 3 jours",
  "statut": "Ouverte"
}
```

Destinations possibles:

- Google Tasks;
- Outlook;
- Planner;
- CRM;
- table `taches`.

Valeur:

- automatise le suivi;
- reduit les oublis;
- rend les appels actionnables.

Critere de validation:

```text
Chaque prochaine_action importante devient une tache exploitable.
```

### 4. Detection des documents requis

L'IA produit une liste de documents manquants:

```text
Avis de cotisation
Talon de paie
Releve hypothecaire
Taxes municipales
Piece d'identite
Preuve de mise de fonds
```

Valeur:

- enorme gain administratif;
- facilite la relance client;
- standardise les demandes documentaires.

Critere de validation:

```text
documents_requis contient une liste non vide quand le dossier est incomplet.
```

## Phase 2 - CRM intelligent (1 mois)

Objectif: creer une vraie base client et rattacher chaque appel au bon representant.

### 5. Creation automatique du client

Pipeline:

```text
Transcription
-> IA extraction
-> JSON client
-> base de donnees
```

Champs minimaux:

| Champ | Exemple |
| --- | --- |
| `client_id` | UUID |
| `representant_id` | REP-001 |
| `nom_client` | Jean Tremblay |
| `telephone` | 514-000-0000 |
| `courriel` | jean@email.com |
| `type_transaction` | Refinancement |
| `statut_dossier` | Nouveau |
| `date_appel` | 2026-06-05 |

La technologie retenue est PostgreSQL. Les fonctions du schéma `crm`
constituent l'API interne JSON; n8n et Ollama ne lisent jamais directement les
tables.

### 6. Deduplication des clients

Regle importante:

```text
representant_id + telephone
```

ou:

```text
representant_id + courriel
```

Logique:

```text
Si client trouve:
  mettre a jour le dossier
Sinon:
  creer un nouveau client
```

Implementation PostgreSQL recommandee:

```text
1. Ajouter les tables representants, clients, interactions, documents_requis et taches.
2. Ajouter une contrainte unique sur representant_id + telephone.
3. Ajouter une contrainte unique sur representant_id + courriel.
4. Dans n8n, rechercher d'abord par telephone.
5. Si aucun resultat, rechercher par courriel.
6. Si un resultat existe, faire un UPDATE client.
7. Sinon, faire un INSERT client.
8. Creer toujours une ligne dans interactions.
```

Script de depart:

```text
database/001_crm_postgresql.sql
```

Point de controle:

```text
Deux appels du meme client avec le meme telephone doivent mettre a jour la meme fiche client et creer deux interactions.
```

Regle de prudence:

```text
Ne pas dedoublonner uniquement par nom_client.
```

Si le telephone et le courriel sont absents, le dossier doit rester `A valider`, car la correspondance automatique n'est pas assez fiable.

Valeur:

- evite les doublons;
- evite de melanger les portefeuilles de representants differents;
- conserve un historique propre.

### 7. Historique complet des appels

Pour chaque client:

```text
Client
-> Appel 1
-> Appel 2
-> Appel 3
-> Appel 4
```

Chaque appel devient une ligne dans `interactions`.

Valeur:

- suivi complet;
- resume multi-appels;
- meilleure continuite client.

Question possible:

```text
Resume-moi les 4 derniers appels de ce client.
```

### 8. Moteur de recherche IA

Exemple:

```text
Quel client parlait de vendre son chalet?
```

Approche POC:

- rechercher dans Google Sheets;
- rechercher dans les transcriptions Drive;
- utiliser une recherche textuelle simple.

Approche avancee:

- index vectoriel;
- embeddings;
- recherche semantique.

## Phase 3 - Agent hypothecaire IA complet

Objectif: assister le conseiller dans le cycle de vie complet du dossier.

### 9. Prequalification automatique

Calculs:

- ABD;
- ATD;
- ratio d'endettement;
- estimation de capacite d'emprunt.

Sortie attendue:

```text
Montant estime: 425 000 $
Confiance: 82 %
Points a valider: revenu, dettes, mise de fonds
```

Important:

```text
Le calcul doit etre marque comme estimation et non comme approbation.
```

### 10. Generation d'un formulaire hypothecaire

L'IA pre-remplit:

- nom;
- revenus;
- dettes;
- objectifs;
- propriete;
- documents requis.

Formats possibles:

- PDF;
- Word;
- CRM;
- Google Docs.

### 11. Courriel client automatique

Exemple:

```text
Bonjour M. Tremblay,

Merci pour notre rencontre.

Voici les documents requis:

- Avis de cotisation
- Talon de paie
- Releve hypothecaire

Merci.
```

Valeur:

- suivi immediat;
- meilleure experience client;
- moins de travail administratif.

### 12. Suivi automatique des renouvellements

Declencheur:

```text
Renouvellement dans 180 jours
```

Workflow:

```text
CRM
-> n8n
-> courriel
-> prise de rendez-vous
```

### 13. Tableau de bord de gestion

Indicateurs:

- nombre d'appels;
- nombre de dossiers;
- conversion appels vers dossiers;
- conversion dossiers vers financements;
- revenus;
- commissions;
- volume finance;
- suivis ouverts;
- documents manquants;
- dossiers bloques;
- productivite par representant.

## Priorisation recommandee

| Priorite | Fonctionnalite | Valeur |
| --- | --- | --- |
| 1 | Extraction structuree JSON | Tres elevee |
| 2 | Creation automatique du client | Tres elevee |
| 3 | Deduplication des clients | Tres elevee |
| 4 | Historique des appels | Elevee |
| 5 | Documents manquants | Elevee |
| 6 | Taches automatiques | Elevee |
| 7 | Prequalification hypothecaire | Tres elevee |
| 8 | Tableau de bord | Moyenne |
| 9 | Recherche IA dans les appels | Tres elevee |
| 10 | Courriels automatiques | Elevee |

## Prochaine etape concrete

L'extraction JSON, les services PostgreSQL, le workflow CRM de consultation et
l'isolation RLS sont maintenant validés. Les migrations 005 à 009 sont
appliquées, `Postgres CRM Runtime` est associé aux cinq outils et chaque
client possède un identifiant métier `CLI-AAAA-II-NNNNNN`. Les outils de
l’agent utilisent désormais ce code au lieu de transmettre les UUID.
Les tests conversationnels de lecture sont maintenant terminés. L’intégration
Keycloak est versionnée : realm OIDC, client React avec PKCE, validation RS256
dans l’API et propagation dynamique du `representant_id`. La prochaine étape
est d’initialiser le compte local, puis de basculer le workflow publié :

```text
Tests de lecture terminés le 2026-08-09
-> dix derniers clients retournés avec code_client et statut
-> Olivier Bergeron : 3 documents, 2 manquants et 1 tâche ouverte
-> aucun UUID ni code représentant affiché
-> routeur n8n déterministe validé pour clients récents, documents et tâches
-> affichage du dossier complet validé par nom ou code_client dans React
-> commande « afficher le dossier CLI-… » routée sans dépendre du modèle
-> chemin conversationnel libre validé avec Ollama mistral-nemo
-> publication locale temporaire du webhook autorisée et validée le 2026-08-09
-> désactiver ce webhook après la démonstration ou implanter le JWT avant toute
   exposition hors du poste de développement
-> Keycloak retenu comme gestionnaire d’identité local
-> validation API : issuer, audience crm-api, signature RS256, rôle et attribut
-> UUID fixe retiré du workflow n8n versionné
-> compte Keycloak local initialisé et rôle représentant vérifié le 2026-08-10
-> version n8n sécurisée publiée le 2026-08-10 avec app.role et
   app.representant_id initialisés dans le même appel SQL
-> sept accès PostgreSQL vérifiés : uniquement des fonctions crm.*
-> contrat conversationnel JSON 1.0, routage hybride et contexte minimal actifs
-> parcours React + Keycloak + API + n8n + PostgreSQL validé de bout en bout le
   2026-08-10, incluant clarification et question libre Ollama
-> consultation globale des clients avec documents manquants implantée et
   validée le 2026-08-10 dans PostgreSQL, n8n, l’API et React
-> ajouter une validation humaine explicite
-> autoriser ensuite la création contrôlée d'interactions, documents et tâches
```

Le script interactif versionné
`scripts/configurer_mot_de_passe_crm_runtime.ps1` a servi à définir le mot de
passe local sans le journaliser. Le workflow MVP versionné utilise Ollama
`mistral-nemo` et cinq outils en lecture seule : rechercher un client,
obtenir son dossier, ses documents, ses tâches et afficher les dix derniers
clients.

L'analyse de transcription reste une prévalidation : elle ne crée ni client ni
interaction tant que l'identité du client, le représentant et les faits retenus
n'ont pas été confirmés.
