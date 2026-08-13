import { createRequestId } from "./contracts.js";
import {
  AgentRequestError,
  extractClientDossier,
  normalizeClientReference,
  normalizeRepresentativeId
} from "./agent.js";

const MAX_TEXT = 160;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()0-9 .-]{7,25}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POSTAL_PATTERN = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i;

function text(value, field, max = MAX_TEXT) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AgentRequestError(`${field} doit être un texte.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new AgentRequestError(`${field} est trop long.`);
  return normalized || null;
}

function date(value, field) {
  const normalized = text(value, field, 10);
  if (!normalized) return null;
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(Date.parse(`${normalized}T12:00:00Z`))) {
    throw new AgentRequestError(`${field} doit utiliser le format AAAA-MM-JJ.`);
  }
  return normalized;
}

function money(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100_000_000) {
    throw new AgentRequestError(`${field} doit être un montant valide.`);
  }
  return normalized;
}

function email(value, field) {
  const normalized = text(value, field, 254)?.toLowerCase() ?? null;
  if (normalized && !EMAIL_PATTERN.test(normalized)) {
    throw new AgentRequestError(`${field} est invalide.`);
  }
  return normalized;
}

function phone(value, field) {
  const normalized = text(value, field, 25);
  if (normalized && !PHONE_PATTERN.test(normalized)) {
    throw new AgentRequestError(`${field} est invalide.`);
  }
  return normalized;
}

function normalizeProfile(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRequestError("Le profil client est invalide.");
  }
  const address = value.adresse ?? {};
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw new AgentRequestError("L’adresse du client est invalide.");
  }
  const postalCode = text(address.code_postal, "Le code postal", 7)?.toUpperCase() ?? null;
  if (postalCode && !POSTAL_PATTERN.test(postalCode)) {
    throw new AgentRequestError("Le code postal est invalide.");
  }
  return {
    prenom: text(value.prenom, "Le prénom", 80),
    nom: text(value.nom, "Le nom", 80),
    date_naissance: date(value.date_naissance, "La date de naissance"),
    telephone: phone(value.telephone, "Le téléphone"),
    telephone_type: text(value.telephone_type, "Le type de téléphone", 40),
    courriel: email(value.courriel, "Le courriel"),
    canal_contact_prefere: text(value.canal_contact_prefere, "Le canal de contact", 40),
    moment_contact_prefere: text(value.moment_contact_prefere, "Le moment de contact", 40),
    adresse: {
      numero_civique: text(address.numero_civique, "Le numéro civique", 20),
      rue: text(address.rue, "La rue", 120),
      type_rue: text(address.type_rue, "Le type de rue", 40),
      direction: text(address.direction, "La direction", 20),
      unite: text(address.unite, "L’unité", 20),
      ville: text(address.ville, "La ville", 80),
      province: text(address.province, "La province", 80),
      code_postal: postalCode,
      pays: text(address.pays, "Le pays", 80) ?? "Canada",
      validee: Boolean(address.validee)
    }
  };
}

function normalizeProject(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRequestError("Le projet hypothécaire est invalide.");
  }
  return {
    type_transaction: text(value.type_transaction, "Le type de transaction", 80),
    echeancier_projet: text(value.echeancier_projet, "L’échéancier", 80),
    type_propriete: text(value.type_propriete, "Le type de propriété", 80),
    type_occupation: text(value.type_occupation, "Le type d’occupation", 80),
    prix_achat: money(value.prix_achat, "Le prix d’achat"),
    mise_de_fonds: money(value.mise_de_fonds, "La mise de fonds"),
    valeur_propriete: money(value.valeur_propriete, "La valeur de la propriété"),
    solde_hypothecaire: money(value.solde_hypothecaire, "Le solde hypothécaire"),
    montant_requis: money(value.montant_requis, "Le montant requis"),
    date_renouvellement: date(value.date_renouvellement, "La date de renouvellement"),
    commentaires: text(value.commentaires, "Les commentaires", 2000),
    source_demande: "Interface CRM",
    statut_soumission: text(value.statut_soumission, "Le statut de soumission", 40) ?? "Brouillon"
  };
}

function normalizeParticipants(value = []) {
  if (!Array.isArray(value) || value.length > 5) {
    throw new AgentRequestError("La liste des participants est invalide.");
  }
  return value.map((participant, index) => {
    if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
      throw new AgentRequestError(`Le participant ${index + 1} est invalide.`);
    }
    const role = text(participant.role, "Le rôle du participant", 30) ?? "Codemandeur";
    if (!["Codemandeur", "Garant", "Autre"].includes(role)) {
      throw new AgentRequestError(`Le rôle du participant ${index + 1} est invalide.`);
    }
    const firstName = text(participant.prenom, "Le prénom du participant", 80);
    const lastName = text(participant.nom, "Le nom du participant", 80);
    if (!firstName || !lastName) {
      throw new AgentRequestError(`Le prénom et le nom du participant ${index + 1} sont requis.`);
    }
    return {
      role,
      prenom: firstName,
      nom: lastName,
      date_naissance: date(participant.date_naissance, "La date de naissance du participant"),
      telephone: phone(participant.telephone, "Le téléphone du participant"),
      telephone_type: text(participant.telephone_type, "Le type de téléphone du participant", 40),
      courriel: email(participant.courriel, "Le courriel du participant"),
      meme_adresse_client: Boolean(participant.meme_adresse_client),
      canal_contact_prefere: text(participant.canal_contact_prefere, "Le canal de contact du participant", 40),
      moment_contact_prefere: text(participant.moment_contact_prefere, "Le moment de contact du participant", 40)
    };
  });
}

export function normalizeDossierUpdate(body = {}) {
  if (body.confirmed !== true) {
    throw new AgentRequestError("La confirmation de sauvegarde est requise.");
  }
  return {
    requestId: createRequestId(body.requestId),
    payload: {
      profil_client: normalizeProfile(body.profil_client),
      projet_hypothecaire: normalizeProject(body.projet_hypothecaire),
      participants: normalizeParticipants(body.participants)
    }
  };
}

export async function requestDossierUpdate(clientReference, input, options = {}) {
  const webhookUrl = options.webhookUrl ?? process.env.N8N_DOSSIER_WRITE_WEBHOOK_URL;
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const representativeId = normalizeRepresentativeId(options.representativeId);
  const reference = normalizeClientReference(clientReference);
  if (!/^CLI-\d{4}-[A-Z]{2}-\d{6}$/.test(reference.toUpperCase())) {
    throw new AgentRequestError("Un code client valide est requis pour modifier le dossier.");
  }
  if (!webhookUrl) throw new AgentRequestError("Le service d’enregistrement n’est pas configuré.", 503);

  try {
    const response = await fetchImplementation(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": input.requestId },
      body: JSON.stringify({
        client_reference: reference.toUpperCase(),
        request_id: input.requestId,
        payload: input.payload,
        representant_id: representativeId,
        security_context: { representant_id: representativeId }
      })
    });
    if (!response.ok) throw new AgentRequestError("L’enregistrement du dossier a échoué.", 502);
    return extractClientDossier(await response.json());
  } catch (error) {
    if (error instanceof AgentRequestError) throw error;
    throw new AgentRequestError("Impossible de joindre le service d’enregistrement.", 502);
  }
}
