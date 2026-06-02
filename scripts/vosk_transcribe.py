import argparse
import json
import os
import wave

from vosk import KaldiRecognizer, Model


def format_time(seconds):
    """Convertit un temps en secondes vers le format HH:MM:SS."""
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    remaining = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{remaining:02d}"


def collect_vosk_words(input_path, model_path):
    """Transcrit un WAV local en texte avec un modele acoustique Vosk."""
    # Charge le modele de langue/acoustique telecharge dans l'image Docker.
    model = Model(model_path)
    words = []
    chunks = []

    # `wave.open` lit le flux audio WAV produit prealablement par FFmpeg.
    with wave.open(input_path, "rb") as audio:
        # Vosk attend ici un signal mono code sur 16 bits par echantillon.
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError("Le fichier WAV doit etre mono 16 bits. FFmpeg doit le preparer avant Vosk.")

        # Le moteur est initialise avec la frequence du fichier (normalement 16000 Hz).
        recognizer = KaldiRecognizer(model, audio.getframerate())
        # Demande a Vosk de conserver les informations de mots dans ses resultats.
        recognizer.SetWords(True)

        # Lit progressivement l'audio pour ne pas charger tout le fichier en memoire.
        while True:
            data = audio.readframes(4000)
            # Un bloc vide signifie que la fin du WAV est atteinte.
            if len(data) == 0:
                break

            # Vosk retourne `True` lorsqu'un segment de parole peut etre finalise.
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                text = result.get("text", "").strip()
                words.extend(result.get("result", []))
                # Ne conserve pas les segments silencieux ou sans texte reconnu.
                if text:
                    chunks.append(text)

        # Recupere le dernier texte restant apres la derniere portion audio.
        final_result = json.loads(recognizer.FinalResult())
        final_text = final_result.get("text", "").strip()
        words.extend(final_result.get("result", []))
        if final_text:
            chunks.append(final_text)

    return chunks, words


def run_diarization(input_path, model_name, token):
    """Execute pyannote et retourne les segments temporels de chaque locuteur."""
    try:
        from pyannote.audio import Pipeline
    except ImportError as error:
        raise RuntimeError(
            "La diarisation demande pyannote.audio. Reconstruisez l'image avec "
            "`docker compose build --build-arg INSTALL_DIARIZATION=true`."
        ) from error

    # Certains modeles Hugging Face exigent un token et l'acceptation des conditions.
    pipeline = Pipeline.from_pretrained(model_name, token=token)
    diarization = pipeline(input_path)
    segments = []

    # `itertracks(yield_label=True)` fournit debut, fin et nom de locuteur.
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": float(turn.start),
            "end": float(turn.end),
            "speaker": speaker,
        })

    return segments


def speaker_for_word(word, segments):
    """Trouve le locuteur dont le segment couvre le centre temporel du mot."""
    midpoint = (float(word.get("start", 0)) + float(word.get("end", 0))) / 2
    for segment in segments:
        if segment["start"] <= midpoint <= segment["end"]:
            return segment["speaker"]
    return "SPEAKER_UNKNOWN"


def build_diarized_lines(words, segments):
    """Regroupe les mots consecutifs qui appartiennent au meme locuteur."""
    lines = []
    current = None

    for word in words:
        speaker = speaker_for_word(word, segments)
        token = word.get("word", "").strip()
        if not token:
            continue

        # Un nouveau bloc commence quand le locuteur change.
        if not current or current["speaker"] != speaker:
            if current:
                lines.append(current)
            current = {
                "speaker": speaker,
                "start": float(word.get("start", 0)),
                "end": float(word.get("end", 0)),
                "words": [],
            }

        current["end"] = float(word.get("end", current["end"]))
        current["words"].append(token)

    if current:
        lines.append(current)

    return [
        f"[{format_time(line['start'])} - {format_time(line['end'])}] "
        f"{line['speaker']}: {' '.join(line['words'])}"
        for line in lines
    ]


def transcribe(input_path, output_path, model_path, diarize=False, diarization_model=None, hf_token=None):
    """Transcrit l'audio et, si demande, ajoute les etiquettes de locuteurs."""
    chunks, words = collect_vosk_words(input_path, model_path)

    if diarize:
        # pyannote separe les plages temporelles par locuteur, sans appeler de LLM.
        diarization_segments = run_diarization(input_path, diarization_model, hf_token)
        diarized_lines = build_diarized_lines(words, diarization_segments)
        transcript = "\n".join(diarized_lines).strip()
    else:
        # Sans diarisation, on conserve simplement le texte reconnu par Vosk.
        transcript = "\n".join(chunks).strip()

    # Assemble les segments reconnus en transcription lisible.
    # Ecrit le fichier texte que le serveur Node relira pour sa reponse JSON.
    with open(output_path, "w", encoding="utf-8") as output:
        output.write(transcript + "\n")


def main():
    """Lit les arguments transmis par Node.js puis declenche la transcription."""
    # `argparse` valide que les chemins indispensables sont fournis.
    parser = argparse.ArgumentParser(description="Transcription locale WAV avec Vosk.")
    parser.add_argument("--input", required=True, help="Chemin du fichier WAV mono.")
    parser.add_argument("--output", required=True, help="Chemin du fichier texte a produire.")
    parser.add_argument("--model", default="/opt/vosk-model", help="Chemin du modele Vosk.")
    parser.add_argument("--diarize", action="store_true", help="Active la diarisation des locuteurs.")
    parser.add_argument(
        "--diarization-model",
        default=os.getenv("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1"),
        help="Modele pyannote a utiliser pour identifier les locuteurs.",
    )
    parser.add_argument(
        "--hf-token",
        default=os.getenv("HUGGINGFACE_TOKEN"),
        help="Token Hugging Face si le modele pyannote le demande.",
    )
    args = parser.parse_args()

    # Les arguments valides sont transmis a la fonction de traitement.
    transcribe(
        args.input,
        args.output,
        args.model,
        diarize=args.diarize,
        diarization_model=args.diarization_model,
        hf_token=args.hf_token,
    )


# Ce test execute `main` uniquement lorsque ce fichier est lance comme commande.
if __name__ == "__main__":
    main()
