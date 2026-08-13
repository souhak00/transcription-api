const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class KeycloakAdminError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "KeycloakAdminError";
    this.statusCode = statusCode;
  }
}

export function loadKeycloakAdminConfig(environment = process.env) {
  const baseUrl = String(environment.KEYCLOAK_ADMIN_URL ?? "http://keycloak:8080")
    .replace(/\/+$/, "");
  const config = {
    baseUrl,
    realm: String(environment.KEYCLOAK_REALM ?? "crm-local").trim(),
    clientId: String(environment.KEYCLOAK_ADMIN_CLIENT_ID ?? "").trim(),
    clientSecret: String(environment.KEYCLOAK_ADMIN_CLIENT_SECRET ?? "").trim()
  };
  config.configured = Boolean(
    config.baseUrl && config.realm && config.clientId && config.clientSecret
  );
  return config;
}

async function parseResponse(response) {
  if (response.status === 204 || response.headers?.get?.("content-length") === "0") {
    return null;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function requestServiceToken(config, fetchImplementation) {
  if (!config?.configured) {
    throw new KeycloakAdminError("Le service d’administration Keycloak n’est pas configuré.", 503);
  }
  const response = await fetchImplementation(
    `${config.baseUrl}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials"
      })
    }
  );
  const payload = await parseResponse(response);
  if (!response.ok || !payload?.access_token) {
    throw new KeycloakAdminError("Keycloak a refusé le compte technique d’administration.", 503);
  }
  return payload.access_token;
}

async function adminRequest(config, resource, options = {}) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const token = await requestServiceToken(config, fetchImplementation);
  const response = await fetchImplementation(
    `${config.baseUrl}/admin/realms/${encodeURIComponent(config.realm)}${resource}`,
    {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }
  );
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new KeycloakAdminError(
      response.status === 404 ? "Le compte Keycloak est introuvable." : "Keycloak a refusé l’opération administrative.",
      response.status === 404 ? 404 : 502
    );
  }
  return { payload, response };
}

function normalizeAccount(user = {}) {
  return {
    id: String(user.id ?? ""),
    email: String(user.email ?? user.username ?? ""),
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || String(user.username ?? ""),
    enabled: Boolean(user.enabled),
    requiredActions: Array.isArray(user.requiredActions) ? user.requiredActions : []
  };
}

export async function listRepresentativeAccounts(config, options = {}) {
  const { payload } = await adminRequest(
    config,
    "/users?first=0&max=200",
    options
  );
  return (Array.isArray(payload) ? payload : [])
    .filter((user) => UUID_PATTERN.test(String(user.attributes?.representant_id?.[0] ?? "")))
    .map(normalizeAccount);
}

export async function setRepresentativeAccountEnabled(config, userId, enabled, options = {}) {
  if (!UUID_PATTERN.test(String(userId))) {
    throw new KeycloakAdminError("Identifiant de compte Keycloak invalide.", 400);
  }
  await adminRequest(config, `/users/${encodeURIComponent(userId)}`, {
    ...options,
    method: "PUT",
    body: { enabled: Boolean(enabled) }
  });
}

export async function resetRepresentativePassword(config, userId, password, options = {}) {
  if (!UUID_PATTERN.test(String(userId))) {
    throw new KeycloakAdminError("Identifiant de compte Keycloak invalide.", 400);
  }
  if (String(password).length < 12) {
    throw new KeycloakAdminError("Le mot de passe temporaire doit contenir au moins 12 caractères.", 400);
  }
  await adminRequest(config, `/users/${encodeURIComponent(userId)}/reset-password`, {
    ...options,
    method: "PUT",
    body: { type: "password", value: String(password), temporary: true }
  });
}

export function normalizeRepresentativeAccountInput(input = {}) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  const representantId = String(input.representantId ?? "").trim();
  if (!EMAIL_PATTERN.test(email)) {
    throw new KeycloakAdminError("Le courriel du représentant est invalide.", 400);
  }
  if (name.length < 2 || name.length > 120) {
    throw new KeycloakAdminError("Le nom du représentant est invalide.", 400);
  }
  if (!UUID_PATTERN.test(representantId)) {
    throw new KeycloakAdminError("Le rattachement au représentant CRM est invalide.", 400);
  }
  return { email, name, representantId };
}
