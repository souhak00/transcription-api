import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractAudio } from "./audio.js";

const CONTENT_TYPES = new Map([
  ["audio/webm", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/mp4", ".m4a"],
  ["audio/mpeg", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"]
]);

export class DictationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "DictationError";
    this.statusCode = statusCode;
  }
}

export function loadDictationConfig(environment = process.env) {
  const maxUploadMb = Math.min(Math.max(Number(environment.DICTATION_MAX_UPLOAD_MB || 2), 1), 10);
  return {
    workerUrl: String(environment.DICTATION_WORKER_URL || "http://dictation-worker:2701").replace(/\/+$/, ""),
    workerToken: String(environment.DICTATION_WORKER_TOKEN || ""),
    maxBytes: maxUploadMb * 1024 * 1024,
    maxPending: Math.min(Math.max(Number(environment.DICTATION_MAX_PENDING || 3), 1), 10),
    timeoutMs: Math.min(Math.max(Number(environment.DICTATION_TIMEOUT_MS || 45000), 5000), 120000),
    audioFilters: String(
      environment.DICTATION_AUDIO_FILTERS
      || "highpass=f=90,lowpass=f=7600,afftdn=nf=-28,loudnorm=I=-16:LRA=7:TP=-1.5"
    ),
    maxTranscriptCharacters: 1000
  };
}

export function normalizeAudioContentType(value = "") {
  const contentType = String(value).split(";", 1)[0].trim().toLowerCase();
  const extension = CONTENT_TYPES.get(contentType);
  if (!extension) {
    throw new DictationError("Format audio non pris en charge.", 415);
  }
  return { contentType, extension };
}

/** Corrige les confusions phonétiques fréquentes uniquement dans une commande CRM. */
export function normalizeCrmDictationTranscript(value = "") {
  let transcript = String(value).replace(/\s+/g, " ").trim();
  if (!/\b(?:clients?|dossiers?|fichiers?)\b/i.test(transcript)) return transcript;

  transcript = transcript
    .replace(
      /^(?:un|une)\s+(?:fiche|fichier|finish)\s*(?:moi|moins)?\b/i,
      "affiche-moi "
    )
    .replace(/^ainsi\s+c['’]est\b/i, "affiche")
    .replace(/\bles\s+dossiers?\s+(?:et|est)\s+de\b/i, "le dossier de")
    .replace(/\bdossiers?\s+en\s+(?:l['’]?\s*[ée]glise|bas)\b/i, "dossiers en analyse")
    .replace(/\b(?:beno[iî]t|benolt)\s+trembler\b/gi, "Benoît Tremblay")
    .replace(/\bbeno[iî]t\s+tremblay\b/gi, "Benoît Tremblay");

  return transcript.replace(/\s+/g, " ").trim();
}

export function createSerialQueue(maxPending = 3) {
  let tail = Promise.resolve();
  let pending = 0;

  return async function enqueue(task) {
    if (pending >= maxPending) {
      throw new DictationError("Le service de dictée est occupé. Réessayez dans un instant.", 429);
    }

    pending += 1;
    const execution = tail.then(task, task);
    tail = execution.catch(() => undefined);

    try {
      return await execution;
    } finally {
      pending -= 1;
    }
  };
}

async function requestWorker(wavBuffer, config, fetchImplementation = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers = {
      "content-type": "audio/wav",
      "content-length": String(wavBuffer.length)
    };
    if (config.workerToken) headers["x-worker-token"] = config.workerToken;

    const response = await fetchImplementation(`${config.workerUrl}/transcribe`, {
      method: "POST",
      headers,
      body: wavBuffer,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const forwardedStatus = [413, 415, 422, 429].includes(response.status)
        ? response.status
        : 503;
      throw new DictationError(
        payload.error || "Le moteur local de dictée n’est pas disponible.",
        forwardedStatus
      );
    }

    const transcript = String(payload.transcript || "").trim();
    if (!transcript) {
      throw new DictationError("Aucune parole n’a été reconnue.", 422);
    }
    return normalizeCrmDictationTranscript(transcript)
      .slice(0, config.maxTranscriptCharacters);
  } catch (error) {
    if (error instanceof DictationError) throw error;
    if (error.name === "AbortError") {
      throw new DictationError("La transcription locale a dépassé le délai permis.", 504);
    }
    throw new DictationError("Le moteur local de dictée n’est pas disponible.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

export function createDictationService(options = {}) {
  const config = options.config || loadDictationConfig();
  const enqueue = createSerialQueue(config.maxPending);
  const extractAudioImplementation = options.extractAudioImplementation || extractAudio;
  const fetchImplementation = options.fetchImplementation || fetch;

  return async function transcribeDictation(audioBuffer, contentType) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new DictationError("L’enregistrement audio est vide.");
    }
    if (audioBuffer.length > config.maxBytes) {
      throw new DictationError("L’enregistrement audio dépasse la limite permise.", 413);
    }

    const media = normalizeAudioContentType(contentType);
    return enqueue(async () => {
      const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "crm-dictation-"));
      const inputPath = path.join(temporaryDirectory, `instruction${media.extension}`);
      const conversionDirectory = path.join(temporaryDirectory, "converted");

      try {
        await writeFile(inputPath, audioBuffer);
        const wavPath = await extractAudioImplementation(inputPath, conversionDirectory, {
          sampleRate: 16000,
          filters: config.audioFilters
        });
        const wavBuffer = await readFile(wavPath);
        return await requestWorker(wavBuffer, config, fetchImplementation);
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    });
  };
}
