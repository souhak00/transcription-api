# Ameliorer la qualite de transcription

Le texte fourni montre des erreurs typiques de reconnaissance vocale:

- mots proches phonetiquement confondus;
- mots manquants;
- ponctuation absente;
- erreurs sur les noms propres;
- erreurs sur les montants et dates;
- mauvaise comprehension des passages rapides ou telephoniques.

Cette solution reste locale et sans LLM pour la transcription. Les ameliorations principales sont donc:

1. utiliser un meilleur modele Vosk;
2. mieux preparer l'audio avec FFmpeg;
3. comparer les resultats avant/apres;
4. optionnellement utiliser Ollama uniquement pour reformater/corriger le texte apres transcription, pas pour transcrire l'audio.

## 1. Utiliser le grand modele francais Vosk

Le conteneur utilise par defaut:

```text
vosk-model-small-fr-0.22
```

Ce modele est leger, environ 41 MB. Il est rapide, mais moins precis.

Pour une meilleure precision, utiliser:

```text
vosk-model-fr-0.22
```

Ce modele fait environ 1,4 GB et demande plus de memoire, mais il est beaucoup plus adapte a une transcription serveur.

Source officielle: [Vosk Models](https://alphacephei.com/vosk/models)

## 2. Construire Docker avec le grand modele

Depuis le dossier du projet:

```powershell
cd "C:\Users\Admin\Documents\Api Exraction d'audio"
```

Construire avec le grand modele francais:

```powershell
docker compose build --build-arg VOSK_MODEL_URL=https://alphacephei.com/vosk/models/vosk-model-fr-0.22.zip
docker compose up
```

Avec diarisation en plus:

```powershell
docker compose build `
  --build-arg VOSK_MODEL_URL=https://alphacephei.com/vosk/models/vosk-model-fr-0.22.zip `
  --build-arg INSTALL_DIARIZATION=true
docker compose up
```

## 3. Verifier que l'API fonctionne

```powershell
curl.exe http://127.0.0.1:3000/health
```

Resultat attendu:

```json
{
  "ok": true
}
```

## 4. Tester le meme fichier avant/apres

Tester l'audio directement:

```powershell
curl.exe -X POST "http://127.0.0.1:3000/transcribe/upload" -F "file=@C:\Users\Admin\Music\Enregistrement.m4a" -F "language=fr"
```

Comparer:

- nombre de mots manquants;
- noms propres;
- dates;
- montants;
- phrases longues;
- passages ou plusieurs personnes parlent.

## 5. Filtrage audio active par defaut

La solution applique maintenant ce filtrage FFmpeg:

```text
highpass=f=80,lowpass=f=7800,loudnorm
```

Effets:

- `highpass=f=80`: retire une partie des basses frequences parasites;
- `lowpass=f=7800`: limite les frequences inutiles pour la voix;
- `loudnorm`: normalise le volume.

Pour modifier ou desactiver:

```env
FFMPEG_AUDIO_FILTERS=highpass=f=80,lowpass=f=7800,loudnorm
```

Desactiver:

```env
FFMPEG_AUDIO_FILTERS=
```

## 6. Ce qui peut encore limiter la qualite

Meme avec un meilleur modele, la transcription peut rester imparfaite si:

- le fichier audio est faible ou sature;
- plusieurs personnes parlent en meme temps;
- le locuteur parle vite;
- il y a du bruit de fond;
- l'audio vient d'un telephone;
- les noms propres ne sont pas connus du modele;
- les montants/dates sont prononces de maniere ambigue.

## 7. Option: correction de texte apres transcription

La transcription audio reste faite par Vosk. Ensuite, Ollama peut etre utilise pour nettoyer le texte:

```text
Corrige uniquement la ponctuation, les accords evidents et le formatage.
Ne change pas les informations factuelles.
Conserve les noms, dates, montants et nombres tels qu'ils apparaissent.
```

Cette correction doit etre traitee comme une aide de lisibilite, pas comme une preuve exacte.

