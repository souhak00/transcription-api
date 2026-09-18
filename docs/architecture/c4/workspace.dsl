workspace "CRM hypothécaire Tonia Conseil" "Modèle C4 de la solution actuelle et de son déploiement" {
    model {
        representant = person "Représentant hypothécaire" "Gère ses clients, dossiers, tâches, documents attendus et rendez-vous."
        administrateur = person "Administrateur de la plateforme" "Pilote les comptes et les accès des représentants."
        emprunteur = person "Client emprunteur" "Fournit ses renseignements et documents au représentant; aucun accès direct au CRM actuellement." "External"

        keycloak = softwareSystem "Keycloak" "Source d'identité: OIDC, utilisateurs, rôles et sessions." "Identity"
        ollama = softwareSystem "Ollama" "Service IA local pour les questions non déterministes et la formulation." "AI"

        crm = softwareSystem "CRM hypothécaire Tonia Conseil" "Suivi du portefeuille hypothécaire, assistant, parcours, agenda et gestion des accès." {
            web = container "Application Web" "Interface représentant et administrateur exécutée dans le navigateur." "React 19, Vite, keycloak-js" "WebBrowser"
            proxy = container "Passerelle TLS" "Termine TLS et route les domaines CRM, Auth et n8n." "Caddy 2" "Infrastructure"
            api = container "API applicative" "Frontière de confiance HTTP, validation JWT, contrats métier et transcription." "Node.js 20" {
                httpRouter = component "Routeur HTTP" "Expose l'API JSON, la santé, la transcription et le build React." "src/server.js"
                authComponent = component "Authentification et autorisation" "Valide RS256/JWKS, issuer, audience, rôles et representant_id." "src/keycloak.js"
                adminComponent = component "Administration des comptes" "Utilise un client confidentiel limité à la gestion des utilisateurs." "src/keycloak-admin.js"
                agentComponent = component "Passerelle agent" "Normalise intentions et contrat v1 avant appel n8n." "src/agent.js, src/contracts.js"
                calendarComponent = component "Service agenda" "Normalise les périodes et les mutations d'événements." "src/calendar.js"
                dossierComponent = component "Service dossier" "Valide et transmet les consultations et écritures dossier." "src/dossier-write.js"
                transcriptionComponent = component "Pipeline de transcription" "Upload, extraction FFmpeg, Vosk et diarisation optionnelle." "src/transcribe.js, src/audio.js, src/upload.js"
            }
            orchestrator = container "Orchestrateur CRM" "Webhooks, routage déterministe, outils SQL et appel IA contrôlé." "n8n 2.30.4" {
                webhooks = component "Webhooks CRM" "Points d'entrée privés pour agent, portefeuille, dossier et agenda." "n8n workflows"
                deterministicRouter = component "Routeur déterministe" "Dirige clients, dossiers, documents, tâches et agenda vers les services SQL." "n8n workflows"
                conversationalAgent = component "Agent conversationnel" "Construit un contexte minimal et appelle Ollama si nécessaire." "n8n + LangChain nodes"
                responseFormatter = component "Formateur de réponse" "Retourne un contrat JSON stable à l'API." "n8n workflows"
            }
            crmDatabase = container "Base métier CRM" "Données hypothécaires, fonctions crm.*, audit, idempotence et RLS." "PostgreSQL" "Database"
            identityDatabase = container "Base d'identité" "Persistance Keycloak." "PostgreSQL" "Database"
            transcriptionFiles = container "Fichiers de transcription" "Fichiers temporaires et résultats du pipeline média." "Docker volume" "DataStore"
            dictationWorker = container "Worker de dictée" "Transcrit localement les instructions courtes avec un modèle chargé une fois et une concurrence de 1." "Python, Vosk small-fr" "AI"
        }

        representant -> web "Utilise" "HTTPS"
        administrateur -> web "Gère les accès" "HTTPS"
        emprunteur -> representant "Transmet renseignements et documents" "Hors portail"
        web -> keycloak "S'authentifie" "OIDC Authorization Code + PKCE"
        web -> api "Appelle avec un jeton Bearer" "HTTPS/JSON"
        proxy -> api "Route crm.toniaconseil.com" "HTTP interne"
        proxy -> keycloak "Route auth.toniaconseil.com" "HTTP interne"
        proxy -> orchestrator "Route l'éditeur n8n protégé" "HTTP interne"
        api -> keycloak "Valide JWKS et administre les comptes" "OIDC/Admin REST"
        keycloak -> identityDatabase "Persiste les identités" "JDBC"
        api -> orchestrator "Envoie les contrats métier et l'identité validée" "HTTP/JSON privé"
        orchestrator -> crmDatabase "Définit le contexte RLS et appelle crm.*" "SQL"
        orchestrator -> ollama "Envoie un contexte JSON minimal" "HTTP privé"
        api -> transcriptionFiles "Lit et écrit les transcriptions" "Système de fichiers"
        api -> dictationWorker "Envoie un WAV temporaire avec un secret interne" "HTTP privé"

        httpRouter -> authComponent "Protège les routes"
        httpRouter -> adminComponent "Délègue les opérations admin"
        httpRouter -> agentComponent "Délègue les messages"
        httpRouter -> calendarComponent "Délègue les événements"
        httpRouter -> dossierComponent "Délègue les dossiers"
        httpRouter -> transcriptionComponent "Délègue les médias"
        adminComponent -> keycloak "Admin REST"
        agentComponent -> orchestrator "Contrat agent v1"
        calendarComponent -> orchestrator "Webhooks agenda"
        dossierComponent -> orchestrator "Webhooks dossier"
        webhooks -> deterministicRouter "Distribue"
        deterministicRouter -> crmDatabase "Fonctions crm.*"
        deterministicRouter -> conversationalAgent "Fournit le contexte autorisé"
        conversationalAgent -> ollama "Question non déterministe"
        deterministicRouter -> responseFormatter "Résultat métier"
        conversationalAgent -> responseFormatter "Texte proposé"

        deploymentEnvironment "Production" {
            deploymentNode "Poste utilisateur" "Navigateur moderne" "Desktop/mobile" {
                containerInstance web
            }
            deploymentNode "Hostinger VPS" "Serveur Ubuntu 24.04" "KVM" {
                deploymentNode "Docker Engine" "Hôte des services de production" "Docker Compose" {
                    containerInstance proxy
                    containerInstance api
                    softwareSystemInstance keycloak
                    containerInstance orchestrator
                    containerInstance crmDatabase
                    containerInstance identityDatabase
                    softwareSystemInstance ollama
                    containerInstance transcriptionFiles
                    containerInstance dictationWorker
                }
            }
        }

        deploymentEnvironment "Développement local" {
            deploymentNode "Poste Windows" "Développement local" "Windows + Docker Desktop" {
                deploymentNode "Navigateur" "Interface locale" "Browser" {
                    containerInstance web
                }
                deploymentNode "Docker Desktop" "Services locaux" "Docker Compose" {
                    containerInstance api
                    softwareSystemInstance keycloak
                    containerInstance orchestrator
                    containerInstance crmDatabase
                    containerInstance identityDatabase
                    softwareSystemInstance ollama
                    containerInstance transcriptionFiles
                    containerInstance dictationWorker
                }
            }
        }
    }

    views {
        systemContext crm "01-SystemContext" "Contexte du CRM hypothécaire" {
            include *
            autolayout lr
        }

        container crm "02-Containers" "Conteneurs de la solution actuelle" {
            include *
            autolayout lr
        }

        component api "03-ApiComponents" "Composants de l'API Node.js" {
            include *
            autolayout lr
        }

        component orchestrator "04-OrchestrationComponents" "Composants logiques n8n" {
            include *
            autolayout lr
        }

        dynamic crm "05-DossierQuery" "Consultation authentifiée d'un dossier" {
            representant -> web "1. Utilise le CRM"
            web -> keycloak "2. S'authentifie avec PKCE"
            web -> api "3. Envoie la requête et le JWT"
            api -> keycloak "4. Valide le jeton via JWKS"
            api -> orchestrator "5. Transmet la demande et representant_id"
            orchestrator -> crmDatabase "6. Appelle la fonction crm.* sous RLS"
            autolayout lr
        }

        deployment crm "06-ProductionDeployment" "Production" "Déploiement Docker sur Hostinger" {
            include *
            autolayout tb
        }

        deployment crm "07-DevelopmentDeployment" "Développement local" "Déploiement Docker Desktop" {
            include *
            autolayout tb
        }

        styles {
            element "Person" {
                shape person
                background #164e63
                color #ffffff
            }
            element "Software System" {
                background #0f766e
                color #ffffff
            }
            element "Container" {
                background #2563eb
                color #ffffff
            }
            element "Component" {
                background #60a5fa
                color #102a43
            }
            element "Database" {
                shape cylinder
                background #7c3aed
                color #ffffff
            }
            element "DataStore" {
                shape folder
                background #7c3aed
                color #ffffff
            }
            element "Infrastructure" {
                shape hexagon
                background #475569
                color #ffffff
            }
            element "External" {
                background #64748b
                color #ffffff
            }
            relationship "Relationship" {
                color #475569
                routing orthogonal
            }
        }
    }

    configuration {
        scope softwaresystem
    }
}
