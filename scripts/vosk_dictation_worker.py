import io
import json
import os
import re
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from vosk import KaldiRecognizer, Model


HOST = os.environ.get("DICTATION_WORKER_HOST", "0.0.0.0")
PORT = int(os.environ.get("DICTATION_WORKER_PORT", "2701"))
MODEL_PATH = os.environ.get("VOSK_MODEL_PATH", "/opt/vosk-model")
WORKER_TOKEN = os.environ.get("DICTATION_WORKER_TOKEN", "")
MAX_WAV_BYTES = int(os.environ.get("DICTATION_MAX_WAV_BYTES", str(2 * 1024 * 1024)))
MAX_DURATION_SECONDS = int(os.environ.get("DICTATION_MAX_DURATION_SECONDS", "35"))
MAX_TRANSCRIPT_CHARACTERS = 1000

if not WORKER_TOKEN:
    raise RuntimeError("DICTATION_WORKER_TOKEN est requis.")

MODEL = Model(MODEL_PATH)
TRANSCRIPTION_LOCK = threading.Lock()

# Les termes fréquents du CRM servent uniquement à départager les hypothèses déjà
# produites par Vosk. Le moteur conserve ainsi la dictée libre et ne charge aucun
# second modèle en mémoire.
DOMAIN_TERMS = {
    "agenda", "analyse", "approbation", "assurance", "client", "courtier",
    "courriel", "crédit", "dossier", "hypothécaire", "hypothèque", "mandat",
    "notaire", "préapprobation", "propriété", "rappel", "rendez-vous",
    "représentant", "revenu", "visite"
}


def normalize_transcript(text):
    normalized = re.sub(r"\s+", " ", text).strip()
    replacements = (
        (r"\brendez[ -]?vous\b", "rendez-vous"),
        (r"\bpré[ -]?approbation\b", "préapprobation"),
        (r"\bpré[ -]?autorisation\b", "préautorisation"),
        (r"\bcourriels?\b", lambda match: "courriels" if match.group(0).endswith("s") else "courriel"),
    )
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized


def domain_score(text):
    words = set(re.findall(r"[a-zà-ÿ-]+", text.lower()))
    return len(words & DOMAIN_TERMS)


def best_hypothesis(payload):
    alternatives = payload.get("alternatives") or []
    if not alternatives:
        return normalize_transcript(payload.get("text", ""))

    best = alternatives[0]
    best_score = float(best.get("confidence", 0)) + domain_score(best.get("text", "")) * 0.08
    for candidate in alternatives[1:]:
        candidate_score = (
            float(candidate.get("confidence", 0))
            + domain_score(candidate.get("text", "")) * 0.08
        )
        if candidate_score > best_score:
            best = candidate
            best_score = candidate_score
    return normalize_transcript(best.get("text", ""))


def transcribe_wav(content):
    with wave.open(io.BytesIO(content), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != 16000:
            raise ValueError("Le WAV doit être mono, 16 bits et 16 kHz.")

        duration = audio.getnframes() / audio.getframerate()
        if duration <= 0 or duration > MAX_DURATION_SECONDS:
            raise ValueError("La dictée dépasse la durée maximale permise.")

        recognizer = KaldiRecognizer(MODEL, audio.getframerate())
        recognizer.SetMaxAlternatives(3)
        chunks = []
        while True:
            data = audio.readframes(4000)
            if not data:
                break
            if recognizer.AcceptWaveform(data):
                text = best_hypothesis(json.loads(recognizer.Result()))
                if text:
                    chunks.append(text)

        final_text = best_hypothesis(json.loads(recognizer.FinalResult()))
        if final_text:
            chunks.append(final_text)
        return normalize_transcript(" ".join(chunks))[:MAX_TRANSCRIPT_CHARACTERS]


class DictationHandler(BaseHTTPRequestHandler):
    server_version = "ClairDictation/1.0"

    def send_json(self, status, payload):
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def authorized(self):
        return self.headers.get("X-Worker-Token", "") == WORKER_TOKEN

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"error": "Route introuvable."})
            return
        self.send_json(200, {"ok": True, "model_loaded": True})

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_json(404, {"error": "Route introuvable."})
            return
        if not self.authorized():
            self.send_json(403, {"error": "Accès refusé."})
            return
        if self.headers.get_content_type() not in {"audio/wav", "audio/x-wav"}:
            self.send_json(415, {"error": "Un fichier WAV est requis."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_WAV_BYTES:
            self.send_json(413, {"error": "Fichier audio invalide ou trop volumineux."})
            return
        if not TRANSCRIPTION_LOCK.acquire(blocking=False):
            self.send_json(429, {"error": "Le moteur de dictée est occupé."})
            return

        try:
            transcript = transcribe_wav(self.rfile.read(length))
            if not transcript:
                self.send_json(422, {"error": "Aucune parole n’a été reconnue."})
                return
            self.send_json(200, {"transcript": transcript})
        except (ValueError, wave.Error) as error:
            self.send_json(422, {"error": str(error)})
        except Exception:
            self.send_json(500, {"error": "La transcription locale a échoué."})
        finally:
            TRANSCRIPTION_LOCK.release()

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), DictationHandler)
    print(f"Worker de dictée disponible sur {HOST}:{PORT}", flush=True)
    server.serve_forever()
