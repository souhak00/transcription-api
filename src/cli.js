import { transcribeMedia } from "./transcribe.js";
import { loadEnvFile } from "./env.js";

/** Affiche les options disponibles quand l'utilisateur demande de l'aide. */
function printUsage() {
  console.log(`Usage:
  npm run transcribe -- <fichier-video-ou-audio> [options]

Options:
  --language fr              Langue ISO-639-1 de l'audio
  --command vosk-transcriber Commande locale de transcription
  --command-args "..."       Arguments, avec {input} et {output}
  --diarize                  Ajoute les etiquettes de locuteurs
  --diarization-model "..."  Modele pyannote de diarisation
  --output-dir outputs       Dossier de sortie
  --keep-audio               Conserve le WAV extrait
  --segment-seconds 600      Taille des segments locaux
  --max-audio-mb 200         Limite avant segmentation locale
`);
}

/** Convertit les arguments saisis dans PowerShell en options de transcription. */
function parseArgs(argv) {
  // Copie le tableau pour pouvoir retirer les valeurs une par une.
  const args = [...argv];
  const inputPath = args.shift();
  const options = {};

  while (args.length > 0) {
    const key = args.shift();
    // Une option sans valeur suivante est traitee comme un booleen (`true`).
    const value = args[0] && !args[0].startsWith("--") ? args.shift() : true;

    // Chaque cas associe une option de commande a la propriete attendue par l'API.
    switch (key) {
      case "--language":
        options.language = value;
        break;
      case "--command":
        options.command = value;
        break;
      case "--command-args":
        options.commandArgs = value;
        break;
      case "--diarize":
        options.diarize = true;
        break;
      case "--diarization-model":
        options.diarizationModel = value;
        break;
      case "--output-dir":
        options.outputDir = value;
        break;
      case "--keep-audio":
        options.keepAudio = true;
        break;
      case "--segment-seconds":
        options.segmentSeconds = Number(value);
        break;
      case "--max-audio-mb":
        options.maxAudioMb = Number(value);
        break;
      default:
        // Une faute de frappe ne doit pas lancer une transcription mal configuree.
        throw new Error(`Option inconnue: ${key}`);
    }
  }

  return { inputPath, options };
}

/** Point d'entree de la commande `npm run transcribe`. */
async function main() {
  await loadEnvFile();
  const { inputPath, options } = parseArgs(process.argv.slice(2));

  // Sans fichier ou avec l'option d'aide, aucune transcription n'est lancee.
  if (!inputPath || inputPath === "--help" || inputPath === "-h") {
    printUsage();
    process.exit(inputPath ? 0 : 1);
  }

  // Lance exactement le meme traitement que l'API HTTP.
  const result = await transcribeMedia(inputPath, options);
  console.log(`Transcription terminee:
- Texte: ${result.transcriptPath}
- JSON: ${result.jsonPath}
- Dossier: ${result.outputDir}`);
}

// Capture les erreurs pour afficher un message propre dans le terminal.
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
