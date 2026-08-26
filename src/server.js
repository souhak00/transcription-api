import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentRequestError,
  detectCalendarQuery,
  extractClientCodes,
  extractUniqueClientCode,
  normalizeAgentRequest,
  normalizeClientReference,
  requestAgentReply,
  requestClientDossier,
  requestPortfolioData
} from "./agent.js";
import { AGENT_INTENTS, buildAgentResponse } from "./contracts.js";
import {
  createCalendarEvent,
  formatCalendarReply,
  requestCalendarData,
  updateCalendarEvent
} from "./calendar.js";
import { normalizeDossierUpdate, requestDossierUpdate } from "./dossier-write.js";
import {
  AuthenticationError,
  authenticateIdentity,
  authenticateRequest,
  loadKeycloakConfig
} from "./keycloak.js";
import {
  KeycloakAdminError,
  listRepresentativeAccounts,
  loadKeycloakAdminConfig,
  resetRepresentativePassword,
  setRepresentativeAccountEnabled
} from "./keycloak-admin.js";
import { loadEnvFile } from "./env.js";
import { transcribeMedia } from "./transcribe.js";
import { readRequestBuffer, saveBase64File, saveMultipartFile } from "./upload.js";

// Charge les options locales avant de definir le port et le moteur a employer.
await loadEnvFile();

// Le conteneur ecoute sur 0.0.0.0; en lancement direct, 127.0.0.1 est plus restrictif.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const WEB_DIST_DIR = path.resolve(process.env.WEB_DIST_DIR || "web/dist");
const keycloakConfig = loadKeycloakConfig();
const keycloakAdminConfig = loadKeycloakAdminConfig();
const keycloakBrowserConfig = {
  url: String(process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080").replace(/\/+$/, ""),
  realm: String(process.env.KEYCLOAK_REALM ?? "crm-local"),
  clientId: String(process.env.KEYCLOAK_CLIENT_ID ?? "crm-web")
};

function getAllowedIdentityOrigin() {
  try {
    return new URL(keycloakBrowserConfig.url).origin;
  } catch {
    return "";
  }
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function securityHeaders(contentType) {
  const identityOrigin = getAllowedIdentityOrigin();
  return {
    "content-type": contentType,
    "cache-control": contentType.startsWith("text/html") || contentType.startsWith("application/json")
      ? "no-store"
      : "public, max-age=3600",
    "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${identityOrigin}; font-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

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
  response.writeHead(status, securityHeaders("application/json; charset=utf-8"));
  response.end(JSON.stringify(payload, null, 2));
}

async function requireAdministrator(request) {
  const identity = await authenticateIdentity(request, keycloakConfig);
  if (identity.role !== "admin") {
    throw new AuthenticationError("Droits administrateur requis.", 403);
  }
  return identity;
}

/** Sert le build React et utilise index.html comme repli pour la navigation. */
async function serveWebApp(url, response) {
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const candidate = path.resolve(WEB_DIST_DIR, relativePath);
  const isInsideWebRoot = candidate === WEB_DIST_DIR || candidate.startsWith(`${WEB_DIST_DIR}${path.sep}`);

  if (!isInsideWebRoot) {
    return false;
  }

  let filePath = candidate;
  let content;

  try {
    content = await readFile(filePath);
  } catch {
    if (path.extname(relativePath)) {
      return false;
    }

    filePath = path.join(WEB_DIST_DIR, "index.html");
    try {
      content = await readFile(filePath);
    } catch {
      return false;
    }
  }

  const contentType = contentTypes[path.extname(filePath).toLowerCase()]
    || "application/octet-stream";
  response.writeHead(200, securityHeaders(contentType));
  response.end(content);
  return true;
}

// Le serveur traite chaque requete selon sa methode HTTP et son chemin URL.
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    // Route de supervision: elle confirme que l'API est demarree.
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        keycloakConfigured: keycloakConfig.configured,
        agentConfigured: Boolean(process.env.N8N_AGENT_WEBHOOK_URL),
        missingDocumentsConfigured: Boolean(process.env.N8N_MISSING_DOCUMENTS_WEBHOOK_URL),
        portfolioConfigured: Boolean(process.env.N8N_PORTFOLIO_WEBHOOK_URL),
        calendarConfigured: Boolean(process.env.N8N_CALENDAR_WEBHOOK_URL),
        calendarWriteConfigured: Boolean(process.env.N8N_CALENDAR_WRITE_WEBHOOK_URL),
        calendarUpdateConfigured: Boolean(process.env.N8N_CALENDAR_UPDATE_WEBHOOK_URL
          ?? process.env.N8N_CALENDAR_WRITE_WEBHOOK_URL),
        clientDossierConfigured: Boolean(process.env.N8N_CLIENT_DOSSIER_WEBHOOK_URL),
        dossierWriteConfigured: Boolean(process.env.N8N_DOSSIER_WRITE_WEBHOOK_URL)
      });
      return;
    }

    // Configuration OIDC publique nécessaire au navigateur; aucun secret n’est exposé.
    if (request.method === "GET" && url.pathname === "/api/auth/config") {
      sendJson(response, 200, keycloakBrowserConfig);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      const user = await authenticateIdentity(request, keycloakConfig);
      sendJson(response, 200, {
        email: user.email,
        name: user.representantName,
        role: user.role
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/portfolio") {
      const user = await authenticateRequest(request, keycloakConfig);
      const portfolio = await requestPortfolioData({
        status: url.searchParams.get("status") ?? "",
        followUp: url.searchParams.get("followUp") === "true",
        limit: url.searchParams.get("limit") ?? 100,
        sort: [{ field: url.searchParams.get("sort") ?? "updated_at", direction: "desc" }]
      }, { representativeId: user.representantId });
      sendJson(response, 200, portfolio);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/calendar") {
      const user = await authenticateRequest(request, keycloakConfig);
      const now = new Date();
      const defaultPeriod = detectCalendarQuery("agenda ce mois", now);
      const calendar = await requestCalendarData({
        start: url.searchParams.get("start") ?? defaultPeriod.start,
        end: url.searchParams.get("end") ?? defaultPeriod.end,
        type: url.searchParams.get("type") ?? "",
        status: url.searchParams.get("status") ?? "",
        remindersOnly: url.searchParams.get("remindersOnly") === "true",
        clientReference: url.searchParams.get("clientReference") ?? ""
      }, { representativeId: user.representantId });
      sendJson(response, 200, calendar);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/calendar/events") {
      const user = await authenticateRequest(request, keycloakConfig);
      const event = await createCalendarEvent(await readJson(request), {
        representativeId: user.representantId,
        requestId: request.headers["x-idempotency-key"]
      });
      sendJson(response, 201, event);
      return;
    }

    const calendarEventMatch = url.pathname.match(/^\/api\/calendar\/events\/(EVT-[A-Z0-9]{12})$/i);
    if (request.method === "PATCH" && calendarEventMatch) {
      const user = await authenticateRequest(request, keycloakConfig);
      const event = await updateCalendarEvent(calendarEventMatch[1], await readJson(request), {
        representativeId: user.representantId,
        requestId: request.headers["x-idempotency-key"]
      });
      sendJson(response, 200, event);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/representatives") {
      await requireAdministrator(request);
      const accounts = await listRepresentativeAccounts(keycloakAdminConfig);
      sendJson(response, 200, { accounts });
      return;
    }

    const adminPasswordMatch = url.pathname.match(
      /^\/api\/admin\/representatives\/([0-9a-f-]+)\/password$/i
    );
    if (request.method === "PUT" && adminPasswordMatch) {
      await requireAdministrator(request);
      const input = await readJson(request);
      await resetRepresentativePassword(
        keycloakAdminConfig,
        adminPasswordMatch[1],
        input.password
      );
      sendJson(response, 200, { status: "password_reset_required" });
      return;
    }

    const adminAccountMatch = url.pathname.match(
      /^\/api\/admin\/representatives\/([0-9a-f-]+)$/i
    );
    if (request.method === "PATCH" && adminAccountMatch) {
      await requireAdministrator(request);
      const input = await readJson(request);
      if (typeof input.enabled !== "boolean") {
        throw new KeycloakAdminError("Le statut du compte est invalide.", 400);
      }
      await setRepresentativeAccountEnabled(
        keycloakAdminConfig,
        adminAccountMatch[1],
        input.enabled
      );
      sendJson(response, 200, { status: input.enabled ? "enabled" : "disabled" });
      return;
    }

    // Frontière conversationnelle: valide l'entrée avant de la transmettre à n8n.
    if (request.method === "POST" && url.pathname === "/api/agent/messages") {
      const user = await authenticateRequest(request, keycloakConfig);
      const input = normalizeAgentRequest(await readJson(request));
      const isCalendar = [
        AGENT_INTENTS.CALENDAR_QUERY,
        AGENT_INTENTS.REMINDERS_QUERY
      ].includes(input.intent);
      const calendarMutationHelp = isCalendar && input.calendar?.mutationRequested;
      const calendarData = isCalendar && !calendarMutationHelp
        ? await requestCalendarData(input.calendar, { representativeId: user.representantId })
        : null;
      const reply = calendarMutationHelp
        ? "Pour créer une rencontre ou un rappel, ouvrez Agenda puis cliquez sur Ajouter. La création conversationnelle avec confirmation sera ajoutée dans une prochaine itération."
        : isCalendar
        ? formatCalendarReply(calendarData, {
            remindersOnly: input.intent === AGENT_INTENTS.REMINDERS_QUERY
          })
        : await requestAgentReply({
            ...input,
            representativeId: user.representantId
          });
      const clientReference = input.clientReference
        ?? extractUniqueClientCode(input.message, reply);
      const resultCodes = extractClientCodes(reply);
      sendJson(response, 200, buildAgentResponse(input, reply, {
        clientReference,
        data: {
          requested_fields: input.requestedFields,
          scope: input.scope,
          result_codes: resultCodes,
          ...(calendarData ? { calendar: calendarData } : {})
        }
      }));
      return;
    }

    // Vue structurée d’un dossier: le navigateur fournit un code métier ou un nom.
    if (request.method === "PUT" && url.pathname.startsWith("/api/clients/")
        && url.pathname.endsWith("/dossier")) {
      const user = await authenticateRequest(request, keycloakConfig);
      const encodedReference = url.pathname
        .slice("/api/clients/".length, -"/dossier".length)
        .replace(/^\/+|\/+$/g, "");
      const clientReference = normalizeClientReference(decodeURIComponent(encodedReference));
      const input = normalizeDossierUpdate(await readJson(request));
      const dossier = await requestDossierUpdate(clientReference, input, {
        representativeId: user.representantId
      });
      sendJson(response, 200, dossier);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/clients/")
        && url.pathname.endsWith("/dossier")) {
      const user = await authenticateRequest(request, keycloakConfig);
      const encodedReference = url.pathname
        .slice("/api/clients/".length, -"/dossier".length)
        .replace(/^\/+|\/+$/g, "");
      const clientReference = normalizeClientReference(decodeURIComponent(encodedReference));
      const dossier = await requestClientDossier(clientReference, {
        representativeId: user.representantId
      });
      sendJson(response, 200, dossier);
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

    // Une route API inconnue ne doit jamais retomber sur index.html : le client
    // attend du JSON et doit recevoir une erreur explicite.
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Route API introuvable." });
      return;
    }

    if (request.method === "GET" && await serveWebApp(url, response)) {
      return;
    }

    // Toute route non declaree recoit une reponse HTTP 404.
    sendJson(response, 404, { error: "Route introuvable." });
  } catch (error) {
    const status = error instanceof AgentRequestError
      || error instanceof AuthenticationError
      || error instanceof KeycloakAdminError
      ? error.statusCode
      : 500;
    // Les erreurs de l'orchestrateur sont volontairement nettoyees avant retour.
    sendJson(response, status, {
      schema_version: "1.0",
      request_id: request.headers["x-correlation-id"] ?? null,
      status: "error",
      data: null,
      reply: null,
      clarification: null,
      error: error.message
    });
  }
});

// `listen` ouvre effectivement le port TCP de l'API.
server.listen(PORT, HOST, () => {
  console.log(`API disponible sur http://${HOST}:${PORT}`);
});
