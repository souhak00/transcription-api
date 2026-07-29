# Services métier PostgreSQL

## Statut

Ce document définit la cible d'architecture. Sur `develop`, les tables, les
contraintes et la RLS existent, mais les fonctions ci-dessous ne sont pas encore
créées par les migrations. Le workflow CRM validé exécute actuellement les
requêtes dans des nœuds n8n.

## Principes

- PostgreSQL possède les invariants CRM et les transactions.
- Chaque fonction publique accepte un argument `jsonb` et retourne `jsonb`.
- Les réponses ne dépendent pas de la forme physique des tables.
- Toute mutation reçoit `request_id` et `idempotency_key`.
- Les valeurs absentes n'écrasent pas les valeurs existantes.
- Les erreurs métier sont structurées; les erreurs techniques restent des
  erreurs SQL observables et ne sont pas transformées en faux succès.
- Le rôle, le représentant et le client sont validés côté base, avec RLS.

## Enveloppe d'entrée

```json
{
  "schema_version": "1.0",
  "request_id": "7abcf18e-19a9-4ac6-bfe8-d4c5ef73a93d",
  "idempotency_key": "drive-file-id:crm-v1",
  "operation": "crm.enregistrer_interaction",
  "context": {
    "role": "representant",
    "representant_id": "uuid",
    "client_id": null
  },
  "data": {},
  "meta": {
    "source": "n8n",
    "workflow_execution_id": "12345",
    "occurred_at": "2026-07-28T12:00:00Z"
  }
}
```

## Enveloppe de sortie

Succès :

```json
{
  "ok": true,
  "operation": "crm.enregistrer_interaction",
  "data": {},
  "warnings": [],
  "error": null
}
```

Erreur métier :

```json
{
  "ok": false,
  "operation": "crm.enregistrer_interaction",
  "data": null,
  "warnings": [],
  "error": {
    "code": "CLIENT_NAME_REQUIRED",
    "message": "Un nom client exploitable est requis pour créer une fiche.",
    "retryable": false,
    "details": {}
  }
}
```

## Catalogue initial

| Fonction cible | But | Mutation |
| --- | --- | --- |
| `crm.rechercher_clients(jsonb)` | Recherche autorisée par identifiants et critères contrôlés | Non |
| `crm.obtenir_client(jsonb)` | Retourne la fiche et les suivis autorisés | Non |
| `crm.lister_interactions(jsonb)` | Retourne l'historique paginé | Non |
| `crm.enregistrer_interaction(jsonb)` | Déduplique/enrichit le client et crée l'interaction et ses suivis | Oui |
| `crm.creer_tache(jsonb)` | Crée une tâche avec idempotence | Oui |
| `crm.mettre_a_jour_tache(jsonb)` | Change une tâche après contrôle d'accès | Oui |

Les fonctions de lecture sont nécessaires à l'agent conversationnel avant
d'autoriser les commandes de mutation.

## Service CRM principal

`crm.enregistrer_interaction(payload jsonb) returns jsonb` encapsule le flux
validé :

1. valider l'enveloppe et le contexte;
2. résoudre le représentant;
3. normaliser téléphone, courriel et valeurs absentes;
4. rechercher par représentant + téléphone;
5. à défaut, rechercher par représentant + courriel;
6. n'utiliser le nom que comme repli prudent;
7. créer le client seulement si le nom est exploitable;
8. enrichir sans écraser par `null`;
9. créer exactement une interaction pour la clé d'idempotence;
10. créer documents requis et tâches;
11. retourner les identifiants et décisions en JSON.

Exemple de données :

```json
{
  "client": {
    "nom_client": "Jean Tremblay",
    "telephone": "5145550100",
    "courriel": "jean@example.ca",
    "type_transaction": "Refinancement",
    "niveau_confiance": "moyen"
  },
  "interaction": {
    "fichier_original_nom": "appel.m4a",
    "transcription_originale_url": "https://drive.google.com/...",
    "synthese_url": "https://drive.google.com/...",
    "fiche_json": {},
    "resume": "Le client souhaite refinancer."
  },
  "documents_requis": [
    {"document": "Avis de cotisation"}
  ],
  "taches": [
    {"titre": "Relancer le client", "date_echeance": "2026-08-01"}
  ]
}
```

Réponse :

```json
{
  "ok": true,
  "operation": "crm.enregistrer_interaction",
  "data": {
    "client_id": "uuid",
    "interaction_id": "uuid",
    "client_action": "updated",
    "documents_created": 1,
    "tasks_created": 1,
    "replayed": false
  },
  "warnings": [],
  "error": null
}
```

## Transactions et concurrence

Le service principal s'exécute dans une seule transaction. Les index uniques
existants sur `(representant_id, telephone)` et
`(representant_id, lower(courriel))` restent la dernière défense contre les
courses concurrentes. L'implémentation doit gérer un conflit d'unicité en
relisant puis enrichissant le client gagnant.

Une table ou un mécanisme équivalent doit mémoriser
`(operation, idempotency_key)` et la réponse produite. Un replay retourne la
réponse précédente avec `replayed: true`.

## Sécurité

Les fonctions publiques ne doivent pas être `SECURITY DEFINER` par défaut. Si
une fonction l'exige, elle fixe explicitement son `search_path`, valide le
contexte, limite ses privilèges et possède des tests dédiés. n8n ne transmet pas
un rôle arbitraire fourni par Ollama.

Le contexte applicatif (`app.role`, `app.representant_id`, `app.client_id`) doit
être posé dans la même transaction que l'appel, afin que les politiques RLS de
`database/002_access_control.sql` s'appliquent.

## Versionnement

- Les changements compatibles conservent `schema_version: "1.0"`.
- Une rupture de champs ou de sens crée une nouvelle version.
- Une fonction peut accepter temporairement deux versions, mais retourne la
  version demandée.
- Les migrations SQL et les exemples n8n sont livrés ensemble.

## Tests d'acceptation

- deux appels du même client enrichissent une fiche et créent deux interactions;
- deux représentants peuvent avoir un client avec le même téléphone uniquement
  si la règle produit le résultat explicitement attendu par les contraintes;
- une entrée sans téléphone ni courriel ne fusionne pas aveuglément sur le nom;
- une création sans nom retourne `CLIENT_NAME_REQUIRED`;
- un replay avec la même clé ne duplique aucune ligne;
- une valeur `null` ne supprime pas une valeur connue;
- un représentant ne lit ni ne modifie le portefeuille d'un autre;
- chaque fonction retourne un JSON conforme au contrat.
