import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDirectory, sanitizeName } from "./audio.js";

/** Lit la limite au moment de la requete, apres le chargement eventuel du fichier `.env`. */
function getMaxBodyMb() {
  return Number(process.env.MAX_UPLOAD_BODY_MB || 512);
}

/** Lit le corps HTTP binaire tout en bloquant les uploads excessivement volumineux. */
export async function readRequestBuffer(request, options = {}) {
  const chunks = [];
  let size = 0;
  const maxBodyMb = getMaxBodyMb();
  const maxBytes = Number(options.maxBytes || maxBodyMb * 1024 * 1024);

  // Une requete HTTP arrive par portions; chaque portion est accumulee en memoire.
  for await (const chunk of request) {
    size += chunk.length;
    // Refuse le fichier des qu'il depasse la limite configuree.
    if (size > maxBytes) {
      throw new Error(options.errorMessage || `Fichier trop volumineux. Limite actuelle: ${maxBodyMb} MB.`);
    }
    chunks.push(chunk);
  }

  // Recompose toutes les portions en un seul contenu binaire.
  return Buffer.concat(chunks);
}

/** Convertit les en-tetes textuels d'une partie multipart en objet JavaScript. */
function parseHeaders(rawHeaders) {
  const headers = {};
  for (const line of rawHeaders.split("\r\n")) {
    const separator = line.indexOf(":");
    // Une ligne sans separateur n'est pas un en-tete HTTP valide.
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    headers[key] = line.slice(separator + 1).trim();
  }
  return headers;
}

/** Lit les informations `name` et `filename` du champ formulaire recu. */
function parseContentDisposition(value = "") {
  const result = {};
  for (const part of value.split(";")) {
    const [rawKey, rawValue] = part.trim().split("=");
    // Les fragments sans valeur ne decrivent pas un attribut exploitable.
    if (!rawKey || rawValue === undefined) {
      continue;
    }
    result[rawKey] = rawValue.replace(/^"|"$/g, "");
  }
  return result;
}

/** Separe un corps `multipart/form-data` en champs texte et fichiers binaires. */
export function parseMultipart(buffer, contentType) {
  // Le boundary est le marqueur choisi par curl/n8n pour separer les champs.
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Boundary multipart manquant.");
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = buffer.toString("binary");
  const parts = [];

  for (const rawPart of body.split(boundary)) {
    // Ignore le debut et la fermeture du formulaire qui ne contiennent pas de champ.
    if (!rawPart || rawPart === "--\r\n" || rawPart === "--") {
      continue;
    }

    const cleaned = rawPart.replace(/^\r\n/, "").replace(/\r\n--$/, "");
    const separator = cleaned.indexOf("\r\n\r\n");
    // Sans separation entetes/contenu, la partie est incomplete.
    if (separator === -1) {
      continue;
    }

    const headers = parseHeaders(cleaned.slice(0, separator));
    const content = cleaned.slice(separator + 4).replace(/\r\n$/, "");
    const disposition = parseContentDisposition(headers["content-disposition"]);

    parts.push({
      name: disposition.name,
      filename: disposition.filename,
      contentType: headers["content-type"],
      value: Buffer.from(content, "binary")
    });
  }

  return parts;
}

/** Sauvegarde le fichier binaire d'un formulaire multipart sur le disque local. */
export async function saveMultipartFile(request, outputDir) {
  const contentType = request.headers["content-type"] || "";
  const buffer = await readRequestBuffer(request);
  const parts = parseMultipart(buffer, contentType);
  // Accepte prioritairement une vraie piece jointe, ou un champ nomme `file`.
  const filePart = parts.find((part) => part.filename) || parts.find((part) => part.name === "file");

  if (!filePart) {
    throw new Error("Aucun fichier trouve dans la requete multipart. Le champ attendu est `file`.");
  }

  // Le nom est nettoye avant ecriture afin d'eviter des chemins fournis par le client.
  await ensureDirectory(outputDir);
  const safeFilename = sanitizeName(filePart.filename || "upload.bin");
  const savedPath = path.join(outputDir, safeFilename);
  await writeFile(savedPath, filePart.value);

  // Les autres champs servent d'options: langue, segmentation, etc.
  const fields = {};
  for (const part of parts) {
    if (!part.filename && part.name) {
      fields[part.name] = part.value.toString("utf8");
    }
  }

  return { savedPath, fields };
}

/** Decode un fichier fourni en base64 dans un appel JSON. */
export async function saveBase64File(fileBase64, filename, outputDir) {
  await ensureDirectory(outputDir);
  const safeFilename = sanitizeName(filename || "upload.bin");
  const savedPath = path.join(outputDir, safeFilename);
  await writeFile(savedPath, Buffer.from(fileBase64, "base64"));
  return savedPath;
}
