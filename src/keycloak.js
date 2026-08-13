import { createRemoteJWKSet, jwtVerify } from "jose";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const remoteKeySets = new Map();

export class AuthenticationError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.statusCode = statusCode;
  }
}

export function loadKeycloakConfig(environment = process.env) {
  const issuer = String(environment.KEYCLOAK_ISSUER ?? "").replace(/\/+$/, "");
  const audience = String(environment.KEYCLOAK_AUDIENCE ?? "crm-api").trim();
  const config = {
    issuer,
    audience,
    jwksUrl: String(
      environment.KEYCLOAK_JWKS_URL
      ?? (issuer ? `${issuer}/protocol/openid-connect/certs` : "")
    ).trim()
  };
  config.configured = Boolean(config.issuer && config.audience && config.jwksUrl);
  return config;
}

export function readBearerToken(authorizationHeader = "") {
  const match = String(authorizationHeader).match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new AuthenticationError("Authentification requise.");
  return match[1];
}

function getRemoteKeySet(jwksUrl) {
  if (!remoteKeySets.has(jwksUrl)) {
    remoteKeySets.set(jwksUrl, createRemoteJWKSet(new URL(jwksUrl)));
  }
  return remoteKeySets.get(jwksUrl);
}

export function extractRepresentative(payload = {}) {
  const identity = extractIdentity(payload);
  if (identity.role !== "representant") {
    throw new AuthenticationError("Ce compte n’est pas associé à un représentant CRM.", 403);
  }
  return identity;
}

export function extractIdentity(payload = {}) {
  const realmRoles = Array.isArray(payload.realm_access?.roles)
    ? payload.realm_access.roles
    : [];
  const representantId = String(payload.representant_id ?? "");

  if (realmRoles.includes("admin")) {
    return {
      subject: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      role: "admin",
      representantId: null,
      representantName: String(payload.name ?? payload.preferred_username ?? "Administrateur")
    };
  }

  if (!realmRoles.includes("representant") || !UUID_PATTERN.test(representantId)) {
    throw new AuthenticationError("Ce compte n’est pas autorisé à utiliser le CRM.", 403);
  }

  return {
    subject: String(payload.sub ?? ""),
    email: String(payload.email ?? ""),
    role: "representant",
    representantId,
    representantName: String(payload.name ?? payload.preferred_username ?? "Représentant")
  };
}

export async function verifyIdentityToken(token, config, options = {}) {
  if (!config?.configured) {
    throw new AuthenticationError("Keycloak n’est pas configuré dans l’API.", 503);
  }

  try {
    const verifier = options.jwtVerifyImplementation ?? jwtVerify;
    const keySet = options.keySet ?? getRemoteKeySet(config.jwksUrl);
    const { payload } = await verifier(token, keySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"]
    });
    return extractIdentity(payload);
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError("La session Keycloak est invalide ou expirée.");
  }
}

export async function verifyAccessToken(token, config, options = {}) {
  if (!config?.configured) {
    throw new AuthenticationError("Keycloak n’est pas configuré dans l’API.", 503);
  }

  try {
    const verifier = options.jwtVerifyImplementation ?? jwtVerify;
    const keySet = options.keySet ?? getRemoteKeySet(config.jwksUrl);
    const { payload } = await verifier(token, keySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"]
    });
    return extractRepresentative(payload);
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError("La session Keycloak est invalide ou expirée.");
  }
}

export async function authenticateRequest(request, config, options = {}) {
  const token = readBearerToken(request.headers.authorization);
  return verifyAccessToken(token, config, options);
}

export async function authenticateIdentity(request, config, options = {}) {
  const token = readBearerToken(request.headers.authorization);
  return verifyIdentityToken(token, config, options);
}
