# Architecture de composants

## Vue d'ensemble

```mermaid
flowchart LR
    subgraph Sources["Sources de fichiers"]
        Drive["Google Drive<br/>fichier audio ou video"]
        Local["Fichier local<br/>test curl"]
    end

    subgraph Orchestration["Orchestration"]
        Trigger["Google Drive Trigger"]
        Download["Google Drive Download<br/>binaire"]
        N8N["n8n<br/>local ou cloud"]
        Curl["curl.exe<br/>multipart/form-data"]
    end

    subgraph Service["Conteneur Docker : transcription-api"]
        API["API Node.js<br/>server.js"]
        Upload["Reception fichier<br/>upload.js"]
        Pipeline["Orchestration<br/>transcribe.js"]
        FFmpeg["FFmpeg<br/>audio.js"]
        WAV["WAV mono 16 kHz"]
        VoskLauncher["Lanceur local<br/>localTranscriber.js"]
        Vosk["Vosk + modele francais<br/>vosk_transcribe.py"]
        Diarization["Diarisation optionnelle<br/>pyannote.audio"]
        Results["Resultats<br/>transcript.txt / JSON / metadata"]
    end

    subgraph Storage["Stockage et sortie"]
        Volume["Volume Docker<br/>./outputs"]
        Consumer["n8n / Google Drive / Docs / Email"]
    end

    Drive --> Trigger --> Download --> N8N
    Local --> Curl
    N8N -->|"POST /transcribe/upload<br/>fichier binaire"| API
    Curl -->|"POST /transcribe/upload<br/>fichier binaire"| API
    API --> Upload --> Pipeline
    Pipeline --> FFmpeg --> WAV --> VoskLauncher --> Vosk
    WAV -. "si diarize=true" .-> Diarization
    Vosk --> Results
    Diarization -. "locuteurs" .-> Results
    Results --> Volume
    Results --> API
    API -->|"JSON + transcription"| N8N
    N8N --> Consumer
```

## Flux de traitement

```mermaid
sequenceDiagram
    participant D as Google Drive
    participant N as n8n
    participant A as API Node.js
    participant F as FFmpeg
    participant V as Vosk local
    participant P as pyannote optionnel
    participant O as Volume outputs

    D->>N: Nouveau fichier detecte
    N->>D: Telecharger le fichier
    D-->>N: Binaire audio/video
    N->>A: POST /transcribe/upload (file)
    A->>A: Sauvegarder upload
    A->>F: Convertir en WAV mono 16 kHz
    F-->>A: Fichier WAV
    A->>V: Transcrire le WAV
    V-->>A: Texte reconnu
    opt diarize=true
        A->>P: Identifier les plages de locuteurs
        P-->>A: SPEAKER_00, SPEAKER_01
    end
    A->>O: Ecrire transcript.txt et JSON
    A-->>N: Reponse JSON avec transcript
```

## Vue des conteneurs - n8n local

```mermaid
flowchart LR
    User["Utilisateur"]
    Drive["Google Drive"]

    subgraph Host["Machine locale / serveur Docker"]
        subgraph Network["Reseau Docker partage"]
            N8N["Conteneur n8n<br/>port 5678"]
            API["Conteneur transcription-api<br/>Node.js :3000"]

            subgraph APIImage["Dans transcription-api"]
                Server["API HTTP"]
                FFmpeg["FFmpeg"]
                Python["Python + Vosk"]
                Pyannote["pyannote.audio<br/>optionnel"]
                Model["Modele francais"]
            end
        end

        N8NVolume[("Volume n8n<br/>workflows / credentials")]
        Outputs[("Volume outputs<br/>transcript.txt / JSON")]
    end

    User -->|"Configure workflow"| N8N
    Drive -->|"Trigger + Download"| N8N
    N8N -->|"HTTP POST<br/>http://transcription-api:3000/transcribe/upload"| API
    API --> Server --> FFmpeg --> Python
    Server -. "diarize=true" .-> Pyannote
    Model --> Python
    Model -. "modele diarisation" .-> Pyannote
    Python --> Outputs
    Pyannote -. "locuteurs" .-> Outputs
    API -->|"Reponse JSON"| N8N
    N8N --- N8NVolume
```

Dans cette configuration, `n8n` et `transcription-api` sont sur le meme reseau Docker. n8n appelle directement le nom du service `transcription-api`, sans exposer l'API sur Internet.

## Vue des conteneurs - n8n Cloud

```mermaid
flowchart LR
    Drive["Google Drive"]
    N8NCloud["n8n Cloud"]
    Internet["HTTPS public"]

    subgraph CloudHost["Hebergement de votre API"]
        Gateway["Domaine HTTPS / reverse proxy"]
        API["Conteneur transcription-api<br/>Node.js :3000"]
        Outputs[("Stockage persistant<br/>outputs")]

        subgraph Runtime["Dependances embarquees"]
            FFmpeg["FFmpeg"]
            Vosk["Python + Vosk"]
            Pyannote["pyannote.audio<br/>optionnel"]
            Model["Modele francais"]
        end
    end

    Drive -->|"Trigger + Download binaire"| N8NCloud
    N8NCloud -->|"POST fichier binaire"| Internet
    Internet --> Gateway --> API
    API --> FFmpeg --> Vosk
    API -. "diarize=true" .-> Pyannote
    Model --> Vosk
    Model -. "modele diarisation" .-> Pyannote
    Vosk --> Outputs
    Pyannote -. "locuteurs" .-> Outputs
    API -->|"JSON transcription"| N8NCloud
```

Dans cette configuration, seul le conteneur `transcription-api` vous appartient. n8n Cloud envoie le fichier sur une URL HTTPS publique; il n'a pas acces a `localhost` ou aux volumes Docker de votre machine.

## Composants techniques

| Composant | Role | Fichier |
| --- | --- | --- |
| API HTTP | Recoit les appels de test ou de n8n | `src/server.js` |
| Gestion upload | Sauvegarde les fichiers multipart/base64 | `src/upload.js` |
| Pipeline | Orchestre conversion, transcription et sortie | `src/transcribe.js` |
| Conversion audio | Produit un WAV exploitable par Vosk | `src/audio.js` |
| Lanceur moteur | Execute le transcripteur local | `src/localTranscriber.js` |
| Moteur STT | Reconnaissance vocale sans LLM | `scripts/vosk_transcribe.py` |
| Diarisation | Attribution optionnelle des mots aux locuteurs | `scripts/vosk_transcribe.py`, `pyannote.audio` |
| Deploiement | Installe FFmpeg, Vosk et expose l'API | `Dockerfile`, `docker-compose.yml` |
