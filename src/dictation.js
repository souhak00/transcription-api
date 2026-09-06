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
function foldFrenchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left, right) {
  if (!left || !right) return 0;
  return 1 - (levenshteinDistance(left, right) / Math.max(left.length, right.length));
}

function frenchPhoneticSkeleton(value = "") {
  const folded = foldFrenchText(value)
    .replace(/ph/g, "f")
    .replace(/(?:eau|au)/g, "o")
    .replace(/(?:ai|ay|ei|er|ez)/g, "e")
    .replace(/(?:qu|ck|c)/g, "k")
    .replace(/gn/g, "n")
    .replace(/ch/g, "s")
    .replace(/g(?=[eiy])/g, "j")
    .replace(/h/g, "")
    .replace(/[^a-z]/g, "");
  if (!folded) return "";
  return `${folded[0]}${folded.slice(1).replace(/[aeiouy]/g, "")}`
    .replace(/(.)\1+/g, "$1");
}

function nameSimilarity(spokenName, candidateName) {
  const spoken = foldFrenchText(spokenName);
  const candidate = foldFrenchText(candidateName);
  const spokenTokens = spoken.split(/\s+/).filter(Boolean);
  const candidateTokens = candidate.split(/\s+/).filter(Boolean);
  const firstSpoken = spokenTokens[0] ?? "";
  const firstCandidate = candidateTokens[0] ?? "";
  const lastSpoken = spokenTokens.at(-1) ?? "";
  const lastCandidate = candidateTokens.at(-1) ?? "";
  const firstSkeleton = frenchPhoneticSkeleton(firstSpoken);
  const candidateSkeleton = frenchPhoneticSkeleton(firstCandidate);
  const sharedPhoneticStart = firstSkeleton.length >= 2
    && candidateSkeleton.length >= 2
    && firstSkeleton.slice(0, 2) === candidateSkeleton.slice(0, 2);
  const firstScore = Math.max(
    similarity(firstSpoken, firstCandidate),
    similarity(firstSkeleton, candidateSkeleton),
    sharedPhoneticStart ? 0.82 : 0
  );
  const lastScore = Math.max(
    similarity(lastSpoken, lastCandidate),
    similarity(frenchPhoneticSkeleton(lastSpoken), frenchPhoneticSkeleton(lastCandidate))
  );
  return Math.max(similarity(spoken, candidate), firstScore * 0.8 + lastScore * 0.2);
}

function closestClientName(spokenName, clientNames = []) {
  const foldedSpokenName = foldFrenchText(spokenName);
  if (foldedSpokenName.length < 4) return null;

  let best = null;
  let secondBestScore = 0;
  for (const rawName of clientNames) {
    const name = String(rawName ?? "").trim();
    const foldedName = foldFrenchText(name);
    if (!name || !foldedName) continue;
    const score = nameSimilarity(foldedSpokenName, foldedName);
    if (!best || score > best.score) {
      secondBestScore = best?.score ?? secondBestScore;
      best = { name, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }
  if (!best) return null;
  const confidentExactMatch = best.score >= 0.9;
  const confidentPhoneticMatch = best.score >= 0.64 && best.score - secondBestScore >= 0.08;
  return confidentExactMatch || confidentPhoneticMatch ? best.name : null;
}

function correctClientReference(transcript, clientNames = []) {
  const reference = transcript.match(
    /\b(dossier|client|fichier)\s+(?:(?:de|du|pour|d)\s+|d['’])([\p{L}'’ -]{4,})\s*[?.!]*$/iu
  );
  if (!reference) return transcript;
  const correctedName = closestClientName(reference[2], clientNames);
  if (!correctedName) return transcript;
  return `${transcript.slice(0, reference.index)}${reference[1]} de ${correctedName}`.trim();
}

export function normalizeCrmDictationTranscript(value = "", options = {}) {
  let transcript = String(value).replace(/\s+/g, " ").trim();

  transcript = transcript
    .replace(/\b(?:cinq|5)\s+derniers?\s+payants?\b/i, "cinq derniers clients")
    .replace(
      /^(?:(?:[aà]|un)?\s*six\s+mois?|un\s+fils\s+paul\s+et|sa\s+finition\s+ou\s+un|il\s+inflige\s+moi)\s+(?=(?:(?:le|la|les|ma|mes|un|une|cinq)\s+)?(?:dossiers?|clients?|fichiers?|prochains?\s+(?:rendez-vous|rencontre)|rendez-vous|rencontre|agenda|documents?|t[âa]ches?|derniers?\s+clients?))/i,
      "affiche-moi "
    )
    .replace(
      /^affiche\s+mo(?:de|i|is)\s+(?=(?:(?:le|la|les|un|une)\s+)?(?:dossiers?|clients?|fichiers?|prochains?\s+rendez-vous|rendez-vous|agenda))/i,
      "affiche-moi "
    )
    .replace(
      /^.*?\baffiche\s+mois?\s+(?=(?:du|le|la|les|un|une)\s+(?:dossiers?|clients?|fichiers?))/i,
      "affiche-moi "
    );

  if (!/\b(?:clients?|dossiers?|fichiers?)\b/i.test(transcript)) {
    return transcript.replace(/\s+/g, " ").trim();
  }

  transcript = transcript
    .replace(
      /^(?:un|une)\s+(?:fiche|fichier|finish)\s*(?:moi|moins)?\b/i,
      "affiche-moi "
    )
    .replace(/^ainsi\s+c['’]est\b/i, "affiche")
    .replace(/\bles\s+dossiers?\s+(?:et|est)\s+de\b/i, "le dossier de")
    .replace(/\b(?:du|le)\s+dossier\s+son\s+analyse\b/i, "les dossiers en analyse")
    .replace(/\bdossiers?\s+en\s+(?:l['’]?\s*[ée]glise|bas)\b/i, "dossiers en analyse")
    .replace(/\b(?:beno[iî]t|benolt)\s+trembler\b/gi, "Benoît Tremblay")
    .replace(/\bbeno[iî]t\s+tremblay\b/gi, "Benoît Tremblay");

  transcript = transcript.replace(/\s+/g, " ").trim();
  return correctClientReference(transcript, options.clientNames);
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
