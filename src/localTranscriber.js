import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const DEFAULT_COMMAND = "vosk-transcriber";

/**
 * Transforme une chaine d'arguments en tableau accepte par `spawn`.
 * Les guillemets permettent de conserver un chemin contenant des espaces.
 */
function splitArgs(value) {
  const args = [];
  let current = "";
  let quote = null;

  for (const char of value) {
    // L'ouverture d'un guillemet commence un argument pouvant contenir des espaces.
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }

    // Un guillemet identique ferme la portion protegee.
    if (char === quote) {
      quote = null;
      continue;
    }

    // Hors guillemets, un espace separe deux arguments de commande.
    if (char === " " && !quote) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/** Prepare les arguments en remplacant les emplacements par les vrais chemins. */
function buildArgs(options, audioPath, outputPath) {
  const commandArgs = options.commandArgs || process.env.TRANSCRIBER_ARGS;
  const diarizeArgs = options.diarize ? "--diarize" : "";
  const diarizationModel = options.diarizationModel || process.env.DIARIZATION_MODEL || "";
  const diarizationModelArgs = diarizationModel ? `--diarization-model "${diarizationModel}"` : "";

  if (commandArgs) {
    return splitArgs(
      commandArgs
        .replaceAll("{input}", audioPath)
        .replaceAll("{output}", outputPath)
        .replaceAll("{diarizeArgs}", diarizeArgs)
        .replaceAll("{diarizationModelArgs}", diarizationModelArgs)
    );
  }

  // Format par defaut attendu par la commande historique `vosk-transcriber`.
  return ["-i", audioPath, "-o", outputPath];
}

/** Execute le moteur speech-to-text local et renvoie le texte qu'il a ecrit. */
export async function transcribeLocally(audioPath, outputPath, options = {}) {
  const command = options.command || process.env.TRANSCRIBER_COMMAND || DEFAULT_COMMAND;
  const args = buildArgs(options, audioPath, outputPath);

  return new Promise((resolve, reject) => {
    // Le moteur est un sous-processus: aucun service cloud n'est appele ici.
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `${command} introuvable ou impossible a lancer. Installez un moteur de transcription local, par exemple Vosk, ou definissez TRANSCRIBER_COMMAND. Detail: ${error.message}`
        )
      );
    });

    child.on("close", async (code) => {
      // Un code non nul indique un echec du moteur Vosk/Python.
      if (code !== 0) {
        reject(new Error(`${command} a echoue avec le code ${code}.\n${stderr || stdout}`));
        return;
      }

      // Le script local ecrit la transcription dans le fichier de sortie demande.
      const transcript = await readFile(outputPath, "utf8");
      resolve({
        command,
        args,
        transcript: transcript.trim(),
        stdout,
        stderr
      });
    });
  });
}
