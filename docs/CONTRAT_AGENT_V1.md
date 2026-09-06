# Contrat conversationnel agent v1

La frontière entre l’API Node.js et n8n utilise un contrat versionné. L’API
effectue d’abord les contrôles déterministes; n8n et Ollama interprètent
seulement les demandes qui restent conversationnelles.

## Commande

```json
{
  "schema_version": "1.0",
  "request_id": "11111111-1111-4111-8111-111111111111",
  "session_id": "session-web",
  "intent": "documents_client",
  "message": "Et ses documents manquants?",
  "subject": {
    "client_reference": "CLI-2026-OB-000012"
  },
  "parameters": {
    "requested_fields": [],
    "scope": "single_client"
  },
  "conversation_context": {
    "active_client": "CLI-2026-OB-000012"
  },
  "interpretation": {
    "source": "deterministic",
    "confidence": 1,
    "clarification_required": false
  },
  "security_context": {
    "representant_id": "identité issue du jeton Keycloak"
  }
}
```

`security_context` est ajouté exclusivement par l’API après validation du JWT.
Le navigateur ne peut pas choisir cette valeur. Les champs historiques de
l’appel n8n sont conservés temporairement pendant la transition du workflow.

## Réponse API

```json
{
  "schema_version": "1.0",
  "request_id": "11111111-1111-4111-8111-111111111111",
  "status": "success",
  "intent": "documents_client",
  "data": null,
  "reply": "Deux documents sont toujours requis.",
  "clarification": null,
  "error": null,
  "sessionId": "session-web",
  "clientReference": "CLI-2026-OB-000012"
}
```

Les définitions exécutables se trouvent dans `src/contracts.js`. Une évolution
incompatible doit créer une nouvelle version au lieu de modifier le sens de la
version `1.0`.

## Politique de routage

1. Une intention fournie par un contrôle de l’interface est validée contre la
   liste autorisée.
2. Les formulations explicites sur les dossiers, documents, tâches, statut,
   coordonnées, revenu, mise de fonds et financement sont reconnues sans modèle.
3. `consultation_client` transporte les champs demandés dans
   `parameters.requested_fields` et réutilise le service dossier JSON.
4. Un code ou un nom explicite est résolu avant toute référence pronominale.
   Une référence pronominale peut utiliser uniquement le `code_client` du
   dossier actif.
5. Une demande structurée sans client provoque une clarification.
6. Toute autre formulation passe au chemin conversationnel Ollama.
7. L’autorisation et l’exécution restent déterministes dans l’API et les
   services PostgreSQL `crm.*`.

Champs actuellement autorisés pour `consultation_client` :
`statut_dossier`, `updated_at`, `prochaine_action`, `telephone`, `courriel`,
`revenu_annuel`, `mise_de_fonds`, `provenance_mise_de_fonds` et
`montant_financement`. Le sous-objet `details_hypothecaires` ajoute le prêteur,
l’approbation, le taux, le terme, la fermeture, le notaire, l’évaluation et
l’assurance prêt. Ces champs utilisent le même service déterministe de dossier.

L’intention `clients_documents_manquants` représente une consultation globale
du portefeuille. Elle est prioritaire sur `documents_client` pour les phrases
comme « quels clients », « qui » ou « liste les dossiers » combinées à des
documents manquants. Elle n’utilise jamais le client actif de la conversation.
