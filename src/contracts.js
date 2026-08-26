import { randomUUID } from "node:crypto";

export const AGENT_SCHEMA_VERSION = "1.0";

export const AGENT_INTENTS = Object.freeze({
  CONVERSATION: "conversation",
  RECENT_CLIENTS: "clients_recents",
  CLIENTS_MISSING_DOCUMENTS: "clients_documents_manquants",
  PORTFOLIO_QUERY: "consultation_portefeuille",
  CLIENT_DOSSIER: "dossier_client",
  CLIENT_QUERY: "consultation_client",
  CLIENT_DOCUMENTS: "documents_client",
  CLIENT_TASKS: "taches_client",
  CALENDAR_QUERY: "consultation_agenda",
  REMINDERS_QUERY: "consultation_rappels"
});

export const ALLOWED_AGENT_INTENTS = new Set(Object.values(AGENT_INTENTS));

/** Construit la commande interne transmise à l'orchestrateur. */
export function buildAgentCommand(input, representativeId) {
  return {
    schema_version: AGENT_SCHEMA_VERSION,
    request_id: input.requestId,
    session_id: input.sessionId,
    intent: input.intent,
    message: input.message,
    subject: { client_reference: input.clientReference ?? null },
    parameters: {
      requested_fields: Array.isArray(input.requestedFields) ? input.requestedFields : [],
      scope: input.scope ?? "single_client",
      filters: input.portfolio?.filters ?? {},
      sort: input.portfolio?.sort ?? [],
      aggregate: input.portfolio?.aggregate ?? null,
      limit: input.portfolio?.limit ?? null,
      format: input.portfolio?.format ?? "text"
    },
    conversation_context: {
      active_client: input.context?.activeClient ?? null,
      // Une nouvelle consultation globale ne doit pas hériter d'un filtre caché.
      // Une relance anaphorique expose explicitement sa sélection ici.
      last_result_codes: input.intent === AGENT_INTENTS.PORTFOLIO_QUERY
        ? (Array.isArray(input.portfolio?.selectionCodes) ? input.portfolio.selectionCodes : [])
        : (Array.isArray(input.context?.lastResultCodes) ? input.context.lastResultCodes : [])
    },
    interpretation: {
      source: input.interpretationSource,
      confidence: input.confidence,
      clarification_required: input.clarificationRequired
    },
    security_context: { representant_id: representativeId }
  };
}

/** Produit une enveloppe stable sans retirer les champs utilisés par React. */
export function buildAgentResponse(input, reply, options = {}) {
  return {
    schema_version: AGENT_SCHEMA_VERSION,
    request_id: input.requestId,
    status: "success",
    intent: input.intent,
    data: options.data ?? null,
    reply,
    clarification: input.clarificationRequired
      ? {
          required: true,
          missing_fields: ["client_reference"],
          question: reply
        }
      : null,
    error: null,
    sessionId: input.sessionId,
    clientReference: options.clientReference ?? null
  };
}

export function createRequestId(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : randomUUID();
}
