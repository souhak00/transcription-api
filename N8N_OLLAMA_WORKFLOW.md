# Workflow n8n : transcription API + synthese Ollama

Ce guide decrit un workflow n8n qui:

1. detecte ou recoit un fichier audio/video;
2. envoie le fichier a l'API `transcription-api`;
3. recupere la transcription;
4. envoie la transcription a Ollama;
5. produit une synthese exploitable.

## Prerequis

- Le conteneur `transcription-api` doit etre demarre.
- Ollama doit etre demarre et accessible par n8n.
- Un modele Ollama doit etre telecharge, par exemple:

```powershell
ollama pull llama3.1
```

Verifier Ollama:

```powershell
curl.exe http://127.0.0.1:11434/api/tags
```

Verifier l'API de transcription:

```powershell
curl.exe http://127.0.0.1:3000/health
```

## URLs selon le mode d'execution

### n8n installe directement sur la machine

```text
API transcription: http://127.0.0.1:3000/transcribe/upload
Ollama: http://127.0.0.1:11434/api/generate
```

### n8n dans Docker sur Windows avec API/Ollama sur la machine hote

```text
API transcription: http://host.docker.internal:3000/transcribe/upload
Ollama: http://host.docker.internal:11434/api/generate
```

### n8n, transcription-api et Ollama dans le meme reseau Docker

```text
API transcription: http://transcription-api:3000/transcribe/upload
Ollama: http://ollama:11434/api/generate
```

## Workflow n8n recommande

```mermaid
flowchart LR
    DriveTrigger["Google Drive Trigger"]
    DriveDownload["Google Drive Download"]
    Transcription["HTTP Request<br/>transcription-api"]
    Ollama["HTTP Request<br/>Ollama"]
    Save["Google Docs / Drive / Email"]

    DriveTrigger --> DriveDownload --> Transcription --> Ollama --> Save
```

## Noeud 1 - Google Drive Trigger

Objectif: declencher le workflow quand un fichier est ajoute dans un dossier Google Drive.

Configuration typique:

```text
Event: File Created
Folder: dossier contenant les audios/videos
```

## Noeud 2 - Google Drive Download

Objectif: telecharger le fichier detecte en binaire.

Configuration typique:

```text
Operation: Download
File ID: valeur venant du trigger
Binary Property: data
```

Le nom `data` est important: il sera utilise par le noeud HTTP suivant.

## Noeud 3 - HTTP Request vers transcription-api

Objectif: envoyer le fichier binaire a l'API de transcription.

Configuration:

```text
Method: POST
URL: http://host.docker.internal:3000/transcribe/upload
Body Content Type: Form-Data
```

Dans le body:

```text
Parameter Type: n8n Binary File
Name: file
Input Data Field Name: data
```

Champs texte optionnels:

```text
language = fr
diarize = false
keepAudio = false
```

Avec diarisation:

```text
diarize = true
```

Sortie attendue:

```json
{
  "outputDir": "...",
  "transcriptPath": "...",
  "jsonPath": "...",
  "metadataPath": "...",
  "transcript": "texte transcrit..."
}
```

## Noeud 4 - HTTP Request vers Ollama

Objectif: generer une synthese a partir du champ `transcript`.

Configuration:

```text
Method: POST
URL: http://host.docker.internal:11434/api/generate
Body Content Type: JSON
```

Body JSON:

```json
{
  "model": "llama3.1",
  "stream": false,
  "prompt": "Tu es un assistant de synthese. Resume la transcription suivante en francais. Donne: 1) resume court, 2) points importants, 3) actions a faire, 4) decisions prises. Transcription: {{$json.transcript}}"
}
```

Sortie attendue d'Ollama:

```json
{
  "response": "Synthese..."
}
```

Dans n8n, le texte de synthese est disponible dans:

```text
{{$json.response}}
```

## Noeud 5 - Sauvegarde du resultat

Options possibles:

- creer un Google Doc;
- creer un fichier `.txt` dans Google Drive;
- envoyer un email;
- enregistrer dans une base de donnees;
- envoyer vers Teams/Slack.

Exemple de contenu a sauvegarder:

```text
Titre: Synthese - {{$now}}

TRANSCRIPTION
{{$node["HTTP Request transcription-api"].json["transcript"]}}

SYNTHESE
{{$node["HTTP Request Ollama"].json["response"]}}
```

## Test manuel sans Google Drive

Pour tester le milieu du workflow, remplacer temporairement Google Drive par un noeud `Read Binary File` ou executer un test curl:

```powershell
curl.exe -X POST "http://127.0.0.1:3000/transcribe/upload" -F "file=@C:\Users\Admin\Music\test.m4a"
```

Puis tester Ollama:

```powershell
curl.exe -X POST "http://127.0.0.1:11434/api/generate" `
  -H "Content-Type: application/json" `
  -d "{\"model\":\"llama3.1\",\"stream\":false,\"prompt\":\"Resume ceci en francais: Ceci est une reunion de test.\"}"
```

