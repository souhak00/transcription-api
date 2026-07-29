# ADR-002 — n8n comme orchestrateur

- Statut : accepté
- Date : 2026-07-28

## Contexte

n8n relie déjà Google Drive, l'API de transcription, Ollama, PostgreSQL et
Gmail. Le workflow CRM validé prouve sa valeur d'intégration, mais contient aussi
des règles métier et du SQL détaillé.

## Décision

n8n demeure l'orchestrateur de la solution. Il gère :

- les déclencheurs et canaux;
- le séquencement des appels;
- la validation de forme des messages JSON;
- les timeouts, retries bornés et branches d'erreur;
- l'archivage, les notifications et la reprise.

n8n ne possède pas les invariants CRM. Il appelle les fonctions PostgreSQL et
transporte leurs réponses JSON. Ollama propose une intention ou une réponse,
mais n8n limite les opérations disponibles et exige les confirmations prévues.

## Conséquences

Positives :

- intégrations visibles et modifiables rapidement;
- séparation claire entre orchestration et métier;
- réutilisation des mêmes services depuis plusieurs workflows;
- reprise indépendante des étapes de livraison.

Contraintes :

- versionner et tester les exports n8n;
- gérer les credentials par environnement;
- éviter les expressions liées à des noms de nœuds fragiles;
- propager les identifiants de corrélation et d'idempotence.

## Options écartées

- Déplacer tout le système dans n8n : règles dispersées et faible atomicité.
- Remplacer immédiatement n8n par du code : coût sans bénéfice démontré pour les
  intégrations actuelles.
- Laisser Ollama choisir et exécuter librement une requête : surface d'action
  non contrôlée.

## Garde-fous

- liste fermée intention → fonction;
- validation JSON avant appel;
- aucune commande SQL générée par le modèle;
- confirmation pour les mutations sensibles;
- voie d'erreur explicite et retries limités;
- aucune donnée secrète dans les exports.
