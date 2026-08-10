import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_CLIENT_REFERENCE_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_CODE_PATTERN = /\bCLI-\d{4}-[A-Z]{2}-\d{6}\b/gi;
const ALLOWED_INTENTS = new Set([
  "conversation",
  "clients_recents",
  "dossier_client",
  "documents_client",
  "taches_client"
]);

export class AgentRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AgentRequestError";
    this.statusCode = statusCode;
  }
}

/** Valide et normalise le message provenant de l interface Web. */
export function normalizeAgentRequest(body = {}) {
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    throw new AgentRequestError("Le message est requis.");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new AgentRequestError(
      `Le message dépasse la limite de ${MAX_MESSAGE_LENGTH} caractères.`
    );
  }

  const sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
    ? body.sessionId.trim().slice(0, 100)
    : randomUUID();

  let intent = typeof body.intent === "string" && body.intent.trim()
    ? body.intent.trim()
    : "conversation";

  if (intent === "conversation") {
    if (/\b(documents?|pi[eè]ces?)\b/i.test(message)) {
      intent = "documents_client";
    } else if (/\b(t[âa]ches?|suivis?)\b/i.test(message)) {
      intent = "taches_client";
    } else if (/\b(afficher|affiche|ouvrir|ouvre|consulter|consulte|résumer|resume|résume)\b.*\bdossier\b/i.test(message)) {
      intent = "dossier_client";
    }
  }

  if (intent && !ALLOWED_INTENTS.has(intent)) {
    throw new AgentRequestError("L’intention demandée n’est pas autorisée.");
  }

  return { message, sessionId, intent };
}

/** Extrait uniquement la réponse conversationnelle du contrat n8n. */
export function extractAgentReply(payload) {
  const value = Array.isArray(payload) ? payload[0] : payload;
  const reply = value?.reply ?? value?.reponse ?? value?.output ?? value?.response;

  if (typeof reply !== "string" || !reply.trim()) {
    throw new AgentRequestError(
      "Le service d’orchestration a retourné une réponse incomplète.",
      502
    );
  }

  return reply.trim();
}

/** Retourne un code client seulement si la réponse désigne un client unique. */
export function extractUniqueClientCode(...values) {
  const codes = new Set();

  for (const value of values) {
    for (const match of String(value ?? "").matchAll(CLIENT_CODE_PATTERN)) {
      codes.add(match[0].toUpperCase());
    }
  }

  return codes.size === 1 ? [...codes][0] : null;
}

/** Valide un code client ou un nom avant de demander un dossier à n8n. */
export function normalizeClientReference(value) {
  const reference = typeof value === "string" ? value.trim() : "";

  if (!reference) {
    throw new AgentRequestError("Le client à afficher est requis.");
  }

  if (reference.length > MAX_CLIENT_REFERENCE_LENGTH) {
    throw new AgentRequestError(
      `La référence client dépasse la limite de ${MAX_CLIENT_REFERENCE_LENGTH} caractères.`
    );
  }

  return reference;
}

/** Accepte uniquement une identité de représentant déjà validée par l’API. */
export function normalizeRepresentativeId(value) {
  const representativeId = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(representativeId)) {
    throw new AgentRequestError("L’identité du représentant est invalide.", 403);
  }
  return representativeId;
}

/** Extrait le contrat structuré du dossier sans accepter de données techniques. */
export function extractClientDossier(payload) {
  const value = Array.isArray(payload) ? payload[0] : payload;
  const dossier = value?.dossier ?? value?.resultat ?? value;

  if (!dossier || typeof dossier !== "object" || Array.isArray(dossier)) {
    throw new AgentRequestError(
      "Le service d’orchestration a retourné un dossier incomplet.",
      502
    );
  }

  return dossier;
}

/** Extrait le code métier d’une commande ou conserve le texte pour la résolution par nom. */
export function extractClientReferenceFromMessage(message) {
  const code = String(message).toUpperCase().match(/CLI-\d{4}-[A-Z]{2}-\d{6}/)?.[0];
  return code ?? String(message).trim();
}

/** Formate un dossier JSON en réponse conversationnelle stable. */
export function formatClientDossierReply(result) {
  if (result?.ambigue) {
    const choices = Array.isArray(result.correspondances) ? result.correspondances : [];
    const lines = choices.map((client, index) =>
      `${index + 1}. ${client.nom_client} — ${client.code_client}`
    );
    return `Plusieurs clients correspondent :\n\n${lines.join("\n")}\n\nPrécisez le client recherché.`;
  }

  if (!result?.trouve || !result?.dossier) {
    return "Aucun dossier client ne correspond à cette recherche.";
  }

  const dossier = result.dossier;
  const summary = dossier.resume_dossier ?? {};
  const missingDocuments = (dossier.documents ?? []).filter((document) =>
    ["a recevoir", "à recevoir", "manquant", "en attente"]
      .includes(String(document.statut ?? "").toLowerCase())
  );
  const openTasks = (dossier.taches ?? []).filter((task) =>
    ["ouverte", "ouvert", "en cours", "à faire", "a faire"]
      .includes(String(task.statut ?? "").toLowerCase())
  );
  const nextAction = dossier.prochaine_action?.description
    ?? dossier.prochaine_action?.titre
    ?? "Aucune action planifiée";

  const lines = [
    `Dossier de ${dossier.nom_client} — ${dossier.code_client}`,
    `Statut : ${dossier.statut_dossier ?? "Non défini"}`,
    `Transaction : ${dossier.type_transaction ?? "Non renseignée"}`,
    `Emploi : ${dossier.type_emploi ?? "Non renseigné"}${dossier.employeur ? ` chez ${dossier.employeur}` : ""}`,
    `Interactions : ${summary.nombre_interactions ?? 0}`,
    `Documents manquants : ${summary.nombre_documents_manquants ?? missingDocuments.length}`,
    `Tâches ouvertes : ${summary.nombre_taches_ouvertes ?? openTasks.length}`,
    `Prochaine action : ${nextAction}`
  ];

  if (missingDocuments.length) {
    lines.push(`Pièces à recevoir : ${missingDocuments.map((document) => document.document).join(", ")}`);
  }

  return lines.join("\n");
}

/** Formate une réponse stable même lorsqu’aucun document n’est manquant. */
export function formatClientDocumentsReply(result) {
  if (result?.ambigue) return formatClientDossierReply(result);
  if (!result?.trouve || !result?.dossier) {
    return "Aucun dossier client ne correspond à cette recherche.";
  }

  const dossier = result.dossier;
  const missingDocuments = (dossier.documents ?? []).filter((document) =>
    ["a recevoir", "à recevoir", "manquant", "en attente"]
      .includes(String(document.statut ?? "").toLowerCase())
  );

  if (!missingDocuments.length) {
    return `Aucun document manquant pour ${dossier.nom_client} — ${dossier.code_client}.`;
  }

  const lines = missingDocuments.map((document, index) =>
    `${index + 1}. ${document.document}`
  );
  return `Documents manquants pour ${dossier.nom_client} — ${dossier.code_client} :\n\n${lines.join("\n")}`;
}

/** Formate une réponse stable même lorsqu’aucune tâche n’est ouverte. */
export function formatClientTasksReply(result) {
  if (result?.ambigue) return formatClientDossierReply(result);
  if (!result?.trouve || !result?.dossier) {
    return "Aucun dossier client ne correspond à cette recherche.";
  }

  const dossier = result.dossier;
  const openTasks = (dossier.taches ?? []).filter((task) =>
    ["ouverte", "ouvert", "en cours", "à faire", "a faire"]
      .includes(String(task.statut ?? "").toLowerCase())
  );

  if (!openTasks.length) {
    return `Aucune tâche ouverte pour ${dossier.nom_client} — ${dossier.code_client}.`;
  }

  const lines = openTasks.map((task, index) => {
    const dueDate = task.date_echeance ? ` — échéance ${task.date_echeance}` : "";
    return `${index + 1}. ${task.titre}${dueDate}`;
  });
  return `Tâches ouvertes pour ${dossier.nom_client} — ${dossier.code_client} :\n\n${lines.join("\n")}`;
}

/** Demande à n8n le dossier JSON d’un client visible par le représentant. */
export async function requestClientDossier(clientReference, options = {}) {
  const webhookUrl = options.webhookUrl ?? process.env.N8N_CLIENT_DOSSIER_WEBHOOK_URL;
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? process.env.AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const representativeId = normalizeRepresentativeId(options.representativeId);

  if (!webhookUrl) {
    throw new AgentRequestError("Le service de dossier client n’est pas configuré.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetchImplementation(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": randomUUID()
      },
      body: JSON.stringify({
        client_reference: clientReference,
        representant_id: representativeId
      }),
      signal: controller.signal
    });

    if (!upstream.ok) {
      throw new AgentRequestError(
        "L’orchestrateur CRM n’est pas disponible pour le moment.",
        502
      );
    }

    return extractClientDossier(await upstream.json());
  } catch (error) {
    if (error instanceof AgentRequestError) throw error;

    if (error.name === "AbortError") {
      throw new AgentRequestError(
        "Le délai de chargement du dossier est dépassé. Réessayez dans un instant.",
        504
      );
    }

    throw new AgentRequestError("Impossible de joindre l’orchestrateur CRM.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Appelle le webhook n8n. Le navigateur ne connait jamais cette adresse et ne
 * peut donc pas contourner la frontière API.
 */
export async function requestAgentReply(input, options = {}) {
  const representativeId = normalizeRepresentativeId(input.representativeId);

  if (["dossier_client", "documents_client", "taches_client"].includes(input.intent)) {
    const clientReference = extractClientReferenceFromMessage(input.message);
    const dossier = await requestClientDossier(clientReference, {
      webhookUrl: options.clientDossierWebhookUrl,
      fetchImplementation: options.fetchImplementation,
      timeoutMs: options.timeoutMs,
      representativeId
    });
    if (input.intent === "documents_client") return formatClientDocumentsReply(dossier);
    if (input.intent === "taches_client") return formatClientTasksReply(dossier);
    return formatClientDossierReply(dossier);
  }

  const conversationWebhookUrl = options.webhookUrl ?? process.env.N8N_AGENT_WEBHOOK_URL;
  const recentClientsWebhookUrl = options.recentClientsWebhookUrl
    ?? process.env.N8N_RECENT_CLIENTS_WEBHOOK_URL;
  const webhookUrl = input.intent === "clients_recents"
    ? recentClientsWebhookUrl
    : conversationWebhookUrl;
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? process.env.AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  if (!webhookUrl) {
    throw new AgentRequestError("Le service conversationnel n’est pas configuré.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetchImplementation(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": randomUUID()
      },
      body: JSON.stringify({
        message: input.message,
        session_id: input.sessionId,
        intent: input.intent ?? "conversation",
        representant_id: representativeId
      }),
      signal: controller.signal
    });

    if (!upstream.ok) {
      throw new AgentRequestError(
        "L’orchestrateur CRM n’est pas disponible pour le moment.",
        502
      );
    }

    const payload = await upstream.json();
    return extractAgentReply(payload);
  } catch (error) {
    if (error instanceof AgentRequestError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new AgentRequestError(
        "Le délai de réponse de l’assistant est dépassé. Réessayez dans un instant.",
        504
      );
    }

    throw new AgentRequestError(
      "Impossible de joindre l’orchestrateur CRM.",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const agentLimits = {
  maxMessageLength: MAX_MESSAGE_LENGTH
};
