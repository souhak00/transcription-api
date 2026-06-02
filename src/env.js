import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Charge les variables declarees dans un fichier `.env` dans `process.env`.
 * Une variable deja definie par Docker ou par le terminal garde la priorite.
 */
export async function loadEnvFile(filePath = ".env") {
  // `path.resolve` transforme un chemin relatif en chemin absolu depuis le dossier courant.
  const resolvedPath = path.resolve(filePath);
  let content;

  try {
    // `readFile` lit tout le fichier de configuration en texte UTF-8.
    content = await readFile(resolvedPath, "utf8");
  } catch {
    // Le fichier `.env` est facultatif: l'application peut etre configuree par Docker.
    return;
  }

  // Chaque ligne non vide peut contenir une variable sous la forme NOM=valeur.
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Les lignes vides et les commentaires ne definissent aucune variable.
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    // Une ligne sans signe egal n'est pas une declaration exploitable.
    if (separatorIndex === -1) {
      continue;
    }

    // La partie gauche est le nom de variable; la droite est sa valeur.
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    // Ne pas ecraser une variable fournie explicitement par l'environnement.
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
