import { randomUUID } from "node:crypto";
import { AgentRequestError, normalizeRepresentativeId } from "./agent.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const EVENT_TYPES = new Set(["rencontre", "appel", "suivi", "echeance", "rappel", "autre"]);
const EVENT_STATUSES = new Set(["planifie", "confirme", "complete", "annule"]);
const EVENT_TYPES_REQUIRING_END = new Set(["rencontre", "appel", "suivi", "autre"]);

function normalizeDateTime(value, label) {
  const text = String(value ?? "").trim();
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) {
    throw new AgentRequestError(`${label} est invalide.`);
  }
  return date.toISOString();
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function normalizeCalendarQuery(query = {}) {
  const start = normalizeDateTime(query.start, "La date de début");
  const end = normalizeDateTime(query.end, "La date de fin");
  if (new Date(end) <= new Date(start)) {
    throw new AgentRequestError("La période de l’agenda est invalide.");
  }
  const type = String(query.type ?? "").trim().toLowerCase();
  const status = String(query.status ?? "").trim().toLowerCase();
  if (type && !EVENT_TYPES.has(type)) throw new AgentRequestError("Le type d’événement est invalide.");
  if (status && !EVENT_STATUSES.has(status)) throw new AgentRequestError("Le statut d’événement est invalide.");
  return {
    start,
    end,
    filters: {
      ...(type ? { type } : {}),
      ...(status ? { statut: status } : {}),
      ...(query.remindersOnly === true ? { rappels_seulement: true } : {}),
      ...(query.overdue === true ? { en_retard: true } : {}),
      ...(normalizeOptionalText(query.clientReference, 120)
        ? { client_reference: normalizeOptionalText(query.clientReference, 120) }
        : {})
    }
  };
}

export function normalizeCalendarEvent(input = {}) {
  const missingFields = getMissingCalendarFields(input);
  if (missingFields.length) {
    throw new AgentRequestError(`Champs à compléter : ${missingFields.join(", ")}.`);
  }
  const title = normalizeOptionalText(input.title, 160);
  const start = normalizeDateTime(input.start, "La date de début");
  const end = input.end ? normalizeDateTime(input.end, "La date de fin") : null;
  if (end && new Date(end) <= new Date(start)) {
    throw new AgentRequestError("La fin doit être postérieure au début.");
  }
  const type = String(input.type ?? "rencontre").trim().toLowerCase();
  if (!EVENT_TYPES.has(type)) throw new AgentRequestError("Le type d’événement est invalide.");
  const reminderMinutes = Number(input.reminderMinutes ?? 30);
  if (!Number.isInteger(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 43_200) {
    throw new AgentRequestError("Le délai du rappel est invalide.");
  }
  return {
    titre: title,
    type,
    description: normalizeOptionalText(input.description, 2_000),
    debut: start,
    fin: end,
    fuseau_horaire: "America/Toronto",
    emplacement: normalizeOptionalText(input.location, 240),
    lien_rencontre: normalizeOptionalText(input.meetingUrl, 500),
    client_reference: normalizeOptionalText(input.clientReference, 120),
    etape_code: normalizeOptionalText(input.stageCode, 80),
    statut: EVENT_STATUSES.has(String(input.status ?? "").trim().toLowerCase())
      ? String(input.status).trim().toLowerCase()
      : "planifie",
    source: "manuel",
    rappels: input.reminderEnabled === false
      ? []
      : [{ minutes_avant: reminderMinutes, canal: "interface" }]
  };
}

export function getMissingCalendarFields(input = {}) {
  const type = String(input.type ?? "rencontre").trim().toLowerCase();
  const fields = [];
  if (!normalizeOptionalText(input.title, 160)) fields.push("Titre");
  if (!String(input.start ?? "").trim()) fields.push("Date et heure de début");
  if (EVENT_TYPES_REQUIRING_END.has(type) && !String(input.end ?? "").trim()) {
    fields.push("Date et heure de fin");
  }
  if (normalizeOptionalText(input.stageCode, 80)
      && !normalizeOptionalText(input.clientReference, 120)) {
    fields.push("Client associé à l’étape du dossier");
  }
  return fields;
}

async function callCalendarWebhook(url, payload, options = {}) {
  if (!url) throw new AgentRequestError("Le service d’agenda n’est pas configuré.", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  try {
    const upstream = await (options.fetchImplementation ?? globalThis.fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": payload.request_id },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!upstream.ok) throw new AgentRequestError("L’orchestrateur de l’agenda est indisponible.", 502);
    if (typeof upstream.text !== "function") return await upstream.json();

    const rawResponse = await upstream.text();
    if (!rawResponse.trim()) {
      throw new AgentRequestError(
        "L’agenda n’a pas pu traiter la demande. Vérifiez que le client appartient à votre portefeuille et que l’étape choisie est valide.",
        422
      );
    }
    try {
      return JSON.parse(rawResponse);
    } catch {
      throw new AgentRequestError("L’orchestrateur de l’agenda a retourné une réponse invalide.", 502);
    }
  } catch (error) {
    if (error instanceof AgentRequestError) throw error;
    if (error.name === "AbortError") throw new AgentRequestError("Le délai de l’agenda est dépassé.", 504);
    throw new AgentRequestError("Impossible de joindre l’orchestrateur de l’agenda.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestCalendarData(query, options = {}) {
  const normalized = normalizeCalendarQuery(query);
  const representativeId = normalizeRepresentativeId(options.representativeId);
  const payload = await callCalendarWebhook(
    options.webhookUrl ?? process.env.N8N_CALENDAR_WEBHOOK_URL,
    {
      request_id: randomUUID(),
      action: "consulter",
      representant_id: representativeId,
      security_context: { representant_id: representativeId },
      ...normalized
    },
    options
  );
  const data = payload?.data ?? payload?.resultat ?? payload;
  return {
    start: data?.debut ?? normalized.start,
    end: data?.fin ?? normalized.end,
    timezone: data?.fuseau_horaire ?? "America/Toronto",
    count: Number(data?.nombre_evenements ?? data?.evenements?.length ?? 0),
    events: Array.isArray(data?.evenements) ? data.evenements : []
  };
}

export async function createCalendarEvent(input, options = {}) {
  const representativeId = normalizeRepresentativeId(options.representativeId);
  const requestId = options.requestId ?? randomUUID();
  const event = normalizeCalendarEvent(input);
  const payload = await callCalendarWebhook(
    options.webhookUrl ?? process.env.N8N_CALENDAR_WRITE_WEBHOOK_URL,
    {
      request_id: requestId,
      action: "creer",
      representant_id: representativeId,
      security_context: { representant_id: representativeId },
      event
    },
    options
  );
  return payload?.data ?? payload?.resultat ?? payload;
}

export async function updateCalendarEvent(code, input, options = {}) {
  const eventCode = String(code ?? "").trim().toUpperCase();
  if (!/^EVT-[A-Z0-9]{12}$/.test(eventCode)) {
    throw new AgentRequestError("Le code de l’événement est invalide.");
  }
  const representativeId = normalizeRepresentativeId(options.representativeId);
  const event = normalizeCalendarEvent(input);
  const payload = await callCalendarWebhook(
    options.webhookUrl ?? process.env.N8N_CALENDAR_UPDATE_WEBHOOK_URL
      ?? process.env.N8N_CALENDAR_WRITE_WEBHOOK_URL?.replace(/\/?$/, "/modifier"),
    {
      request_id: options.requestId ?? randomUUID(),
      action: "modifier",
      code_evenement: eventCode,
      representant_id: representativeId,
      security_context: { representant_id: representativeId },
      event
    },
    options
  );
  return payload?.data ?? payload?.resultat ?? payload;
}

function formatCalendarDate(value) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatCalendarReply(data, options = {}) {
  const allEvents = Array.isArray(data?.events) ? data.events : [];
  const events = Number(options.limit) > 0
    ? allEvents.slice(0, Number(options.limit))
    : allEvents;
  const label = options.remindersOnly ? "rappel" : "événement";
  if (!events.length) {
    return `Aucun ${label} trouvé pour cette période.`;
  }
  const lines = events.map((event, index) => {
    const client = event.nom_client
      ? ` — ${event.nom_client}${event.code_client ? ` (${event.code_client})` : ""}`
      : "";
    const stage = event.etape_titre ? ` — étape : ${event.etape_titre}` : "";
    const location = event.emplacement ? ` — ${event.emplacement}` : "";
    return `${index + 1}. ${formatCalendarDate(event.debut)} — ${event.titre}${client}${stage}${location}`;
  });
  return `${events.length} ${label}(s) trouvé(s) :\n\n${lines.join("\n\n")}`;
}
