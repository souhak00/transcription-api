# Procedure complete de reprise du projet

Cette procedure permet de reprendre le projet depuis le debut sans perdre le fil. Elle couvre:

- le demarrage de l'API Docker;
- le test de transcription;
- la connexion n8n;
- la synthese avec Ollama;
- la sauvegarde dans Google Drive;
- la sauvegarde du code dans GitHub.

## 0. Restaurer la solution complete sur une nouvelle machine

Cette section permet de retrouver la solution dans les conditions de la derniere sauvegarde du 2026-07-13.

Elle restaure:

- le code source depuis GitHub;
- la configuration Docker;
- l'API de transcription;
- le conteneur PostgreSQL CRM;
- les donnees PostgreSQL depuis le dump;
- le workflow n8n exporte;
- les connexions n8n;
- la chaine Google Drive -> API -> Ollama -> PostgreSQL -> Gmail.

### 0.1 Recuperer les sauvegardes

#### Objectif

Recuperer les deux sources de sauvegarde:

```text
GitHub : code source, Docker, SQL, documentation, workflows n8n versionnes
Google Drive / ZIP prive : dump PostgreSQL, export n8n, inventaire Docker, fiche de reprise
```

#### Actions

Sur la nouvelle machine:

1. Ouvrir Google Drive.
2. Telecharger le fichier:

```text
sauvegarde_transcription_solution_2026-07-13.zip
```

3. Le placer temporairement dans:

```text
C:\Users\Admin\Downloads
```

4. Extraire le ZIP.

#### Resultat attendu

Le dossier extrait doit contenir au minimum:

```text
CONFIG_REPRISE_N8N_2026-07-13.txt
n8n_workflow_transcription_local_batch_2026-07-13.json
transcription_crm_2026-07-13.dump
docker_containers_2026-07-13.txt
docker_images_2026-07-13.txt
docker_volumes_2026-07-13.txt
docker_compose_resolved_2026-07-13.yml
```

#### Question de validation

Les fichiers `transcription_crm_2026-07-13.dump` et `n8n_workflow_transcription_local_batch_2026-07-13.json` sont-ils presents dans le dossier extrait?

### 0.2 Installer les prerequis sur la nouvelle machine

#### Objectif

Installer les outils necessaires pour executer la solution.

#### Prerequis

Installer:

```text
Git for Windows
Docker Desktop
Node.js 20 ou plus
Ollama
n8n local, soit via Docker, soit via installation locale
Google Chrome ou Edge
```

#### Commandes de validation

```powershell
git --version
docker version
docker compose version
node --version
npm --version
ollama --version
```

#### Resultat attendu

Chaque commande doit afficher une version.

#### Erreurs frequentes

Si Docker retourne une erreur de type:

```text
dockerDesktopLinuxEngine
```

demarrer Docker Desktop et attendre que le moteur Linux soit actif.

#### Question de validation

Toutes les commandes de version retournent-elles une version sans erreur?

### 0.3 Cloner le depot GitHub

#### Objectif

Restaurer le code source, les scripts SQL, la documentation, Docker Compose et les exports n8n versionnes.

#### Commandes

```powershell
cd "C:\Users\Admin\Documents"
git clone https://github.com/souhak00/transcription-api.git "Api Exraction d'audio"
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
git checkout develop
git pull origin develop
```

#### Resultat attendu

Le dossier du projet contient:

```text
Dockerfile
docker-compose.yml
database
n8n-workflows
src
scripts
README.md
ARCHITECTURE.md
PROCEDURE_REPRISE_COMPLETE.md
```

#### Validation

```powershell
git status
git log --oneline -3
```

Resultat attendu:

```text
On branch develop
Your branch is up to date with 'origin/develop'.
```

Le journal Git doit contenir les commits de sauvegarde recents, par exemple:

```text
8350c24 Ignore local backup archives
8568a78 Add n8n workflow export
```

#### Question de validation

Le depot est-il bien clone sur la branche `develop` et a jour avec `origin/develop`?

### 0.4 Copier les backups dans le projet

#### Objectif

Remettre les fichiers de sauvegarde prives dans le projet local, sans les publier dans GitHub.

#### Commandes

Adapter le chemin du dossier extrait si necessaire:

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
New-Item -ItemType Directory -Force -Path ".\backups"
Copy-Item "C:\Users\Admin\Downloads\backups\*" ".\backups" -Recurse -Force
```

Si le ZIP a ete extrait dans un dossier different, copier manuellement ces fichiers vers:

```text
C:\Users\Admin\Documents\Api Exraction d'audio\backups
```

#### Resultat attendu

```powershell
Get-ChildItem ".\backups" | Select-Object Name, Length
```

doit afficher:

```text
CONFIG_REPRISE_N8N_2026-07-13.txt
n8n_workflow_transcription_local_batch_2026-07-13.json
transcription_crm_2026-07-13.dump
docker_containers_2026-07-13.txt
docker_images_2026-07-13.txt
docker_volumes_2026-07-13.txt
docker_compose_resolved_2026-07-13.yml
```

#### Question de validation

Le dossier `backups` local contient-il bien le dump PostgreSQL et l'export n8n?

### 0.5 Demarrer Docker et reconstruire les conteneurs

#### Objectif

Recreer les conteneurs principaux:

```text
postgres-crm
transcription-api
```

#### Commande

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
docker compose up --build -d
```

#### Resultat attendu

```powershell
docker ps
```

doit afficher au minimum:

```text
postgres-crm       Up ...   0.0.0.0:5432->5432/tcp
transcription-api  Up ...   0.0.0.0:3000->3000/tcp
```

#### Validation API

```powershell
curl.exe http://127.0.0.1:3000/health
```

Resultat attendu:

```json
{"ok":true}
```

#### Question de validation

Les deux conteneurs `postgres-crm` et `transcription-api` sont-ils `Up`, et `/health` retourne-t-il `ok=true`?

### 0.6 Restaurer PostgreSQL depuis le dump

#### Objectif

Restaurer les donnees CRM telles qu'elles etaient lors de la sauvegarde.

#### Important

Si le conteneur `postgres-crm` vient d'etre cree avec un volume neuf, les scripts SQL dans `database/` creent deja la structure. Le dump restaure ensuite les donnees.

#### Commandes

Copier le dump dans le conteneur:

```powershell
docker cp ".\backups\transcription_crm_2026-07-13.dump" postgres-crm:/tmp/transcription_crm_2026-07-13.dump
```

Nettoyer les donnees existantes de test avant restauration:

```powershell
docker exec -it postgres-crm psql -U transcription_user -d transcription_crm -c "truncate table documents_requis, taches, interactions, clients restart identity cascade;"
```

Restaurer le dump:

```powershell
docker exec -it postgres-crm pg_restore -U transcription_user -d transcription_crm --clean --if-exists /tmp/transcription_crm_2026-07-13.dump
```

#### Resultat attendu

La restauration peut afficher des messages `DROP`, `CREATE`, `ALTER`, `INSERT` ou quelques avertissements si les objets existent deja. L'important est que la commande se termine sans erreur bloquante.

#### Validation

```powershell
docker exec -it postgres-crm psql -U transcription_user -d transcription_crm -c "select count(*) as representants from representants; select count(*) as clients from clients; select count(*) as interactions from interactions; select count(*) as documents from documents_requis; select count(*) as taches from taches;"
```

Resultat attendu:

```text
representants > 0
clients >= 0
interactions >= 0
documents >= 0
taches >= 0
```

Verifier le representant de reference:

```powershell
docker exec -it postgres-crm psql -U transcription_user -d transcription_crm -c "select representant_id, code_representant, nom_representant from representants where code_representant = '2026999999';"
```

Resultat attendu:

```text
code_representant = 2026999999
representant_id = 67f3b17e-8d00-4fd8-84a3-fa95fbcfe6cf
```

#### Question de validation

La base restauree contient-elle bien le representant `2026999999`?

### 0.7 Verifier ou reinstaller Ollama et le modele

#### Objectif

Retrouver la capacite de synthese et d'extraction JSON.

#### Commandes

Verifier les modeles disponibles:

```powershell
ollama list
curl.exe http://127.0.0.1:11434/api/tags
```

#### Resultat attendu

La liste doit contenir:

```text
mistral-nemo:latest
```

Si le modele est absent:

```powershell
ollama pull mistral-nemo:latest
```

#### Test rapide

```powershell
$body = @{ model = "mistral-nemo:latest"; stream = $false; prompt = "Retourne uniquement ce JSON: {`"test`":`"ok`"}" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $body
```

#### Resultat attendu

La reponse contient:

```text
response : { "test": "ok" }
done     : True
```

#### Question de validation

Le modele `mistral-nemo:latest` est-il disponible et repond-il au test?

### 0.8 Restaurer ou demarrer n8n local

#### Objectif

Retrouver l'interface n8n et importer le workflow sauvegarde.

#### Option A - n8n deja installe localement

Demarrer n8n comme auparavant, puis ouvrir:

```text
http://localhost:5678
```

#### Option B - n8n via Docker

Si n8n est gere par un autre compose ou une installation separee, demarrer n8n selon sa procedure habituelle.

#### Resultat attendu

L'interface n8n s'ouvre.

#### Question de validation

n8n est-il accessible sur `http://localhost:5678`?

### 0.9 Importer le workflow n8n sauvegarde

#### Objectif

Restaurer le workflow complet de traitement en lot.

#### Action dans n8n

1. Aller dans n8n.
2. Cliquer sur `Workflows`.
3. Choisir `Import from file`.
4. Selectionner:

```text
C:\Users\Admin\Documents\Api Exraction d'audio\backups\n8n_workflow_transcription_local_batch_2026-07-13.json
```

ou utiliser la version Git:

```text
C:\Users\Admin\Documents\Api Exraction d'audio\n8n-workflows\transcription_local_batch_google_drive.json
```

#### Resultat attendu

Le workflow apparait avec les noeuds:

```text
Chercher fichiers a traiter
Boucle fichiers
Download file1
API - Transcription
Ollama - Extraction JSON client
Parse JSON client
Construire metadata JSON
Postgres - Rechercher client telephone
Postgres - Rechercher client nom
Postgres - Creer client
Postgres - Mettre a jour client
Postgres - Creer interaction
Postgres - Creer documents requis
Postgres - Creer taches
Gmail - Alerte extraction incomplete
Transcription Original
Transcription AI
Move file
```

#### Question de validation

Le workflow importe contient-il bien les branches transcription, CRM, Gmail et gestion d'erreur?

### 0.10 Reconnecter les credentials n8n

#### Objectif

Les exports n8n ne restaurent pas les secrets OAuth ou mots de passe. Il faut reconnecter les comptes.

#### Credentials a recreer ou reconnecter

```text
Google Drive account
Gmail account
Postgres account
Ollama account, si le noeud Ollama natif est utilise
```

#### Credential PostgreSQL

Dans n8n:

```text
Credentials -> New -> PostgreSQL
```

Configuration:

```text
Host: host.docker.internal
Port: 5432
Database: transcription_crm
User: transcription_user
Password: transcription_password
SSL: Off
```

#### Resultat attendu

Le test du credential PostgreSQL affiche:

```text
Connection tested successfully
```

#### Google Drive et Gmail

Reconnecter avec OAuth Google. Les URI OAuth doivent inclure:

```text
http://localhost:5678
http://localhost:5678/rest/oauth2-credential/callback
```

Activer dans Google Cloud:

```text
Google Drive API
Gmail API
```

#### Question de validation

Les credentials Google Drive, Gmail et PostgreSQL sont-ils reconnectes sans erreur?

### 0.11 Verifier les dossiers Google Drive

#### Objectif

S'assurer que les ID de dossiers utilises par le workflow existent toujours.

#### Dossiers requis

```text
01_A_TRAITER
02_TRAITES
03_ERREURS_EXTRACTION
```

#### Actions

Dans Google Drive:

1. Ouvrir chaque dossier.
2. Copier son ID depuis l'URL.
3. Verifier dans les noeuds n8n que les champs `Parent Folder` utilisent les bons ID.

#### Resultat attendu

Les noeuds Google Drive suivants pointent vers les bons dossiers:

```text
Chercher fichiers a traiter -> 01_A_TRAITER
Transcription Original -> dossier de sortie transcription
Transcription AI -> dossier de sortie synthese
Google Drive - Upload erreur extraction -> 03_ERREURS_EXTRACTION
Move file -> 02_TRAITES
```

#### Question de validation

Les ID de dossiers Drive dans n8n correspondent-ils aux dossiers de la nouvelle configuration?

### 0.12 Tester l'API de transcription seule

#### Objectif

Valider Docker et l'API avant de tester n8n.

#### Commande

Utiliser un fichier audio de test local:

```powershell
curl.exe -X POST "http://127.0.0.1:3000/transcribe/upload" -F "file=@C:\Users\Admin\Music\Enregistrement.m4a" -F "language=fr"
```

#### Resultat attendu

La reponse contient:

```text
transcript
outputDir
transcriptPath
jsonPath
metadataPath
```

#### Question de validation

L'API retourne-t-elle une transcription avec `transcript`?

### 0.13 Tester PostgreSQL depuis PowerShell

#### Objectif

Valider que la base est accessible depuis l'exterieur du conteneur.

#### Commande

```powershell
docker run --rm -e PGPASSWORD=transcription_password postgres:16 psql -h host.docker.internal -U transcription_user -d transcription_crm -c "select current_user, current_database();"
```

#### Resultat attendu

```text
current_user       | transcription_user
current_database   | transcription_crm
```

#### Question de validation

La connexion PostgreSQL externe fonctionne-t-elle?

### 0.14 Tester le workflow n8n complet

#### Objectif

Valider toute la chaine restauree.

#### Action

1. Placer un fichier audio dans `01_A_TRAITER`.
2. Dans n8n, cliquer sur `Execute workflow`.

#### Resultat attendu

Le workflow doit:

```text
1. trouver le fichier dans Google Drive
2. le telecharger en binary.data
3. appeler l'API de transcription
4. sauvegarder la transcription originale
5. produire la synthese avec Ollama
6. sauvegarder la synthese
7. extraire le JSON client
8. creer ou mettre a jour le client PostgreSQL
9. creer une interaction
10. creer les documents requis
11. creer les taches
12. envoyer le courriel Gmail
13. deplacer le fichier vers 02_TRAITES
```

#### Validation PostgreSQL

```powershell
docker exec -it postgres-crm psql -U transcription_user -d transcription_crm -c "select c.nom_client, c.telephone, c.courriel, c.type_transaction, count(distinct i.interaction_id) as interactions, count(distinct d.document_id) as documents, count(distinct t.tache_id) as taches from clients c left join interactions i on i.client_id = c.client_id left join documents_requis d on d.client_id = c.client_id left join taches t on t.client_id = c.client_id group by c.client_id, c.nom_client, c.telephone, c.courriel, c.type_transaction order by c.updated_at desc;"
```

#### Resultat attendu

```text
Une ligne par client
interactions >= 1
documents >= 0
taches >= 0
```

#### Question de validation

Le workflow traite-t-il un fichier de bout en bout et cree-t-il une interaction PostgreSQL?

### 0.15 Tester la deduplication

#### Objectif

Verifier que le workflow ne cree pas un doublon client lors d'un deuxieme appel.

#### Action

1. Remettre le meme fichier audio dans `01_A_TRAITER`.
2. Relancer le workflow.

#### Validation

```powershell
docker exec -it postgres-crm psql -U transcription_user -d transcription_crm -c "select c.nom_client, count(i.interaction_id) as nombre_interactions from clients c left join interactions i on i.client_id = c.client_id group by c.client_id, c.nom_client order by nombre_interactions desc;"
```

#### Resultat attendu

Le client existant doit avoir:

```text
nombre_interactions = 2
```

et il ne doit pas y avoir deux fiches client identiques.

#### Question de validation

Le deuxieme traitement met-il a jour le client existant et ajoute-t-il seulement une nouvelle interaction?

### 0.16 Tester la branche d'erreur extraction

#### Objectif

Valider que le workflow ne cree pas de client invalide si l'IA ne trouve pas de nom.

#### Action

Dans `IF - Nom client valide`, forcer temporairement:

```javascript
{{ false }}
```

Relancer le workflow avec un fichier de test.

#### Resultat attendu

Le workflow doit executer:

```text
Gmail - Alerte extraction incomplete
Convert erreur extraction to File
Google Drive - Upload erreur extraction
```

et ne doit pas executer:

```text
Postgres - Creer client
```

Remettre ensuite la vraie condition:

```javascript
{{
  !!$("Construire metadata JSON").item.json.metadata.database_payload.client_record.nom_client &&
  $("Construire metadata JSON").item.json.metadata.database_payload.client_record.nom_client !== "undefined" &&
  $("Construire metadata JSON").item.json.metadata.database_payload.client_record.nom_client !== "null"
}}
```

#### Validation PostgreSQL

```powershell
docker exec -it postgres-crm psql -U transcription_user -d transcription_crm -c "select nom_client, telephone, courriel from clients where nom_client in ('undefined', 'null', '') or nom_client is null or telephone = 'undefined' or courriel = 'undefined';"
```

#### Resultat attendu

```text
(0 rows)
```

#### Question de validation

La branche d'erreur cree-t-elle un fichier dans Drive et aucun client invalide?

### 0.17 Checklist finale de restauration nouvelle machine

```text
[ ] ZIP prive recupere depuis Google Drive
[ ] Depot GitHub clone sur develop
[ ] Dossier backups restaure localement
[ ] Docker Desktop demarre
[ ] docker compose up --build -d execute
[ ] postgres-crm Up
[ ] transcription-api Up
[ ] API /health retourne ok=true
[ ] Dump PostgreSQL restaure
[ ] Representant 2026999999 present
[ ] Ollama installe
[ ] mistral-nemo:latest disponible
[ ] n8n accessible sur localhost:5678
[ ] Workflow n8n importe
[ ] Credentials Google Drive reconnectes
[ ] Credentials Gmail reconnectes
[ ] Credential PostgreSQL reconnecte
[ ] Dossiers Drive 01_A_TRAITER, 02_TRAITES, 03_ERREURS_EXTRACTION valides
[ ] API testee avec curl
[ ] Workflow n8n execute avec succes
[ ] Client cree ou mis a jour dans PostgreSQL
[ ] Interaction creee
[ ] Documents requis crees
[ ] Taches creees
[ ] Courriel Gmail recu
[ ] Fichier original deplace vers 02_TRAITES
[ ] Deduplication validee
[ ] Branche erreur extraction validee
```

### 0.18 Sauvegarde apres restauration

#### Objectif

Une fois la nouvelle machine fonctionnelle, recreer une sauvegarde locale actualisee.

#### Commandes

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
New-Item -ItemType Directory -Force -Path ".\backups"
docker exec postgres-crm pg_dump -U transcription_user -d transcription_crm -F c -f /tmp/transcription_crm.dump
docker cp postgres-crm:/tmp/transcription_crm.dump ".\backups\transcription_crm_$(Get-Date -Format yyyy-MM-dd).dump"
docker ps -a > ".\backups\docker_containers_$(Get-Date -Format yyyy-MM-dd).txt"
docker images > ".\backups\docker_images_$(Get-Date -Format yyyy-MM-dd).txt"
docker volume ls > ".\backups\docker_volumes_$(Get-Date -Format yyyy-MM-dd).txt"
docker compose config > ".\backups\docker_compose_resolved_$(Get-Date -Format yyyy-MM-dd).yml"
Compress-Archive -Path ".\backups" -DestinationPath ".\sauvegarde_transcription_solution_$(Get-Date -Format yyyy-MM-dd).zip" -Force
```

#### Resultat attendu

Un nouveau ZIP de sauvegarde est cree sur la nouvelle machine.

#### Question de validation

Une sauvegarde post-restauration a-t-elle ete creee et copiee hors de la machine?

## 1. Verifier les prerequis

### Objectif

Verifier que les outils de base sont disponibles sur la machine.

### Commandes

```powershell
git --version
docker version
docker compose version
curl.exe --version
```

### Resultat attendu

Chaque commande doit afficher une version.

Exemple:

```text
git version 2.52.0.windows.1
Docker version ...
```

### Test de validation

Si les versions s'affichent, l'environnement de base est pret.

### Erreur frequente

Si Docker retourne une erreur avec `dockerDesktopLinuxEngine`, demarrer Docker Desktop et attendre que le moteur soit actif.

## 2. Ouvrir le dossier du projet

### Objectif

Se placer dans le dossier contenant le code source.

### Commande

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
```

### Resultat attendu

Le prompt PowerShell doit afficher:

```text
PS C:\Users\Admin\Documents\Api Exraction d'audio>
```

### Test de validation

```powershell
Get-ChildItem
```

On doit voir notamment:

```text
Dockerfile
docker-compose.yml
README.md
src
scripts
```

## 3. Verifier la syntaxe du code

### Objectif

Valider que les fichiers JavaScript de l'API ne contiennent pas d'erreur de syntaxe.

### Commande

```powershell
npm.cmd run check
```

### Resultat attendu

La commande se termine sans erreur.

### Test de validation

Le terminal doit afficher:

```text
audio-extraction-transcription@1.0.0 check
```

et revenir au prompt PowerShell.

## 4. Construire et demarrer l'API Docker

### Objectif

Lancer le conteneur `transcription-api`, qui contient:

- l'API Node.js;
- FFmpeg;
- Vosk;
- le modele francais de transcription.

### Commande sans diarisation

```powershell
docker compose up --build
```

### Commande avec diarisation

```powershell
docker compose build --build-arg INSTALL_DIARIZATION=true
docker compose up
```

### Resultat attendu

Le terminal affiche:

```text
transcription-api | API disponible sur http://0.0.0.0:3000
```

### Test de validation

Dans une deuxieme fenetre PowerShell:

```powershell
curl.exe http://127.0.0.1:3000/health
```

Resultat attendu:

```json
{
  "ok": true
}
```

## 5. Tester une transcription directement avec curl

### Objectif

Verifier que l'API accepte un fichier et retourne une transcription.

### Commande

Remplacer le chemin par un vrai fichier audio ou video:

```powershell
curl.exe -X POST "http://127.0.0.1:3000/transcribe/upload" -F "file=@C:\Users\Admin\Music\Enregistrement.m4a"
```

### Resultat attendu

La reponse contient:

```text
transcript
transcriptPath
jsonPath
metadataPath
```

### Test de validation

Verifier les fichiers generes:

```powershell
Get-ChildItem "C:\Users\Admin\Documents\Api Exraction d'audio\outputs" -Recurse
```

On doit voir:

```text
transcript.txt
transcription.json
metadata.json
```

## 6. Tester Ollama en local

### Objectif

Verifier que le service Ollama est disponible pour produire une synthese.

### Commande

```powershell
curl.exe http://127.0.0.1:11434/api/tags
```

### Resultat attendu

La reponse contient:

```json
{
  "models": [...]
}
```

### Test de generation avec PowerShell

```powershell
$body = @{ model = "llama3.2:latest"; stream = $false; prompt = "Dis bonjour en francais." } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $body
```

### Resultat attendu

La reponse contient:

```text
response : Bonjour...
done     : True
```

## 7. Ouvrir n8n local

### Objectif

Acceder a l'interface de creation du workflow.

### URL

```text
http://localhost:5678
```

ou:

```text
http://127.0.0.1:5678
```

### Resultat attendu

L'interface n8n s'ouvre dans le navigateur.

### Test de validation

Creer ou ouvrir le workflow:

```text
Transcription_Local
```

## 8. Creer le workflow n8n

### Objectif

Construire le flux complet:

```text
Manual Trigger
-> Google Drive Download
-> API - Transcription
   -> Convert Transcription Originale
      -> Transcription Original
   -> HTTP Request
      -> Transcription AI Convert to File
         -> Transcription AI
```

### Resultat attendu

Le workflow contient une branche pour sauvegarder la transcription originale et une branche pour produire puis sauvegarder la synthese IA.

### Export de reference

La version validee du workflow est sauvegardee dans:

```text
n8n-workflows/Transcription_Local_2026-06-03-0702.json
```

## 9. Ajouter le noeud Manual Trigger

### Objectif

Lancer le workflow manuellement pendant les tests.

### Configuration

Ajouter:

```text
Manual Trigger
```

### Resultat attendu

Le noeud est present et ne demande aucune configuration.

### Erreur frequente

n8n n'accepte qu'un seul `Manual Trigger` par workflow.

## 10. Configurer Google Drive OAuth

### Objectif

Autoriser n8n a lire et ecrire dans Google Drive.

### Configuration Google Cloud

Dans le client OAuth, ajouter:

Origine JavaScript autorisee:

```text
http://localhost:5678
```

URI de redirection autorise:

```text
http://localhost:5678/rest/oauth2-credential/callback
```

Dans l'ecran OAuth, ajouter l'utilisateur de test:

```text
soussouhakim@gmail.com
```

Activer aussi:

```text
Google Drive API
```

### Resultat attendu

Dans n8n, le credential Google Drive indique:

```text
Account connected
```

### Tests de validation

Le noeud Google Drive ne doit plus afficher:

```text
Unable to sign without access token
```

ni:

```text
Google Drive API has not been used...
```

## 11. Configurer Google Drive Download

### Objectif

Telecharger le fichier audio/video depuis Google Drive sous forme binaire.

### Configuration

```text
Resource: File
Operation: Download
File: By URL
```

Utiliser une URL de fichier:

```text
https://drive.google.com/file/d/FILE_ID/view?usp=drive_link
```

Ne pas utiliser une URL de dossier:

```text
https://drive.google.com/drive/folders/...
```

### Resultat attendu

La sortie du noeud contient:

```text
binary.data
```

avec les informations du fichier:

```text
File Name
Mime Type
File Size
```

## 12. Configurer le noeud API - Transcription

### Objectif

Envoyer le fichier Google Drive a l'API Docker pour obtenir une transcription.

### Configuration

```text
Method: POST
URL: http://host.docker.internal:3000/transcribe/upload
Authentication: None
Send Body: true
Body Content Type: Form-Data
```

Body:

```text
Type: n8n Binary File
Name: file
Input Data Field Name: data
```

Champ optionnel:

```text
Type: Form Data
Name: language
Value: fr
```

Pour la diarisation:

```text
Type: Form Data
Name: diarize
Value: true
```

### Resultat attendu

La sortie contient:

```text
transcript
outputDir
transcriptPath
jsonPath
metadataPath
```

### Erreur frequente

Si l'erreur indique:

```text
Aucun fichier trouve dans la requete multipart. Le champ attendu est `file`.
```

verifier que le body contient bien:

```text
Name: file
Input Data Field Name: data
```

## 13. Convertir la transcription originale en fichier texte

### Objectif

Transformer le champ `transcript` retourne par l'API en fichier texte.

### Position dans le workflow

Ce noeud part directement de:

```text
API - Transcription
```

Il est en parallele de la branche Ollama.

### Configuration

Ajouter un noeud `Convert to File`:

```text
Node: Convert Transcription Originale
Operation: Convert to Text File
Text Input Field: transcript
Put Output File in Field: data
```

### Resultat attendu

La sortie contient:

```text
binary.data
Mime Type: text/plain
File Size: superieur a 0 B
```

## 14. Sauvegarder la transcription originale dans Google Drive

### Objectif

Uploader le fichier texte de transcription dans le dossier cible.

### Configuration

Ajouter un noeud Google Drive apres `Convert Transcription Originale`:

```text
Node: Transcription Original
Resource: File
Operation: Upload
Input Data Field Name: data
File Name: ={{ "transcription-originale-" + $now.toFormat("yyyy-MM-dd-HH-mm") + ".txt" }}
Parent Drive: My Drive
Parent Folder: ID du dossier cible
```

### Resultat attendu

La sortie contient:

```text
id
name
mimeType
webViewLink
```

Le fichier `transcription-originale-...txt` est visible dans le dossier cible Google Drive.

## 15. Configurer le noeud Ollama - Synthese

### Objectif

Envoyer la transcription a Ollama pour produire une synthese.

### Configuration

```text
Method: POST
URL: http://host.docker.internal:11434/api/generate
Authentication: None
Send Body: true
Body Content Type: JSON
Specify Body: Using JSON
```

Dans le champ JSON, utiliser le mode expression:

```javascript
={{
  {
    "model": "llama3.2:latest",
    "stream": false,
    "prompt": "Tu es un assistant de synthese. Resume la transcription suivante en francais. Donne: 1) un resume court, 2) les points importants, 3) les actions a faire, 4) les decisions prises.\n\nTranscription:\n" + $json.transcript
  }
}}
```

### Resultat attendu

La sortie contient:

```text
response
```

avec la synthese.

### Erreurs frequentes

Si l'erreur indique:

```text
405 method not allowed
```

mettre:

```text
Method: POST
```

Si l'erreur indique:

```text
JSON parameter needs to be valid JSON
```

utiliser l'expression JavaScript ci-dessus au lieu d'un JSON fixe contenant `{{$json.transcript}}`.

## 16. Convertir la synthese IA en fichier texte

### Objectif

Transformer le texte `response` d'Ollama en fichier binaire pour Google Drive.

### Noeud

```text
Convert to File
```

Action:

```text
Convert to text file
```

### Configuration

```text
Node: Transcription AI Convert to File
Operation: Convert to Text File
Text Input Field: response
Put Output File in Field: data
```

### Resultat attendu

La sortie contient:

```text
binary.data
```

avec:

```text
Mime Type: text/plain
File Extension: txt
```

## 17. Sauvegarder la synthese IA dans Google Drive

### Objectif

Uploader le fichier texte de synthese genere par Ollama vers Google Drive.

### Configuration

```text
Node: Transcription AI
Resource: File
Operation: Upload
Input Data Field Name: data
File Name: ={{ "synthese-ai-" + $now.toFormat("yyyy-MM-dd-HH-mm") + ".txt" }}
Parent Drive: My Drive
Parent Folder: ID du dossier cible
```

Pour choisir le repertoire cible:

- utiliser `From list` et selectionner le dossier;
- ou utiliser `By ID` et coller l'ID du dossier.

Exemple:

URL du dossier:

```text
https://drive.google.com/drive/folders/1ABCdefGHIjklMNop
```

ID a utiliser:

```text
1ABCdefGHIjklMNop
```

### Resultat attendu

La sortie contient:

```text
id
name
mimeType
webViewLink
```

Le fichier est visible dans Google Drive.

## 18. Configurer le noeud Ollama - Extraction JSON client

### Objectif

Transformer la transcription brute en fiche client hypothecaire structuree.

Ce noeud ne remplace pas la synthese. Il ajoute une branche metier destinee a alimenter un CRM, Google Sheets, PostgreSQL ou Supabase.

### Position dans le workflow

Le noeud part directement de:

```text
API - Transcription
```

Il est en parallele de la branche de synthese:

```text
API - Transcription
-> Ollama - Extraction JSON client
-> Parse JSON client
```

### Configuration

```text
Node: Ollama - Extraction JSON client
Method: POST
URL: http://host.docker.internal:11434/api/generate
Authentication: None
Send Body: true
Body Content Type: JSON
Specify Body: Using JSON
```

Dans le champ `JSON`, utiliser le mode expression.

```javascript
={{
  {
    "model": "mistral-nemo:latest",
    "stream": false,
    "format": "json",
    "prompt":
      "Tu es un assistant specialise en courtage hypothecaire au Quebec/Canada.\n\n" +
      "A partir de la transcription suivante, extrais une fiche client hypothecaire au format JSON strict.\n\n" +
      "Regles importantes:\n" +
      "- Retourne uniquement un JSON valide.\n" +
      "- N'ajoute aucun texte avant ou apres le JSON.\n" +
      "- N'utilise pas de Markdown.\n" +
      "- N'invente aucune information.\n" +
      "- Si une information est absente, utilise null.\n" +
      "- Si une information est incertaine, utilise \"A valider\".\n" +
      "- Si un nom est partiel, conserve la partie entendue et ajoute une note dans points_a_valider.\n" +
      "- Garde les montants, dates, noms et nombres selon la transcription.\n\n" +
      "Structure JSON obligatoire:\n" +
      "{\n" +
      "  \"nom_client\": null,\n" +
      "  \"prenom_client\": null,\n" +
      "  \"date_naissance\": null,\n" +
      "  \"telephone\": null,\n" +
      "  \"courriel\": null,\n" +
      "  \"type_emploi\": null,\n" +
      "  \"poste\": null,\n" +
      "  \"employeur\": null,\n" +
      "  \"salaire_mensuel\": null,\n" +
      "  \"heures_semaine\": null,\n" +
      "  \"taux_horaire\": null,\n" +
      "  \"revenu_annuel\": null,\n" +
      "  \"revenu_conjoint\": null,\n" +
      "  \"type_transaction\": null,\n" +
      "  \"prix_achat\": null,\n" +
      "  \"valeur_propriete\": null,\n" +
      "  \"solde_hypothecaire\": null,\n" +
      "  \"montant_financement\": null,\n" +
      "  \"annees_restantes\": null,\n" +
      "  \"mise_de_fonds\": null,\n" +
      "  \"pourcentage_mise_de_fonds\": null,\n" +
      "  \"provenance_mise_de_fonds\": null,\n" +
      "  \"dettes_totales\": null,\n" +
      "  \"objectif\": null,\n" +
      "  \"etat_civil\": null,\n" +
      "  \"situation_matrimoniale\": null,\n" +
      "  \"date_rappel\": null,\n" +
      "  \"informations_fiscales\": null,\n" +
      "  \"documents_requis\": [],\n" +
      "  \"points_a_valider\": [],\n" +
      "  \"prochaines_actions\": [],\n" +
      "  \"niveau_confiance\": null,\n" +
      "  \"resume\": null\n" +
      "}\n\n" +
      "Regles d'extraction detaillee:\n" +
      "- Separe le nom et le prenom si les deux sont mentionnes.\n" +
      "- Si la date de naissance est mentionnee, normalise-la au format AAAA-MM-JJ si possible.\n" +
      "- Extrait le poste exact si mentionne.\n" +
      "- Extrait salaire_mensuel, heures_semaine et taux_horaire separement.\n" +
      "- Si un montant est exprime en millions, convertis-le en nombre: 2.8 millions = 2800000, 2.5 millions = 2500000.\n" +
      "- Si une mise de fonds est exprimee en pourcentage, remplis pourcentage_mise_de_fonds.\n" +
      "- Si la provenance de la mise de fonds est mentionnee, remplis provenance_mise_de_fonds.\n" +
      "- Si le dossier concerne une propriete existante a refinancer, type_transaction = Refinancement.\n" +
      "- Si le dossier concerne l'achat d'une propriete, type_transaction = Achat.\n" +
      "- Si le dossier concerne une hypotheque arrivant a echeance, type_transaction = Renouvellement.\n" +
      "- documents_requis doit contenir les documents demandes ou utiles pour valider le dossier.\n" +
      "- points_a_valider doit contenir les informations manquantes, partielles ou incertaines.\n" +
      "- prochaines_actions doit contenir les suivis ou actions mentionnes.\n" +
      "- niveau_confiance doit etre faible, moyen ou eleve.\n" +
      "- resume doit contenir une phrase courte qui resume le dossier.\n\n" +
      "Transcription:\n" +
      $json.transcript
  }
}}
```

### Resultat attendu

La sortie contient soit:

```text
response
```

si `stream=false` est respecte, soit:

```text
data
```

si n8n recoit la reponse Ollama en streaming.

### Test de validation

Verifier que la sortie contient un JSON avec des champs comme:

```text
nom_client
prenom_client
type_transaction
prix_achat
montant_financement
documents_requis
points_a_valider
prochaines_actions
```

## 19. Configurer le noeud Parse JSON client

### Objectif

Transformer la sortie brute d'Ollama en champs n8n propres et utilisables par Google Sheets, PostgreSQL, Supabase ou un CRM.

### Position dans le workflow

```text
Ollama - Extraction JSON client
-> Parse JSON client
```

### Configuration

```text
Node: Parse JSON client
Mode: Run Once for All Items
Language: JavaScript
```

Code:

```javascript
// Recupere la reponse directe d'Ollama lorsque stream=false fonctionne.
let fullResponse = $json.response;

// Recupere la reponse en streaming lorsque n8n place le flux dans le champ data.
const rawStream = $json.data;

// Si la reponse directe est absente mais que le flux existe, on reconstruit la reponse.
if (!fullResponse && rawStream) {
  // Decoupe le flux Ollama en lignes.
  const lines = rawStream
    .split("\n")
    .filter(line => line.trim() !== "");

  // Initialise la reponse reconstruite.
  fullResponse = "";

  // Parcourt chaque ligne du flux.
  for (const line of lines) {
    // Convertit chaque ligne JSON en objet JavaScript.
    const chunk = JSON.parse(line);

    // Ajoute le morceau de texte retourne par Ollama.
    fullResponse += chunk.response || "";
  }
}

// Si aucune reponse n'est disponible, on arrete le noeud.
if (!fullResponse) {
  throw new Error("Aucune reponse Ollama trouvee dans response ou data.");
}

// Nettoie la reponse finale.
fullResponse = fullResponse.trim();

// Prepare la variable qui contiendra le JSON client.
let parsed;

// Convertit le texte JSON en objet JavaScript.
try {
  parsed = JSON.parse(fullResponse);
} catch (error) {
  throw new Error(
    "Impossible de parser le JSON client: " +
    error.message +
    "\nContenu recu: " +
    fullResponse
  );
}

// Retourne une ligne structuree pour les prochains noeuds n8n.
return [
  {
    json: {
      nom_client: parsed.nom_client ?? null,
      prenom_client: parsed.prenom_client ?? null,
      date_naissance: parsed.date_naissance ?? null,
      telephone: parsed.telephone ?? null,
      courriel: parsed.courriel ?? null,
      type_emploi: parsed.type_emploi ?? null,
      poste: parsed.poste ?? null,
      employeur: parsed.employeur ?? null,
      salaire_mensuel: parsed.salaire_mensuel ?? null,
      heures_semaine: parsed.heures_semaine ?? null,
      taux_horaire: parsed.taux_horaire ?? null,
      revenu_annuel: parsed.revenu_annuel ?? null,
      revenu_conjoint: parsed.revenu_conjoint ?? null,
      type_transaction: parsed.type_transaction ?? null,
      prix_achat: parsed.prix_achat ?? null,
      valeur_propriete: parsed.valeur_propriete ?? null,
      solde_hypothecaire: parsed.solde_hypothecaire ?? null,
      montant_financement: parsed.montant_financement ?? null,
      annees_restantes: parsed.annees_restantes ?? null,
      mise_de_fonds: parsed.mise_de_fonds ?? null,
      pourcentage_mise_de_fonds: parsed.pourcentage_mise_de_fonds ?? null,
      provenance_mise_de_fonds: parsed.provenance_mise_de_fonds ?? null,
      dettes_totales: parsed.dettes_totales ?? null,
      objectif: parsed.objectif ?? null,
      etat_civil: parsed.etat_civil ?? null,
      situation_matrimoniale: parsed.situation_matrimoniale ?? null,
      date_rappel: parsed.date_rappel ?? null,
      informations_fiscales: parsed.informations_fiscales ?? null,
      documents_requis: Array.isArray(parsed.documents_requis)
        ? parsed.documents_requis.join(", ")
        : parsed.documents_requis ?? null,
      points_a_valider: Array.isArray(parsed.points_a_valider)
        ? parsed.points_a_valider.join(", ")
        : parsed.points_a_valider ?? null,
      prochaines_actions: Array.isArray(parsed.prochaines_actions)
        ? parsed.prochaines_actions.join(", ")
        : parsed.prochaines_actions ?? null,
      niveau_confiance: parsed.niveau_confiance ?? null,
      resume: parsed.resume ?? null
    }
  }
];
```

### Resultat attendu

La sortie affiche des champs separes:

```text
nom_client
prenom_client
date_naissance
poste
salaire_mensuel
heures_semaine
taux_horaire
revenu_annuel
type_transaction
prix_achat
montant_financement
mise_de_fonds
pourcentage_mise_de_fonds
provenance_mise_de_fonds
etat_civil
documents_requis
points_a_valider
prochaines_actions
niveau_confiance
resume
```

### Erreurs frequentes

Si l'erreur indique:

```text
Aucune reponse Ollama trouvee dans response ou data.
```

executer d'abord le noeud `Ollama - Extraction JSON client`.

Si l'erreur indique:

```text
Impossible de parser le JSON client
```

verifier que le prompt demande bien:

```text
Retourne uniquement un JSON valide.
```

## 20. Sauvegarder la fiche client structuree

### Objectif

Preparer la suite CRM en envoyant les champs extraits dans une base simple.

### Option POC recommandee

Utiliser Google Sheets avec les colonnes:

```text
date_traitement
nom_client
prenom_client
date_naissance
telephone
courriel
type_emploi
poste
employeur
salaire_mensuel
heures_semaine
taux_horaire
revenu_annuel
revenu_conjoint
type_transaction
prix_achat
valeur_propriete
solde_hypothecaire
montant_financement
annees_restantes
mise_de_fonds
pourcentage_mise_de_fonds
provenance_mise_de_fonds
dettes_totales
objectif
etat_civil
situation_matrimoniale
date_rappel
informations_fiscales
documents_requis
points_a_valider
prochaines_actions
niveau_confiance
resume
```

### Evolution recommandee

Pour une version durable, migrer vers PostgreSQL ou Supabase avec les tables:

```text
representants
clients
interactions
documents_requis
taches
```

La regle de dedoublonnage cible est:

```text
representant_id + telephone
```

ou:

```text
representant_id + courriel
```

## 21. Configurer le traitement en lot Google Drive

### Objectif

Traiter automatiquement tous les fichiers presents dans un dossier Google Drive, un fichier a la fois.

Le principe est:

```text
01_A_TRAITER
-> chercher les fichiers
-> boucler fichier par fichier
-> transcrire / synthetiser / extraire
-> envoyer le courriel
-> deplacer le fichier original vers 02_TRAITES
-> passer au fichier suivant
```

### Dossiers Google Drive requis

Creer trois dossiers:

```text
01_A_TRAITER
02_TRAITES
03_ERREURS
```

Noter les ID de dossiers:

```text
ID_A_TRAITER = ID du dossier 01_A_TRAITER
ID_TRAITES = ID du dossier 02_TRAITES
ID_ERREURS = ID du dossier 03_ERREURS
```

### Resultat attendu

Les fichiers audio a traiter sont places dans `01_A_TRAITER`. Apres traitement reussi, ils sont deplaces vers `02_TRAITES`.

## 22. Ajouter le noeud Chercher fichiers a traiter

### Objectif

Lister tous les fichiers audio/video presents dans le dossier `01_A_TRAITER`.

### Position dans le workflow

```text
Manual Trigger
-> Chercher fichiers a traiter
```

### Configuration

```text
Node: Chercher fichiers a traiter
Credential: Google Drive account
Resource: File
Operation: Search
Search Method: Query
```

Requete recommandee pour audio seulement:

```text
'ID_A_TRAITER' in parents and trashed = false and mimeType contains 'audio/'
```

Requete recommandee pour audio et video:

```text
'ID_A_TRAITER' in parents and trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/')
```

Remplacer `ID_A_TRAITER` par le vrai ID Google Drive.

### Resultat attendu

Le noeud retourne un item par fichier:

```text
id
name
mimeType
```

### Erreur frequente

Si le deuxieme fichier echoue avec:

```text
Forbidden - perhaps check your credentials?
```

verifier que la requete ne retourne pas de dossier, document Google natif, raccourci ou fichier sans permission de telechargement.

## 23. Ajouter le noeud Boucle fichiers

### Objectif

Traiter les fichiers un par un pour eviter les executions paralleles lourdes.

### Position dans le workflow

```text
Chercher fichiers a traiter
-> Boucle fichiers
```

### Configuration

```text
Node: Boucle fichiers
Type: Loop Over Items ou Split In Batches
Batch Size: 1
```

### Resultat attendu

La sortie de la boucle contient:

```text
1 item
```

avec le fichier courant.

## 24. Ajouter le noeud Download file1

### Objectif

Telecharger le fichier courant de la boucle en binaire.

### Position dans le workflow

```text
Boucle fichiers
-> Download file1
```

### Configuration

```text
Node: Download file1
Credential: Google Drive account
Resource: File
Operation: Download
File: By ID
File ID: {{ $json.id }}
```

Si le champ est en mode expression `fx`, utiliser:

```javascript
$json.id
```

### Resultat attendu

La sortie contient:

```text
binary.data
File Name
Mime Type
File Size > 0 B
```

## 25. Ajouter le noeud Edit Fields pour garder l'ID original

### Objectif

Conserver l'ID du fichier Google Drive original afin de pouvoir le deplacer a la fin du traitement.

### Position dans le workflow

```text
Download file1
-> Edit Fields
-> API - Transcription
```

### Configuration

```text
Node: Edit Fields
Mode: Manual Mapping
Include Other Input Fields: true
```

Ajouter les champs:

```text
fileIdOriginal
fileNameOriginal
```

Valeurs:

```javascript
{{ $("Boucle fichiers").item.json.id }}
{{ $("Boucle fichiers").item.json.name }}
```

Si les champs sont en mode expression `fx`, utiliser:

```javascript
$("Boucle fichiers").item.json.id
$("Boucle fichiers").item.json.name
```

### Resultat attendu

La sortie contient:

```text
fileIdOriginal = vrai ID Google Drive
fileNameOriginal = nom du fichier audio
binary.data
```

## 26. Brancher le traitement existant

### Objectif

Executer la transcription, la synthese, l'extraction client et les sauvegardes pour chaque fichier de la boucle.

### Position dans le workflow

```text
Edit Fields
-> API - Transcription
```

Puis conserver les branches existantes:

```text
API - Transcription
-> Convert Transcription Originale
-> Transcription Original
```

```text
API - Transcription
-> HTTP Request
-> Transcription AI Convert to File
-> Transcription AI
-> Send a message
```

```text
API - Transcription
-> Ollama - Extraction JSON client
-> Parse JSON client
```

### Resultat attendu

Pour chaque fichier audio:

```text
1 transcription originale
1 synthese IA
1 extraction JSON client
1 courriel Gmail
```

## 27. Ajouter le noeud Recuperer ID fichier original

### Objectif

Recuperer `fileIdOriginal` apres l'envoi Gmail, car le noeud `Send a message` ne conserve pas les champs precedents.

### Position dans le workflow

Le noeud doit recevoir deux entrees:

```text
Edit Fields -> Recuperer ID fichier original
Send a message -> Recuperer ID fichier original
```

Puis:

```text
Recuperer ID fichier original
-> Move file
```

### Configuration

```text
Node: Recuperer ID fichier original
Type: Merge
Mode: Combine
Combine By: Position
Number of Inputs: 2
```

### Resultat attendu

La sortie contient un seul item avec:

```text
fileIdOriginal
fileNameOriginal
id
threadId
labelIds
```

### Erreur frequente

Si `fileIdOriginal` est absent, verifier que l'entree du Merge vient bien de `Edit Fields` et non de `API - Transcription`.

## 28. Ajouter le noeud Move file

### Objectif

Deplacer le fichier original vers `02_TRAITES` apres succes du traitement.

### Position dans le workflow

```text
Recuperer ID fichier original
-> Move file
-> retour Boucle fichiers
```

### Configuration

```text
Node: Move file
Credential: Google Drive account
Resource: File
Operation: Move
File: By ID
File ID: {{ $json.fileIdOriginal }}
Parent Drive: My Drive
Parent Folder: ID_TRAITES
```

Si le champ `File ID` est en mode expression `fx`, utiliser:

```javascript
$json.fileIdOriginal
```

### Resultat attendu

Le fichier disparait de:

```text
01_A_TRAITER
```

et apparait dans:

```text
02_TRAITES
```

### Erreurs frequentes

Si l'erreur indique:

```text
File not found: $json.fileIdOriginal
```

verifier que le champ est en mode expression et que l'apercu affiche un vrai ID Google Drive.

Si l'erreur indique:

```text
File not found: $("Edit Fields").item.json.fileIdOriginal
```

cela signifie que n8n a envoye l'expression comme texte. Utiliser plutot `$json.fileIdOriginal` apres le noeud Merge.

## 29. Fermer la boucle

### Objectif

Permettre a n8n de passer au fichier suivant apres le deplacement.

### Configuration

Connecter:

```text
Move file
-> Boucle fichiers
```

en utilisant l'entree de continuation de boucle prevue par n8n.

### Resultat attendu

Si `01_A_TRAITER` contient 4 fichiers, le workflow cree:

```text
4 transcriptions originales
4 syntheses IA
4 courriels
4 fichiers deplaces vers 02_TRAITES
```

## 30. Tester le workflow complet

### Objectif

Valider toute la chaine de bout en bout.

### Action

Cliquer sur:

```text
Execute workflow
```

### Resultat attendu

Chaque noeud devient vert:

```text
Manual Trigger
Ollama - Test synthese
Download file
API - Transcription
HTTP Request
Convert Transcription Originale
Transcription Original
Transcription AI Convert to File
Transcription AI
Ollama - Extraction JSON client
Parse JSON client
```

### Test de validation

Dans Google Drive, verifier que deux fichiers sont crees:

```text
transcription-originale-YYYY-MM-DD-HH-mm.txt
synthese-ai-YYYY-MM-DD-HH-mm.txt
```

Dans l'API locale, verifier les resultats:

```powershell
Get-ChildItem "C:\Users\Admin\Documents\Api Exraction d'audio\outputs" -Recurse
```

## 31. Exporter le workflow n8n

### Objectif

Sauvegarder la configuration n8n pour pouvoir la restaurer.

### Action dans n8n

Dans le workflow:

```text
Menu ... > Download / Export workflow
```

Sauvegarder le fichier dans:

```text
C:\Users\Admin\Documents\Api Exraction d'audio\n8n-workflows
```

Nom recommande:

```text
Transcription_Local_YYYY-MM-DD-HHmm.json
```

### Resultat attendu

Le fichier JSON du workflow existe dans le projet.

### Attention

Verifier que l'export ne contient pas de secret sensible avant de le pousser dans GitHub.

## 32. Sauvegarder le code dans GitHub

### Objectif

Versionner le code, la documentation et les exports n8n.

### Commandes

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
git status
git add .
git commit -m "Add complete recovery procedure and n8n workflow"
git push
```

### Resultat attendu

Git affiche que les fichiers sont envoyes vers GitHub.

### Test de validation

```powershell
git status
```

Resultat attendu:

```text
nothing to commit, working tree clean
```

Verifier aussi sur GitHub:

```text
https://github.com/souhak00/transcription-api
```

## 33. Sauvegarder les resultats generes

### Objectif

Creer une archive des transcriptions et metadonnees locales.

### Commandes

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
New-Item -ItemType Directory -Force backup
Compress-Archive -Path ".\outputs" -DestinationPath ".\backup\outputs-$(Get-Date -Format yyyyMMdd-HHmmss).zip"
```

### Resultat attendu

Un fichier ZIP est cree:

```text
backup\outputs-YYYYMMDD-HHMMSS.zip
```

## 34. Sauvegarder l'image Docker optionnellement

### Objectif

Conserver une copie locale de l'image Docker construite.

### Commande

```powershell
docker save apiexractiondaudio-transcription-api:latest -o backup\transcription-api-image.tar
```

### Resultat attendu

Le fichier suivant existe:

```text
backup\transcription-api-image.tar
```

### Restauration

```powershell
docker load -i backup\transcription-api-image.tar
```

## 35. Reprise rapide apres redemarrage

### Objectif

Redemarrer le travail rapidement apres une fermeture de Windows ou Docker.

### Commandes

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
docker compose up
```

Verifier l'API:

```powershell
curl.exe http://127.0.0.1:3000/health
```

Verifier Ollama:

```powershell
curl.exe http://127.0.0.1:11434/api/tags
```

Ouvrir n8n:

```text
http://localhost:5678
```

Executer le workflow.

## 36. Checklist de validation finale

Avant de considerer le systeme fonctionnel:

```text
[ ] Docker Desktop est demarre
[ ] API /health retourne ok=true
[ ] Ollama /api/tags retourne les modeles
[ ] n8n est accessible sur localhost:5678
[ ] Les dossiers Drive 01_A_TRAITER, 02_TRAITES et 03_ERREURS existent
[ ] Chercher fichiers a traiter retourne les fichiers audio/video attendus
[ ] Boucle fichiers traite 1 item a la fois
[ ] Google Drive Download retourne binary.data
[ ] Edit Fields retourne fileIdOriginal et fileNameOriginal
[ ] API - Transcription retourne transcript
[ ] HTTP Request Ollama retourne response
[ ] Convert Transcription Originale retourne binary.data avec une taille > 0 B
[ ] Transcription Original cree un fichier Google Drive
[ ] Transcription AI Convert to File retourne binary.data avec une taille > 0 B
[ ] Transcription AI cree un fichier Google Drive
[ ] Ollama - Extraction JSON client retourne response ou data
[ ] Parse JSON client retourne des champs client separes
[ ] Les champs type_transaction, documents_requis et prochaines_actions sont coherents
[ ] Construire metadata JSON retourne metadata.source, metadata.transcription, metadata.client et metadata.suivi
[ ] Construire metadata JSON retourne metadata.database_payload.client_record et metadata.database_payload.interaction_record
[ ] Le fichier metadata JSON est sauvegarde dans Google Drive avec une taille superieure a 0 B
[ ] Recuperer ID fichier original retourne fileIdOriginal apres Gmail
[ ] Move file deplace le fichier original vers 02_TRAITES
[ ] La boucle passe au fichier suivant apres Move file
[ ] Deux fichiers sont visibles dans Google Drive: transcription originale et synthese IA
[ ] Le workflow n8n est exporte
[ ] Le code est pousse dans GitHub
[ ] Les outputs sont archives
```
