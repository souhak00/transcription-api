# C4 niveau 3 — Composants

## Application Web et API

```mermaid
flowchart LR
    user["Utilisateur authentifié"]

    subgraph web["Application Web React"]
        shell["Coquille et navigation\nApp.jsx"]
        assistant["Assistant conversationnel"]
        portfolio["Portefeuille et dossiers\nPortfolioViews.jsx"]
        calendarui["Agenda et rappels\nCalendarView.jsx"]
        adminui["Gestion des accès\nAdminRepresentatives.jsx"]
        authui["Adaptateur OIDC\nauth.js"]
    end

    subgraph api["API Node.js"]
        http["Routeur HTTP et fichiers Web\nserver.js"]
        identity["Authentification et autorisation\nkeycloak.js"]
        adminsvc["Administration des comptes\nkeycloak-admin.js"]
        agent["Contrat et routage agent\nagent.js + contracts.js"]
        calendar["Service agenda\ncalendar.js"]
        dossier["Service dossier\ndossier-write.js"]
        transcription["Pipeline média\ntranscribe.js, audio.js, upload.js"]
    end

    keycloak["Keycloak"]
    n8n["n8n"]
    engine["FFmpeg + Vosk + pyannote"]
    dictationworker["Worker Vosk léger\nmodèle chargé une fois"]

    user --> shell
    shell --> assistant
    shell --> portfolio
    shell --> calendarui
    shell --> adminui
    shell --> authui
    authui -->|"OIDC PKCE"| keycloak
    assistant -->|"POST /api/agent/messages"| http
    portfolio -->|"GET /api/portfolio et /api/clients/.../dossier"| http
    calendarui -->|"/api/calendar et /events"| http
    adminui -->|"/api/admin/representatives"| http
    http --> identity
    identity -->|"JWKS / jetons"| keycloak
    http --> agent
    http --> calendar
    http --> dossier
    http --> transcription
    adminsvc -->|"Admin REST avec client confidentiel"| keycloak
    http --> adminsvc
    agent -->|"Contrat agent v1"| n8n
    calendar -->|"Webhooks agenda"| n8n
    dossier -->|"Webhooks dossier"| n8n
    transcription --> engine
    http -->|"POST /api/agent/dictation"| transcription
    transcription -->|"WAV temporaire"| dictationworker
```

## Orchestration et données métier

```mermaid
flowchart LR
    api["API Node.js\ncontexte representant_id validé"]

    subgraph orchestration["n8n — workflows actifs"]
        entry["Webhooks CRM"]
        router["Détection et routage d'intention"]
        deterministic["Branches déterministes\nclients, dossiers, documents, tâches, agenda"]
        conversational["Branche conversationnelle\ncontexte minimal"]
        formatter["Normalisation de la réponse"]
    end

    subgraph postgres["PostgreSQL — domaine CRM"]
        security["Contexte RLS\nrepresentant_id"]
        services["API SQL crm.*\nrecherche, dossier, portefeuille, parcours, agenda"]
        model["Tables métier\nreprésentants, clients, dossiers, interactions, documents, tâches, événements"]
        audit["Audit, codes métier et idempotence"]
    end

    ollama["Ollama\nmistral-nemo"]

    api --> entry
    entry --> router
    router --> deterministic
    router --> conversational
    deterministic --> security
    security --> services
    services --> model
    services --> audit
    conversational -->|"Question + JSON nécessaire seulement"| ollama
    conversational -->|"Outils SQL contrôlés"| services
    deterministic --> formatter
    ollama --> formatter
    formatter --> api
```

La logique métier demeure dans les fonctions SQL versionnées. n8n orchestre et
formate; Ollama ne décide ni de l’identité ni de l’autorisation.
