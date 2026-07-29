# Feuille de route vers l'agent conversationnel

Cette feuille de route part de l'état vérifié sur `develop`. Les dates sont à
planifier; les critères de sortie priment sur un calendrier arbitraire.

## État de départ

Déjà disponible :

- transcription locale FFmpeg/Vosk par API;
- workflow de transcription simple;
- workflow Drive en lot avec synthèse et extraction Ollama;
- flux CRM validé de recherche, création ou enrichissement;
- création des interactions, documents requis et tâches;
- schéma PostgreSQL, contraintes de déduplication et RLS.

Dette principale : la logique CRM validée est répartie dans des nœuds n8n et du
SQL embarqué. Les fonctions de services PostgreSQL retournant du JSON ne sont
pas encore présentes dans les migrations.

## Étape 1 — Stabiliser les contrats

Objectif : rendre les échanges observables et testables.

- figer l'enveloppe JSON versionnée;
- définir un schéma JSON pour la fiche extraite par Ollama;
- normaliser les montants, dates, téléphones, courriels et valeurs absentes;
- ajouter `request_id` et une clé d'idempotence;
- constituer un jeu d'appels anonymisés avec résultats attendus.

Critère de sortie : toute entrée invalide est rejetée de manière déterministe et
toute exécution est corrélable de bout en bout.

## Étape 2 — Introduire la couche de services PostgreSQL

Objectif : déplacer les invariants CRM hors de n8n.

- créer un schéma SQL `crm`;
- ajouter les fonctions JSON de lecture, recherche, création/enrichissement et
  enregistrement d'une interaction;
- garantir une transaction unique pour client + interaction + suivis;
- appliquer le contexte d'accès et la RLS dans les fonctions;
- tester les cas de doublon, reprise, concurrence et données partielles.

Critère de sortie : le scénario CRM validé passe par une fonction atomique et
retourne un JSON stable sans SQL métier embarqué dans n8n.

## Étape 3 — Simplifier et fiabiliser les workflows n8n

Objectif : faire de n8n un orchestrateur explicite.

- remplacer la chaîne de nœuds CRUD par l'appel au service PostgreSQL;
- ajouter validation JSON, timeouts, retries bornés et voie d'erreur;
- séparer workflow de transcription et sous-workflow CRM;
- ajouter des tests d'import et une procédure de promotion des credentials;
- documenter l'activation planifiée et le traitement des fichiers en échec.

Critère de sortie : rejouer une exécution ne crée ni doublon client ni
interaction dupliquée.

## Étape 4 — Ajouter la boucle conversationnelle en lecture

Objectif : répondre à des questions CRM sans mutation.

- recevoir un message depuis un premier canal;
- faire classifier l'intention par Ollama dans une liste fermée;
- valider les paramètres et appeler uniquement des fonctions de lecture;
- donner à Ollama le résultat JSON pour formuler une réponse;
- journaliser intention, fonction appelée et sources utilisées.

Exemples : « Quels documents manque-t-il pour ce client? », « Résume les trois
dernières interactions. »

Critère de sortie : les réponses sont fondées sur des données CRM autorisées et
peuvent être reliées au résultat JSON source.

## Étape 5 — Autoriser les actions conversationnelles

Objectif : créer des tâches, rappels et mises à jour de manière sûre.

- établir une matrice intention → fonction → rôle autorisé;
- demander une confirmation pour toute mutation importante;
- rendre les commandes idempotentes;
- conserver auteur, confirmation, avant/après et résultat;
- permettre l'annulation lorsqu'elle est réaliste.

Critère de sortie : aucune écriture n'est exécutée à partir d'un texte libre sans
validation, autorisation et confirmation adaptées au risque.

## Étape 6 — Industrialiser

- métriques de latence, taux d'erreur et qualité d'extraction;
- sauvegarde, restauration et tests de reprise;
- gestion des versions de prompts, modèles Ollama et schémas JSON;
- tests de charge et limites de concurrence;
- politique de rétention et traitement des données personnelles;
- évaluation humaine continue des réponses.

## Indicateurs

| Indicateur | Cible à définir |
| --- | --- |
| Appels traités sans intervention | taux par type de fichier |
| Fiches créées sans doublon | précision téléphone/courriel |
| Extractions nécessitant validation | taux et motifs |
| Appels de service rejoués sans effet secondaire | 100 % pour les opérations idempotentes |
| Réponses conversationnelles fondées | taux vérifié sur jeu d'évaluation |
| Temps transcription → CRM | p50 / p95 |
