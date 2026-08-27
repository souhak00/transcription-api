# Vues de déploiement C4

## Production — Hostinger VPS

```mermaid
flowchart TB
    internet["Internet"]
    browser["Navigateur utilisateur\nReact SPA + keycloak-js"]

    subgraph vps["Hostinger VPS — Ubuntu 24.04 / Docker"]
        subgraph front["Réseau frontend — 172.30.0.0/24"]
            caddy["caddy\n80, 443 publics"]
            api["transcription-api\nNode.js + build React\n3000 privé"]
            keycloak["keycloak\n8080 privé"]
            n8n["n8n 2.30.4\n5678 privé"]
        end

        subgraph back["Réseau backend — 172.31.0.0/24"]
            postgres[("postgres-crm\nBases transcription_crm + keycloak")]
            ollama["ollama\nmistral-nemo"]
            dictation["dictation-worker\nVosk léger, 1 CPU / 512 Mo"]
        end

        volumes[("Volumes Docker\npostgres, n8n, ollama, transcriptions, certificats")]
    end

    internet -->|"DNS: crm/auth/n8n.toniaconseil.com"| caddy
    caddy -->|"crm.toniaconseil.com"| api
    caddy -->|"auth.toniaconseil.com"| keycloak
    caddy -->|"n8n.toniaconseil.com + Basic Auth"| n8n
    api --> browser
    api --> keycloak
    api --> n8n
    api --> dictation
    keycloak --> postgres
    n8n --> postgres
    n8n --> ollama
    postgres --- volumes
    n8n --- volumes
    ollama --- volumes
    api --- volumes
```

Seul Caddy publie des ports sur l’hôte. La console `/admin` de Keycloak est
bloquée par le proxy public; l’administration applicative utilise le canal
serveur privé.

## Développement local

```mermaid
flowchart LR
    developer["Développeur Windows"]
    browser["Navigateur\nlocalhost:3000"]

    subgraph desktop["Docker Desktop"]
        api["API Node.js + React"]
        keycloak["Keycloak local"]
        n8n["n8n local"]
        postgres[("PostgreSQL local")]
        ollama["Ollama local"]
        dictation["Worker Vosk léger"]
    end

    source["Dépôt Git local\ncode, migrations, workflows, realm"]

    developer --> source
    developer --> browser
    browser --> api
    browser --> keycloak
    api --> n8n
    api --> keycloak
    n8n --> postgres
    n8n --> ollama
    api --> dictation
    source -.->|"build et configuration"| desktop
```

La topologie locale reproduit les frontières essentielles de production, mais
les noms DNS, certificats, secrets et volumes sont propres à chaque environnement.
