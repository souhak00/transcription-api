# C4 niveau 4 — Code et traçabilité

Le niveau Code est maintenu comme une carte de modules vers les sources et les
tests. Un diagramme de classes exhaustif serait rapidement obsolète dans cette
base JavaScript/SQL; cette table constitue le point de navigation vérifiable.

## Carte des composants

| Composant | Sources principales | Responsabilité | Vérification associée |
|---|---|---|---|
| Coquille Web et assistant | `web/src/App.jsx`, `web/src/styles.css` | Navigation, conversation et détail du dossier | Build Vite et tests d’intégration manuels |
| Portefeuille | `web/src/PortfolioViews.jsx` | Vues d’ensemble, clients et dossiers | Contrat `/api/portfolio` |
| Agenda | `web/src/CalendarView.jsx`, `src/calendar.js` | Consultation, création, modification et rappels | `tests/node/calendar.test.js` |
| Administration | `web/src/AdminRepresentatives.jsx`, `src/keycloak-admin.js` | Comptes, activation, mots de passe et sessions | Routes réservées au rôle `admin` |
| Authentification | `web/src/auth.js`, `src/keycloak.js` | OIDC PKCE et validation JWT/JWKS | `tests/node/keycloak.test.js` |
| Frontière HTTP | `src/server.js` | Routage, validation d’entrée, sécurité HTTP et SPA | `GET /health`, `npm run check`, tests Node |
| Agent | `src/agent.js`, `src/contracts.js` | Détection d’intention, contrat v1 et réponse normalisée | Tests `agent*` et contrat documentaire |
| Écriture dossier | `src/dossier-write.js` | Normalisation et mutation contrôlée des dossiers | Tests `dossier-write*` |
| Transcription | `src/transcribe.js`, `src/audio.js`, `src/upload.js`, `src/localTranscriber.js` | Upload, FFmpeg, Vosk et diarisation | Tests audio/transcription et CLI |
| Dictée locale | `src/dictation.js`, `scripts/vosk_dictation_worker.py`, `deploy/dictation/Containerfile` | Dictée authentifiée, file séquentielle et modèle léger persistant | `tests/node/dictation.test.js` |
| Orchestration | `n8n-workflows/crm_agent_webhook_mvp.json`, `crm_agent_conversationnel_mvp.json`, `crm_agenda_mvp.json` | Webhooks et appels SQL/IA | Imports n8n et scénarios de validation |
| Domaine CRM | `database/001_crm_postgresql.sql` à `database/018_suivi_statut_dossier.sql` | Schéma, fonctions `crm.*`, RLS, audit et idempotence | Migrations ordonnées et seeds séparés |
| Identité | `keycloak/realm-crm-local.json`, `keycloak/realm-crm-production.json` | Clients OIDC, rôles et attributs de jeton | Import Keycloak et vérification des claims |
| Déploiement | `Dockerfile`, `deploy/production/compose.yml`, `deploy/production/Caddyfile` | Images, réseaux, volumes, santé et TLS | Procédure `deploy/production/README.md` |

## Routes publiques de l’API applicative

| Domaine | Routes principales |
|---|---|
| Santé et identité | `GET /health`, `GET /api/auth/config`, `GET /api/me` |
| Assistant | `POST /api/agent/messages` |
| Dictée | `POST /api/agent/dictation` |
| Portefeuille et dossier | `GET /api/portfolio`, `GET/PUT /api/clients/{référence}/dossier` |
| Agenda | `GET /api/calendar`, `POST /api/calendar/events`, `PATCH /api/calendar/events/{code}` |
| Administration | `GET/POST/PATCH /api/admin/representatives`, réinitialisation de mot de passe et révocation de sessions |
| Transcription | `POST /transcribe`, `POST /transcribe/upload` |

## Fonctions SQL majeures

- Consultation : `crm.rechercher_clients_agent`,
  `crm.obtenir_dossier_hypothecaire`, `crm.consulter_portefeuille`,
  `crm.obtenir_parcours_dossier`.
- Mutations : `crm.enregistrer_dossier_hypothecaire`,
  `crm.enregistrer_parcours_hypothecaire`, `crm.associer_client_dossier`.
- Agenda : `crm.consulter_agenda`, `crm.creer_evenement_agenda`,
  `crm.modifier_evenement_agenda`.
- Sécurité et invariants : contexte RLS par représentant, codes métier,
  historique de statut, audit et idempotence.

## Matrice de décisions

| Décision | Artefact d’autorité |
|---|---|
| Keycloak comme source d’identité | `docs/ADR/ADR-005-keycloak-gestion-identite.md` |
| Module documentaire et OCR découplé | `docs/ADR/ADR-006-api-documentaire-ocr.md` |
| Contrat API vers agent | `docs/CONTRAT_AGENT_V1.md` |
| Parcours en 11 étapes | `docs/parcours-hypothecaire.md`, migration `016` |
| Agenda et rappels | `docs/agenda-rappels.md`, migration `017` |
