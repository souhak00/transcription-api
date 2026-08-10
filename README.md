# Plateforme IA hypothécaire locale

Plateforme locale combinant une API Node.js de transcription, un CRM
PostgreSQL, des workflows n8n et Ollama. Le service de transcription extrait
l’audio avec FFmpeg et produit une transcription locale; la couche CRM expose
ses services métier sous forme de fonctions PostgreSQL retournant du JSON.

L’architecture actuelle, la cible MVP, les frontières de sécurité et les écarts
connus sont documentés dans [ARCHITECTURE.md](./ARCHITECTURE.md). Le contexte
permanent du projet se trouve dans
[CONTEXTE_PROJET.md](./CONTEXTE_PROJET.md).
Le processus GitHub, les environnements, les releases, les rollbacks et les sauvegardes sont decrits dans [GITHUB_PROCESS.md](./GITHUB_PROCESS.md).
Le workflow n8n qui combine transcription et synthese Ollama est decrit dans [N8N_OLLAMA_WORKFLOW.md](./N8N_OLLAMA_WORKFLOW.md).
La procedure complete de reprise, avec resultats attendus et tests de validation, est disponible dans [PROCEDURE_REPRISE_COMPLETE.md](./PROCEDURE_REPRISE_COMPLETE.md).
Les actions pour ameliorer la qualite de transcription sont decrites dans [AMELIORER_TRANSCRIPTION.md](./AMELIORER_TRANSCRIPTION.md).
Le modele de donnees client/representant et l'evolution CRM du POC sont decrits dans [CRM_HYPOTHECAIRE_POC.md](./CRM_HYPOTHECAIRE_POC.md).
La feuille de route de l'assistant hypothecaire intelligent est disponible dans [ROADMAP_ASSISTANT_HYPOTHECAIRE.md](./ROADMAP_ASSISTANT_HYPOTHECAIRE.md).
Le script PostgreSQL de depart pour la Phase 2 est disponible dans [database/001_crm_postgresql.sql](./database/001_crm_postgresql.sql).

## État du MVP

- API locale de transcription : fonctionnelle.
- PostgreSQL et services métier `crm.*` : fonctionnels.
- Workflow n8n CRM `CrmEtatDossierV1` : importé et exécuté avec succès.
- Workflow texte `CrmAnalyseTexteV1` : publié; prévalidation JSON séquentielle,
  preuves verbatim, liste blanche CRM et validation humaine obligatoire.
- Ollama `mistral-nemo` : réponse française validée à partir du JSON CRM.
- Isolation RLS : politiques forcées, rôles `crm_service_owner` et
  `crm_runtime` appliqués; test d’isolation réussi. Le mot de passe local du
  rôle restreint est défini hors dépôt; l’identifiant n8n
  `Postgres CRM Runtime` est associé aux outils de l’agent.
- Agent conversationnel CRM : première version MVP en lecture seule
  versionnée dans
  [`n8n-workflows/crm_agent_conversationnel_mvp.json`](./n8n-workflows/crm_agent_conversationnel_mvp.json),
  avec un routeur d’intention à quatre sorties. Les clients récents, les
  documents et les tâches passent par des appels PostgreSQL déterministes;
  les autres questions utilisent Ollama `mistral-nemo` et les outils CRM. Le
  workflow de chat de l’éditeur demeure non publié.
- Webhook Web `CrmAgentWebhookV1` : publié temporairement le 2026-08-09 dans
  l’environnement local isolé, sans JWT, après autorisation explicite pour la
  validation du MVP. Les parcours documents, tâches, clients récents et dossier
  client ont été vérifiés depuis l’interface React.
- Identifiant métier client : la migration
  [`database/008_code_client_metier.sql`](./database/008_code_client_metier.sql)
  attribue à chaque fiche un code immuable tel que `CLI-2026-OB-000012`.
  L’agent utilise ce code pour enchaîner ses outils sans recevoir les UUID
  techniques.
- Tests conversationnels : Documents et Tâches sont validés de bout en bout
  avec résolution déterministe du message dans PostgreSQL. L’action rapide
  « Clients récents » transmet désormais l’intention autorisée
  `clients_recents`; l’API sélectionne le webhook n8n dédié
  `crm/clients-recents`, qui appelle `crm.obtenir_derniers_clients()` et
  retourne une réponse stable sans dépendre du choix d’outil de
  `mistral-nemo`. Le webhook `crm/agent-chat` reste réservé aux questions
  conversationnelles.
- Tests n8n du 2026-08-09 : le routeur manuel a retourné les dix clients
  récents, la tâche ouverte et les trois documents d’Olivier Bergeron; une
  question libre a été traitée en français par Ollama.

Le mot de passe local du rôle restreint peut être défini interactivement, sans
l’ajouter à l’historique de commandes ni au dépôt, avec
[`scripts/configurer_mot_de_passe_crm_runtime.ps1`](./scripts/configurer_mot_de_passe_crm_runtime.ps1).

L’intégration Keycloak est maintenant versionnée, mais n’est pas encore activée
dans l’environnement local. Elle utilise OpenID Connect, le flux Authorization
Code avec PKCE et un jeton d’accès RS256. Le navigateur ne choisit jamais le
`representant_id` : Keycloak le signe comme attribut, l’API le valide, puis le
transmet à n8n.

Pour créer le compte local du représentant sans versionner de secret :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File ".\scripts\configurer_keycloak_mvp.ps1"
```

Le script démarre Keycloak, associe le représentant PostgreSQL `2026999999` au
compte OIDC et demande interactivement son mot de passe. Après cette étape,
reconstruire l’API avec `docker compose up -d --build transcription-api`.

## Interface Web de l’agent

Une première interface React responsive est versionnée dans [`web/`](./web/).
Elle fournit :

- un fil de conversation en français;
- des raccourcis vers les clients récents, les documents et les tâches;
- une recherche de dossier par nom ou `code_client`;
- un panneau de dossier affichant profil, emploi, revenu, documents manquants,
  tâches ouvertes et prochaine action, sans UUID;
- des états de chargement et d’erreur accessibles;
- un affichage adapté aux ordinateurs et aux appareils mobiles.

Le navigateur appelle uniquement `GET /api/auth/config`,
`POST /api/agent/messages` et `GET /api/clients/{reference}/dossier`. Les deux
routes CRM exigent un jeton Keycloak. L’API valide les entrées et le jeton,
établit elle-même le `representant_id`, puis relaie les appels à n8n; elle ne
transmet ni accès PostgreSQL ni adresse Ollama au frontend.

```powershell
npm.cmd install --prefix web
npm.cmd run web:build
npm.cmd start
```

En développement avec rechargement automatique :

```powershell
npm.cmd run web:dev
```

Le workflow
[`n8n-workflows/crm_agent_webhook_mvp.json`](./n8n-workflows/crm_agent_webhook_mvp.json)
est publié temporairement dans l’environnement local pour les essais du MVP.
Il ouvre temporairement trois webhooks persistants :
`POST /webhook/crm/agent-chat` pour le dialogue libre et
`POST /webhook/crm/clients-recents` pour l’action rapide déterministe, ainsi que
`POST /webhook/crm/dossier-client` pour le contrat structuré du dossier. Cette
exception locale ne remplace pas l’authentification cible : le workflow devra
être désactivé après la démonstration ou protégé par JWT avant toute exposition
hors du poste de développement.

## Données de démonstration CRM

Le jeu local fictif et réexécutable contient 12 clients, 3 interactions,
4 documents et 3 tâches. Il ne supprime aucune donnée existante et utilise
exclusivement des adresses `example.test` et des UUID réservés aux essais.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File ".\scripts\charger_donnees_demo.ps1"
```

Le script charge
[`database/seeds/001_mvp_demo.sql`](./database/seeds/001_mvp_demo.sql), puis
exécute automatiquement le contrôle
[`tests/sql/mvp_demo_seed_test.sql`](./tests/sql/mvp_demo_seed_test.sql).
La question `Affiche les 10 derniers clients` doit commencer par Olivier
Bergeron et retourner exactement dix noms avec leur `code_client` dans ce jeu
de démonstration.

Le principe est volontairement simple:

1. FFmpeg convertit le media en WAV mono 16 kHz.
2. Une commande locale de speech-to-text transcrit le WAV.
3. Optionnellement, pyannote ajoute les etiquettes de locuteurs.
4. Le projet ecrit `transcript.txt`, `transcription.json` et `metadata.json`.

## Prerequis en local

- Node.js 20 ou plus.
- FFmpeg installe et disponible dans le `PATH`.
- Un moteur de transcription local disponible en ligne de commande.

Dans Docker, ces dependances sont installees dans l'image. En execution locale hors Docker, vous devez les installer sur votre machine.

## Configuration

Copier `.env.example` vers `.env`, puis adapter la commande si besoin:

```env
TRANSCRIBER_COMMAND=python3
TRANSCRIBER_ARGS=scripts/vosk_transcribe.py --model /opt/vosk-model --input {input} --output {output} {diarizeArgs} {diarizationModelArgs}
DIARIZATION_MODEL=pyannote/speaker-diarization-3.1
```

Les variables `{input}` et `{output}` sont remplacees par le chemin du WAV extrait et le chemin du fichier texte attendu. Les variables `{diarizeArgs}` et `{diarizationModelArgs}` sont remplies uniquement quand la diarisation est activee.

## Utilisation CLI

```powershell
npm.cmd run transcribe -- "C:\chemin\vers\video.mp4" --language fr
```

Avec diarisation:

```powershell
npm.cmd run transcribe -- "C:\chemin\vers\reunion.mp4" --language fr --diarize
```

Avec une autre commande locale:

```powershell
npm.cmd run transcribe -- "C:\chemin\vers\audio.mp3" `
  --command "mon-transcripteur.exe" `
  --command-args "--input {input} --output {output}"
```

Les resultats sont crees dans `outputs/<timestamp>/`:

- `transcript.txt`: transcription lisible.
- `transcription.json`: details de chaque execution locale.
- `metadata.json`: details du traitement.

## Utilisation API locale

Demarrer le serveur:

```powershell
npm.cmd start
```

Verifier l'etat:

```powershell
curl http://127.0.0.1:3000/health
```

Lancer une transcription:

```powershell
curl -X POST http://127.0.0.1:3000/transcribe `
  -H "Content-Type: application/json" `
  -d "{\"inputPath\":\"C:\\chemin\\vers\\video.mp4\",\"language\":\"fr\"}"
```

Avec diarisation via upload multipart:

```powershell
curl -X POST http://127.0.0.1:3000/transcribe/upload `
  -F "file=@C:\chemin\vers\reunion.mp4" `
  -F "diarize=true"
```

Avec une commande personnalisee:

```json
{
  "inputPath": "C:\\chemin\\vers\\video.mp4",
  "command": "mon-transcripteur.exe",
  "commandArgs": "--input {input} --output {output}"
}
```

## Integration n8n avec Google Drive

Le workflow recommande en production locale est un traitement en lot depuis un repertoire Google Drive:

1. `Manual Trigger` ou `Schedule Trigger`: declenchement manuel ou planifie.
2. `Chercher fichiers a traiter`: recherche les fichiers dans `01_A_TRAITER`.
3. `Boucle fichiers`: traite un fichier a la fois.
4. `Download file1`: telecharge le fichier courant en `binary.data`.
5. `Edit Fields`: conserve `fileIdOriginal` et `fileNameOriginal`.
6. `API - Transcription`: envoie le binaire a cette API.
7. `Transcription Original`: sauvegarde la transcription brute dans Google Drive.
8. `HTTP Request` vers Ollama: produit la synthese IA.
9. `Transcription AI`: sauvegarde la synthese dans Google Drive.
10. `Ollama - Extraction JSON client`: produit une fiche client hypothecaire structuree.
11. `Parse JSON client`: prepare les champs pour la branche CRM.
12. `PostgreSQL`: recherche par telephone/courriel, met a jour le client ou cree une nouvelle fiche.
13. `Send a message`: envoie le courriel Gmail.
14. `Recuperer ID fichier original`: merge `Edit Fields` et `Send a message`.
15. `Move file`: deplace le fichier original vers `02_TRAITES`, puis la boucle passe au fichier suivant.

Dossiers Google Drive recommandes:

```text
01_A_TRAITER
02_TRAITES
03_ERREURS
```

Le detail du workflow n8n, incluant les expressions, le noeud `Merge` et les erreurs frequentes, est documente dans [N8N_OLLAMA_WORKFLOW.md](./N8N_OLLAMA_WORKFLOW.md).

### n8n local

Si n8n et cette API tournent sur la meme machine, deux options sont possibles:

- Envoyer le fichier binaire vers `http://127.0.0.1:3000/transcribe/upload`.
- Donner un chemin local a `/transcribe` si le fichier existe deja sur le meme disque.

Configuration du noeud `HTTP Request` pour l'upload:

- Method: `POST`
- URL: `http://127.0.0.1:3000/transcribe/upload`
- Send Body: active
- Body Content Type: `Form-Data`
- Parameter Type: `n8n Binary File`
- Name: `file`
- Input Data Field Name: le nom de la propriete binaire creee par Google Drive, souvent `data`

Ajouter au besoin des champs texte dans le form-data:

- `language`: `fr`
- `diarize`: `true`
- `segmentSeconds`: `600`
- `keepAudio`: `false`

### n8n infonuagique

n8n Cloud ne peut pas appeler `127.0.0.1` sur votre ordinateur. L'API doit etre exposee sur une URL HTTPS accessible publiquement, par exemple:

- une VM ou un conteneur chez un fournisseur cloud;
- un serveur interne expose via un tunnel securise;
- une plateforme de conteneurs capable d'installer FFmpeg et le moteur de transcription local.

Dans ce cas, le noeud `HTTP Request` pointe vers:

```text
https://votre-domaine.example/transcribe/upload
```

Le fichier Google Drive reste traite sans LLM: n8n Cloud envoie seulement le binaire a votre service, puis le service execute FFmpeg et le moteur local configure par `TRANSCRIBER_COMMAND`.

Un `Dockerfile` est fourni. Il installe Node.js, FFmpeg, Vosk et le modele francais `vosk-model-small-fr-0.22`.

```powershell
docker build -t transcription-locale .
docker run --rm -p 3000:3000 --env-file .env transcription-locale
```

Pour inclure la diarisation pyannote dans l'image:

```powershell
docker build --build-arg INSTALL_DIARIZATION=true -t transcription-locale .
docker run --rm -p 3000:3000 --env-file .env transcription-locale
```

Si le modele pyannote demande une authentification, ajoutez un token Hugging Face dans `.env` apres avoir accepte les conditions du modele:

```env
HUGGINGFACE_TOKEN=hf_...
```

Test rapide:

```powershell
curl http://127.0.0.1:3000/health
```

Avec Docker Compose:

```powershell
docker compose up --build
```

Avec diarisation:

```powershell
docker compose build --build-arg INSTALL_DIARIZATION=true
docker compose up
```

L'API ecoute ensuite sur:

```text
http://127.0.0.1:3000
```

Puis, depuis n8n, envoyez le fichier Google Drive telecharge en binaire vers:

```text
http://host.docker.internal:3000/transcribe/upload
```

Si n8n tourne aussi dans Docker, mettez les deux conteneurs sur le meme reseau Docker et appelez l'API par le nom du service, par exemple:

```text
http://transcription-api:3000/transcribe/upload
```

### Variante JSON base64

Si votre workflow n8n transforme deja le fichier en base64, vous pouvez appeler `/transcribe`:

```json
{
  "filename": "reunion.mp4",
  "fileBase64": "AAAA...",
  "language": "fr"
}
```

L'upload multipart reste preferable pour les gros fichiers.

## Notes

- Aucun appel a un LLM ni a une API cloud n'est effectue par ce projet.
- La diarisation est optionnelle. Elle utilise pyannote localement dans le conteneur quand l'image est construite avec `INSTALL_DIARIZATION=true`.
- Le serveur accepte un chemin local (`inputPath`), un upload multipart (`/transcribe/upload`) ou un fichier JSON base64 (`fileBase64`).
- Par defaut, le WAV intermediaire est supprime apres transcription. Ajouter `--keep-audio` ou `keepAudio: true` pour le conserver.
- Si le transcripteur local supporte mal les longs fichiers, utilisez `--segment-seconds 600` pour segmenter l'audio.
