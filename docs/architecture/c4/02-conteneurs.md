# C4 niveau 2 — Conteneurs

Les flèches représentent les communications autorisées. Les traits pointillés
indiquent une fonction spécialisée ou une intégration interne, pas un accès
public.

```mermaid
flowchart TB
    rep["Représentant"]
    admin["Administrateur"]

    subgraph crm["CRM hypothécaire Tonia Conseil"]
        caddy["Passerelle TLS\nCaddy 2\nRoutage des domaines et en-têtes de sécurité"]
        web["Application Web\nReact 19 + Vite\nExécutée dans le navigateur"]
        api["API applicative\nNode.js 20 / HTTP JSON\nAuthentification, validation, contrats et transcription"]
        n8n["Orchestrateur\nn8n\nWebhooks et enchaînement des services CRM"]
        crmdb[("Base métier\nPostgreSQL — transcription_crm\nFonctions crm.*, audit et RLS")]
        iddb[("Base d'identité\nPostgreSQL — keycloak")]
        outputs[("Fichiers de transcription\nVolume Docker privé")]
        dictation["Worker de dictée\nPython + Vosk français léger\nModèle chargé une fois, concurrence 1"]
    end

    keycloak["Gestion des identités\nKeycloak 26\nOIDC, utilisateurs, rôles et sessions"]
    ollama["IA locale\nOllama / mistral-nemo"]
    media["Moteur de transcription local\nFFmpeg + Vosk + pyannote"]

    rep -->|"HTTPS"| caddy
    admin -->|"HTTPS"| caddy
    caddy -->|"Application statique et /api"| api
    api -->|"Livre l'application"| web
    web -->|"Bearer JWT + JSON"| api
    web -->|"OIDC PKCE"| keycloak
    api -->|"Validation JWKS et administration REST"| keycloak
    keycloak -->|"JDBC"| iddb
    api -->|"Webhooks internes + contexte signé"| n8n
    api -->|"WAV temporaire + secret interne"| dictation
    n8n -->|"SQL sous compte crm_runtime"| crmdb
    n8n -->|"Prompts avec contexte minimal"| ollama
    api -.->|"Extraction et transcription"| media
    media -.->|"Résultats"| outputs
```

## Responsabilités et frontières

| Conteneur | Responsabilité principale | Exposition |
|---|---|---|
| Caddy | Terminaison TLS et reverse proxy | Seul service publié sur `80/443` |
| Application Web | Expérience représentant et administration | Servie par le conteneur API |
| API Node.js | Frontière de confiance et contrats HTTP | Via `crm.toniaconseil.com` |
| Keycloak | Identité, rôles `representant`/`admin`, sessions | Via `auth.toniaconseil.com`; console admin bloquée publiquement |
| n8n | Orchestration déterministe et IA | Webhooks privés; éditeur via domaine protégé |
| PostgreSQL | Données métier, fonctions de service, RLS et identité | Réseau Docker privé uniquement |
| Ollama | Génération locale non autoritative | Réseau Docker privé uniquement |
| Transcription | FFmpeg, Vosk et diarisation optionnelle | Appel interne au processus API |
| Worker de dictée | Reconnaissance courte, locale et séquentielle | Réseau Docker privé uniquement |
