# C4 niveau 1 — Contexte du système

Le CRM permet aux représentants hypothécaires de piloter clients, dossiers,
parcours, documents attendus, tâches, agenda et assistant conversationnel. Les
administrateurs gèrent les comptes et accès des représentants.

```mermaid
flowchart LR
    rep["Personne\nReprésentant hypothécaire"]
    admin["Personne\nAdministrateur de la plateforme"]
    borrower["Personne externe\nClient emprunteur"]

    crm["Système logiciel\nCRM hypothécaire Tonia Conseil\nSuivi des dossiers, agenda, assistant et administration"]
    idp["Système d'identité\nKeycloak\nAuthentification OIDC, rôles et sessions"]
    ai["Service IA local\nOllama / mistral-nemo\nFormulation et questions non déterministes"]

    rep -->|"Consulte et met à jour son portefeuille"| crm
    admin -->|"Pilote les comptes représentants"| crm
    borrower -.->|"Fournit renseignements et documents hors portail"| rep
    crm -->|"Authorization Code + PKCE; validation JWT"| idp
    crm -->|"Contexte JSON minimal; aucune donnée d'identité source"| ai
```

## Frontière du système

Keycloak et Ollama sont opérés avec la plateforme mais restent des systèmes
spécialisés. Le client emprunteur n’a actuellement aucun accès direct au CRM.
Google Drive et Gmail apparaissent dans des workflows de transcription
historiques; ils ne sont pas requis par le parcours CRM de production.
