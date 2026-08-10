# Agent conversationnel CRM

## Rôle

L’agent répond aux représentants hypothécaires en français et en lecture seule.
Il utilise Ollama `mistral-nemo` pour comprendre la question, choisir un outil
autorisé et formuler la réponse à partir du JSON retourné par PostgreSQL.

## Outils initiaux

- `Rechercher client` appelle `crm.rechercher_clients_agent(text)`;
- `Obtenir documents` appelle `crm.obtenir_documents_client(text)`;
- `Obtenir tâches` appelle `crm.obtenir_taches_client(text)`.
- `Derniers clients` appelle `crm.obtenir_derniers_clients()` et retourne au
  maximum dix fiches visibles, ordonnées par date de création décroissante.

## Règles obligatoires

- appeler directement l’outil Documents ou Tâches avec le nom ou le
  `code_client` fourni lorsque la question porte sur ces données;
- ne jamais choisir arbitrairement parmi plusieurs correspondances;
- demander une clarification en cas d’ambiguïté;
- transmettre le message utilisateur à PostgreSQL, qui résout la référence
  client et signale les ambiguïtés;
- considérer qu’une recherche seule ne répond jamais à une question portant
  sur les documents ou les tâches;
- appeler obligatoirement l’outil métier correspondant avant de répondre;
- ne jamais interpréter un champ de profil nul comme un document manquant ou
  une tâche;
- ne jamais afficher un UUID ou un identifiant technique;
- afficher le `code_client` lorsqu’il aide le représentant à distinguer ou à
  retrouver une fiche;
- ne jamais afficher le code interne d’un représentant;
- utiliser `Derniers clients` pour les demandes portant sur les dix clients
  les plus récents;
- ne jamais inventer une information absente du JSON;
- ne créer, modifier ou supprimer aucune donnée;
- répondre de façon contrôlée aux questions hors périmètre.

## Sécurité

Chaque outil initialise dans la même requête PostgreSQL :

```text
app.role = representant
app.representant_id = identité validée
```

La valeur actuellement versionnée est réservée au jeu de test local. Dans
l’architecture cible, l’API Node.js/Express valide le JWT et fournit le
`representant_id`; ni React, ni Ollama, ni l’utilisateur ne peuvent le choisir.

Les outils doivent utiliser l’identifiant n8n `Postgres CRM Runtime`. Aucun
outil ne lit directement une table et aucun outil ne reçoit un identifiant
PostgreSQL administrateur.
