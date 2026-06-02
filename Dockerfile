# Image de base fournissant Node.js, necessaire au serveur HTTP.
FROM node:24-bookworm-slim

# Installe FFmpeg pour la conversion et Python pour l'execution de Vosk.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip wget unzip \
  && rm -rf /var/lib/apt/lists/*

# Installe la bibliotheque de reconnaissance vocale locale Vosk.
RUN pip3 install --break-system-packages --no-cache-dir vosk==0.3.45

# La diarisation est optionnelle car pyannote.audio ajoute des dependances lourdes.
ARG INSTALL_DIARIZATION=false
RUN if [ "$INSTALL_DIARIZATION" = "true" ]; then \
    pip3 install --break-system-packages --no-cache-dir pyannote.audio; \
  fi

# Telecharge un modele francais compact puis le place dans un chemin stable.
ARG VOSK_MODEL_URL=https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip
RUN wget -O /tmp/vosk-model.zip "$VOSK_MODEL_URL" \
  && unzip /tmp/vosk-model.zip -d /opt \
  && mv /opt/vosk-model-* /opt/vosk-model \
  && rm /tmp/vosk-model.zip

# Definit le dossier d'execution du serveur a l'interieur du conteneur.
WORKDIR /app

# Copie uniquement les fichiers utiles a l'execution de l'API.
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY README.md ./

# Configure l'API et la commande Python que Node lancera pour chaque audio.
ENV HOST=0.0.0.0
ENV PORT=3000
ENV TRANSCRIBER_COMMAND=python3
ENV TRANSCRIBER_ARGS="scripts/vosk_transcribe.py --model /opt/vosk-model --input {input} --output {output} {diarizeArgs} {diarizationModelArgs}"
ENV DIARIZATION_MODEL=pyannote/speaker-diarization-3.1

# Documente le port reseau ecoute par l'application.
EXPOSE 3000

# Lance le serveur HTTP au demarrage du conteneur.
CMD ["node", "src/server.js"]
