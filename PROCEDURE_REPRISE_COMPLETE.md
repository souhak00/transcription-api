# Procedure complete de reprise du projet

Cette procedure permet de reprendre le projet depuis le debut sans perdre le fil. Elle couvre:

- le demarrage de l'API Docker;
- le test de transcription;
- la connexion n8n;
- la synthese avec Ollama;
- la sauvegarde dans Google Drive;
- la sauvegarde du code dans GitHub.

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

## 18. Tester le workflow complet

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

## 19. Exporter le workflow n8n

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

## 20. Sauvegarder le code dans GitHub

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

## 21. Sauvegarder les resultats generes

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

## 22. Sauvegarder l'image Docker optionnellement

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

## 23. Reprise rapide apres redemarrage

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

## 24. Checklist de validation finale

Avant de considerer le systeme fonctionnel:

```text
[ ] Docker Desktop est demarre
[ ] API /health retourne ok=true
[ ] Ollama /api/tags retourne les modeles
[ ] n8n est accessible sur localhost:5678
[ ] Google Drive Download retourne binary.data
[ ] API - Transcription retourne transcript
[ ] HTTP Request Ollama retourne response
[ ] Convert Transcription Originale retourne binary.data avec une taille > 0 B
[ ] Transcription Original cree un fichier Google Drive
[ ] Transcription AI Convert to File retourne binary.data avec une taille > 0 B
[ ] Transcription AI cree un fichier Google Drive
[ ] Deux fichiers sont visibles dans Google Drive: transcription originale et synthese IA
[ ] Le workflow n8n est exporte
[ ] Le code est pousse dans GitHub
[ ] Les outputs sont archives
```
