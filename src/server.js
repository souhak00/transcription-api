import http from "node:http";
import path from "node:path";
import { loadEnvFile } from "./env.js";
import { transcribeMedia } from "./transcribe.js";
import { readRequestBuffer, saveBase64File, saveMultipartFile } from "./upload.js";

// Charge les options locales avant de definir le port et le moteur a employer.
await loadEnvFile();

// Le conteneur ecoute sur 0.0.0.0; en lancement direct, 127.0.0.1 est plus restrictif.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

/** Lit une requete JSON et renvoie un objet vide si aucun corps n'est envoye. */
async function readJson(request) {
  const buffer = await readRequestBuffer(request);
  if (buffer.length === 0) {
    return {};
  }

  // Le JSON convertit les donnees textuelles de la requete en objet JavaScript.
  return JSON.parse(buffer.toString("utf8"));
}

/** Produit une reponse API JSON avec le code HTTP indique. */
function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

// Le serveur traite chaque requete selon sa methode HTTP et son chemin URL.
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    // Route de supervision: elle confirme que l'API est demarree.
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    // Route JSON: accepte soit un chemin local, soit un fichier encode en base64.
    if (request.method === "POST" && url.pathname === "/transcribe") {
      const body = await readJson(request);
      const uploadDir = path.resolve(body.outputDir || "outputs", "incoming");
      // Si un chemin existe il est utilise; sinon le base64 est decode sur disque.
      const inputPath = body.inputPath || (body.fileBase64
        ? await saveBase64File(body.fileBase64, body.filename, uploadDir)
        : null);

      // Une transcription ne peut demarrer sans contenu source.
      if (!inputPath) {
        sendJson(response, 400, { error: "inputPath ou fileBase64 est requis." });
        return;
      }

      // Lance la chaine FFmpeg puis Vosk avec les options recues dans le JSON.
      const result = await transcribeMedia(inputPath, {
        language: body.language,
        command: body.command,
        commandArgs: body.commandArgs,
        diarize: Boolean(body.diarize),
        diarizationModel: body.diarizationModel,
        outputDir: body.outputDir,
        keepAudio: Boolean(body.keepAudio),
        segmentSeconds: body.segmentSeconds,
        maxAudioMb: body.maxAudioMb
      });

      sendJson(response, 200, result);
      return;
    }

    // Route multipart: c'est celle utilisee par curl et par n8n pour un binaire.
    if (request.method === "POST" && url.pathname === "/transcribe/upload") {
      const uploadDir = path.resolve("outputs", "incoming");
      // Sauvegarde d'abord l'upload, puis l'utilise comme entree de transcription.
      const { savedPath, fields } = await saveMultipartFile(request, uploadDir);
      const result = await transcribeMedia(savedPath, {
        language: fields.language,
        command: fields.command,
        commandArgs: fields.commandArgs,
        diarize: fields.diarize === "true",
        diarizationModel: fields.diarizationModel,
        outputDir: fields.outputDir,
        keepAudio: fields.keepAudio === "true",
        segmentSeconds: fields.segmentSeconds,
        maxAudioMb: fields.maxAudioMb
      });

      sendJson(response, 200, result);
      return;
    }

    // Toute route non declaree recoit une reponse HTTP 404.
    sendJson(response, 404, { error: "Route introuvable." });
  } catch (error) {
    // Toute erreur technique est retournee au client au format JSON.
    sendJson(response, 500, { error: error.message });
  }
});

// `listen` ouvre effectivement le port TCP de l'API.
server.listen(PORT, HOST, () => {
  console.log(`API disponible sur http://${HOST}:${PORT}`);
});
