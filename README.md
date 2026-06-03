# Extraction audio et transcription locale

Solution Node.js locale pour extraire l'audio d'un fichier video/audio avec FFmpeg, puis produire une transcription sans LLM et sans API distante.

Les schemas de composants, de flux n8n et de deploiement par conteneurs sont disponibles dans [ARCHITECTURE.md](./ARCHITECTURE.md).
Le processus GitHub, les environnements, les releases, les rollbacks et les sauvegardes sont decrits dans [GITHUB_PROCESS.md](./GITHUB_PROCESS.md).
Le workflow n8n qui combine transcription et synthese Ollama est decrit dans [N8N_OLLAMA_WORKFLOW.md](./N8N_OLLAMA_WORKFLOW.md).
La procedure complete de reprise, avec resultats attendus et tests de validation, est disponible dans [PROCEDURE_REPRISE_COMPLETE.md](./PROCEDURE_REPRISE_COMPLETE.md).

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

Le workflow recommande est:

1. `Google Drive Trigger`: declenchement quand un fichier est cree ou modifie dans un dossier Drive.
2. `Google Drive`: operation `Download` pour recuperer le fichier en binaire.
3. `HTTP Request`: envoi du binaire a cette API.
4. `Google Drive`, `Google Docs`, `Email` ou autre sortie: stockage ou notification avec la transcription.

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
