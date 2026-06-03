import { spawn } from "node:child_process";
import { access, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SAMPLE_RATE = "16000";
const DEFAULT_AUDIO_FILTERS = "highpass=f=80,lowpass=f=7800,loudnorm";

/** Verifie que le fichier d'entree existe et est lisible. */
export async function ensureFileExists(filePath) {
  await access(filePath);
}

/** Cree le dossier demande ainsi que ses dossiers parents s'ils manquent. */
export async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

/** Nettoie un nom recu en upload pour produire un nom de fichier utilisable. */
export function sanitizeName(value) {
  return value
    // Remplace les caracteres inhabituels par un tiret.
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    // Evite plusieurs tirets consecutifs apres remplacement.
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    // Limite la longueur des noms crees par l'API.
    .slice(0, 80) || "audio";
}

/** Lance un programme externe et transforme son resultat en Promise JavaScript. */
export async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    // `spawn` execute FFmpeg sans ouvrir de fenetre supplementaire sous Windows.
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    // Conserve la sortie standard pour les journaux ou les messages de retour.
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    // Conserve les erreurs emises par l'outil externe.
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    // Cet evenement est emis lorsque l'executable n'est pas trouvable/lancable.
    child.on("error", (error) => {
      reject(new Error(`${command} introuvable ou impossible a lancer: ${error.message}`));
    });

    child.on("close", (code) => {
      // Par convention, un code de sortie 0 signifie que la commande a reussi.
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      // Tout autre code interrompt le traitement avec le detail FFmpeg disponible.
      reject(new Error(`${command} a echoue avec le code ${code}.\n${stderr || stdout}`));
    });
  });
}

/** Echoue rapidement si FFmpeg n'est pas installe dans le conteneur ou la machine. */
export async function assertFfmpegAvailable() {
  await runCommand("ffmpeg", ["-version"]);
}

/** Convertit le media d'entree en WAV mono 16 kHz compatible avec Vosk. */
export async function extractAudio(inputPath, outputDir, options = {}) {
  const resolvedInput = path.resolve(inputPath);
  await ensureFileExists(resolvedInput);
  await ensureDirectory(outputDir);

  const baseName = sanitizeName(path.parse(resolvedInput).name);
  const outputPath = path.join(outputDir, `${baseName}.wav`);
  const sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
  const filters = options.filters || process.env.FFMPEG_AUDIO_FILTERS || DEFAULT_AUDIO_FILTERS;

  // FFmpeg ignore l'image video (`-vn`) et genere un signal PCM mono 16 bits.
  const args = [
    "-y",
    "-i",
    resolvedInput,
    "-vn",
    "-ac",
    "1",
    "-ar",
    sampleRate,
  ];

  if (filters) {
    args.push("-af", filters);
  }

  args.push(
    "-acodec",
    "pcm_s16le",
    outputPath
  );

  await runCommand("ffmpeg", args);

  return outputPath;
}

/** Decoupe un WAV long en morceaux afin de limiter le temps de traitement par appel. */
export async function splitAudio(audioPath, chunksDir, segmentSeconds = 600) {
  await ensureDirectory(chunksDir);
  const pattern = path.join(chunksDir, "chunk_%03d.wav");
  const filters = process.env.FFMPEG_AUDIO_FILTERS || DEFAULT_AUDIO_FILTERS;

  const args = [
    "-y",
    "-i",
    audioPath,
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-reset_timestamps",
    "1",
    "-ac",
    "1",
    "-ar",
    DEFAULT_SAMPLE_RATE,
  ];

  if (filters) {
    args.push("-af", filters);
  }

  args.push(
    "-acodec",
    "pcm_s16le",
    pattern
  );

  await runCommand("ffmpeg", args);

  const files = await readdir(chunksDir);
  // Renvoie les morceaux WAV dans l'ordre de leur numero de segment.
  return files
    .filter((file) => file.toLowerCase().endsWith(".wav"))
    .sort()
    .map((file) => path.join(chunksDir, file));
}

/** Determine si un fichier depasse une limite exprimee en megaoctets. */
export async function isFileOverLimit(filePath, limitMb) {
  const fileStats = await stat(filePath);
  return fileStats.size > limitMb * 1024 * 1024;
}

/** Supprime les fichiers intermediaires sans faire echouer une transcription terminee. */
export async function removeFiles(paths) {
  await Promise.all(
    paths.map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch {
        // Une suppression impossible n'annule pas le texte deja produit.
      }
    })
  );
}
