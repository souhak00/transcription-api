import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertFfmpegAvailable,
  extractAudio,
  isFileOverLimit,
  removeFiles,
  splitAudio
} from "./audio.js";
import { transcribeLocally } from "./localTranscriber.js";

const DEFAULT_OUTPUT_DIR = "outputs";
const DEFAULT_SEGMENT_SECONDS = 600;

/**
 * Orchestre une transcription complete:
 * verification FFmpeg, conversion WAV, transcription locale et ecriture des resultats.
 */
export async function transcribeMedia(inputPath, options = {}) {
  // Arrete immediatement avec une erreur claire si la conversion est impossible.
  await assertFfmpegAvailable();

  // Un identifiant temporel cree un dossier distinct pour chaque execution.
  const runId = `${Date.now()}`;
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR, runId);
  const chunksDir = path.join(outputDir, "chunks");
  await mkdir(outputDir, { recursive: true });

  // La reconnaissance vocale recoit toujours un WAV normalise par FFmpeg.
  const audioPath = await extractAudio(inputPath, outputDir, options.audio || {});
  const segmentSeconds = Number(options.segmentSeconds || DEFAULT_SEGMENT_SECONDS);
  // La segmentation n'est activee que si l'appelant a demande une duree de segment.
  const shouldSplit = options.segmentSeconds
    ? await isFileOverLimit(audioPath, Number(options.maxAudioMb || 200))
    : false;
  // Sans segmentation, le moteur traite simplement le WAV complet.
  const audioFiles = shouldSplit ? await splitAudio(audioPath, chunksDir, segmentSeconds) : [audioPath];

  const rawTranscriptions = [];
  const transcriptParts = [];

  // Chaque morceau est transcrit successivement, puis les textes sont rassembles.
  for (const [index, file] of audioFiles.entries()) {
    const chunkTranscriptPath = path.join(outputDir, `transcript_${String(index).padStart(3, "0")}.txt`);
    const result = await transcribeLocally(file, chunkTranscriptPath, options);
    rawTranscriptions.push({
      index,
      file,
      command: result.command,
      args: result.args,
      stdout: result.stdout,
      stderr: result.stderr
    });
    transcriptParts.push(result.transcript);
  }

  // Le texte lisible final conserve un saut de ligne entre les segments.
  const transcript = transcriptParts.filter(Boolean).join("\n\n").trim();
  const transcriptPath = path.join(outputDir, "transcript.txt");
  const jsonPath = path.join(outputDir, "transcription.json");
  const metadataPath = path.join(outputDir, "metadata.json");

  // Trois sorties sont creees: texte, details d'execution et metadonnees.
  await writeFile(transcriptPath, `${transcript}\n`, "utf8");
  await writeFile(jsonPath, JSON.stringify(rawTranscriptions, null, 2), "utf8");
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        inputPath: path.resolve(inputPath),
        audioPath,
        chunks: shouldSplit ? audioFiles : [],
        engine: options.command || process.env.TRANSCRIBER_COMMAND || "vosk-transcriber",
        language: options.language || null,
        diarize: Boolean(options.diarize),
        diarizationModel: options.diarizationModel || process.env.DIARIZATION_MODEL || null,
        createdAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );

  // Si l'utilisateur ne souhaite pas garder l'audio, seul le resultat texte reste.
  if (!options.keepAudio) {
    await removeFiles([audioPath, ...audioFiles.filter((file) => file !== audioPath)]);
    // Le dossier de segments ne sert plus une fois ses WAV effaces.
    if (shouldSplit) {
      await rm(chunksDir, { recursive: true, force: true });
    }
  }

  // Cet objet devient la reponse JSON renvoyee par l'API HTTP.
  return {
    outputDir,
    transcriptPath,
    jsonPath,
    metadataPath,
    transcript
  };
}
