import assert from "node:assert/strict";
import test from "node:test";
import {
  KeycloakAdminError,
  listRepresentativeAccounts,
  loadKeycloakAdminConfig,
  normalizeRepresentativeAccountInput,
  resetRepresentativePassword,
  setRepresentativeAccountEnabled
} from "../../src/keycloak-admin.js";

const userId = "ac7b7a4b-907e-4733-a0de-4e5ed40e6af0";
const representantId = "bc7b7a4b-907e-4733-a0de-4e5ed40e6af1";

function response(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => payload === undefined ? "" : JSON.stringify(payload)
  };
}

function createFetch(handler) {
  return async (url, options) => {
    if (url.endsWith("/protocol/openid-connect/token")) {
      assert.equal(options.body.get("grant_type"), "client_credentials");
      return response(200, { access_token: "service-token" });
    }
    assert.equal(options.headers.authorization, "Bearer service-token");
    return handler(url, options);
  };
}

const config = {
  configured: true,
  baseUrl: "http://keycloak:8080",
  realm: "crm-local",
  clientId: "crm-admin-api",
  clientSecret: "secret-test"
};

test("loadKeycloakAdminConfig exige un compte technique confidentiel", () => {
  assert.equal(loadKeycloakAdminConfig({}).configured, false);
  assert.equal(loadKeycloakAdminConfig({
    KEYCLOAK_ADMIN_CLIENT_ID: "crm-admin-api",
    KEYCLOAK_ADMIN_CLIENT_SECRET: "secret-test"
  }).configured, true);
});

test("listRepresentativeAccounts minimise les données retournées", async () => {
  const accounts = await listRepresentativeAccounts(config, {
    fetchImplementation: createFetch(async (url) => {
      assert.match(url, /\/users\?first=0&max=200/);
      return response(200, [{
        id: userId,
        username: "representant@example.test",
        email: "representant@example.test",
        firstName: "Représentant MVP",
        enabled: true,
        requiredActions: ["UPDATE_PASSWORD"],
        attributes: { representant_id: [representantId], secret: ["masqué"] }
      }, {
        id: "cc7b7a4b-907e-4733-a0de-4e5ed40e6af2",
        username: "compte-sans-portefeuille@example.test",
        enabled: true
      }]);
    })
  });
  assert.deepEqual(accounts, [{
    id: userId,
    email: "representant@example.test",
    name: "Représentant MVP",
    enabled: true,
    requiredActions: ["UPDATE_PASSWORD"]
  }]);
});

test("les mutations de compte restent temporaires et contrôlées", async () => {
  const calls = [];
  const fetchImplementation = createFetch(async (url, options) => {
    calls.push({ url, options });
    return response(204);
  });
  await setRepresentativeAccountEnabled(config, userId, false, { fetchImplementation });
  await resetRepresentativePassword(config, userId, "Mot-de-passe-temporaire-2026", {
    fetchImplementation
  });
  assert.deepEqual(JSON.parse(calls[0].options.body), { enabled: false });
  assert.equal(JSON.parse(calls[1].options.body).temporary, true);
});

test("normalizeRepresentativeAccountInput valide le rattachement métier", () => {
  assert.deepEqual(normalizeRepresentativeAccountInput({
    email: " Rep@example.test ",
    name: "Représentant Test",
    representantId
  }), {
    email: "rep@example.test",
    name: "Représentant Test",
    representantId
  });
  assert.throws(
    () => normalizeRepresentativeAccountInput({ email: "invalide", name: "X" }),
    (error) => error instanceof KeycloakAdminError && error.statusCode === 400
  );
});
