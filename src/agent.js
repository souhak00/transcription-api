import { randomUUID } from "node:crypto";
import {
  AGENT_INTENTS,
  ALLOWED_AGENT_INTENTS,
  buildAgentCommand,
  createRequestId
} from "./contracts.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_CLIENT_REFERENCE_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_CODE_PATTERN = /\bCLI-\d{4}-[A-Z]{2}-\d{6}\b/gi;
const GENERIC_CLIENT_REQUEST = /^(?:quels?|quelles?|montre|affiche|donne|liste)?\s*(?:moi\s*)?(?:les?\s*)?(?:documents?|pi[eè]ces?|papiers?|t[âa]ches?|suivis?|dossier)\s*(?:manquants?|ouverts?)?\s*[?.!]*$/i;
const ANAPHORA_PATTERN = /\b(?:ses|son|sa|lui|elle|il|ce client|ce dossier|celui-ci|celle-ci)\b/i;
const DOCUMENT_TERM_PATTERN = /\b(?:documents?|pi[eè]ces?|papiers?|paperasse|relev[eé]s?)\b/i;
const MISSING_TERM_PATTERN = /\b(?:manquants?|manquantes?|en attente|[àa] fournir|[àa] recevoir|[àa] r[eé]clamer|reste)\b/i;
const PORTFOLIO_TERM_PATTERN = /\b(?:quels? clients?|quelles? personnes?|qui|portefeuille|liste des clients|montre\w*\s+les clients|affiche\w*\s+les clients)\b/i;
const PORTFOLIO_LIST_PATTERN = /\b(?:tous?|toutes?|chaque|liste|clients?|dossiers?|portefeuille)\b/i;
const PORTFOLIO_ACTION_PATTERN = /\b(?:affich\w*|montr\w*|list\w*|class\w*|tri\w*|priori\w*|relanc\w*|plus gros|plus grand|revenu (?:le )?plus|tableau|tableur|export\w*)\b/i;
// Une nouvelle demande globale (par exemple « affiche les dossiers en analyse »)
// ne doit jamais être limitée aux résultats précédents. Seules les formulations
// réellement anaphoriques réutilisent cette sélection.
const LAST_RESULT_PATTERN = /\b(?:ceux|celles|le tout|ces clients|ces dossiers)\b|\b(?:class|tri|affich|montr)\w*-les\b/i;
const PRODUCT_PATTERN = /\b(?:achat|refinanc\w*|renouvellement|pr[eé](?:approbation|qualification)|produit hypoth[eé]caire)\b/i;
const DEFERRED_DOMAIN_PATTERN = /\b(?:r[eé]trocession|commission|r[eé]mun[eé]ration|Beacon|ratios?|endettement)\b/i;
const NAME_STOP_WORDS = new Set([
  "As", "A", "Au", "Aux", "Avec", "Combien", "Comment", "Dans", "De", "Des", "Du",
  "Est", "Le", "La", "Les", "Liste", "Montre", "Où", "Peux", "Pour", "Quel", "Quelle",
  "Quelles", "Quels", "Quand", "Un", "Une"
]);

export const CLIENT_QUERY_FIELDS = Object.freeze({
  STATUS: "statut_dossier",
  UPDATED_AT: "updated_at",
  NEXT_ACTION: "prochaine_action",
  PHONE: "telephone",
  EMAIL: "courriel",
  ANNUAL_INCOME: "revenu_annuel",
  DOWN_PAYMENT: "mise_de_fonds",
  DOWN_PAYMENT_SOURCE: "provenance_mise_de_fonds",
  LOAN_AMOUNT: "montant_financement",
  LENDER: "preteur",
  PRODUCT: "produit",
  APPROVAL_STATUS: "statut_approbation",
  APPROVAL_DATE: "date_approbation",
  APPROVAL_CONDITIONS: "conditions_approbation",
  RATE: "taux_interet",
  RATE_TYPE: "type_taux",
  TERM_MONTHS: "terme_mois",
  AMORTIZATION_YEARS: "amortissement_annees",
  CLOSING_DATE: "date_fermeture",
  DISBURSEMENT_DATE: "date_decaissement",
  NOTARY_NAME: "notaire_nom",
  NOTARY_PHONE: "notaire_telephone",
  NOTARY_STATUS: "instructions_notaire_statut",
  NOTARY_DATE: "instructions_notaire_date",
  APPRAISAL_REQUIRED: "evaluation_requise",
  APPRAISAL_STATUS: "evaluation_statut",
  APPRAISER: "evaluateur_nom",
  APPRAISAL_DATE: "evaluation_date",
  APPRAISED_VALUE: "valeur_evaluee",
  INSURANCE_REQUIRED: "assurance_requise",
  INSURER: "assureur_pret",
  INSURANCE_STATUS: "assurance_statut",
  INSURANCE_PREMIUM: "prime_assurance",
  BIRTH_DATE: "date_naissance",
  ADDRESS: "adresse",
  CONTACT_PREFERENCE: "preference_contact",
  PARTICIPANTS: "participants",
  PROJECT_TYPE: "type_transaction",
  PROJECT_TIMELINE: "echeancier_projet",
  PROPERTY_TYPE: "type_propriete",
  OCCUPANCY: "type_occupation",
  CONSENTS: "consentements"
});

/** Isole une référence humaine avant d'évaluer les pronoms ou le contexte. */
export function extractExplicitClientReference(message) {
  const text = String(message ?? "").trim();
  const code = text.toUpperCase().match(/\bCLI-\d{4}-[A-Z]{2}-\d{6}\b/)?.[0];
  if (code) return code;

  // Les utilisateurs écrivent souvent les noms entièrement en minuscules.
  // Cette forme reste volontairement contrainte à « dossier/demande/fichier
  // de|pour <nom> » en fin de phrase afin de ne pas transformer une requête
  // globale (« afficher tous les dossiers ») en consultation individuelle.
  const lowercaseContextualName = text.match(
    /\b(?:dossier|demande|fichier)\s+(?:de|pour)\s+([\p{L}][\p{L}'’-]+(?:\s+[\p{L}][\p{L}'’-]+)?)(?=\s*[?.!]*$)/iu
  )?.[1];
  if (lowercaseContextualName) return lowercaseContextualName;

  const titledName = text.match(/\b(?:M(?:me)?|Monsieur|Madame)\.?\s+([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+)?)/u)?.[1];
  if (titledName) return titledName;

  const clientName = text.match(/\b(?:client|cliente)\s+([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+)?)/u)?.[1];
  if (clientName) return clientName;

  const contextualName = text.match(/\b(?:dossier|demande|fichier|pour)\s+(?:de\s+)?([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+)?)/u)?.[1];
  if (contextualName && !NAME_STOP_WORDS.has(contextualName)) return contextualName;

  const propertyOwner = text.match(/\b(?:maison|propri[eé]t[eé])\s+de\s+([\p{Lu}][\p{L}'’-]+)/u)?.[1];
  if (propertyOwner) return propertyOwner;

  const candidates = [...text.matchAll(/\b[\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+)+\b/gu)]
    .map((match) => match[0])
    .filter((candidate) => !NAME_STOP_WORDS.has(candidate.split(/\s+/)[0]));
  return candidates.at(-1) ?? null;
}

/** Détermine uniquement les champs CRM qui existent déjà dans le dossier JSON. */
export function detectClientQueryFields(message) {
  const text = String(message ?? "");
  if (DEFERRED_DOMAIN_PATTERN.test(text)) return [];
  const specializedDomain = /(?:[eé]valuation|[eé]valuateur)|\b(?:expertise|notaire|notari[eé]|SCHL|Sagen|Canada Guaranty|assurance|assureur|approbation|approuv\w*)\b/i.test(text);
  const fields = [];
  const add = (...values) => values.forEach((value) => {
    if (!fields.includes(value)) fields.push(value);
  });

  if (!specializedDomain && (/[eé]tat|\b(?:statut|avance|rendue?|nouvelles?)\b|\bo[uù]\s+en\b|\bsuivi\b.*\b(?:fichier|dossier|demande)\b/i.test(text))) {
    add(CLIENT_QUERY_FIELDS.STATUS, CLIENT_QUERY_FIELDS.UPDATED_AT);
    if (/\b(?:prochaine? [eé]tape|suite|blocage)\b/i.test(text)) add(CLIENT_QUERY_FIELDS.NEXT_ACTION);
  }
  if (/\b(?:coordonn[eé]es?|t[eé]l[eé]phone|num[eé]ro|courriel|e-?mail|joindre|contacter)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.PHONE, CLIENT_QUERY_FIELDS.EMAIL);
  }
  if (/\b(?:date de naissance|n[eé]e? le|anniversaire|quel [aâ]ge)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.BIRTH_DATE);
  }
  if (/\b(?:adresse|domicile|habite|r[eé]sidence actuelle|code postal)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.ADDRESS);
  }
  if (/\b(?:pr[eé]f[eé]rence de contact|moyen de contact|fa[cç]on de joindre|moment pour joindre|quand le joindre)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.CONTACT_PREFERENCE);
  }
  if (/\b(?:co-?demandeur|co-?emprunteur|garant|participants? au dossier)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.PARTICIPANTS);
  }
  if (/\b(?:type de (?:transaction|projet)|achat|refinanc\w*|renouvellement)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.PROJECT_TYPE);
  }
  if (/\b(?:[eé]ch[eé]ancier|quand.*(?:acheter|projet)|d[eé]lai du projet|prochains mois)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.PROJECT_TIMELINE);
  }
  if (/(?:\btype de propri[eé]t[eé]|\bjumel[eé]e?|\bcondo\b|\bplex\b|\bmaison unifamiliale\b)/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.PROPERTY_TYPE);
  }
  if (/\b(?:occupation|occup[eé]e? par|propri[eé]taire occupant|locatif|r[eé]sidence secondaire)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.OCCUPANCY);
  }
  if (/(?:\bconsentements?\b|\bautorisation de cr[eé]dit|\banti-?pourriel\b|\bconfidentialit[eé])/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.CONSENTS);
  }
  if (/\b(?:salaire|revenu|gagne|paye|brut)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.ANNUAL_INCOME);
  }
  if (/\b(?:mise de fonds|acompte|comptant|apport)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.DOWN_PAYMENT);
    if (/\b(?:provenance|source|provient|vient)\b/i.test(text)) add(CLIENT_QUERY_FIELDS.DOWN_PAYMENT_SOURCE);
  }
  if (/\b(?:montant|somme|combien|solde)\b.*\b(?:pr[eê]t|financement|hypoth[eè]que|emprunt)\b|\bcombien\b.*\bemprunt/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.LOAN_AMOUNT);
  }
  if (/\b(?:approuv\w*|accord|accept[eé]e?|r[eé]ponse du pr[eê]teur|conditionnel|ferme)\b/i.test(text)) {
    add(
      CLIENT_QUERY_FIELDS.APPROVAL_STATUS,
      CLIENT_QUERY_FIELDS.LENDER,
      CLIENT_QUERY_FIELDS.APPROVAL_DATE,
      CLIENT_QUERY_FIELDS.APPROVAL_CONDITIONS
    );
  }
  if (/\b(?:banque|pr[eê]teur|institution financi[eè]re)\b|\bplace-t-on\b.*\bhypoth[eè]que\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.LENDER, CLIENT_QUERY_FIELDS.PRODUCT);
  }
  if (/\b(?:taux|terme|fixe|variable|amortissement)\b/i.test(text)) {
    add(
      CLIENT_QUERY_FIELDS.RATE,
      CLIENT_QUERY_FIELDS.RATE_TYPE,
      CLIENT_QUERY_FIELDS.TERM_MONTHS,
      CLIENT_QUERY_FIELDS.AMORTIZATION_YEARS
    );
  }
  if (/\b(?:prise de possession|cl[oô]ture|fermeture|signature finale|date limite de financement)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.CLOSING_DATE);
  }
  if (/\b(?:d[eé]bours[eé]s?|d[eé]boursement)\b/i.test(text)) {
    add(CLIENT_QUERY_FIELDS.DISBURSEMENT_DATE);
  }
  if (/\b(?:notaire|mandat)\b|\bnotari[eé]/i.test(text)) {
    add(
      CLIENT_QUERY_FIELDS.NOTARY_NAME,
      CLIENT_QUERY_FIELDS.NOTARY_PHONE,
      CLIENT_QUERY_FIELDS.NOTARY_STATUS,
      CLIENT_QUERY_FIELDS.NOTARY_DATE
    );
  }
  if (/(?:[eé]valuation|[eé]valuateur)|\bexpertise immobili[eè]re\b/i.test(text)) {
    add(
      CLIENT_QUERY_FIELDS.APPRAISAL_REQUIRED,
      CLIENT_QUERY_FIELDS.APPRAISAL_STATUS,
      CLIENT_QUERY_FIELDS.APPRAISER,
      CLIENT_QUERY_FIELDS.APPRAISAL_DATE,
      CLIENT_QUERY_FIELDS.APPRAISED_VALUE
    );
  }
  if (/\b(?:SCHL|Sagen|Canada Guaranty|assurance|assureur|prime)\b/i.test(text)) {
    add(
      CLIENT_QUERY_FIELDS.INSURANCE_REQUIRED,
      CLIENT_QUERY_FIELDS.INSURER,
      CLIENT_QUERY_FIELDS.INSURANCE_STATUS,
      CLIENT_QUERY_FIELDS.INSURANCE_PREMIUM
    );
  }

  return fields;
}

function isMissingDocumentsPortfolioRequest(message, clientReference = null) {
  return DOCUMENT_TERM_PATTERN.test(message)
    && MISSING_TERM_PATTERN.test(message)
    && PORTFOLIO_TERM_PATTERN.test(message)
    && !clientReference;
}

function normalizeContextCodes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item ?? "").trim().toUpperCase())
    .filter((item) => /^CLI-\d{4}-[A-Z]{2}-\d{6}$/.test(item)))]
    .slice(0, 100);
}

/** Traduit les consultations globales en parametres metier autorises. */
export function detectPortfolioQuery(message, context = {}) {
  const text = String(message ?? "");
  const lastResultCodes = normalizeContextCodes(context.lastResultCodes);
  const refersToLastResult = lastResultCodes.length > 0 && LAST_RESULT_PATTERN.test(text);
  const explicitPortfolio = PORTFOLIO_TERM_PATTERN.test(text)
    || (PORTFOLIO_LIST_PATTERN.test(text) && PORTFOLIO_ACTION_PATTERN.test(text));
  const aggregateIncome = /\b(?:plus (?:gros|grand|haut) revenu|revenu (?:le )?plus (?:gros|grand|haut)|gagne le plus)\b/i.test(text);
  const sortByPriority = /\b(?:class\w*|tri\w*|priori\w*|ordre de traitement)\b/i.test(text);
  const followUp = /\b(?:a|à)\s+relancer\b|\brelanc\w*\b|\ben retard\b/i.test(text);
  const tableFormat = /\b(?:tableau|tableur|excel|csv|export\w*)\b/i.test(text);

  if (!(explicitPortfolio || refersToLastResult || aggregateIncome || followUp)) return null;

  const statusText = text.match(/\b(en analyse|documents? requis|nouve(?:au|aux|lle|lles)|preappro\w*|préappro\w*|prequal\w*|préqual\w*)\b/i)?.[1];
  const knownStatus = !statusText
    ? null
    : /^nouve/i.test(statusText)
      ? "Nouveau"
      : /^pr[eé]appro/i.test(statusText)
        ? "Préapprouvé"
        : /^pr[eé]qual/i.test(statusText)
          ? "Préqualification"
          : /^documents?/i.test(statusText)
            ? "Documents requis"
            : "En analyse";
  const limit = Number(text.match(/\b(?:les?\s+)?(\d{1,3})\s+(?:derniers?|clients?|dossiers?)\b/i)?.[1] ?? 20);

  return {
    filters: {
      ...(knownStatus ? { statut: knownStatus } : {}),
      ...(followUp ? { a_relancer: true } : {})
    },
    sort: sortByPriority || followUp
      ? [{ field: "priority_score", direction: "desc" }]
      : /\bderniers?\b/i.test(text)
        ? [{ field: "updated_at", direction: "desc" }]
        : [],
    aggregate: aggregateIncome ? { operation: "max", field: "revenu_annuel" } : null,
    limit: Math.max(1, Math.min(limit, 100)),
    format: tableFormat ? "table" : "text",
    selectionCodes: refersToLastResult ? lastResultCodes : []
  };
}

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

  const explicitIntent = typeof body.intent === "string" && body.intent.trim()
    ? body.intent.trim()
    : null;
  let intent = explicitIntent ?? AGENT_INTENTS.CONVERSATION;
  let interpretationSource = explicitIntent ? "explicit" : "ai_fallback";
  let confidence = explicitIntent ? 1 : 0.5;
  const explicitClientReference = extractExplicitClientReference(message);
  const requestedFields = detectClientQueryFields(message);
  const contextInput = {
    activeClient: body.context?.activeClient,
    lastResultCodes: normalizeContextCodes(body.context?.lastResultCodes)
  };
  const portfolio = detectPortfolioQuery(message, contextInput);

  if (intent === AGENT_INTENTS.CONVERSATION) {
    if (isMissingDocumentsPortfolioRequest(message, explicitClientReference)) {
      intent = AGENT_INTENTS.CLIENTS_MISSING_DOCUMENTS;
    } else if (portfolio && !explicitClientReference) {
      intent = AGENT_INTENTS.PORTFOLIO_QUERY;
    } else if (requestedFields.length) {
      intent = AGENT_INTENTS.CLIENT_QUERY;
    } else if (DOCUMENT_TERM_PATTERN.test(message) && (!PRODUCT_PATTERN.test(message) || explicitClientReference)) {
      intent = AGENT_INTENTS.CLIENT_DOCUMENTS;
    } else if (/\b(t[âa]ches?|rappels?|rendez-vous|agenda|rencontres?|planifier)\b|\bsuivis?\b(?!\s+hypoth[eé]caire)/i.test(message)) {
      intent = AGENT_INTENTS.CLIENT_TASKS;
    } else if (/\b(afficher|affiche|ouvrir|ouvre|consulter|consulte|résumer|resume|résume)\b.*\bdossier\b/i.test(message)) {
      intent = AGENT_INTENTS.CLIENT_DOSSIER;
    }

    if (intent !== AGENT_INTENTS.CONVERSATION) {
      interpretationSource = "deterministic";
      confidence = 1;
    }
  }

  if (intent && !ALLOWED_AGENT_INTENTS.has(intent)) {
    throw new AgentRequestError("L’intention demandée n’est pas autorisée.");
  }

  const activeClientValue = typeof contextInput.activeClient === "string"
    ? contextInput.activeClient.trim().toUpperCase()
    : "";
  const activeClient = activeClientValue.match(CLIENT_CODE_PATTERN)?.[0] ?? null;
  CLIENT_CODE_PATTERN.lastIndex = 0;
  const messageClientCode = message.toUpperCase().match(CLIENT_CODE_PATTERN)?.[0] ?? null;
  CLIENT_CODE_PATTERN.lastIndex = 0;
  const useActiveClient = Boolean(
    activeClient
    && (ANAPHORA_PATTERN.test(message) || GENERIC_CLIENT_REQUEST.test(message))
  );
  const clientReference = messageClientCode
    ?? explicitClientReference
    ?? (useActiveClient ? activeClient : null);
  const needsClient = [
    AGENT_INTENTS.CLIENT_DOSSIER,
    AGENT_INTENTS.CLIENT_QUERY,
    AGENT_INTENTS.CLIENT_DOCUMENTS,
    AGENT_INTENTS.CLIENT_TASKS
  ].includes(intent);
  const clarificationRequired = needsClient
    && !clientReference
    && (GENERIC_CLIENT_REQUEST.test(message) || ANAPHORA_PATTERN.test(message));

  return {
    message,
    sessionId,
    requestId: createRequestId(body.requestId),
    intent,
    clientReference,
    requestedFields,
    scope: [AGENT_INTENTS.CLIENTS_MISSING_DOCUMENTS, AGENT_INTENTS.PORTFOLIO_QUERY].includes(intent)
      ? (portfolio?.selectionCodes?.length ? "selection" : "portfolio")
      : "single_client",
    portfolio,
    context: { activeClient, lastResultCodes: contextInput.lastResultCodes },
    interpretationSource,
    confidence,
    clarificationRequired
  };
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

/** Extrait une selection ordonnee de codes metier pour le prochain tour. */
export function extractClientCodes(...values) {
  const codes = [];
  for (const value of values) {
    for (const match of String(value ?? "").matchAll(CLIENT_CODE_PATTERN)) {
      const code = match[0].toUpperCase();
      if (!codes.includes(code)) codes.push(code);
      if (codes.length === 100) return codes;
    }
  }
  return codes;
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
  return code ?? extractExplicitClientReference(message) ?? String(message).trim();
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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "Non renseigné";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(amount)} $`;
}

function formatDate(value) {
  if (!value) return "Non renseignée";
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

/** Formate uniquement les champs demandés, sans compléter une valeur absente. */
export function formatClientQueryReply(result, requestedFields = []) {
  if (result?.ambigue) return formatClientDossierReply(result);
  if (!result?.trouve || !result?.dossier) {
    return "Aucun dossier client ne correspond à cette recherche.";
  }

  const dossier = result.dossier;
  const profile = dossier.profil_client ?? {};
  const project = dossier.projet_hypothecaire ?? {};
  const fields = requestedFields.length
    ? requestedFields
    : [CLIENT_QUERY_FIELDS.STATUS];
  const lines = [];
  const add = (field, label, value) => {
    if (fields.includes(field)) lines.push(`${label} : ${value ?? "Non renseigné"}`);
  };

  add(CLIENT_QUERY_FIELDS.STATUS, "Statut", dossier.statut_dossier);
  if (fields.includes(CLIENT_QUERY_FIELDS.UPDATED_AT)) {
    lines.push(`Dernière mise à jour : ${formatDate(dossier.updated_at)}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.NEXT_ACTION)) {
    const action = dossier.prochaine_action?.description
      ?? dossier.prochaine_action?.titre
      ?? "Aucune action planifiée";
    lines.push(`Prochaine action : ${action}`);
  }
  add(CLIENT_QUERY_FIELDS.PHONE, "Téléphone", dossier.telephone);
  add(CLIENT_QUERY_FIELDS.EMAIL, "Courriel", dossier.courriel);
  if (fields.includes(CLIENT_QUERY_FIELDS.BIRTH_DATE)) {
    lines.push(`Date de naissance : ${formatDate(profile.date_naissance)}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.ADDRESS)) {
    const address = profile.adresse ?? {};
    const street = [address.numero_civique, address.type_rue, address.rue, address.direction]
      .filter(Boolean).join(" ");
    const locality = [address.unite ? `unité ${address.unite}` : null, address.ville,
      address.province, address.code_postal, address.pays].filter(Boolean).join(", ");
    lines.push(`Adresse : ${[street, locality].filter(Boolean).join(" — ") || "Non renseignée"}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.CONTACT_PREFERENCE)) {
    lines.push(`Contact préféré : ${profile.canal_contact_prefere ?? "Non renseigné"}`);
    lines.push(`Moment préféré : ${profile.moment_contact_prefere ?? "Non renseigné"}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.PARTICIPANTS)) {
    const participants = Array.isArray(dossier.participants) ? dossier.participants : [];
    lines.push(participants.length
      ? `Participants : ${participants.map((participant) => `${participant.prenom} ${participant.nom} (${participant.role})`).join(", ")}`
      : "Participants : Aucun codemandeur ou garant");
  }
  add(CLIENT_QUERY_FIELDS.PROJECT_TYPE, "Type de projet", project.type_transaction ?? dossier.type_transaction);
  add(CLIENT_QUERY_FIELDS.PROJECT_TIMELINE, "Échéancier", project.echeancier_projet);
  add(CLIENT_QUERY_FIELDS.PROPERTY_TYPE, "Type de propriété", project.type_propriete);
  add(CLIENT_QUERY_FIELDS.OCCUPANCY, "Occupation", project.type_occupation);
  if (fields.includes(CLIENT_QUERY_FIELDS.CONSENTS)) {
    const consents = Array.isArray(dossier.consentements) ? dossier.consentements : [];
    lines.push(consents.length
      ? `Consentements : ${consents.map((consent) => `${consent.type} (${consent.accepte ? "accepté" : "refusé"})`).join(", ")}`
      : "Consentements : Aucun consentement enregistré");
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.ANNUAL_INCOME)) {
    lines.push(`Revenu annuel : ${formatMoney(dossier.revenu_annuel)}`);
  }
  add(CLIENT_QUERY_FIELDS.DOWN_PAYMENT, "Mise de fonds", project.mise_de_fonds ?? project.mise_de_fonds_texte ?? dossier.mise_de_fonds);
  add(
    CLIENT_QUERY_FIELDS.DOWN_PAYMENT_SOURCE,
    "Provenance de la mise de fonds",
    dossier.provenance_mise_de_fonds
  );
  if (fields.includes(CLIENT_QUERY_FIELDS.LOAN_AMOUNT)) {
    lines.push(`Montant du financement : ${formatMoney(project.montant_requis ?? dossier.montant_financement)}`);
  }
  const mortgage = dossier.details_hypothecaires ?? {};
  add(CLIENT_QUERY_FIELDS.LENDER, "Prêteur", mortgage.preteur);
  add(CLIENT_QUERY_FIELDS.PRODUCT, "Produit", mortgage.produit);
  add(CLIENT_QUERY_FIELDS.APPROVAL_STATUS, "Approbation", mortgage.statut_approbation);
  if (fields.includes(CLIENT_QUERY_FIELDS.APPROVAL_DATE)) {
    lines.push(`Date d’approbation : ${formatDate(mortgage.date_approbation)}`);
  }
  add(
    CLIENT_QUERY_FIELDS.APPROVAL_CONDITIONS,
    "Conditions restantes",
    mortgage.conditions_approbation
  );
  if (fields.includes(CLIENT_QUERY_FIELDS.RATE)) {
    lines.push(`Taux d’intérêt : ${mortgage.taux_interet ?? "Non renseigné"} %`);
  }
  add(CLIENT_QUERY_FIELDS.RATE_TYPE, "Type de taux", mortgage.type_taux);
  if (fields.includes(CLIENT_QUERY_FIELDS.TERM_MONTHS)) {
    const term = Number(mortgage.terme_mois);
    const termLabel = Number.isFinite(term) && term > 0
      ? `${term} mois${term % 12 === 0 ? ` (${term / 12} ans)` : ""}`
      : "Non renseigné";
    lines.push(`Terme : ${termLabel}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.AMORTIZATION_YEARS)) {
    lines.push(`Amortissement : ${mortgage.amortissement_annees ?? "Non renseigné"} ans`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.CLOSING_DATE)) {
    lines.push(`Date de fermeture : ${formatDate(mortgage.date_fermeture)}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.DISBURSEMENT_DATE)) {
    lines.push(`Date de décaissement : ${formatDate(mortgage.date_decaissement)}`);
  }
  add(CLIENT_QUERY_FIELDS.NOTARY_NAME, "Notaire", mortgage.notaire_nom);
  add(CLIENT_QUERY_FIELDS.NOTARY_PHONE, "Téléphone du notaire", mortgage.notaire_telephone);
  add(
    CLIENT_QUERY_FIELDS.NOTARY_STATUS,
    "Instructions au notaire",
    mortgage.instructions_notaire_statut
  );
  if (fields.includes(CLIENT_QUERY_FIELDS.NOTARY_DATE)) {
    lines.push(`Date d’envoi au notaire : ${formatDate(mortgage.instructions_notaire_date)}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.APPRAISAL_REQUIRED)) {
    const required = mortgage.evaluation_requise;
    lines.push(`Évaluation requise : ${required === true ? "Oui" : required === false ? "Non" : "Non renseigné"}`);
  }
  add(CLIENT_QUERY_FIELDS.APPRAISAL_STATUS, "Statut de l’évaluation", mortgage.evaluation_statut);
  add(CLIENT_QUERY_FIELDS.APPRAISER, "Évaluateur", mortgage.evaluateur_nom);
  if (fields.includes(CLIENT_QUERY_FIELDS.APPRAISAL_DATE)) {
    lines.push(`Date de l’évaluation : ${formatDate(mortgage.evaluation_date)}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.APPRAISED_VALUE)) {
    lines.push(`Valeur évaluée : ${formatMoney(mortgage.valeur_evaluee)}`);
  }
  if (fields.includes(CLIENT_QUERY_FIELDS.INSURANCE_REQUIRED)) {
    const required = mortgage.assurance_requise;
    lines.push(`Assurance prêt requise : ${required === true ? "Oui" : required === false ? "Non" : "Non renseigné"}`);
  }
  add(CLIENT_QUERY_FIELDS.INSURER, "Assureur prêt", mortgage.assureur_pret);
  add(CLIENT_QUERY_FIELDS.INSURANCE_STATUS, "Statut de l’assurance", mortgage.assurance_statut);
  if (fields.includes(CLIENT_QUERY_FIELDS.INSURANCE_PREMIUM)) {
    lines.push(`Prime d’assurance : ${formatMoney(mortgage.prime_assurance)}`);
  }

  return `Informations pour ${dossier.nom_client} — ${dossier.code_client} :\n\n${lines.join("\n")}`;
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

/** Retourne le portefeuille structuré destiné aux vues Clients et Dossiers. */
export async function requestPortfolioData(query = {}, options = {}) {
  const webhookUrl = options.webhookUrl ?? process.env.N8N_PORTFOLIO_WEBHOOK_URL;
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? process.env.AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const representativeId = normalizeRepresentativeId(options.representativeId);
  const status = String(query.status ?? "").trim().slice(0, 80);
  const followUp = query.followUp === true;
  const limit = Math.max(1, Math.min(Number(query.limit) || 100, 100));
  const allowedSortFields = new Set(["priority_score", "updated_at"]);
  const sort = Array.isArray(query.sort) ? query.sort
    .filter((item) => allowedSortFields.has(item?.field))
    .slice(0, 1)
    .map((item) => ({
      field: item.field,
      direction: item.direction === "asc" ? "asc" : "desc"
    })) : [];

  if (!webhookUrl) {
    throw new AgentRequestError("Le service de portefeuille n’est pas configuré.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchImplementation(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": randomUUID() },
      body: JSON.stringify({
        representant_id: representativeId,
        security_context: { representant_id: representativeId },
        command: {
          parameters: {
            filters: { ...(status ? { statut: status } : {}), ...(followUp ? { a_relancer: true } : {}) },
            sort,
            limit,
            format: "json"
          },
          conversation_context: { last_result_codes: [] },
          security_context: { representant_id: representativeId }
        }
      }),
      signal: controller.signal
    });
    if (!upstream.ok) {
      throw new AgentRequestError("L’orchestrateur CRM n’est pas disponible pour le moment.", 502);
    }
    const payload = await upstream.json();
    const data = payload?.data ?? payload?.resultat ?? payload;
    return {
      count: Number(data?.nombre_clients ?? data?.rows?.length ?? 0),
      rows: Array.isArray(data?.rows) ? data.rows : []
    };
  } catch (error) {
    if (error instanceof AgentRequestError) throw error;
    if (error.name === "AbortError") {
      throw new AgentRequestError("Le délai de chargement du portefeuille est dépassé.", 504);
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

  if (input.clarificationRequired) {
    return "De quel client souhaitez-vous consulter les informations?";
  }

  if ([
    AGENT_INTENTS.CLIENT_DOSSIER,
    AGENT_INTENTS.CLIENT_QUERY,
    AGENT_INTENTS.CLIENT_DOCUMENTS,
    AGENT_INTENTS.CLIENT_TASKS
  ].includes(input.intent)) {
    const clientReference = input.clientReference
      ?? extractClientReferenceFromMessage(input.message);
    const dossier = await requestClientDossier(clientReference, {
      webhookUrl: options.clientDossierWebhookUrl,
      fetchImplementation: options.fetchImplementation,
      timeoutMs: options.timeoutMs,
      representativeId
    });
    if (input.intent === AGENT_INTENTS.CLIENT_QUERY) {
      return formatClientQueryReply(dossier, input.requestedFields);
    }
    if (input.intent === AGENT_INTENTS.CLIENT_DOCUMENTS) return formatClientDocumentsReply(dossier);
    if (input.intent === AGENT_INTENTS.CLIENT_TASKS) return formatClientTasksReply(dossier);
    return formatClientDossierReply(dossier);
  }

  const conversationWebhookUrl = options.webhookUrl ?? process.env.N8N_AGENT_WEBHOOK_URL;
  const recentClientsWebhookUrl = options.recentClientsWebhookUrl
    ?? process.env.N8N_RECENT_CLIENTS_WEBHOOK_URL;
  const missingDocumentsWebhookUrl = options.missingDocumentsWebhookUrl
    ?? process.env.N8N_MISSING_DOCUMENTS_WEBHOOK_URL;
  const portfolioWebhookUrl = options.portfolioWebhookUrl
    ?? process.env.N8N_PORTFOLIO_WEBHOOK_URL;
  const webhookUrl = input.intent === AGENT_INTENTS.RECENT_CLIENTS
    ? recentClientsWebhookUrl
    : input.intent === AGENT_INTENTS.CLIENTS_MISSING_DOCUMENTS
      ? missingDocumentsWebhookUrl
      : input.intent === AGENT_INTENTS.PORTFOLIO_QUERY
        ? portfolioWebhookUrl
      : conversationWebhookUrl;
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? process.env.AGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  if (!webhookUrl) {
    throw new AgentRequestError("Le service conversationnel n’est pas configuré.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestId = input.requestId ?? randomUUID();
    const command = buildAgentCommand({
      ...input,
      requestId,
      interpretationSource: input.interpretationSource ?? "ai_fallback",
      confidence: input.confidence ?? 0.5,
      clarificationRequired: Boolean(input.clarificationRequired)
    }, representativeId);
    const upstream = await fetchImplementation(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-correlation-id": requestId
      },
      body: JSON.stringify({
        schema_version: command.schema_version,
        request_id: command.request_id,
        message: input.message,
        session_id: input.sessionId,
        intent: input.intent ?? "conversation",
        representant_id: representativeId,
        command,
        security_context: command.security_context
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
