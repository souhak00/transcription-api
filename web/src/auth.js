import Keycloak from "keycloak-js";

export async function initializeIdentity() {
  const configResponse = await fetch("/api/auth/config", {
    headers: { accept: "application/json" }
  });
  if (!configResponse.ok) {
    throw new Error("La configuration Keycloak n’est pas disponible.");
  }

  if (!configResponse.headers.get("content-type")?.includes("application/json")) {
    throw new Error("L’API en cours d’exécution ne contient pas encore l’intégration Keycloak.");
  }

  const config = await configResponse.json();
  const keycloak = new Keycloak(config);
  const authenticated = await keycloak.init({
    onLoad: "login-required",
    pkceMethod: "S256",
    checkLoginIframe: false
  });

  if (!authenticated) {
    await keycloak.login({ redirectUri: window.location.href });
  }

  async function apiFetch(resource, options = {}) {
    try {
      await keycloak.updateToken(30);
    } catch {
      await keycloak.login({ redirectUri: window.location.href });
      throw new Error("La session Keycloak doit être renouvelée.");
    }

    const headers = new Headers(options.headers ?? {});
    headers.set("authorization", `Bearer ${keycloak.token}`);
    return fetch(resource, { ...options, headers });
  }

  return {
    apiFetch,
    logout: () => keycloak.logout({ redirectUri: window.location.origin }),
    user: {
      email: keycloak.tokenParsed?.email ?? "",
      name: keycloak.tokenParsed?.name
        ?? keycloak.tokenParsed?.preferred_username
        ?? "Représentant"
    }
  };
}
